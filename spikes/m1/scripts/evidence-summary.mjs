// Builds a sanitised Markdown summary of an evidence run for the CI job summary.
// Publishes only: environment versions, step outcomes, test counts and names, spike check IDs
// with pass/fail, tamper outcome codes, file-system probe results and the architecture of the
// native SQLite module the app actually loaded. Never publishes check expected/actual values,
// spike facts, fingerprints, logs, keys or database contents.
// Usage: node scripts/evidence-summary.mjs   (STEP_OUTCOMES may hold the workflow's steps JSON)
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from 'node:fs';
import { homedir, release, tmpdir, version } from 'node:os';
import { join, relative } from 'node:path';
import { SPIKE_ROOT } from './lib/launch.mjs';
import { sanitiseException } from './lib/sanitise-exception.mjs';

const EVIDENCE = join(SPIKE_ROOT, 'out/evidence');
const RUNS = join(SPIKE_ROOT, 'out/runs');
const PHASES = [
  's3-create',
  's3-reopen',
  's5-write',
  's5-read',
  's5-decrypt-foreign',
  's5-vault-foreign',
];
const lines = [];
const out = (s = '') => lines.push(s);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function cell(value) {
  return String(value ?? '—').replace(/\|/g, '\\|');
}

function sanitisePath(path) {
  return path
    .split(SPIKE_ROOT)
    .join('<spike>')
    .split(tmpdir())
    .join('<tmp>')
    .split(homedir())
    .join('~');
}

/** CPU architecture recorded in a native module's own header (PE on Windows, Mach-O on macOS). */
function binaryArch(path) {
  const header = Buffer.alloc(4096);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }
  if (header.toString('latin1', 0, 2) === 'MZ') {
    const pe = header.readUInt32LE(0x3c);
    if (header.toString('latin1', pe, pe + 4) !== 'PE\0\0') return 'PE (unreadable header)';
    const machine = header.readUInt16LE(pe + 4);
    const names = { 0x8664: 'x64', 0xaa64: 'arm64', 0x14c: 'x86' };
    return `PE machine 0x${machine.toString(16)} (${names[machine] ?? 'unknown'})`;
  }
  const magic = header.readUInt32LE(0);
  if (magic === 0xfeedfacf) {
    const cpu = header.readUInt32LE(4);
    const names = { 0x0100000c: 'arm64', 0x01000007: 'x64' };
    return `Mach-O cputype 0x${cpu.toString(16)} (${names[cpu] ?? 'unknown'})`;
  }
  if (header.readUInt32BE(0) === 0xcafebabe) return 'Mach-O universal (fat) binary';
  return 'unrecognised format';
}

function expandHome(path) {
  return path.startsWith('~') ? join(homedir(), path.slice(1)) : path;
}

// --- Environment ----------------------------------------------------------------------------
const results = {};
for (const run of ['dev', 'packaged']) {
  results[run] = {};
  for (const phase of PHASES) {
    const r = readJson(join(RUNS, run, `${phase}.json`));
    if (r) results[run][phase] = r;
  }
}
const anyEnv = Object.values(results.dev).concat(Object.values(results.packaged))[0]?.environment;
let windowsCaption = null;
if (process.platform === 'win32') {
  try {
    windowsCaption = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$o = Get-CimInstance Win32_OperatingSystem; "$($o.Caption) | build $($o.BuildNumber) | $($o.OSArchitecture)"',
      ],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    windowsCaption = 'unavailable';
  }
}

out('# M1 Windows evidence run (partial evidence)');
out();
out(
  '> GitHub-hosted runner. This is **partial** evidence for Q-M1-02: a Windows Server image under a ' +
    'runner service account, not a clean Windows 10 22H2 or 11 client machine. It does not establish ' +
    'support on all Windows 10/11 systems.',
);
out();
out('## Environment');
out();
out('| Item | Value |');
out('|---|---|');
out(`| OS | ${cell(windowsCaption ?? `${process.platform} ${release()}`)} |`);
out(`| OS version string | ${cell(version())} |`);
out(`| Runner image | ${cell(process.env.ImageOS)} ${cell(process.env.ImageVersion)} |`);
out(`| Node (host) | ${process.versions.node} ${process.arch} |`);
out(`| PROCESSOR_ARCHITECTURE | ${cell(process.env.PROCESSOR_ARCHITECTURE)} |`);
out(
  `| Electron (spike runs) | ${cell(anyEnv?.electron)} (Chromium ${cell(anyEnv?.chrome)}, Node ${cell(anyEnv?.node)}) |`,
);
out(`| Spike process platform / arch | ${cell(anyEnv?.platform)} / ${cell(anyEnv?.arch)} |`);
out();

