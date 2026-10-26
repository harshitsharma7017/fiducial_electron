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

export function packagedAppBundle() {
  return join(
    SPIKE_ROOT,
    'out/package',
    `${PACKAGED_NAME}-${process.platform}-${process.arch}`,
    `${PACKAGED_NAME}.app`,
  );
}

export function packagedExecutable() {
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
