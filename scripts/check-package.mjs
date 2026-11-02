// Packaged-content and fuse check (AR-20, DM-04). Fails if app.asar contains anything outside the
// allowlist (source, tests, configs, dev-only modules), if any built file contains code of the
// temporary portal demo (scripts/demo-markers.mjs), or if a required fuse is not set.
// Usage: node scripts/check-package.mjs mac|win
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage, statFile } from '@electron/asar';
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { demoMarkersIn } from './demo-markers.mjs';

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

// The app's own build (out/main, out/preload and out/renderer, never other folders in out/) and
// runtime production dependencies only (package.json "dependencies"). The encrypted database
// module (DM-02) may ship its JavaScript, licence and manifest, and its macOS and Windows prebuilt
// binaries: never its C/C++ sources or the Linux binaries.
const SQLITE = '/node_modules/better-sqlite3-multiple-ciphers';
const OS = target === 'mac' ? 'darwin' : 'win32';
const ALLOWED = [
  /^\/package\.json$/,
  /^\/out$/,
  /^\/out\/(main|preload|renderer)(\/|$)/,
  /^\/node_modules(\/zod(\/.*)?)?$/,
  new RegExp(
    `^${SQLITE}(/(LICENSE|package\\.json)|/lib(/.*)?|/prebuilds(/(darwin|win32)-(x64|arm64)\\.node)?)?$`,
  ),
];
/** The binary this package must contain, by build label (mac-arm64, mac = x64, win-unpacked). */
function requiredBinary(label) {
  const arch = label.endsWith('arm64') ? 'arm64' : 'x64';
  return `${SQLITE}/prebuilds/${OS}-${arch}.node`;
}
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
  const demo = entries
    .filter((e) => e.startsWith('/out/') && 'size' in statFile(asar, e.slice(1)))
    .map((e) => ({
      file: e,
      markers: demoMarkersIn(extractFile(asar, e.slice(1)).toString('latin1')),
    }))
    .filter((found) => found.markers.length > 0);
  const wire = await getCurrentFuseWire(binary);
  const fuseProblems = Object.entries(REQUIRED_FUSES)
    .filter(([option, enabled]) => (wire[option] === FuseState.ENABLE) !== enabled)
    .map(([option]) => FuseV1Options[option]);
  // The database cannot open without its native binary for this architecture.
  const missing = entries.includes(requiredBinary(label)) ? [] : [requiredBinary(label)];
  console.log(
    JSON.stringify({ label, entries: entries.length, unexpected, missing, demo, fuseProblems }),
  );
  if (unexpected.length > 0 || missing.length > 0 || demo.length > 0 || fuseProblems.length > 0) {
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
