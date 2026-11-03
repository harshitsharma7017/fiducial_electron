// United India motor automation only, against the local copy of the Motor calculator
// (uiic-motor-calculator.cjs). Contacts no insurer: every page is served from 127.0.0.1.
// Usage: node test/insurer-login-e2e/run-motor.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(resolve(HERE, '../..'), 'out/insurer-login-e2e');

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
      output: { format: 'cjs', entryFileNames: 'agent.cjs' },
    },
  },
  ssr: { noExternal: true },
});

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env, FQF_LOGIN_E2E_BUNDLE: join(OUT, 'agent.cjs') };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
const child = spawn(electron, [join(HERE, 'motor-harness.cjs')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