// --- Workflow steps -------------------------------------------------------------------------
const steps = (() => {
  try {
    return JSON.parse(process.env.STEP_OUTCOMES ?? '{}');
  } catch {
    return {};
  }
})();
if (Object.keys(steps).length > 0) {
  out('## Workflow steps');
  out();
  out('| Step | Outcome |');
  out('|---|---|');
  for (const [id, s] of Object.entries(steps)) out(`| ${cell(id)} | ${cell(s?.outcome)} |`);
  out();
}

// --- Native module ----------------------------------------------------------------------------
out('## Native SQLite module actually loaded by the app');
out();
out(
  'Path taken from the running Electron process (`require.cache`), then the binary header is read.',
);
out();
out('| Run | Module | Architecture from binary header |');
out('|---|---|---|');
let nativeRows = 0;
for (const run of ['dev', 'packaged']) {
  for (const phase of ['s3-create', 's3-reopen']) {
    for (const p of results[run][phase]?.facts?.nativeModules ?? []) {
      const path = expandHome(String(p));
      const arch = existsSync(path) ? binaryArch(path) : 'file not found';
      // A path inside the spike workspace is shown relative to it, as before; any other path
      // could name the user or machine, so it is redacted.
      const shown = sanitisePath(path);
      const safe = shown.startsWith('<spike>') ? shown : sanitiseException(path);
      out(`| ${run} ${phase} | \`${cell(safe)}\` | ${cell(arch)} |`);
      nativeRows += 1;
    }
  }
}
if (nativeRows === 0) out('| — | no S3 result recorded a loaded module | — |');
out();

// --- Vitest ---------------------------------------------------------------------------------
out('## M1 test suite (Vitest)');
out();
const vitest = readJson(join(EVIDENCE, 'vitest.json'));
if (!vitest) {
  out('No Vitest report found.');
} else {
  out(
    `Total ${vitest.numTotalTests}: **${vitest.numPassedTests} passed**, ` +
      `**${vitest.numFailedTests} failed**, ${vitest.numPendingTests + (vitest.numTodoTests ?? 0)} skipped.`,
  );
  const byStatus = (status) =>
    vitest.testResults.flatMap((f) =>
      f.assertionResults
        .filter((a) => (Array.isArray(status) ? status.includes(a.status) : a.status === status))
        .map((a) => `${relative(SPIKE_ROOT, f.name).replace(/\\/g, '/')} › ${a.fullName}`),
    );
  for (const [title, status] of [
    ['Failed tests (names only)', 'failed'],
    ['Skipped tests', ['skipped', 'pending', 'todo']],
  ]) {
    const names = byStatus(status);
    if (names.length > 0) {
      out();
      out(`**${title}:**`);
      for (const n of names) out(`- ${cell(n)}`);
    }
  }
}
out();

// --- Spike runs -------------------------------------------------------------------------------
out('## S3 / S5 spike runs (check IDs and pass/fail only)');
for (const run of ['dev', 'packaged']) {
  out();
  out(`### ${run === 'dev' ? 'Development' : 'Packaged (fused)'} build`);
  out();
  out('| Phase | Status | Failed checks | Passed checks |');
  out('|---|---|---|---|');
  for (const phase of PHASES) {
    const r = results[run][phase];
    if (!r) {
      out(`| ${phase} | not run / no result | — | — |`);
      continue;
    }
    const failed = r.checks.filter((c) => !c.pass).map((c) => c.id);
    const passed = r.checks.filter((c) => c.pass).map((c) => c.id);
    out(
      `| ${phase} | **${r.status}** | ${cell(failed.join(', ') || 'none')} | ${cell(passed.join(', '))} |`,
    );
  }
}
const runnerFailures = ['dev', 'packaged'].flatMap((run) =>
  PHASES.flatMap((phase) =>
    (results[run][phase]?.checks ?? [])
      .filter((c) => c.id === 'runner' && !c.pass)
      .map((c) => `${run} ${phase}: \`${cell(sanitiseException(c.actual))}\``),
  ),
);
if (runnerFailures.length > 0) {
  out();
  out(
    "**Runner exceptions** (the spike's own exception message only, sanitised, at most 300 " +
      'characters; no stack traces):',
  );
  for (const f of runnerFailures) out(`- ${f}`);
}
out();
out(
  '_Interpretation note:_ on Windows, a "foreign identity refused" result most likely reflects a ' +
    'different per-profile encryption key, not app binding: DPAPI does not bind keys to an app, ' +
    'and any process running as the same user can use it (vault limitation L3).',
);
out();

