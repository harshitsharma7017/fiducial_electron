// Encrypted SQLite experiment (S3), independent of Electron so it also runs under Node in tests.
// Uses SQLite3MultipleCiphers in SQLCipher v4 mode with a caller-supplied random key.
import { closeSync, openSync, readSync, readFileSync, statSync } from 'node:fs';
import Database from 'better-sqlite3-multiple-ciphers';

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');

export function openEncrypted(path: string, key: Buffer): Database.Database {
  const db = new Database(path);
  try {
    // Cipher selection must precede the key. SQLCipher v4 layout keeps files readable by other
    // SQLCipher tools, which helps support and recovery.
    db.pragma(`cipher='sqlcipher'`);
    db.pragma('legacy=4');
    db.key(key);
    // Touch the schema: with a wrong or missing key this throws SQLITE_NOTADB.
    db.prepare('SELECT count(*) AS n FROM sqlite_master').get();
    db.pragma('foreign_keys = ON');
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

export function createSpikeSchema(db: Database.Database, marker: string): void {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE quote (id TEXT PRIMARY KEY, label TEXT NOT NULL);
    CREATE TABLE result (
      id INTEGER PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES quote(id),
      premium_paise INTEGER NOT NULL
    );
  `);
  const insert = db.transaction(() => {
    db.prepare('INSERT INTO quote (id, label) VALUES (?, ?)').run('q-spike-1', marker);
    db.prepare('INSERT INTO result (quote_id, premium_paise) VALUES (?, ?)').run(
      'q-spike-1',
      1234550,
    );
  });
  insert();
}

export function readMarker(db: Database.Database): string | undefined {
  const row = db.prepare('SELECT label FROM quote WHERE id = ?').get('q-spike-1') as
    { label: string } | undefined;
  return row?.label;
}

/** True if inserting an orphan result is rejected, i.e. foreign keys are enforced. */
export function foreignKeysEnforced(db: Database.Database): boolean {
  try {
    db.prepare('INSERT INTO result (quote_id, premium_paise) VALUES (?, ?)').run('missing', 1);
    return false;
  } catch {
    return true;
  }
}

export interface FileInspection {
  exists: boolean;
  size: number;
  plainSqliteHeader: boolean;
  markerFound: boolean;
}

/** Looks at raw file bytes: an encrypted file has no SQLite header and no readable marker. */
export function inspectFile(path: string, marker: string): FileInspection {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return { exists: false, size: 0, plainSqliteHeader: false, markerFound: false };
  const header = Buffer.alloc(16);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, header, 0, 16, 0);
  } finally {
    closeSync(fd);
  }
  return {
    exists: true,
    size: stat.size,
    plainSqliteHeader: header.equals(SQLITE_HEADER),
    markerFound: readFileSync(path).includes(Buffer.from(marker, 'utf8')),
  };
}

export interface OpenAttempt {
  opened: boolean;
  errorCode: string | null;
}

/** Tries to open and read; `key === null` means "open as a plain, unencrypted database". */
export function tryOpen(path: string, key: Buffer | null): OpenAttempt {
  let db: Database.Database | undefined;
  try {
    if (key) {
      db = openEncrypted(path, key);
    } else {
      db = new Database(path, { fileMustExist: true });
      db.prepare('SELECT count(*) AS n FROM sqlite_master').get();
    }
    return { opened: true, errorCode: null };
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return { opened: false, errorCode: typeof code === 'string' ? code : 'UNKNOWN' };
  } finally {
    db?.close();
  }
}

/** Plain database with the same content: a positive control proving `inspectFile` can see data. */
export function createPlainControl(path: string, marker: string): void {
  const db = new Database(path);
  try {
    createSpikeSchema(db, marker);
  } finally {
    db.close();
  }
}

export function cipherName(db: Database.Database): unknown {
  return db.pragma('cipher', { simple: true });
}
