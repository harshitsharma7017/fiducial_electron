// Writes the sample import workbooks into test/import-samples/ and checks them (generate.ts).
// Usage: node test/import-samples/run.mjs
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(resolve(HERE, '../..'), 'out/import-samples');
await build({
  configFile: false,
  logLevel: 'warn',
  root: HERE,
  build: {
    outDir: OUT,
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    ssr: join(HERE, 'generate.ts'),
    rollupOptions: {
      external: [/^node:/],
      output: { format: 'cjs', entryFileNames: 'generate.cjs' },
    },
  },
  ssr: { noExternal: true },
});
const { generate } = createRequire(import.meta.url)(join(OUT, 'generate.cjs'));
process.exit((await generate(HERE)) ? 0 : 1);
