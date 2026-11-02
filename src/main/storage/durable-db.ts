// Durable commits for the encrypted database (M1 follow-up to the WAL finding of the Windows
// evidence run, 28 Oct 2026). Ported unchanged from the M1 spike (spikes/m1/src/shared).
//
// The finding: in WAL mode a committed transaction lives only in the -wal file until a checkpoint
// copies it into the main file. If the -wal file is then lost (deleted, not copied by a backup,
// quarantined) or a frame is corrupted, SQLite stops replaying at the first bad frame and opens
// the older main file. `integrity_check` reports ok, because that file is consistent; it checks
// structure, not completeness. The committed transaction is gone and nothing says so.
//
// The guarantee here: once commit() returns, the transaction is either in the database, or the
// database refuses to open (COMMITTED_DATA_MISSING). Never a silent loss.
// - Every commit runs with synchronous=FULL, then checkpoints with TRUNCATE before returning, so
//   acknowledged data is in the main file (synced) and the WAL is empty: a later WAL loss or
//   corruption can no longer drop it.
// - Each commit increments a sequence number stored in the database (table fqf_durability). After
//   the checkpoint, the sequence is written to a separate ledger file, authenticated with an
//   HMAC keyed from the database key (HKDF), so it cannot be edited or moved to another database.
// - On open: database sequence below the ledger's means acknowledged commits are missing (an
//   older main file, a lost checkpoint): refuse. A missing, edited or foreign ledger: refuse.
//   Database sequence above the ledger's (a crash after the commit, before the ledger write): the
//   database holds more than was acknowledged, so the ledger is rolled forward.
// - A refused open changes no file. Recovery is a deliberate, separate action.
// Limits: restoring an older copy of the database AND its ledger together is not detected (that
// needs a counter outside both, such as one wrapped by the OS key store). A transaction whose
// commit() had not returned when the process died may be lost; it was never acknowledged.
//
// Self-contained (node: built-ins and types only), so a plain Node process can load it for the
// crash tests.
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type Database from 'better-sqlite3-multiple-ciphers';

export type DurabilityErrorCode =
  | 'COMMITTED_DATA_MISSING'
  | 'LEDGER_MISSING'
  | 'LEDGER_TAMPERED'
  | 'LEDGER_MISMATCH'
  | 'INTEGRITY_FAILED'
  | 'WAL_UNAVAILABLE'
  | 'CHECKPOINT_INCOMPLETE';

export class DurabilityError extends Error {
  readonly code: DurabilityErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: DurabilityErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'DurabilityError';
    this.code = code;
    this.details = details;
  }
}

export interface DurableOptions {
  /** The authenticated ledger file. Keep it outside the database directory. */
  ledgerPath: string;
  /** The database key; the ledger's MAC key is derived from it. */
  key: Buffer;
  /** Test seam: how the ledger is written (default: atomic write). */
  writeLedgerFile?: (path: string, data: string) => void;
}

export type Recovery = 'none' | 'initialised' | 'ledger-rolled-forward';

export type OpenResult =
  { ok: true; store: DurableStore; recovery: Recovery } | { ok: false; error: DurabilityError };

interface LedgerRecord {
  v: 1;
  dbId: string;
  seq: number;
  mac: string;
}

const TABLE = 'fqf_durability';

function ledgerKey(key: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'fqf-durability-ledger-v1', 32));
}

function macOf(key: Buffer, dbId: string, seq: number): Buffer {
  return createHmac('sha256', ledgerKey(key)).update(`v1|${dbId}|${seq}`).digest();
}

/** Temporary file, fsync, rename over the target, fsync the directory (not on Windows). */
export function atomicWriteFile(path: string, data: string): void {
  const tmp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, Buffer.from(data, 'utf8'));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  if (process.platform !== 'win32') {
    const dirFd = openSync(dirname(path), 'r');
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  }
}

type LedgerRead = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'ok'; record: LedgerRecord };

function readLedger(path: string, key: Buffer): LedgerRead {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as { code?: unknown }).code === 'ENOENT') return { kind: 'missing' };
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'invalid' };
  }
  const r = parsed as Partial<LedgerRecord>;
  if (
    r.v !== 1 ||
    typeof r.dbId !== 'string' ||
    !/^[0-9a-f]{32}$/.test(r.dbId) ||
    typeof r.seq !== 'number' ||
    !Number.isSafeInteger(r.seq) ||
    r.seq < 0 ||
    typeof r.mac !== 'string' ||
    !/^[0-9a-f]{64}$/.test(r.mac)
  ) {
    return { kind: 'invalid' };
  }
  const expected = macOf(key, r.dbId, r.seq);
  if (!timingSafeEqual(expected, Buffer.from(r.mac, 'hex'))) return { kind: 'invalid' };
  return { kind: 'ok', record: { v: 1, dbId: r.dbId, seq: r.seq, mac: r.mac } };
}

export class DurableStore {
  private readonly db: Database.Database;
  private readonly options: DurableOptions;
  private readonly dbId: string;

  constructor(db: Database.Database, options: DurableOptions, dbId: string) {
    this.db = db;
    this.options = options;
    this.dbId = dbId;
  }

