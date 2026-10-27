// Windows file-system probes for the M1 vault and database (Windows evidence run).
// - ACLs of the key, database and vault files left by the S3/S5 development runs, and whether
//   the POSIX modes the code requests (0600 files, 0700 folders) have any effect.
// - Replacing a file by rename while another process holds it open (the vault's atomicWrite).
// - Hard links on the volume (the vault's atomicCreate relies on EEXIST from link()).
// Uses disposable temporary folders and synthetic content only. Writes
// out/evidence/windows-fs-probe.json; on other platforms it records that it was skipped.
// Usage: node scripts/windows-fs-probe.mjs   (after the S3 and S5 development runs)
import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, hostname, tmpdir, userInfo } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { SPIKE_ROOT } from './lib/launch.mjs';

const OUT = join(SPIKE_ROOT, 'out/evidence/windows-fs-probe.json');
const USER_DATA = join(SPIKE_ROOT, 'out/runs/dev/user-data');

function save(report) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
}

if (process.platform !== 'win32') {
  save({ skipped: true, reason: `not Windows (platform ${process.platform})` });
  console.log(`windows-fs-probe: skipped on ${process.platform}`);
  process.exit(0);
}

/** Removes the machine name, user name and absolute locations from recorded text. */
function sanitise(text) {
  const replace = (s, from, to) => (from ? s.split(from).join(to) : s);
  let out = text;
  for (const [from, to] of [
    [SPIKE_ROOT, '<spike>'],
    [tmpdir(), '<tmp>'],
    [homedir(), '~'],
  ]) {
    out = replace(out, from, to);
  }
  for (const [name, to] of [
    [hostname(), '<host>'],
    [userInfo().username, '<user>'],
  ]) {
    if (!name) continue;
    out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), to);
  }
  return out;
}

function powershell(script, env = {}) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).trim();
}

function fileSystemOf(path) {
  const drive = parse(path).root.slice(0, 2);
  try {
    const fs = powershell(
      '(Get-CimInstance Win32_LogicalDisk | Where-Object DeviceID -eq $env:FQF_DRIVE).FileSystem',
      { FQF_DRIVE: drive },
    );
    return { drive, fileSystem: fs || null };
  } catch (err) {
    return { drive, fileSystem: null, error: err.code ?? 'UNKNOWN' };
  }
}

const BROAD = /^(Everyone|BUILTIN\\Users|NT AUTHORITY\\Authenticated Users):/i;

/** icacls entries for a path: one "PRINCIPAL:(rights)" string per access-control entry. */
function aclOf(path) {
  const out = execFileSync('icacls', [path], { encoding: 'utf8' });
  const lines = out.split(/\r?\n/).filter((l) => l.trim() !== '');
  const entries = [];
  for (const [i, line] of lines.entries()) {
    if (/^Successfully processed/i.test(line.trim())) break;
    entries.push(i === 0 ? line.slice(path.length).trim() : line.trim());
  }
  return entries.map(sanitise);
}

function probeAcls() {
  const targets = [
    ['keys/', 'folder for wrapped keys (S3, S5)', 0o700],
    ['keys/db.key.enc', 'wrapped database key (S3)', 0o600],
    ['data/', 'database folder (S3)', 0o700],
    ['data/spike.db', 'encrypted database (S3)', null],
    ['secrets/', 'vault folder (S5)', 0o700],
    ['secrets/keyring.json', 'vault keyring (S5)', 0o600],
  ];
  return targets.map(([rel, what, requestedMode]) => {
    const path = join(USER_DATA, rel);
    if (!existsSync(path)) return { path: rel, what, present: false };
    const entries = aclOf(path);
    return {
      path: rel,
      what,
      present: true,
      requestedMode: requestedMode === null ? null : requestedMode.toString(8),
      reportedMode: (statSync(path).mode & 0o777).toString(8),
      entries,
      broadPrincipals: entries.filter((e) => BROAD.test(e)),
    };
  });
}

