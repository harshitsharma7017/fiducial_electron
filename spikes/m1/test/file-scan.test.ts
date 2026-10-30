// The plaintext scan and files it cannot read. The Windows evidence run of 28 Oct 2026 failed every
// S3 and S5 phase with EBUSY: the scan read Chromium's profile files while Chromium held them open
// without read sharing. scanFiles reports such files instead of stopping, and the spike treats an
// unreadable file in its own folders as a failure, never as clean.
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { filesContaining, scanFiles } from '../src/shared/file-scan';
import { holdLocked, stopAndWait } from './fixtures/processes';

const root = mkdtempSync(join(tmpdir(), 'fqf-scan-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function folder(name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'clean.txt'), 'nothing here');
  writeFileSync(join(dir, 'leak.txt'), 'xx SECRET-NEEDLE xx');
  writeFileSync(join(dir, 'locked.bin'), 'SECRET-NEEDLE inside a locked file');
  return dir;
}

const NEEDLE = [Buffer.from('SECRET-NEEDLE')];

describe('scanFiles', () => {
  it('finds needles in readable files', () => {
    const dir = folder('readable');
    const scan = scanFiles([dir], NEEDLE);
    expect(scan.unreadable).toEqual([]);
    expect(scan.hits.map((f) => f.slice(dir.length + 1)).sort()).toEqual([
      'leak.txt',
      'locked.bin',
    ]);
  });

  it('skips only the excluded folders, and reads a file under nested roots once', () => {
    const dir = folder('nested');
    const inner = join(dir, 'inner');
    const session = join(dir, 'session');
    mkdirSync(inner);
    mkdirSync(session);
    writeFileSync(join(inner, 'a.txt'), 'SECRET-NEEDLE');
    writeFileSync(join(session, 'chromium.db'), 'SECRET-NEEDLE');
    const scan = scanFiles([dir, inner], NEEDLE, [session]);
    expect(scan.hits.map((f) => f.slice(dir.length + 1)).sort()).toEqual([
      join('inner', 'a.txt'),
      'leak.txt',
      'locked.bin',
    ]);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports a file it cannot read (POSIX permissions) and still scans the rest',
    () => {
      const dir = folder('posix');
      chmodSync(join(dir, 'locked.bin'), 0o000);
      try {
        const scan = scanFiles([dir], NEEDLE);
        expect(scan.unreadable).toEqual([{ file: join(dir, 'locked.bin'), code: 'EACCES' }]);
        expect(scan.hits).toEqual([join(dir, 'leak.txt')]);
        // Negative control: the strict scan stops at the first unreadable file.
        expect(() => filesContaining([dir], NEEDLE)).toThrow(/EACCES/);
      } finally {
        chmodSync(join(dir, 'locked.bin'), 0o600);
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'Windows: reports a file held open without read sharing (EBUSY) and still scans the rest',
    async () => {
      const dir = folder('windows');
      const locked = join(dir, 'locked.bin');
      const holder = await holdLocked(locked);
      let stopped: boolean | undefined;
      try {
        // Negative control: the strict scan fails exactly as the evidence run did.
        expect(() => filesContaining([dir], NEEDLE)).toThrow(/EBUSY/);
        const scan = scanFiles([dir], NEEDLE);
        expect(scan.unreadable).toEqual([{ file: locked, code: 'EBUSY' }]);
        expect(scan.hits).toEqual([join(dir, 'leak.txt')]);
      } finally {
        // Runs even when an assertion failed: the holder must be gone before cleanup deletes the
        // folder (the run of 30 Oct 2026 failed with EPERM when it was not).
        stopped = await stopAndWait(holder);
      }
      expect(stopped).toBe(true);
      // The lock ends with the process: the file is readable again, and the scan finds it.
      expect(readFileSync(locked).length).toBeGreaterThan(0);
      expect(scanFiles([dir], NEEDLE).unreadable).toEqual([]);
    },
    90_000,
  );
});

describe('stopAndWait (the lock tests depend on it)', () => {
  it('returns only after the child process has exited', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      stdio: 'ignore',
    });
    await new Promise((resolve) => child.once('spawn', resolve));
    expect(await stopAndWait(child)).toBe(true);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    // Already gone: returns at once.
    expect(await stopAndWait(child)).toBe(true);
  });
});
