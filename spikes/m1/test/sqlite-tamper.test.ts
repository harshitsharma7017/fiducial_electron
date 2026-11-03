// Tamper and integrity evidence for the encrypted database (S3 follow-up, Windows evidence run).
// Every database is disposable, in a fresh temporary folder, with a random key that is never
// written anywhere. The hard assertion everywhere is that modified data is never returned as
// if it were genuine. Whether tampering raises an error, fails `integrity_check` or silently
// loses a committed transaction is recorded, not assumed: silent loss is reported as a
// finding, never as acceptable behaviour.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SPIKE_ROOT } from '../scripts/lib/launch.mjs';
import { createSpikeSchema, openEncrypted } from '../src/shared/sqlite-core';

type Row = { id: string; label: string };
type Outcome =
  | 'intact'
  | 'rejected-with-error'
  | 'integrity-check-failed'
  | 'silent-loss'
  | 'altered-data-accepted';

interface Observation {
  outcome: Outcome;
  errorCode: string | null;
  integrity: string | null;
  rowsReturned: number | null;
}

const evidence: Record<string, unknown> = {};
const findings: string[] = [];
const scratch = mkdtempSync(join(tmpdir(), 'fqf-sqlite-tamper-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  const dir = join(SPIKE_ROOT, 'out/evidence');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'sqlite-tamper.json'),
    `${JSON.stringify({ platform: process.platform, arch: process.arch, evidence, findings }, null, 2)}\n`,
  );
});

let counter = 0;
function freshDir(): string {
  const dir = join(scratch, String(counter++));
  mkdirSync(dir);
  return dir;
}

function flip(bytes: Buffer, offset: number): Buffer {
  const copy = Buffer.from(bytes);
  copy.writeUInt8(copy.readUInt8(offset) ^ 0x01, offset);
  return copy;
}

/** Opens a copy and reads everything back, classifying the result against the genuine rows. */
function observe(dbPath: string, key: Buffer, genuine: readonly Row[]): Observation {
  let db;
  try {
    db = openEncrypted(dbPath, key);
    const rows = db.prepare('SELECT id, label FROM quote ORDER BY id').all() as Row[];
    db.prepare('SELECT quote_id, premium_paise FROM result').all();
    const integrity = String(db.pragma('integrity_check', { simple: true }));
    const byId = new Map(genuine.map((r) => [r.id, r.label]));
    const altered = rows.some((r) => byId.get(r.id) !== r.label);
    const outcome: Outcome = altered
      ? 'altered-data-accepted'
      : integrity !== 'ok'
        ? 'integrity-check-failed'
        : rows.length < genuine.length
          ? 'silent-loss'
          : 'intact';
    return { outcome, errorCode: null, integrity, rowsReturned: rows.length };
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return {
      outcome: 'rejected-with-error',
      errorCode: typeof code === 'string' ? code : 'UNKNOWN',
      integrity: null,
      rowsReturned: null,
    };
  } finally {
    db?.close();
  }
}

function writeScenario(files: Record<string, Buffer>): string {
  const dir = freshDir();
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes);
  return join(dir, 'spike.db');
}

// --- SQLite WAL checksums (https://www.sqlite.org/fileformat.html#checksum_algorithm) --------
// Unkeyed: anyone who can edit the file can recompute them. Used to show that integrity rests
// on SQLCipher's per-page authentication, not on the WAL checksum.
const WAL_HEADER = 32;
const FRAME_HEADER = 24;

function checksum(
  buf: Buffer,
  start: number,
  end: number,
  init: [number, number],
  littleEndian: boolean,
): [number, number] {
  let [s0, s1] = init;
  for (let i = start; i < end; i += 8) {
    const x0 = littleEndian ? buf.readUInt32LE(i) : buf.readUInt32BE(i);
    const x1 = littleEndian ? buf.readUInt32LE(i + 4) : buf.readUInt32BE(i + 4);
    s0 = (s0 + x0 + s1) >>> 0;
    s1 = (s1 + x1 + s0) >>> 0;
  }
  return [s0, s1];
}

/** Recomputes every frame checksum in place, chaining from the (unchanged) header checksum. */
function rechainWal(wal: Buffer): Buffer {
  const out = Buffer.from(wal);
  const littleEndian = (out.readUInt32BE(0) & 1) === 0;
  const pageSize = out.readUInt32BE(8);
  let ck: [number, number] = [out.readUInt32BE(24), out.readUInt32BE(28)];
  for (
    let at = WAL_HEADER;
    at + FRAME_HEADER + pageSize <= out.length;
    at += FRAME_HEADER + pageSize
  ) {
    ck = checksum(out, at, at + 8, ck, littleEndian);
    ck = checksum(out, at + FRAME_HEADER, at + FRAME_HEADER + pageSize, ck, littleEndian);
    out.writeUInt32BE(ck[0], at + 16);
    out.writeUInt32BE(ck[1], at + 20);
  }
  return out;
}