/** Mode bits requested at creation in a fresh folder, as Node reports them afterwards. */
function probeModes(dir) {
  const folder = join(dir, 'mode-0700');
  mkdirSync(folder, { mode: 0o700 });
  const file = join(dir, 'mode-0600.bin');
  writeFileSync(file, 'synthetic', { mode: 0o600 });
  return {
    folderRequested: '700',
    folderReported: (statSync(folder).mode & 0o777).toString(8),
    fileRequested: '600',
    fileReported: (statSync(file).mode & 0o777).toString(8),
  };
}

/** Starts PowerShell holding `path` open with the given FileShare mode; resolves once held. */
function holdOpen(path, share) {
  const script =
    '$f = [System.IO.File]::Open($env:FQF_TARGET, [System.IO.FileMode]::Open, ' +
    '[System.IO.FileAccess]::Read, [System.IO.FileShare]$env:FQF_SHARE); ' +
    "[Console]::Out.WriteLine('HELD'); [Console]::Out.Flush(); Start-Sleep -Seconds 60; $f.Close()";
  const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, FQF_TARGET: path, FQF_SHARE: share },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('holder did not start'));
    }, 30_000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('HELD')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('holder exited early'));
    });
  });
}

function release(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
  });
}

/** What atomicWrite does: rename a fully written temporary file over the target. */
function tryRename(dir) {
  const src = join(dir, '.keyring.json.tmp');
  writeFileSync(src, 'new');
  const target = join(dir, 'keyring.json');
  try {
    renameSync(src, target);
    return { renamed: true, code: null };
  } catch (err) {
    return { renamed: false, code: err.code ?? 'UNKNOWN' };
  }
}

async function probeRenameOverOpenTarget(dir) {
  const results = [];
  for (const share of ['None', 'Read, Write', 'Read, Write, Delete']) {
    const caseDir = mkdtempSync(join(dir, 'rename-'));
    const target = join(caseDir, 'keyring.json');
    writeFileSync(target, 'old');
    let holder;
    try {
      holder = await holdOpen(target, share);
      const attempt = tryRename(caseDir);
      await release(holder);
      results.push({
        heldBy: 'another process',
        fileShare: share,
        ...attempt,
        targetAfter: readFileSync(target, 'utf8'),
      });
    } catch (err) {
      if (holder) await release(holder);
      results.push({ heldBy: 'another process', fileShare: share, error: err.message });
    }
  }
  // Control: Node's own handles allow delete sharing, so this should behave like POSIX.
  const caseDir = mkdtempSync(join(dir, 'rename-node-'));
  const target = join(caseDir, 'keyring.json');
  writeFileSync(target, 'old');
  const fd = openSync(target, 'r');
  const attempt = tryRename(caseDir);
  closeSync(fd);
  results.push({
    heldBy: 'Node fs.openSync (same process)',
    fileShare: 'libuv default',
    ...attempt,
    targetAfter: readFileSync(target, 'utf8'),
  });
  return results;
}

function probeHardLinks(dir) {
  const a = join(dir, 'link-a');
  const b = join(dir, 'link-b');
  writeFileSync(a, 'synthetic');
  const result = {};
  try {
    linkSync(a, b);
    result.firstLink = { created: true, links: statSync(a).nlink };
  } catch (err) {
    result.firstLink = { created: false, code: err.code ?? 'UNKNOWN' };
  }
  try {
    linkSync(a, b);
    result.linkOverExistingName = { created: true, code: null };
  } catch (err) {
    result.linkOverExistingName = { created: false, code: err.code ?? 'UNKNOWN' };
  }
  return result;
}

const work = mkdtempSync(join(tmpdir(), 'fqf-fs-probe-'));
const report = { skipped: false };
try {
  report.volumes = {
    spikeWorkspace: fileSystemOf(SPIKE_ROOT),
    tempFolder: fileSystemOf(work),
  };
  report.acls = probeAcls();
  report.modes = probeModes(work);
  report.renameOverOpenTarget = await probeRenameOverOpenTarget(work);
  report.hardLinks = probeHardLinks(work);
} catch (err) {
  report.error = sanitise(String(err?.message ?? err)).slice(0, 300);
} finally {
  rmSync(work, { recursive: true, force: true });
}
save(report);
console.log(`windows-fs-probe: ${report.error ? `error: ${report.error}` : 'done'}`);
process.exit(report.error ? 1 : 0);
