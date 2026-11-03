// Launches the spike under Electron with a cleaned environment and captures its output.
// The IDE this repository is developed in exports ELECTRON_RUN_AS_NODE=1, which would make
// the Electron binary behave as plain Node, so it is always removed here.
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPIKE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PACKAGED_NAME = 'fqf-spike-m1-packaged';

export function devExecutable() {
  // In Node, the electron package exports the path to the downloaded binary.
  return createRequire(import.meta.url)('electron');
}

/** The packaged app: a `.app` bundle on macOS, the packager's output folder on Windows. */
export function packagedAppBundle() {
  const dir = join(
    SPIKE_ROOT,
    'out/package',
    `${PACKAGED_NAME}-${process.platform}-${process.arch}`,
  );
  return process.platform === 'win32' ? dir : join(dir, `${PACKAGED_NAME}.app`);
}

export function packagedExecutable() {
  if (process.platform === 'win32') return join(packagedAppBundle(), `${PACKAGED_NAME}.exe`);
  return join(packagedAppBundle(), 'Contents/MacOS', PACKAGED_NAME);
}

export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_ENABLE_LOGGING;
  return { ...env, ...extra };
}

/** The .app bundle path of whichever binary is launched, used to find leftover processes. */
export function bundleOf(executable) {
  const i = executable.indexOf('.app/');
  return i >= 0 ? executable.slice(0, i + 4) : executable;
}

export function processesUnder(bundlePath) {
  if (process.platform === 'win32') {
    // No `ps` on Windows: list processes whose executable lies under the path. The path is
    // passed through the environment so it never needs quoting in the command.
    const script =
      '(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ' +
      '$_.ExecutablePath.StartsWith($env:FQF_PROCESS_PATH, ' +
      '[System.StringComparison]::OrdinalIgnoreCase) }).ProcessId';
    const pids = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      env: { ...process.env, FQF_PROCESS_PATH: bundlePath },
    });
    return pids
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^\d+$/.test(l))
      .map(Number);
  }
  const out = execFileSync('ps', ['-A', '-o', 'pid=,command='], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes(bundlePath))
    .map((l) => Number(l.split(/\s+/, 1)[0]));
}

/**
 * @param {{ packaged?: boolean, args?: string[], env?: NodeJS.ProcessEnv, logFile: string, timeoutMs?: number }} options
 */
export function launch({ packaged = false, args = [], env, logFile, timeoutMs = 120_000 }) {
  const executable = packaged ? packagedExecutable() : devExecutable();
  const argv = packaged ? args : [SPIKE_ROOT, ...args];
  mkdirSync(dirname(logFile), { recursive: true });
  const log = createWriteStream(logFile);
  const started = Date.now();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, argv, {
      env: env ?? cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      // Give helper processes a moment to exit before looking for leftovers.
      setTimeout(() => {
        log.end();
        resolvePromise({
          executable,
          exitCode,
          signal,
          timedOut,
          durationMs,
          leftoverProcesses: processesUnder(bundleOf(executable)).length,
        });
      }, 1000);
    });
  });
}
