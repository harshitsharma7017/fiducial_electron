// Prints the S4 text and font checks for every PDF a run produced (evidence helper).
// Usage: node scripts/inspect-pdfs.mjs [--run=dev|packaged]   (run `npm run build` first)
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { SPIKE_ROOT } from './lib/launch.mjs';
import { inspectPdf } from './lib/pdf-inspect.mjs';

const require = createRequire(import.meta.url);
const { findRupeeFontProblems, findRupeeTextProblems } = require('../dist/shared/rupee-check.js');
const { S4_EXPECTED_STRINGS, S4_VARIANTS } = require('../dist/shared/s4-content.js');

const run = process.argv.find((a) => a.startsWith('--run='))?.slice(6) ?? 'dev';
const report = {};
for (const variant of S4_VARIANTS) {
  const info = await inspectPdf(join(SPIKE_ROOT, 'out/runs', run, 's4', `${variant}.pdf`));
  report[variant] = {
    pages: info.numPages,
    fonts: Object.values(info.fonts),
    rupeeRuns: info.items.filter((i) => i.str.includes('₹')).length,
    textProblems: findRupeeTextProblems(info.text, S4_EXPECTED_STRINGS),
    fontProblems: findRupeeFontProblems(info.items, info.fonts, 'NotoSans'),
    sampleLines: info.text
      .split('\n')
      .filter((l) => /₹|■/.test(l))
      .slice(0, 4),
  };
}
console.log(JSON.stringify({ run, report }, null, 2));
