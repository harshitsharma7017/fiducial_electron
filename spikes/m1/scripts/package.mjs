// Packages the spike for the current platform and architecture (unsigned; on macOS an ad-hoc
// signature only) and applies the DM-04 fuse settings. The packaged app gets its own name so
// its OS key-store entry never collides with the development run's.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { packager } from '@electron/packager';
import { packagedAppBundle, packagedExecutable, PACKAGED_NAME, SPIKE_ROOT } from './lib/launch.mjs';

const electronVersion = JSON.parse(
  readFileSync(join(SPIKE_ROOT, 'node_modules/electron/package.json'), 'utf8'),
).version;

// Copy only what the app needs at runtime; packager prunes devDependencies from node_modules.
const KEEP = /^\/(package\.json$|dist(\/|$)|resources(\/|$)|node_modules(\/|$))/;
// npm/Vite housekeeping inside node_modules is not a module, so the pruner never sees it.
const DROP = /^\/node_modules\/(\.bin|\.vite|\.vite-temp|\.package-lock\.json)(\/|$)/;

await packager({
  dir: SPIKE_ROOT,
  out: join(SPIKE_ROOT, 'out/package'),
  overwrite: true,
  platform: process.platform,
  arch: process.arch,
  name: PACKAGED_NAME,
  appBundleId: 'local.fqf.spike.m1',
  electronVersion,
  asar: { unpack: '**/*.node' },
  prune: true,
  ignore: (path) => path !== '' && (!KEEP.test(path) || DROP.test(path)),
  afterCopy: [
    ({ buildPath }) => {
      const file = join(buildPath, 'package.json');
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      pkg.name = PACKAGED_NAME;
      delete pkg.scripts;
      writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
    },
  ],
});

// Fuses live in the Electron binary: the .app bundle on macOS, the .exe on Windows.
await flipFuses(process.platform === 'win32' ? packagedExecutable() : packagedAppBundle(), {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: process.platform === 'darwin' && process.arch === 'arm64',
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
});

console.log(`packaged: ${packagedAppBundle()}`);
