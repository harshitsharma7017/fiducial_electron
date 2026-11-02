// Durable commits (src/main/storage/durable-db.ts, ported from the M1 spike): every acknowledged commit survives a crash, a missing
// WAL and a corrupted WAL, and missing committed data is refused, never silently accepted.
// Disposable databases with random keys in temporary folders. Runs on macOS and Windows (CI).
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3-multiple-ciphers';
import {
  openDurable,
  type DurableOptions,
  type DurableStore,
} from '../src/main/storage/durable-db';
import { openEncrypted } from '../src/main/storage/encrypted-db';

const scratch = mkdtempSync(join(tmpdir(), 'fqf-durable-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
interface Fixture {
  dir: string;
  dbPath: string;
  ledgerPath: string;
  key: Buffer;
}
function fixture(): Fixture {
  const dir = join(scratch, String(counter++));
  mkdirSync(join(dir, 'data'), { recursive: true });
  mkdirSync(join(dir, 'keys'));
  return {
    dir,
    dbPath: join(dir, 'data', 'app.db'),
    ledgerPath: join(dir, 'keys', 'app.ledger'),
    key: randomBytes(32),
  };
}

function open(
  f: Fixture,
  extra: Partial<DurableOptions> = {},
): { db: Database.Database; store: DurableStore; recovery: string } {
  const db = openEncrypted(f.dbPath, f.key);
  const r = openDurable(db, { ledgerPath: f.ledgerPath, key: f.key, ...extra });
  if (!r.ok) {
    db.close();
    throw r.error;
  }
  return { db, store: r.store, recovery: r.recovery };
}

/** The refusal code, or 'OK' (closing the database either way). */
function openCode(f: Fixture): string {
  const db = openEncrypted(f.dbPath, f.key);
  try {
    const r = openDurable(db, { ledgerPath: f.ledgerPath, key: f.key });
    return r.ok ? 'OK' : r.error.code;
  } finally {
    db.close();
  }
}

function addItem(store: DurableStore, id: string): number {
  return store.commit((db) => {
    db.exec('CREATE TABLE IF NOT EXISTS item (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO item (id) VALUES (?)').run(id);
  }).seq;
}

function items(f: Fixture): string[] {
  const db = openEncrypted(f.dbPath, f.key);
  try {
    return (db.prepare('SELECT id FROM item ORDER BY id').all() as { id: string }[]).map(
      (r) => r.id,
    );
  } finally {
    db.close();
  }
}

/** A crash image: the files as they are on disk now, with the connection still open. */
function crashImage(f: Fixture): Fixture {
  const copy = fixture();
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(f.dbPath + suffix)) copyFileSync(f.dbPath + suffix, copy.dbPath + suffix);
  }
  if (existsSync(f.ledgerPath)) copyFileSync(f.ledgerPath, copy.ledgerPath);
  return { ...copy, key: f.key };
}

function hashes(f: Fixture): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sub of ['data', 'keys']) {
    for (const name of readdirSync(join(f.dir, sub))) {
      out[`${sub}/${name}`] = createHash('sha256')
        .update(readFileSync(join(f.dir, sub, name)))
        .digest('hex');
    }
  }
  return out;
}

