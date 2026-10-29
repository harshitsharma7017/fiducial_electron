// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../../README.md).
// End-to-end check against the LOCAL portal copy (start it first with ../local-portal.mjs):
// bundles the demo's real main-process modules and drives them in Electron (harness.cjs).
// Usage: node src/demo/portal-automation/tools/e2e/run.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../..');
const OUT = join(REPO, 'out/portal-demo-e2e');

await build({
  configFile: false,
  logLevel: 'warn',
  root: HERE,
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    ssr: join(HERE, 'entry.ts'),
    rollupOptions: {
      external: ['electron', /^node:/],
      output: { format: 'cjs', entryFileNames: 'demo.cjs' },
    },
  },
  ssr: { noExternal: true },
});

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env, FQF_E2E_BUNDLE: join(OUT, 'demo.cjs') };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
const child = spawn(electron, [join(HERE, 'harness.cjs')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