  /** The number of acknowledged commits. */
  sequence(): number {
    const row = this.db.prepare(`SELECT seq FROM ${TABLE} WHERE id = 1`).get() as { seq: number };
    return row.seq;
  }

  /**
   * Runs `work` in one transaction. When this returns, the transaction is in the main database
   * file and the ledger records it. If it throws after the transaction committed (checkpoint or
   * ledger write failed), the next open rolls the ledger forward.
   */
  commit<T>(work: (db: Database.Database) => T): { seq: number; value: T } {
    const run = this.db.transaction(() => {
      const value = work(this.db);
      this.db.prepare(`UPDATE ${TABLE} SET seq = seq + 1 WHERE id = 1`).run();
      return value;
    });
    const value = run();
    const seq = this.sequence();
    this.checkpoint();
    this.writeLedger(seq);
    return { seq, value };
  }

  /** Copies the WAL into the main file (synced) and empties it; throws if anything is left. */
  checkpoint(): void {
    const [row] = this.db.pragma('wal_checkpoint(TRUNCATE)') as {
      busy: number;
      log: number;
      checkpointed: number;
    }[];
    if (!row || row.busy !== 0 || row.log !== row.checkpointed) {
      throw new DurabilityError(
        'CHECKPOINT_INCOMPLETE',
        'The write-ahead log could not be fully copied into the database file',
        { ...row },
      );
    }
  }

  writeLedger(seq: number): void {
    const record: LedgerRecord = {
      v: 1,
      dbId: this.dbId,
      seq,
      mac: macOf(this.options.key, this.dbId, seq).toString('hex'),
    };
    (this.options.writeLedgerFile ?? atomicWriteFile)(
      this.options.ledgerPath,
      `${JSON.stringify(record)}\n`,
    );
  }
}

function fail(
  code: DurabilityErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): OpenResult {
  return { ok: false, error: new DurabilityError(code, message, details) };
}

/**
 * Checks an opened, keyed database against its ledger and returns a store for durable commits.
 * On refusal the database and ledger are left exactly as they were; the caller closes `db`.
 */
export function openDurable(db: Database.Database, options: DurableOptions): OpenResult {
  const mode = String(db.pragma('journal_mode = WAL', { simple: true }));
  if (mode !== 'wal') {
    return fail('WAL_UNAVAILABLE', 'The database could not be switched to WAL mode', { mode });
  }
  db.pragma('synchronous = FULL');
  const check = String(db.pragma('quick_check', { simple: true }));
  if (check !== 'ok') {
    return fail('INTEGRITY_FAILED', 'The database failed its integrity check', { check });
  }

  const ledger = readLedger(options.ledgerPath, options.key);
  if (ledger.kind === 'invalid') {
    return fail('LEDGER_TAMPERED', 'The commit ledger is malformed or its MAC does not match');
  }
  const hasTable =
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(TABLE) !==
    undefined;

  if (!hasTable) {
    if (ledger.kind === 'ok') {
      return fail(
        'COMMITTED_DATA_MISSING',
        'The ledger records commits, but the database has no commit record: it was replaced or lost data',
        { database: null, ledger: ledger.record.seq },
      );
    }
    const dbId = randomBytes(16).toString('hex');
    db.transaction(() => {
      db.exec(
        `CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY CHECK (id = 1), db_id TEXT NOT NULL, seq INTEGER NOT NULL)`,
      );
      db.prepare(`INSERT INTO ${TABLE} (id, db_id, seq) VALUES (1, ?, 0)`).run(dbId);
    })();
    const store = new DurableStore(db, options, dbId);
    store.checkpoint();
    store.writeLedger(0);
    return { ok: true, store, recovery: 'initialised' };
  }

  const row = db.prepare(`SELECT db_id AS dbId, seq FROM ${TABLE} WHERE id = 1`).get() as
    { dbId: string; seq: number } | undefined;
  if (!row) {
    return fail('INTEGRITY_FAILED', 'The commit record is missing from the database');
  }
  const store = new DurableStore(db, options, row.dbId);

  if (ledger.kind === 'missing') {
    if (row.seq !== 0) {
      return fail(
        'LEDGER_MISSING',
        'The database has acknowledged commits but its ledger is missing, so completeness cannot be confirmed',
        { database: row.seq },
      );
    }
    // A crash between creating the database and writing its first ledger: nothing was committed.
    store.writeLedger(0);
    return { ok: true, store, recovery: 'ledger-rolled-forward' };
  }
  if (ledger.record.dbId !== row.dbId) {
    return fail('LEDGER_MISMATCH', 'The ledger belongs to a different database');
  }
  if (row.seq < ledger.record.seq) {
    return fail('COMMITTED_DATA_MISSING', 'Acknowledged commits are missing from the database', {
      database: row.seq,
      ledger: ledger.record.seq,
    });
  }
  if (row.seq > ledger.record.seq) {
    // Committed, but the ledger write did not happen (crash or failure after the commit).
    store.checkpoint();
    store.writeLedger(row.seq);
    return { ok: true, store, recovery: 'ledger-rolled-forward' };
  }
  return { ok: true, store, recovery: 'none' };
}
