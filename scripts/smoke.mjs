// Smoke harness (M2): launches the built app with --smoke-test and checks the in-app results,
// then verifies from outside that the launch guard refuses debugging switches. It also checks that
// the build holds no portal-demo code and that the demo's variables activate nothing in it.
// Usage: node scripts/smoke.mjs [--packaged]   (run `npm run build` or `npm run build:mac` first)
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoMarkersIn } from './demo-markers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');

function packagedExecutable() {
  const release = join(root, 'release');
  if (process.platform === 'darwin') {
    const dir = ['mac-arm64', 'mac', 'mac-universal'].map((d) => join(release, d)).find(existsSync);
    const appName = dir && readdirSync(dir).find((f) => f.endsWith('.app'));
    return appName ? join(dir, appName, 'Contents/MacOS', appName.replace(/\.app$/, '')) : null;
  }
  const win = join(release, 'win-unpacked', 'Fiducial Quote Fetcher.exe');
  return existsSync(win) ? win : null;
}

const executable = packaged ? packagedExecutable() : createRequire(import.meta.url)('electron');
if (!executable || !existsSync(executable)) {
  console.error(packaged ? 'No packaged app found under release/.' : 'Electron binary not found.');
  process.exit(1);
}
const baseArgs = packaged ? [] : [root];

function run(args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!('NODE_OPTIONS' in extraEnv)) delete env.NODE_OPTIONS;
  return new Promise((resolvePromise) => {
    const child = spawn(executable, [...baseArgs, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 60_000);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, timedOut, stdout, stderr });
    });
  });
}

const failures = [];
const report = { packaged, demoInBuild: null, smoke: null, smokeExit: null, guard: [] };

// The production build (out/main, out/preload, out/renderer: what the app runs and what is
// packaged) must not contain the temporary portal demo. app.asar is checked by check-package.mjs.
if (!packaged) {
  const files = ['main', 'preload', 'renderer']
    .flatMap((dir) => readdirSync(join(root, 'out', dir), { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  report.demoInBuild = files
    .map((file) => ({
      file: file.slice(root.length + 1),
      markers: demoMarkersIn(readFileSync(file, 'latin1')),
    }))
    .filter((found) => found.markers.length > 0);
  if (report.demoInBuild.length > 0) failures.push('demo-in-build');
}

// With the demo's variables set, the production app must still have no demo IPC handler and no
// demo bridge (checked in the app: demo.no-ipc-handlers, demo.no-bridge).
const smoke = await run(['--smoke-test'], {
  ENABLE_PORTAL_AUTOMATION_DEMO: '1',
  PORTAL_AUTOMATION_FULL_WORKFLOW: '1',
});
const line = smoke.stdout.split('\n').find((l) => l.startsWith('FQF_SMOKE_RESULT '));
report.smoke = line ? JSON.parse(line.slice('FQF_SMOKE_RESULT '.length)) : null;
// How the app process ended; `timedOut` means the harness killed it after 60 s.
report.smokeExit = { code: smoke.code, signal: smoke.signal, timedOut: smoke.timedOut };
if (smoke.code !== 0 || !report.smoke?.passed) failures.push('smoke');

// Launch guard (DM-04): these must be refused with exit 78 before any window exists.
for (const [id, args, env] of [
  ['remote-debugging-port', ['--remote-debugging-port=9222', '--smoke-test'], {}],
  ['remote-debugging-pipe', ['--remote-debugging-pipe', '--smoke-test'], {}],
  ['inspect', ['--inspect=9229', '--smoke-test'], {}],
]) {
  const r = await run(args, env);
  const refused = r.code === 78 && !r.stdout.includes('FQF_SMOKE_RESULT');
  report.guard.push({ id, exitCode: r.code, signal: r.signal, timedOut: r.timedOut, refused });
  if (!refused) failures.push(`guard.${id}`);
}

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  console.error(`smoke failed: ${failures.join(', ')}`);
  process.exit(1);
}
