// The post-exit plaintext scan: needle digests (src/shared/needle-digest.ts) and the scan script
// (scripts/scan-after-exit.mjs). It must find every needle from its digest alone, never report a
// near miss, fail on any file it cannot read, fail when no digests were recorded, and never print
// a needle.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SPIKE_ROOT } from '../scripts/lib/launch.mjs';
import { digestNeedle, findDigests, MIN_NEEDLE_BYTES } from '../src/shared/needle-digest';
import { holdLocked, stopAndWait } from './fixtures/processes';

describe('needle digests', () => {
  const a = Buffer.from(randomBytes(32).toString('base64url'));
  const b = randomBytes(32);

  it('find a needle anywhere in a file, from its digest alone', () => {
    const digests = [digestNeedle(a), digestNeedle(b)];
    for (const at of ['start', 'middle', 'end'] as const) {
      const pad = randomBytes(5000);
      const bytes =
        at === 'start'
          ? Buffer.concat([a, pad])
          : at === 'end'
            ? Buffer.concat([pad, a])
            : Buffer.concat([pad, a, pad]);
      expect(findDigests(bytes, digests)).toEqual([digests[0]]);
    }
    expect(findDigests(Buffer.concat([b, a]), digests)).toEqual(digests);
    expect(findDigests(a, digests)).toEqual([digests[0]]); // the file is exactly the needle
  });

  it('never report a near miss or random data', () => {
    const digests = [digestNeedle(a)];
    const nearMiss = Buffer.from(a);
    nearMiss[10] = nearMiss[10]! ^ 0x01;
    expect(findDigests(Buffer.concat([randomBytes(100), nearMiss]), digests)).toEqual([]);
    expect(findDigests(a.subarray(0, a.length - 1), digests)).toEqual([]);
    expect(findDigests(randomBytes(1 << 20), digests)).toEqual([]);
  });

  it('hold no needle bytes, and refuse needles too short to protect', () => {
    const text = JSON.stringify([digestNeedle(a), digestNeedle(b)]);
    expect(text.includes(a.toString())).toBe(false);
    expect(text.includes(b.toString('hex'))).toBe(false);
    expect(() => digestNeedle(Buffer.alloc(MIN_NEEDLE_BYTES - 1))).toThrow(/at least/);
  });
});

describe('scripts/scan-after-exit.mjs', () => {
  const runs: string[] = [];
  afterAll(() => {
    for (const run of runs)
      rmSync(join(SPIKE_ROOT, 'out/runs', run), { recursive: true, force: true });
  });

  /** A synthetic run folder with a user-data folder, a Chromium session folder and digests. */
  function syntheticRun(needles: Buffer[]): { run: string; dir: string } {
    const run = `test-post-exit-${randomBytes(4).toString('hex')}`;
    runs.push(run);
    const dir = join(SPIKE_ROOT, 'out/runs', run);
    mkdirSync(join(dir, 'user-data/keys'), { recursive: true });
    mkdirSync(join(dir, 'user-data-session/GPUPersistentCache'), { recursive: true });
    mkdirSync(join(dir, 'needle-digests'));
    writeFileSync(join(dir, 'user-data/keys/db.key.enc'), randomBytes(64));
    writeFileSync(join(dir, 'user-data-session/GPUPersistentCache/cache.db'), randomBytes(4096));
    if (needles.length > 0) {
      writeFileSync(
        join(dir, 'needle-digests/s5-write.json'),
        JSON.stringify(needles.map(digestNeedle)),
      );
    }
    return { run, dir };
  }

  function scan(run: string): {
    status: number | null;
    report: Record<string, unknown>;
    out: string;
  } {
    const r = spawnSync(
      process.execPath,
      [join(SPIKE_ROOT, 'scripts/scan-after-exit.mjs'), `--run=${run}`],
      {
        encoding: 'utf8',
      },
    );
    return {
      status: r.status,
      report: JSON.parse(r.stdout) as Record<string, unknown>,
      out: r.stdout + r.stderr,
    };
  }

  it('passes a clean run, reading every file including Chromium session files', () => {
    const { run } = syntheticRun([randomBytes(32)]);
    const r = scan(run);
    expect(r.status).toBe(0);
    expect(r.report).toMatchObject({ status: 'pass', matches: [], unreadable: [], digests: 1 });
    expect(r.report['filesScanned']).toBeGreaterThanOrEqual(3);
  });

  it('reports a needle in a Chromium session file by path and phase, never by value', () => {
    const secret = Buffer.from(randomBytes(24).toString('base64url'));
    const { run, dir } = syntheticRun([secret]);
    writeFileSync(
      join(dir, 'user-data-session/GPUPersistentCache/cache.db'),
      Buffer.concat([randomBytes(100), secret, randomBytes(100)]),
    );
    const r = scan(run);
    expect(r.status).toBe(1);
    expect(r.report['matches']).toEqual([
      {
        file: 'user-data-session/GPUPersistentCache/cache.db',
        phase: 's5-write',
        needleBytes: secret.length,
      },
    ]);
    expect(r.out.includes(secret.toString())).toBe(false);
  });

  it('fails closed when no digests were recorded', () => {
    const { run } = syntheticRun([]);
    const r = scan(run);
    expect(r.status).toBe(1);
    expect(r.report['reason']).toMatch(/no needle digests/);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails on a file it cannot read (POSIX permissions)',
    () => {
      const { run, dir } = syntheticRun([randomBytes(32)]);
      const file = join(dir, 'user-data-session/GPUPersistentCache/cache.db');
      chmodSync(file, 0o000);
      try {
        const r = scan(run);
        expect(r.status).toBe(1);
        expect(r.report['unreadable']).toEqual([
          { file: 'user-data-session/GPUPersistentCache/cache.db', code: 'EACCES' },
        ]);
      } finally {
        chmodSync(file, 0o600);
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'Windows: fails on a session file another process holds without read sharing (EBUSY)',
    async () => {
      const { run, dir } = syntheticRun([randomBytes(32)]);
      const holder = await holdLocked(join(dir, 'user-data-session/GPUPersistentCache/cache.db'));
      let r: ReturnType<typeof scan> | undefined;
      let stopped: boolean | undefined;
      try {
        r = scan(run);
      } finally {
        stopped = await stopAndWait(holder);
      }
      expect(stopped).toBe(true);
      expect(r?.status).toBe(1);
      expect(r?.report['unreadable']).toEqual([
        { file: 'user-data-session/GPUPersistentCache/cache.db', code: 'EBUSY' },
      ]);
    },
    90_000,
  );
});
