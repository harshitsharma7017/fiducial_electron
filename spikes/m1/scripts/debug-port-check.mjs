// DM-04 / AR-16: launches the app with debugging-related switches and watches, from outside the
// process, whether any debugger port accepts connections and whether the app refuses to run.
// Usage: node scripts/debug-port-check.mjs [--packaged]
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { cleanEnv, devExecutable, packagedExecutable, SPIKE_ROOT } from './lib/launch.mjs';

const packaged = process.argv.includes('--packaged');
const executable = packaged ? packagedExecutable() : devExecutable();
const runDir = join(SPIKE_ROOT, 'out/runs', packaged ? 'packaged' : 'dev');
const base = packaged ? [] : [SPIKE_ROOT];
const spikeArgs = [
  `--spike=s1`,
  `--out=${join(runDir, 'port-check')}`,
  `--user-data=${join(runDir, 'user-data')}`,
];

const CASES = [
  { id: 'baseline', args: spikeArgs, env: {}, watch: [9222, 9229] },
  {
    id: 'remote-debugging-port',
    args: ['--remote-debugging-port=9222', ...spikeArgs],
    env: {},
    watch: [9222],
  },
  {
    id: 'remote-debugging-pipe',
    args: ['--remote-debugging-pipe', ...spikeArgs],
    env: {},
    watch: [],
  },
  { id: 'inspect', args: ['--inspect=9229', ...spikeArgs], env: {}, watch: [9229] },
  { id: 'inspect-brk', args: ['--inspect-brk=9229', ...spikeArgs], env: {}, watch: [9229] },
  {
    id: 'node-options-inspect',
    args: spikeArgs,
    env: { NODE_OPTIONS: '--inspect=9230' },
    watch: [9230],
  },
  // If RunAsNode were honoured, the binary would act as Node and exit 42.
  {
    id: 'run-as-node',
    // No app path: under RunAsNode the binary evaluates -e directly.
    noAppArg: true,
    args: ['-e', 'process.exit(42)'],
    env: { ELECTRON_RUN_AS_NODE: '1' },
    watch: [],
  },
];
// Positive control (development binary only): the same switch with an app that has no guard.
// Proves the probe can see an open port and shows how soon Chromium opens it.
if (!packaged) {
  CASES.push({
    id: 'control-no-guard',
    controlApp: join(SPIKE_ROOT, 'scripts/fixtures/port-control'),
    args: ['--remote-debugging-port=9222'],
    env: {},
    watch: [9222],
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(150);
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

function descendants(rootPid) {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((l) => l.trim().split(/\s+/).map(Number));
  const pids = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of rows) {
      if (pids.has(ppid) && !pids.has(pid)) {
        pids.add(pid);
        grew = true;
      }
    }
  }
  return [...pids];
}

function listeningPorts(pids) {
  try {
    const out = execFileSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', pids.join(',')], {
      encoding: 'utf8',
    });
    return [...out.matchAll(/:(\d+) \(LISTEN\)/g)].map((m) => Number(m[1]));
  } catch {
    return []; // lsof exits 1 when nothing matches
  }
}

async function runCase(c) {
  for (const port of c.watch) {
    if (await portOpen(port))
      return { id: c.id, skipped: `port ${port} already in use before launch` };
  }
  const started = Date.now();
  const appArgs = c.controlApp ? [c.controlApp] : c.noAppArg ? [] : base;
  const child = spawn(executable, [...appArgs, ...c.args], {
    env: cleanEnv(c.env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  child.stdout.on('data', () => undefined);
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  );
  let done = false;
  void exited.then(() => (done = true));

  const openedPorts = new Set();
  let firstAcceptMs = null;
  const lsofPorts = new Set();
  let polls = 0;
  const deadline = Date.now() + 30_000;
  while (!done && Date.now() < deadline) {
    polls += 1;
    for (const port of c.watch) {
      if (await portOpen(port)) {
        openedPorts.add(port);
        firstAcceptMs ??= Date.now() - started;
      }
    }
    if (polls % 5 === 0) for (const p of listeningPorts(descendants(child.pid))) lsofPorts.add(p);
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!done) child.kill('SIGKILL');
  const { code, signal } = await exited;
  return {
    id: c.id,
    args: c.args.filter((a) => !a.startsWith('--out=') && !a.startsWith('--user-data=')),
    env: Object.keys(c.env),
    exitCode: code,
    signal,
    durationMs: Date.now() - started,
    polls,
    watchedPortsThatAcceptedConnections: [...openedPorts],
    firstAcceptMs,
    listeningPortsSeenByLsof: [...lsofPorts],
    guardMessage: /refusing to start: [^\n]*/.exec(stderr)?.[0] ?? null,
  };
}

const results = [];
for (const c of CASES) {
  results.push(await runCase(c));
  await new Promise((r) => setTimeout(r, 500));
}
mkdirSync(runDir, { recursive: true });
const report = { packaged, executable: executable.replace(SPIKE_ROOT, '<spike>'), results };
writeFileSync(join(runDir, 'debug-port-check.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
