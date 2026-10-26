// S2 cookie-at-rest check: reads the Chromium cookie store of the mock insurer partitions and
// reports, per cookie, only its name and whether the value is stored plain or encrypted.
// Cookie values are never printed. Usage: node scripts/inspect-cookies.mjs --run=dev|packaged
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { SPIKE_ROOT } from './lib/launch.mjs';

const Database = createRequire(import.meta.url)('better-sqlite3-multiple-ciphers');
const run = process.argv.find((a) => a.startsWith('--run='))?.slice(6) ?? 'dev';
const report = {};
for (const partition of ['insurer-mock-a', 'insurer-mock-b']) {
  const file = join(SPIKE_ROOT, 'out/runs', run, 'user-data/Partitions', partition, 'Cookies');
  if (!existsSync(file)) {
    report[partition] = 'no Cookies database';
    continue;
  }
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    report[partition] = db
      .prepare(
        `SELECT name, length(value) AS plainLength, length(encrypted_value) AS encryptedLength,
                CAST(substr(encrypted_value, 1, 3) AS TEXT) AS encryptedPrefix
           FROM cookies WHERE host_key = '127.0.0.1' ORDER BY name`,
      )
      .all();
  } finally {
    db.close();
  }
}
console.log(JSON.stringify({ run, report }, null, 2));
