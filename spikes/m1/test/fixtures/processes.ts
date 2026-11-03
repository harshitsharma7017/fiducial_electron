// Child-process helpers for the file-locking tests.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

/**
 * Stops a child process and waits until it has exited, at most `ms` per attempt. On Windows a
 * process that outlives kill() is ended with its whole tree (taskkill /T /F), so no PowerShell is
 * left holding a file. Returns whether the process has exited.
 */
export async function stopAndWait(child: ChildProcess, ms = 10_000): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  const exited = new Promise<boolean>((resolve) => child.once('exit', () => resolve(true)));
  const within = (wait: Promise<boolean>) =>
    Promise.race([wait, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);
  child.kill();
  if (await within(exited)) return true;
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  return within(exited);
}

/**
 * Windows only: a PowerShell process that holds `file` open with FileShare.None, as Chromium does
 * with some of its profile files, until it is stopped. Resolves once the file is locked.
 */
export async function holdLocked(file: string): Promise<ChildProcess> {
  const holder = spawn(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$f = [System.IO.File]::Open($env:FQF_LOCKED, 'Open', 'Read', 'None'); " +
        "Write-Output 'locked'; Start-Sleep -Seconds 60; $f.Close()",
    ],
    { env: { ...process.env, FQF_LOCKED: file }, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      holder.stdout?.on('data', (d: Buffer) => {
        if (d.toString().includes('locked')) resolve();
      });
      holder.on('exit', () => reject(new Error('the lock holder exited early')));
    });
  } catch (err) {
    await stopAndWait(holder);
    throw err;
  }
  return holder;
}
