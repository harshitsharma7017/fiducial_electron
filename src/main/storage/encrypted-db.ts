// Opening the encrypted database (DM-02; M1 S3). SQLite3MultipleCiphers in SQLCipher v4 mode with
// a random 256-bit key, which is kept in the vault (src/main/secrets), never on disk in the clear.
// Independent of Electron, so tests run it under plain Node (the same N-API prebuild Electron
// loads).
import Database from 'better-sqlite3-multiple-ciphers';

export function openEncrypted(path: string, key: Buffer): Database.Database {
  const db = new Database(path);
  try {
    // Cipher selection must precede the key. The SQLCipher v4 layout keeps files readable by
    // other SQLCipher tools, which helps support and recovery.
    db.pragma(`cipher='sqlcipher'`);
    db.pragma('legacy=4');
    db.key(key);
    // Touch the schema: with a wrong or missing key this throws SQLITE_NOTADB.
    db.prepare('SELECT count(*) AS n FROM sqlite_master').get();
    db.pragma('foreign_keys = ON');
    // Deleted content is overwritten, not left in free pages (a deleted client is gone).
    db.pragma('secure_delete = ON');
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

/** The cipher actually in use (for checks; "sqlcipher" when encryption is on). */
export function cipherName(db: Database.Database): string {
  return String(db.pragma('cipher', { simple: true }));
}
