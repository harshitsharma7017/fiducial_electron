// Post-exit plaintext scan. Runs after a run's spike phases, when no Electron process of the run
// is left, so Chromium's session files (locked while the app runs on Windows) can be read. Reads
// every file under out/runs/<run>, including Chromium's session folder, and compares it with the
// needle digests the in-app scans recorded (src/shared/needle-digest.ts): never the secrets.
// Fails closed: on any match, on any file it cannot read, and when no digests were recorded.
// Prints and writes out/runs/<run>/post-exit-scan.json: relative paths and error codes only.
// Usage: node scripts/scan-after-exit.mjs --run=dev|packaged   (Node 23.6 or later)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SPIKE_ROOT } from './lib/launch.mjs';

const { findDigests } = await import(
  new URL('../src/shared/needle-digest.ts', import.meta.url).href
);

const run = process.argv.find((a) => a.startsWith('--run='))?.slice('--run='.length) ?? 'dev';
const runDir = join(SPIKE_ROOT, 'out/runs', run);
const digestsDir = join(runDir, 'needle-digests');
const rel = (file) => relative(runDir, file).split(sep).join('/');

const report = {
  run,
  status: 'fail',
  reason: null,
  phasesWithDigests: [],
  digests: 0,
  filesScanned: 0,
  bytesScanned: 0,
  matches: [],
  unreadable: [],
};

/** @type {{ phase: string, digest: { length: number, rolling: number, sha256: string } }[]} */
const digests = [];
if (existsSync(digestsDir)) {
  for (const name of readdirSync(digestsDir)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const phase = name.replace(/\.json$/, '');
    const list = JSON.parse(readFileSync(join(digestsDir, name), 'utf8'));
    for (const digest of list) digests.push({ phase, digest });
    report.phasesWithDigests.push(phase);
  }
}
report.digests = digests.length;

if (!existsSync(runDir)) {
  report.reason = 'no run folder';
} else if (digests.length === 0) {
  report.reason = 'no needle digests recorded: nothing to compare (fail closed)';
} else {
  const files = readdirSync(runDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .sort();
  for (const file of files) {
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch (err) {
      report.unreadable.push({ file: rel(file), code: err?.code ?? 'UNKNOWN' });
      continue;
    }
    report.filesScanned += 1;
    report.bytesScanned += bytes.length;
    const found = findDigests(
      bytes,
      digests.map((d) => d.digest),
    );
    for (const digest of found) {
      for (const d of digests.filter((x) => x.digest === digest)) {
        report.matches.push({ file: rel(file), phase: d.phase, needleBytes: digest.length });
      }
    }
  }
  const clean = report.matches.length === 0 && report.unreadable.length === 0;
  report.status = clean ? 'pass' : 'fail';
  if (!clean) {
    report.reason = `${report.matches.length} match(es), ${report.unreadable.length} unreadable file(s)`;
  }
}

if (existsSync(runDir)) {
  writeFileSync(join(runDir, 'post-exit-scan.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'pass' ? 0 : 1);