describe('the WAL finding (negative control, without the durability layer)', () => {
  it('a commit that lives only in the WAL is silently lost when the WAL is missing', () => {
    const f = fixture();
    const db = openEncrypted(f.dbPath, f.key);
    db.pragma('journal_mode = WAL');
    db.pragma('wal_autocheckpoint = 0');
    db.exec('CREATE TABLE item (id TEXT PRIMARY KEY)');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.prepare('INSERT INTO item (id) VALUES (?)').run('committed');
    const image = crashImage(f);
    db.close();
    rmSync(`${image.dbPath}-wal`);
    // Reproduces the Windows evidence: no error, integrity ok, the committed row is gone.
    const reopened = openEncrypted(image.dbPath, image.key);
    try {
      expect(reopened.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(reopened.prepare('SELECT count(*) AS n FROM item').get()).toEqual({ n: 0 });
    } finally {
      reopened.close();
    }
  });
});

describe('durable commits', () => {
  it('opens in WAL mode with synchronous=FULL, and an acknowledged commit leaves the WAL empty', () => {
    const f = fixture();
    const { db, store, recovery } = open(f);
    expect(recovery).toBe('initialised');
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('synchronous', { simple: true })).toBe(2); // FULL
    expect(addItem(store, 'a')).toBe(1);
    expect(readFileSync(`${f.dbPath}-wal`).length).toBe(0);
    db.close();
    expect(openCode(f)).toBe('OK');
  });

  it('keeps every acknowledged commit after a crash followed by a missing WAL', () => {
    const f = fixture();
    const { db, store } = open(f);
    for (const id of ['a', 'b', 'c']) addItem(store, id);
    const image = crashImage(f);
    db.close();
    rmSync(`${image.dbPath}-wal`, { force: true });
    rmSync(`${image.dbPath}-shm`, { force: true });
    expect(openCode(image)).toBe('OK');
    expect(items(image)).toEqual(['a', 'b', 'c']);
  });

  it('keeps every acknowledged commit when the WAL is replaced by garbage', () => {
    const f = fixture();
    const { db, store } = open(f);
    for (const id of ['a', 'b']) addItem(store, id);
    const image = crashImage(f);
    db.close();
    writeFileSync(`${image.dbPath}-wal`, randomBytes(64 * 1024));
    rmSync(`${image.dbPath}-shm`, { force: true });
    expect(openCode(image)).toBe('OK');
    expect(items(image)).toEqual(['a', 'b']);
  });

  it('a corrupted WAL can lose only an unacknowledged transaction, never an acknowledged one', () => {
    const f = fixture();
    const { db, store } = open(f);
    addItem(store, 'acknowledged');
    // A transaction that was still in flight: committed to the WAL, commit() never returned.
    db.pragma('wal_autocheckpoint = 0');
    db.prepare('INSERT INTO item (id) VALUES (?)').run('in-flight');
    const image = crashImage(f);
    db.close();
    const wal = readFileSync(`${image.dbPath}-wal`);
    expect(wal.length).toBeGreaterThan(32);
    wal.writeUInt8(wal.readUInt8(32 + 24 + 100) ^ 0x01, 32 + 24 + 100); // inside the first frame
    writeFileSync(`${image.dbPath}-wal`, wal);
    rmSync(`${image.dbPath}-shm`, { force: true });
    expect(openCode(image)).toBe('OK');
    expect(items(image)).toEqual(['acknowledged']);
  });

  it('a rolled-back transaction changes neither the data nor the sequence', () => {
    const f = fixture();
    const { db, store } = open(f);
    addItem(store, 'a');
    expect(() =>
      store.commit((d) => {
        d.prepare('INSERT INTO item (id) VALUES (?)').run('b');
        throw new Error('validation failed');
      }),
    ).toThrow('validation failed');
    expect(store.sequence()).toBe(1);
    db.close();
    expect(items(f)).toEqual(['a']);
    expect(openCode(f)).toBe('OK');
  });
});

