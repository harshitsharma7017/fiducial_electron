// A log sink that keeps the app's log records on disk, for support: one JSON line per record in
// <userData>/logs/fqf.log, owner-only. The records are the logger's (allowlisted fields only: no
// client data, sign-in details or addresses), so the file holds nothing more than the console
// does. The file is rotated when it passes MAX_BYTES: fqf.log becomes fqf.1.log, and so on, keeping
// KEEP old files. Writes are synchronous, so the last records before a crash are on disk. A sink
// never throws: a log that cannot be written is dropped.
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { LogSink } from './logger';

export const LOG_FILE = 'fqf.log';
const MAX_BYTES = 2 * 1024 * 1024;
const KEEP = 4;

export function fileSink(dir: string, limits = { maxBytes: MAX_BYTES, keep: KEEP }): LogSink {
  let ready = false;
  const path = join(dir, LOG_FILE);
  const old = (n: number) => join(dir, `fqf.${n}.log`);
  const rotate = (): void => {
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      return;
    }
    if (size < limits.maxBytes) return;
    rmSync(old(limits.keep), { force: true });
    for (let n = limits.keep - 1; n >= 1; n -= 1) {
      try {
        renameSync(old(n), old(n + 1));
      } catch {
        // Not there yet.
      }
    }
    renameSync(path, old(1));
  };
  return (record) => {
    try {
      if (!ready) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        ready = true;
      }
      rotate();
      appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    } catch {
      // Dropped: the log must never stop the app.
    }
  };
}
