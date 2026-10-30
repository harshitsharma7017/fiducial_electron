// The plaintext scan and files it cannot read. The Windows evidence run of 28 Oct 2026 failed every
// S3 and S5 phase with EBUSY: the scan read Chromium's profile files while Chromium held them open
// without read sharing. scanFiles reports such files instead of stopping, and the spike treats an
// unreadable file in its own folders as a failure, never as clean.
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { filesContaining, scanFiles } from '../src/shared/file-scan';

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
      // Holds the file open with FileShare.None, as Chromium does with some profile files.
      const holder: ChildProcess = spawn(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$f = [System.IO.File]::Open($env:FQF_LOCKED, 'Open', 'Read', 'None'); " +
            "Write-Output 'locked'; Start-Sleep -Seconds 60; $f.Close()",
        ],
        { env: { ...process.env, FQF_LOCKED: locked }, stdio: ['ignore', 'pipe', 'inherit'] },
      );
      try {
        await new Promise<void>((resolve, reject) => {
          holder.stdout?.on('data', (d: Buffer) => {
            if (d.toString().includes('locked')) resolve();
          });
          holder.on('exit', () => reject(new Error('the lock holder exited early')));
        });
        // Negative control: the strict scan fails exactly as the evidence run did.
        expect(() => filesContaining([dir], NEEDLE)).toThrow(/EBUSY/);
        const scan = scanFiles([dir], NEEDLE);
        expect(scan.unreadable).toEqual([{ file: locked, code: 'EBUSY' }]);
        expect(scan.hits).toEqual([join(dir, 'leak.txt')]);
      } finally {
        holder.kill();
      }
    },
    90_000,
  );
});
