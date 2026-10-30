// The "no plaintext on disk" scan of S3 and S5, run inside the app.
//
// It reads every file under user-data and the run's output folder (results, captured logs), and
// fails on any match and on any file it cannot read: an unreadable file is never treated as clean.
// The one folder it does not walk is the running Chromium's own session folder (sessionData, a
// separate folder for S3 and S5, see index.ts): on Windows Chromium holds some of those files open
// without read sharing while it runs (EBUSY). That folder is covered by the post-exit scan
// (scripts/scan-after-exit.mjs), which reads every file of the run once the app has exited, from
// the needle digests recorded here, and fails on any match or unreadable file.
// Problems name the file (relative to the run folder) and the error code, never any content.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { app } from 'electron';
import { scanFiles } from '../shared/file-scan';
import { digestNeedle, type NeedleDigest } from '../shared/needle-digest';
import type { SpikeContext } from './spike-context';
import { sanitisePath } from './util';

export interface ScanProblem {
  /** "match": a needle was found in the file. "unreadable": the file could not be read. */
  kind: 'match' | 'unreadable';
  /** Path relative to the run folder (or sanitised, if outside it). */
  file: string;
  /** The error code of an unreadable file. */
  code: string | null;
  /** The phase whose in-app scan found it. */
  scan: string;
}

export interface PlaintextScan {
  /** Matches and unreadable files; the check passes only when this is empty. */
  problems: ScanProblem[];
  /** The running Chromium's session folder, left to the post-exit scan (null if none). */
  deferredToPostExit: string | null;
}

export const DIGESTS_DIR = 'needle-digests';

function phaseLabel(ctx: SpikeContext): string {
  return `${ctx.args.spike}${ctx.args.phase ? `-${ctx.args.phase}` : ''}`;
}

function relativeToRun(ctx: SpikeContext, file: string): string {
  const rel = relative(ctx.outDir, file);
  return rel.startsWith('..') ? sanitisePath(file) : rel.split(sep).join('/');
}

/** Adds this phase's needle digests to <run>/needle-digests/<phase>.json (never the needles). */
function recordDigests(ctx: SpikeContext, needles: readonly Buffer[]): void {
  const dir = join(ctx.outDir, DIGESTS_DIR);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${phaseLabel(ctx)}.json`);
  const existing: NeedleDigest[] = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as NeedleDigest[])
    : [];
  const all = [...existing];
  for (const digest of needles.map(digestNeedle)) {
    if (!all.some((d) => d.sha256 === digest.sha256)) all.push(digest);
  }
  writeFileSync(file, `${JSON.stringify(all)}\n`);
}

export function plaintextScan(ctx: SpikeContext, needles: readonly Buffer[]): PlaintextScan {
  recordDigests(ctx, needles);
  const sessionData = app.getPath('sessionData');
  const ownSession = sessionData === app.getPath('userData') ? null : sessionData;
  const scan = scanFiles(
    [app.getPath('userData'), ctx.outDir],
    needles,
    ownSession ? [ownSession] : [],
  );
  const label = `${phaseLabel(ctx)} (in-app)`;
  return {
    problems: [
      ...scan.hits.map((file) => ({
        kind: 'match' as const,
        file: relativeToRun(ctx, file),
        code: null,
        scan: label,
      })),
      ...scan.unreadable.map((u) => ({
        kind: 'unreadable' as const,
        file: relativeToRun(ctx, u.file),
        code: u.code,
        scan: label,
      })),
    ],
    deferredToPostExit: ownSession ? relativeToRun(ctx, ownSession) : null,
  };
}
