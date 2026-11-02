// Crash-safe file writes (ported unchanged from the M1 spike, spikes/m1/src/shared/vault).
// - atomicWrite: temporary file, fsync, rename over the target, fsync the directory. A crash
//   leaves either the old or the new file, never a torn one.
// - atomicCreate: same, but never replaces an existing target (hard-link, which fails with
//   EEXIST if the name is taken). Used where overwriting would lose data.
// Limits: macOS fsync does not force a full device flush (F_FULLFSYNC is not exposed by Node);
// directory fsync is skipped on Windows, where it is not supported.
import { randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

function writeTemp(target: string, data: Buffer | string): string {
  const tmp = join(dirname(target), `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    fsyncSync(fd);
  } catch (err) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw err;
  }
  closeSync(fd);
  return tmp;
}

/** Makes a rename or link durable by flushing the directory entry (POSIX only). */
export function fsyncDirectory(dir: string): void {
  if (process.platform === 'win32') return;
  const fd = openSync(dir, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function atomicWrite(target: string, data: Buffer | string): void {
  const tmp = writeTemp(target, data);
  try {
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  fsyncDirectory(dirname(target));
}

/** Like atomicWrite, but throws (code EEXIST) instead of replacing an existing target. */
export function atomicCreate(target: string, data: Buffer | string): void {
  const tmp = writeTemp(target, data);
  try {
    linkSync(tmp, target);
  } finally {
    rmSync(tmp, { force: true });
  }
  fsyncDirectory(dirname(target));
}
