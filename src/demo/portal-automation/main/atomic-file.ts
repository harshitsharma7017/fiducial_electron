// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// Crash-safe file writes for the attempt store and the audit log. A replaced file is written to a
// temporary file beside it, flushed to disk, then renamed over the old one, so a crash leaves
// either the old or the new version, never a mix. Appends are flushed before they return.
// Files are readable by the user only (0600), in a folder that is the user's only (0700).
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** The file-system calls used here; tests pass their own to simulate failures. */
export interface FileOps {
  openSync(path: string, flags: string, mode?: number): number;
  writeSync(fd: number, buffer: Uint8Array, offset: number, length: number): number;
  fsyncSync(fd: number): void;
  closeSync(fd: number): void;
  renameSync(from: string, to: string): void;
  unlinkSync(path: string): void;
}

export const NODE_FILE_OPS: FileOps = {
  openSync: (path, flags, mode) => fs.openSync(path, flags, mode),
  writeSync: (fd, buffer, offset, length) => fs.writeSync(fd, buffer, offset, length),
  fsyncSync: (fd) => fs.fsyncSync(fd),
  closeSync: (fd) => fs.closeSync(fd),
  renameSync: (from, to) => fs.renameSync(from, to),
  unlinkSync: (path) => fs.unlinkSync(path),
};

const TEMP_MARK = '.tmp-';

export function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function writeAll(ops: FileOps, fd: number, data: Uint8Array): void {
  let offset = 0;
  while (offset < data.length) offset += ops.writeSync(fd, data, offset, data.length - offset);
}

/** Flushes a folder's entries (the rename) where the platform allows it. */
function syncDir(dir: string): void {
  if (process.platform === 'win32') return;
  try {
    const fd = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Not supported here: the rename itself is still atomic.
  }
}

/** Antivirus and indexers on Windows briefly lock files; a rename is retried a few times. */
function renameWithRetry(ops: FileOps, from: string, to: string): void {
  for (let tries = 0; ; tries += 1) {
    try {
      ops.renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (tries >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
      // A short synchronous pause: the store's writes are synchronous by design.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (tries + 1));
    }
  }
}

/** Replaces `path` with `text`: either the old or the new content survives a crash. */
export function writeFileAtomic(path: string, text: string, ops: FileOps = NODE_FILE_OPS): void {
  const temp = `${path}${TEMP_MARK}${process.pid}-${randomBytes(4).toString('hex')}`;
  const fd = ops.openSync(temp, 'wx', 0o600);
  try {
    try {
      writeAll(ops, fd, Buffer.from(text, 'utf8'));
      ops.fsyncSync(fd);
    } finally {
      ops.closeSync(fd);
    }
    renameWithRetry(ops, temp, path);
  } catch (error) {
    try {
      ops.unlinkSync(temp);
    } catch {
      // Already gone.
    }
    throw error;
  }
  syncDir(dirname(path));
}

/** Appends `text` and flushes it to disk before returning. */
export function appendDurable(path: string, text: string, ops: FileOps = NODE_FILE_OPS): void {
  const fd = ops.openSync(path, 'a', 0o600);
  try {
    writeAll(ops, fd, Buffer.from(text, 'utf8'));
    ops.fsyncSync(fd);
  } finally {
    ops.closeSync(fd);
  }
}

/** Removes temporary files a crash left beside `path`; the file itself is the valid version. */
export function removeStaleTemps(path: string): number {
  const prefix = `${basename(path)}${TEMP_MARK}`;
  let removed = 0;
  let names: string[];
  try {
    names = fs.readdirSync(dirname(path));
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    try {
      fs.unlinkSync(join(dirname(path), name));
      removed += 1;
    } catch {
      // Left for the next start.
    }
  }
  return removed;
}