// --- Tamper experiments -----------------------------------------------------------------------
out('## Database and WAL tampering (disposable databases, random keys)');
out();
const tamper = readJson(join(EVIDENCE, 'sqlite-tamper.json'));
if (!tamper) {
  out('No tamper report found.');
} else {
  const e = tamper.evidence ?? {};
  out('| Scenario | Outcome | Error code | integrity_check |');
  out('|---|---|---|---|');
  for (const p of e.databasePages?.perPage ?? []) {
    out(
      `| Database page ${p.page} modified | ${p.outcome} | ${cell(p.errorCode)} | ${cell(p.integrity)} |`,
    );
  }
  for (const [key, label] of [
    ['walControl', 'WAL untouched (control)'],
    ['walFrameBrokenChecksum', 'WAL frame modified, SQLite checksum broken'],
    ['walFrameValidChecksum', 'WAL frame modified, SQLite checksum recomputed'],
    ['walMissing', 'WAL file missing'],
  ]) {
    const r = e[key];
    if (r) out(`| ${label} | ${r.outcome} | ${cell(r.errorCode)} | ${cell(r.integrity)} |`);
  }
  out();
  if ((tamper.findings ?? []).length > 0) {
    out('**Findings (not acceptable behaviour; need a design decision):**');
    for (const f of tamper.findings) out(`- ${cell(f)}`);
  }
}
out();

// --- File-system probes -----------------------------------------------------------------------
out('## Windows file-system probes');
out();
const fsProbe = readJson(join(EVIDENCE, 'windows-fs-probe.json'));
if (!fsProbe) {
  out('No probe report found.');
} else if (fsProbe.skipped) {
  out(`Skipped: ${cell(fsProbe.reason)}.`);
} else {
  if (fsProbe.error) out(`**Probe error:** \`${cell(sanitiseException(fsProbe.error))}\``);
  const v = fsProbe.volumes ?? {};
  out(
    `Volumes: workspace ${cell(v.spikeWorkspace?.drive)} ${cell(v.spikeWorkspace?.fileSystem)}; ` +
      `temp ${cell(v.tempFolder?.drive)} ${cell(v.tempFolder?.fileSystem)}.`,
  );
  out();
  out('| File (S3/S5 dev run) | Requested mode | Mode reported | ACL entries | Broad principals |');
  out('|---|---|---|---|---|');
  for (const a of fsProbe.acls ?? []) {
    if (!a.present) {
      out(`| ${a.path} | — | not present | — | — |`);
      continue;
    }
    out(
      `| ${a.path} | ${cell(a.requestedMode)} | ${cell(a.reportedMode)} | ${cell(a.entries.join('; '))} | ${cell(a.broadPrincipals.join('; ') || 'none')} |`,
    );
  }
  const m = fsProbe.modes;
  if (m) {
    out();
    out(
      `Fresh folder created with mode ${m.folderRequested} reports ${m.folderReported}; ` +
        `fresh file created with mode ${m.fileRequested} reports ${m.fileReported}.`,
    );
  }
  out();
  out('| Rename over a target held open by | FileShare | Renamed | Error | Target content after |');
  out('|---|---|---|---|---|');
  for (const r of fsProbe.renameOverOpenTarget ?? []) {
    out(
      `| ${cell(r.heldBy)} | ${cell(r.fileShare)} | ${r.renamed != null || r.error == null ? cell(r.renamed ?? r.error) : `\`${cell(sanitiseException(r.error))}\``} | ${cell(r.code)} | ${cell(r.targetAfter)} |`,
    );
  }
  const h = fsProbe.hardLinks;
  if (h) {
    out();
    out(
      `Hard link: first link ${h.firstLink?.created ? `created (link count ${h.firstLink.links})` : `failed (${cell(h.firstLink?.code)})`}; ` +
        `link over an existing name ${h.linkOverExistingName?.created ? '**succeeded (unexpected)**' : `refused (${cell(h.linkOverExistingName?.code)})`}.`,
    );
  }
}
out();

// --- Limitations ------------------------------------------------------------------------------
out('## Not tested / limitations');
out();
for (const item of [
  'Real OS-level "secure storage unavailable" was **not** produced. Fail-closed behaviour is covered only by unit tests with a mocked backend (`test/secret-store.test.ts`, `test/vault.test.ts`) and by the pre-ready probe.',
  'Not a clean Windows 10 22H2 / 11 client machine; runner account and Server image (Q-D07).',
  'No Windows user-password reset, profile loss, second user or roaming-profile scenario (DPAPI key loss, L5).',
  'No crash or power-loss test (L7); no fuzzing (L11).',
  'S1, S2 (session isolation, debug-port check) and S4 Electron runs are not part of this workflow; `debug-port-check.mjs` is macOS-only.',
  'Packaged build is unsigned (S6 blocked).',
]) {
  out(`- ${item}`);
}

const markdown = `${lines.join('\n')}\n`;
mkdirSync(EVIDENCE, { recursive: true });
writeFileSync(join(EVIDENCE, 'summary.md'), markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
process.stdout.write(markdown);