describe('missing committed data is refused, never silently accepted', () => {
  it('refuses an older database file than the ledger records, and changes no file', () => {
    const f = fixture();
    const { db, store } = open(f);
    addItem(store, 'a');
    const older = readFileSync(f.dbPath); // checkpointed: the main file holds commit 1
    addItem(store, 'b');
    db.close();
    writeFileSync(f.dbPath, older);
    rmSync(`${f.dbPath}-wal`, { force: true });
    rmSync(`${f.dbPath}-shm`, { force: true });
    const before = hashes(f);
    const db2 = openEncrypted(f.dbPath, f.key);
    const r = openDurable(db2, { ledgerPath: f.ledgerPath, key: f.key });
    db2.close();
    expect(r.ok ? 'OK' : [r.error.code, r.error.details]).toEqual([
      'COMMITTED_DATA_MISSING',
      { database: 1, ledger: 2 },
    ]);
    expect(hashes(f)).toEqual(before);
  });

  it('refuses a replaced database (no commit record) while the ledger records commits', () => {
    const f = fixture();
    const { db, store } = open(f);
    addItem(store, 'a');
    db.close();
    for (const suffix of ['', '-wal', '-shm']) rmSync(f.dbPath + suffix, { force: true });
    expect(openCode(f)).toBe('COMMITTED_DATA_MISSING');
    expect(existsSync(f.ledgerPath)).toBe(true);
  });

  it('refuses a missing ledger once commits exist', () => {
    const f = fixture();
    const { db, store } = open(f);
    addItem(store, 'a');
    db.close();
    rmSync(f.ledgerPath);
    expect(openCode(f)).toBe('LEDGER_MISSING');
    expect(existsSync(f.ledgerPath)).toBe(false);
  });

  it('refuses an edited ledger and a ledger from another database', () => {
    const f = fixture();
    const { db, store } = open(f);
    addItem(store, 'a');
    db.close();
    const genuine = readFileSync(f.ledgerPath, 'utf8');
    writeFileSync(f.ledgerPath, genuine.replace('"seq":1', '"seq":0'));
    expect(openCode(f)).toBe('LEDGER_TAMPERED');
    writeFileSync(f.ledgerPath, 'not json');
    expect(openCode(f)).toBe('LEDGER_TAMPERED');

    const other = { ...fixture(), key: f.key };
    const o = open(other);
    addItem(o.store, 'x');
    o.db.close();
    copyFileSync(other.ledgerPath, f.ledgerPath);
    expect(openCode(f)).toBe('LEDGER_MISMATCH');
    writeFileSync(f.ledgerPath, genuine);
    expect(openCode(f)).toBe('OK');
  });
});

describe('a crash between the commit and the ledger write', () => {
  it('rolls the ledger forward: the database holds more than was acknowledged, nothing is lost', () => {
    const f = fixture();
    let failLedger = false;
    const { db, store } = open(f, {
      writeLedgerFile: (path, data) => {
        if (failLedger) throw Object.assign(new Error('injected'), { code: 'EIO' });
        writeFileSync(path, data);
      },
    });
    addItem(store, 'a');
    failLedger = true;
    expect(() => addItem(store, 'b')).toThrow('injected');
    db.close();
    const reopened = open(f);
    expect(reopened.recovery).toBe('ledger-rolled-forward');
    expect(reopened.store.sequence()).toBe(2);
    reopened.db.close();
    expect(items(f)).toEqual(['a', 'b']);
    expect(openCode(f)).toBe('OK');
  });
});

/** Runs the writer in its own process and kills it once it has acknowledged `acks` commits. */
function killWriterAfter(f: Fixture, acks: number): Promise<{ acked: string[]; lastSeq: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(__dirname, 'fixtures/durable-writer.mjs'),
        f.dbPath,
        f.ledgerPath,
        f.key.toString('hex'),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const acked: string[] = [];
    let lastSeq = 0;
    let buffer = '';
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.stdout.on('data', (d: Buffer) => {
      buffer += d.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const m = /^acked (\d+) (\S+)$/.exec(line.trim());
        if (!m) continue;
        lastSeq = Number(m[1]);
        acked.push(m[2]!);
        if (acked.length === acks) child.kill('SIGKILL');
      }
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (acked.length < acks)
        reject(new Error(`writer stopped early (${code ?? signal}): ${stderr}`));
      else resolve({ acked, lastSeq });
    });
  });
}

describe('real crashes (the writer process is killed mid-commit)', () => {
  it('every acknowledged commit survives a kill', async () => {
    const f = fixture();
    const { acked, lastSeq } = await killWriterAfter(f, 40);
    const { db, store } = open(f);
    expect(store.sequence()).toBeGreaterThanOrEqual(lastSeq);
    db.close();
    const found = new Set(items(f));
    expect(acked.filter((id) => !found.has(id))).toEqual([]);
  }, 60_000);

  it('every acknowledged commit survives a kill followed by a lost WAL', async () => {
    const f = fixture();
    const { acked } = await killWriterAfter(f, 25);
    rmSync(`${f.dbPath}-wal`, { force: true });
    rmSync(`${f.dbPath}-shm`, { force: true });
    expect(openCode(f)).toBe('OK');
    const found = new Set(items(f));
    expect(acked.filter((id) => !found.has(id))).toEqual([]);
  }, 60_000);
});
