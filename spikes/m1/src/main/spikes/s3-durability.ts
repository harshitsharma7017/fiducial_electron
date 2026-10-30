// S3 durability trials (follow-up to the WAL finding of the Windows evidence run): the durable
// commit layer (src/shared/durable-db.ts) inside the real Electron runtime, development and
// packaged. Phase "create" commits three items; phase "reopen" reads them back in a new process,
// then works on copies: a missing WAL and a garbage WAL must keep every acknowledged commit, and
// an older database file or a missing ledger must be refused, never accepted.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { openDurable } from '../../shared/durable-db';
import { check, type Check } from '../../shared/result';
import { openEncrypted } from '../../shared/sqlite-core';

const ITEMS = ['durable-1', 'durable-2', 'durable-3'];

interface Paths {
  db: string;
  ledger: string;
  /** The main database file as it was after the first commit (an older copy). */
  older: string;
}

function paths(dataDir: string, keysDir: string): Paths {
  return {
    db: join(dataDir, 'durable.db'),
    ledger: join(keysDir, 'durable.ledger'),
    older: join(dataDir, 'durable-older.db.copy'),
  };
}

/** Opens through the durability layer; returns the refusal code or the stored items. */
function readThrough(
  db: string,
  ledger: string,
  key: Buffer,
): { code: string; items: string[]; seq: number | null } {
  const handle = openEncrypted(db, key);
  try {
    const r = openDurable(handle, { ledgerPath: ledger, key });
    if (!r.ok) return { code: r.error.code, items: [], seq: null };
    const rows = handle.prepare('SELECT id FROM item ORDER BY id').all() as { id: string }[];
    return { code: 'OK', items: rows.map((row) => row.id), seq: r.store.sequence() };
  } finally {
    handle.close();
  }
}

export function durabilityCreate(
  dataDir: string,
  keysDir: string,
  key: Buffer,
): { checks: Check[]; facts: Record<string, unknown> } {
  const p = paths(dataDir, keysDir);
  const db = openEncrypted(p.db, key);
  let seq = -1;
  let walAfterCommit = -1;
  let refused: string | null = null;
  try {
    const opened = openDurable(db, { ledgerPath: p.ledger, key });
    if (!opened.ok) {
      refused = opened.error.code;
    } else {
      for (const [i, id] of ITEMS.entries()) {
        seq = opened.store.commit((d) => {
          d.exec('CREATE TABLE IF NOT EXISTS item (id TEXT PRIMARY KEY)');
          d.prepare('INSERT INTO item (id) VALUES (?)').run(id);
        }).seq;
        if (i === 0) copyFileSync(p.db, p.older);
      }
      walAfterCommit = existsSync(`${p.db}-wal`) ? readFileSync(`${p.db}-wal`).length : 0;
    }
  } finally {
    db.close();
  }
  return {
    checks: [
      check(
        's3.durable-commit',
        'Durable commits: three acknowledged, each checkpointed (WAL empty afterwards)',
        { seq: 3, walBytes: 0 },
        { seq, walBytes: walAfterCommit, refused },
        refused === null && seq === 3 && walAfterCommit === 0,
      ),
    ],
    facts: { durableSeq: seq },
  };
}

export function durabilityReopen(
  dataDir: string,
  keysDir: string,
  key: Buffer,
  trialsDir: string,
): { checks: Check[]; facts: Record<string, unknown> } {
  const p = paths(dataDir, keysDir);
  const reopened = readThrough(p.db, p.ledger, key);

  // Each trial works on a copy, so the real database is never changed.
  rmSync(trialsDir, { recursive: true, force: true });
  const trial = (name: string, change: (db: string, ledger: string) => void) => {
    const dir = join(trialsDir, name);
    mkdirSync(dir, { recursive: true });
    const db = join(dir, 'durable.db');
    const ledger = join(dir, 'durable.ledger');
    copyFileSync(p.db, db);
    copyFileSync(p.ledger, ledger);
    change(db, ledger);
    return readThrough(db, ledger, key);
  };
  const walMissing = trial('wal-missing', (db) => rmSync(`${db}-wal`, { force: true }));
  const walGarbage = trial('wal-garbage', (db) => writeFileSync(`${db}-wal`, randomBytes(65536)));
  const olderFile = trial('older-file', (db) => copyFileSync(p.older, db));
  const noLedger = trial('ledger-missing', (_db, ledger) => rmSync(ledger));
  rmSync(trialsDir, { recursive: true, force: true });

  const all = (r: { code: string; items: string[] }) =>
    r.code === 'OK' && ITEMS.every((id) => r.items.includes(id));
  return {
    checks: [
      check(
        's3.durable-reopen',
        'New process: every acknowledged commit is present',
        { code: 'OK', items: ITEMS, seq: 3 },
        reopened,
        all(reopened) && reopened.seq === 3,
      ),
      check(
        's3.durable-wal-missing',
        'Missing WAL: every acknowledged commit is still present',
        { code: 'OK', items: ITEMS },
        { code: walMissing.code, items: walMissing.items },
        all(walMissing),
      ),
      check(
        's3.durable-wal-garbage',
        'WAL replaced by garbage: every acknowledged commit is still present',
        { code: 'OK', items: ITEMS },
        { code: walGarbage.code, items: walGarbage.items },
        all(walGarbage),
      ),
      check(
        's3.durable-older-file-refused',
        'Older database file (committed data missing): refused, not opened',
        'COMMITTED_DATA_MISSING',
        olderFile.code,
        olderFile.code === 'COMMITTED_DATA_MISSING',
      ),
      check(
        's3.durable-ledger-missing-refused',
        'Ledger missing after commits: refused, not opened',
        'LEDGER_MISSING',
        noLedger.code,
        noLedger.code === 'LEDGER_MISSING',
      ),
    ],
    facts: {},
  };
}
