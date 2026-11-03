// Entry point for the M1 feasibility spike. Throwaway experiment code, not the product app.
// The launch guard runs before any window, session or spike code (DM-04).
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { app, safeStorage, session } from 'electron';
import { parseSpikeArgs, type SpikeId } from '../shared/args';
import { findUnsafeLaunchOptions } from '../shared/launch-guard';
import { check, spikeResultSchema } from '../shared/result';
import { hardenSession, installNavigationPolicy } from './navigation-policy';
import type { SpikeContext, SpikeOutcome } from './spike-context';
import { runS1 } from './spikes/s1-electron';
import { runS2 } from './spikes/s2-sessions';
import { runS3 } from './spikes/s3-sqlite';
import { runS4 } from './spikes/s4-pdf';
import { runS5 } from './spikes/s5-secure-storage';
import { sanitisePath } from './util';

const EXIT_UNSAFE_LAUNCH = 78;
const EXIT_USAGE = 64;
const EXIT_WATCHDOG = 70;

const unsafe = findUnsafeLaunchOptions(process.argv, process.env, process.platform);
if (unsafe.length > 0) {
  process.stderr.write(
    `[fqf-spike] refusing to start: unsafe launch options: ${unsafe.join(', ')}\n`,
  );
  process.exit(EXIT_UNSAFE_LAUNCH);
}

const parsed = parseSpikeArgs(process.argv);
if (!parsed.ok) {
  process.stderr.write(
    `[fqf-spike] usage: --spike=<s1..s5> --out=<dir> [--user-data=<dir>] [--phase=<name>]\n`,
  );
  process.stderr.write(`[fqf-spike] ${parsed.message}\n`);
  process.exit(EXIT_USAGE);
}
const args = parsed.args;
const outDir = resolve(args.out);
mkdirSync(outDir, { recursive: true });
if (args.userData) app.setPath('userData', resolve(args.userData));
// S3 and S5 keep Chromium's own session data (caches, local storage, network state) in a
// separate folder, so their user-data folder holds only the spike's files. On Windows,
// Chromium holds some of those files open without read sharing: a scan of a shared folder
// failed with EBUSY (Windows evidence run, 28 Oct 2026). S2 keeps the default, because its
// cookie inspection reads user-data/Partitions.
if (args.userData && (args.spike === 's3' || args.spike === 's5')) {
  app.setPath('sessionData', `${resolve(args.userData)}-session`);
}

// Recorded for S5: what safeStorage reports before the app is ready (sync API is deprecated).
let preReadySafeStorage: string;
try {
  preReadySafeStorage = String(safeStorage.isEncryptionAvailable());
} catch (err) {
  preReadySafeStorage = `threw ${(err as Error).name}`;
}
let preReadyAsyncSafeStorage: Promise<string>;
try {
  preReadyAsyncSafeStorage = safeStorage.isAsyncEncryptionAvailable().then(
    (v) => String(v),
    (err: unknown) => `rejected ${(err as Error).name}`,
  );
} catch (err) {
  preReadyAsyncSafeStorage = Promise.resolve(`threw ${(err as Error).name}`);
}

installNavigationPolicy();
const watchdog = setTimeout(() => {
  process.stderr.write('[fqf-spike] watchdog expired\n');
  app.exit(EXIT_WATCHDOG);
}, 120_000);

// Quitting is explicit once the spike has written its result.
app.on('window-all-closed', () => undefined);
app.on('will-quit', () => process.stderr.write('[fqf-spike] will-quit\n'));

const RUNNERS: Record<SpikeId, (ctx: SpikeContext) => Promise<SpikeOutcome> | SpikeOutcome> = {
  s1: runS1,
  s2: runS2,
  s3: runS3,
  s4: runS4,
  s5: runS5,
};

function environmentFacts(): Record<string, unknown> {
  return {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    osVersion: process.getSystemVersion(),
    osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? null,
    runningUnderARM64Translation: app.runningUnderARM64Translation,
    isPackaged: app.isPackaged,
    appName: app.getName(),
    appRoot: sanitisePath(app.getAppPath()),
    userData: sanitisePath(app.getPath('userData')),
  };
}

app
  .whenReady()
  .then(async () => {
    hardenSession(session.defaultSession);
    const startedAt = new Date().toISOString();
    let outcome: SpikeOutcome;
    try {
      outcome = await RUNNERS[args.spike]({
        args,
        outDir,
        appRoot: app.getAppPath(),
        preReadySafeStorage,
        preReadyAsyncSafeStorage,
      });
    } catch (err) {
      const message = sanitisePath((err as Error).message ?? String(err)).slice(0, 300);
      outcome = {
        checks: [check('runner', 'Spike ran to completion', 'no error', message, false)],
        facts: {},
      };
    }
    const result = spikeResultSchema.parse({
      spike: args.spike,
      phase: args.phase ?? null,
      status: outcome.checks.length > 0 && outcome.checks.every((c) => c.pass) ? 'pass' : 'fail',
      startedAt,
      environment: environmentFacts(),
      checks: outcome.checks,
      // Round-trip drops undefined values, which are not valid JSON evidence.
      facts: JSON.parse(JSON.stringify(outcome.facts)) as Record<string, unknown>,
    });
    const file = join(outDir, `${args.spike}${args.phase ? `-${args.phase}` : ''}.json`);
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(
      `[fqf-spike] ${args.spike}${args.phase ? `/${args.phase}` : ''}: ${result.status}\n`,
    );
    clearTimeout(watchdog);
    app.quit();
  })
  .catch((err: unknown) => {
    process.stderr.write(`[fqf-spike] fatal: ${sanitisePath(String(err)).slice(0, 300)}\n`);
    app.exit(1);
  });
