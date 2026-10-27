// Packaged-content and fuse check (AR-20, DM-04). Fails if app.asar contains anything outside the
// allowlist (source, tests, configs, dev-only modules) or if a required fuse is not set.
// Usage: node scripts/check-package.mjs mac|win
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPackage } from '@electron/asar';
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
const release = join(root, 'release');

function locate() {
  if (target === 'mac') {
    return readdirSync(release)
      .filter((d) => d.startsWith('mac'))
      .flatMap((d) =>
        readdirSync(join(release, d))
          .filter((f) => f.endsWith('.app'))
          .map((appDir) => ({
            label: d,
            asar: join(release, d, appDir, 'Contents/Resources/app.asar'),
            binary: join(release, d, appDir, 'Contents/MacOS', appDir.replace(/\.app$/, '')),
          })),
      );
  }
  if (target === 'win') {
    const dir = join(release, 'win-unpacked');
    return [
      {
        label: 'win-unpacked',
        asar: join(dir, 'resources/app.asar'),
        binary: join(dir, 'Fiducial Quote Fetcher.exe'),
      },
    ];
  }
  console.error('usage: check-package.mjs mac|win');
  process.exit(64);
}

// Runtime production dependencies only (package.json "dependencies").
const ALLOWED = [/^\/package\.json$/, /^\/out(\/|$)/, /^\/node_modules(\/zod(\/.*)?)?$/];
const FORBIDDEN_IN_OUT = /\.(map|ts|tsx)$/;
const REQUIRED_FUSES = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

let failed = false;
for (const { label, asar, binary } of locate()) {
  if (!existsSync(asar) || !existsSync(binary)) {
    console.error(`${label}: app.asar or binary missing`);
    failed = true;
    continue;
  }
  const entries = listPackage(asar, { isPack: false }).map((e) => e.replaceAll('\\', '/'));
  const unexpected = entries.filter(
    (e) => !ALLOWED.some((re) => re.test(e)) || (e.startsWith('/out/') && FORBIDDEN_IN_OUT.test(e)),
  );
  const wire = await getCurrentFuseWire(binary);
  const fuseProblems = Object.entries(REQUIRED_FUSES)
    .filter(([option, enabled]) => (wire[option] === FuseState.ENABLE) !== enabled)
    .map(([option]) => FuseV1Options[option]);
  console.log(JSON.stringify({ label, entries: entries.length, unexpected, fuseProblems }));
  if (unexpected.length > 0 || fuseProblems.length > 0) failed = true;
}
process.exit(failed ? 1 : 0);
