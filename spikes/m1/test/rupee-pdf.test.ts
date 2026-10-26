// S4 regression test: generates the report PDF with Electron's printToPDF and checks the
// extracted text and fonts. Fails if ₹ is replaced by ■, ?, � or drawn with a fallback font.
// Requires `npm run build` (run automatically by `npm test` via pretest).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch } from '../scripts/lib/launch.mjs';
import { inspectPdf, type PdfInspection } from '../scripts/lib/pdf-inspect.mjs';
import { findRupeeFontProblems, findRupeeTextProblems } from '../src/shared/rupee-check';
import { S4_EXPECTED_STRINGS } from '../src/shared/s4-content';

const outDir = mkdtempSync(join(tmpdir(), 'fqf-s4-'));
const pdfs: Record<string, PdfInspection> = {};

beforeAll(async () => {
  const result = await launch({
    args: ['--spike=s4', `--out=${outDir}`, `--user-data=${join(outDir, 'user-data')}`],
    logFile: join(outDir, 's4.log'),
    timeoutMs: 60_000,
  });
  expect(result.exitCode).toBe(0);
  const spike = JSON.parse(readFileSync(join(outDir, 's4.json'), 'utf8')) as { status: string };
  expect(spike.status).toBe('pass');
  for (const variant of ['bundled-font', 'control-substituted-glyph', 'control-system-font']) {
    pdfs[variant] = await inspectPdf(join(outDir, 's4', `${variant}.pdf`));
  }
});

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('rupee rendering in generated PDFs', () => {
  it('bundled font: every expected amount and punctuation line is extractable as text', () => {
    expect(findRupeeTextProblems(pdfs['bundled-font']!.text, S4_EXPECTED_STRINGS)).toEqual([]);
  });

  it('bundled font: every ₹ is drawn with the embedded Noto Sans subset', () => {
    const pdf = pdfs['bundled-font']!;
    expect(findRupeeFontProblems(pdf.items, pdf.fonts, 'NotoSans')).toEqual([]);
  });

  it('negative control: a ■ substitution is detected', () => {
    const problems = findRupeeTextProblems(
      pdfs['control-substituted-glyph']!.text,
      S4_EXPECTED_STRINGS,
    );
    expect(problems).toContain('substitute glyph present: U+25A0 BLACK SQUARE');
  });

  it('negative control: a system fallback font is detected even when the text looks right', () => {
    const pdf = pdfs['control-system-font']!;
    expect(findRupeeFontProblems(pdf.items, pdf.fonts, 'NotoSans').length).toBeGreaterThan(0);
  });
});
