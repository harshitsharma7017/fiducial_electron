// Runs one spike (and phase) in development or packaged mode and prints a summary.
// Usage: node scripts/run-spike.mjs --spike=s1 [--phase=x] [--packaged] [--run=name] [--foreign=path]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, SPIKE_ROOT } from './lib/launch.mjs';

const opts = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
if (typeof opts.spike !== 'string') {
  console.error('usage: run-spike.mjs --spike=s1 [--phase=x] [--packaged] [--run=name]');
  process.exit(64);
}

const packaged = opts.packaged === true;
const run = typeof opts.run === 'string' ? opts.run : packaged ? 'packaged' : 'dev';
const runDir = join(SPIKE_ROOT, 'out/runs', run);
const label = `${opts.spike}${opts.phase ? `-${opts.phase}` : ''}`;
const args = [
  `--spike=${opts.spike}`,
  `--out=${runDir}`,
  `--user-data=${join(runDir, 'user-data')}`,
];
if (typeof opts.phase === 'string') args.push(`--phase=${opts.phase}`);
if (typeof opts.foreign === 'string') args.push(`--foreign=${opts.foreign}`);

const result = await launch({ packaged, args, logFile: join(runDir, 'logs', `${label}.log`) });
const resultFile = join(runDir, `${label}.json`);
const spikeResult = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')) : null;

console.log(
  JSON.stringify(
    {
      run,
      spike: label,
      packaged,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      leftoverProcesses: result.leftoverProcesses,
      status: spikeResult?.status ?? 'no-result',
      failedChecks: spikeResult?.checks.filter((c) => !c.pass).map((c) => c.id) ?? [],
    },
    null,
    2,
  ),
);
process.exit(spikeResult?.status === 'pass' && result.exitCode === 0 ? 0 : 1);