/**
 * A database whose second transaction exists only in the WAL: the first row is checkpointed
 * into the main file, the second is committed to the WAL and the files are copied before the
 * connection closes (closing would checkpoint it).
 */
function walFixture() {
  const key = randomBytes(32);
  const dbPath = join(freshDir(), 'spike.db');
  const first = `FQF-TAMPER-${randomBytes(6).toString('hex')}`;
  const second = `FQF-TAMPER-${randomBytes(6).toString('hex')}`;
  const db = openEncrypted(dbPath, key);
  try {
    createSpikeSchema(db, first);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.pragma('wal_autocheckpoint = 0');
    db.prepare('INSERT INTO quote (id, label) VALUES (?, ?)').run('q-spike-2', second);
    return {
      key,
      main: readFileSync(dbPath),
      wal: readFileSync(`${dbPath}-wal`),
      pageSize: Number(db.pragma('page_size', { simple: true })),
      genuine: [
        { id: 'q-spike-1', label: first },
        { id: 'q-spike-2', label: second },
      ] as Row[],
    };
  } finally {
    db.close();
  }
}

describe('database file tampering', () => {
  it('detects a modified byte in every page and never returns modified data', () => {
    const key = randomBytes(32);
    const dbPath = join(freshDir(), 'spike.db');
    const label = `FQF-TAMPER-${randomBytes(6).toString('hex')}`;
    const db = openEncrypted(dbPath, key);
    createSpikeSchema(db, label);
    const pageSize = Number(db.pragma('page_size', { simple: true }));
    db.close(); // checkpoints the WAL into the main file
    const main = readFileSync(dbPath);
    const genuine = [{ id: 'q-spike-1', label }];
    const pages = main.length / pageSize;

    const control = observe(writeScenario({ 'spike.db': main }), key, genuine);
    expect(control.outcome).toBe('intact');

    const perPage = Array.from({ length: pages }, (_, page) => ({
      page: page + 1,
      ...observe(
        writeScenario({ 'spike.db': flip(main, page * pageSize + pageSize / 2) }),
        key,
        genuine,
      ),
    }));
    evidence['databasePages'] = { pageSize, pages, control: control.outcome, perPage };
    for (const p of perPage.filter((x) => x.outcome === 'intact' || x.outcome === 'silent-loss')) {
      findings.push(`Database page ${p.page}: modification not detected (${p.outcome})`);
    }
    expect(perPage.filter((p) => p.outcome === 'altered-data-accepted')).toEqual([]);
  });
});

describe('write-ahead log (WAL) tampering', () => {
  const fixture = walFixture();
  const frameData = WAL_HEADER + FRAME_HEADER + fixture.pageSize / 2;

  it('control: the untouched WAL replays the second transaction', () => {
    const control = observe(
      writeScenario({ 'spike.db': fixture.main, 'spike.db-wal': fixture.wal }),
      fixture.key,
      fixture.genuine,
    );
    evidence['walControl'] = control;
    expect(control.outcome).toBe('intact');
  });

  it('control: the WAL checksum implementation reproduces the stored checksums', () => {
    expect(rechainWal(fixture.wal).equals(fixture.wal)).toBe(true);
  });

  it('records a modified WAL frame whose SQLite checksum no longer matches', () => {
    const result = observe(
      writeScenario({ 'spike.db': fixture.main, 'spike.db-wal': flip(fixture.wal, frameData) }),
      fixture.key,
      fixture.genuine,
    );
    evidence['walFrameBrokenChecksum'] = result;
    if (result.outcome === 'silent-loss') {
      findings.push(
        'WAL frame modified (SQLite checksum broken): the committed second transaction was ' +
          'silently lost; no error was raised and integrity_check reported ok',
      );
    }
    expect(result.outcome).not.toBe('altered-data-accepted');
  });

  it('rejects a modified WAL frame even when its SQLite checksum is recomputed', () => {
    const result = observe(
      writeScenario({
        'spike.db': fixture.main,
        'spike.db-wal': rechainWal(flip(fixture.wal, frameData)),
      }),
      fixture.key,
      fixture.genuine,
    );
    evidence['walFrameValidChecksum'] = result;
    if (result.outcome === 'silent-loss') {
      findings.push('WAL frame modified with a valid SQLite checksum: transaction silently lost');
    }
    expect(result.outcome).not.toBe('altered-data-accepted');
    expect(['rejected-with-error', 'integrity-check-failed']).toContain(result.outcome);
  });

  it('records the effect of a missing WAL file', () => {
    const result = observe(
      writeScenario({ 'spike.db': fixture.main }),
      fixture.key,
      fixture.genuine,
    );
    evidence['walMissing'] = result;
    if (result.outcome === 'silent-loss') {
      findings.push(
        'WAL file missing: the committed second transaction was silently lost; no error was ' +
          'raised and integrity_check reported ok',
      );
    }
    expect(result.outcome).not.toBe('altered-data-accepted');
  });
});
