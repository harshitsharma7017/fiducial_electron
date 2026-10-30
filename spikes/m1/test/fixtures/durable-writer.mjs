// Crash-test writer for test/durable-db.test.ts. A separate Node process that opens the encrypted
// database through the durability layer and commits rows forever, printing "acked <seq> <id>"
// after each commit() returns. The test kills it (SIGKILL; TerminateProcess on Windows) at an
// arbitrary point and checks that every acknowledged row survived.
// Usage: node durable-writer.mjs <dbPath> <ledgerPath> <keyHex>
import { createRequire } from 'node:module';

const [dbPath, ledgerPath, keyHex] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3-multiple-ciphers');
// Node strips the types of this self-contained module (Node 23.6 or later).
const { openDurable } = await import(
  new URL('../../src/shared/durable-db.ts', import.meta.url).href
);

const key = Buffer.from(keyHex, 'hex');
const db = new Database(dbPath);
// As src/shared/sqlite-core.ts openEncrypted (SQLCipher v4 mode).
db.pragma(`cipher='sqlcipher'`);
db.pragma('legacy=4');
db.key(key);
db.prepare('SELECT count(*) FROM sqlite_master').get();

const opened = openDurable(db, { ledgerPath, key });
if (!opened.ok) {
  process.stderr.write(`open refused: ${opened.error.code}\n`);
  process.exit(2);
}
const { store } = opened;
store.commit((d) => d.exec('CREATE TABLE IF NOT EXISTS item (id TEXT PRIMARY KEY, n INTEGER)'));
process.stdout.write('ready\n');
for (let n = 1; ; n += 1) {
  const id = `item-${n}`;
  const { seq } = store.commit((d) =>
    d.prepare('INSERT INTO item (id, n) VALUES (?, ?)').run(id, n),
  );
  process.stdout.write(`acked ${seq} ${id}\n`);
}
