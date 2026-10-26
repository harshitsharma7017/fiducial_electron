// S4: render the report HTML to PDF with Chromium's printToPDF. Text and font checks run
// afterwards under Node (scripts/lib/pdf-inspect.mjs and test/rupee-pdf.test.ts).
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, session } from 'electron';
import { check, type Check } from '../../shared/result';
import { buildReportHtml, S4_VARIANTS, type S4Variant } from '../../shared/s4-content';
import { hardenSession } from '../navigation-policy';
import type { SpikeContext, SpikeOutcome } from '../spike-context';
import { withTimeout } from '../util';
import { pdfRenderPreferences } from '../web-preferences';

const PDF_PARTITION = 'fqf-pdf-render';

function htmlFor(variant: S4Variant, ctx: SpikeContext): string {
  const fonts = {
    regularUrl: pathToFileURL(join(ctx.appRoot, 'resources/fonts/NotoSans-Regular.ttf')).href,
    boldUrl: pathToFileURL(join(ctx.appRoot, 'resources/fonts/NotoSans-Bold.ttf')).href,
  };
  switch (variant) {
    case 'bundled-font':
      return buildReportHtml(fonts, null);
    case 'control-substituted-glyph':
      return buildReportHtml(fonts, '■');
    case 'control-system-font':
      return buildReportHtml(null, null);
  }
}

export async function runS4(ctx: SpikeContext): Promise<SpikeOutcome> {
  const checks: Check[] = [];
  const dir = join(ctx.outDir, 's4');
  mkdirSync(dir, { recursive: true });

  const ses = session.fromPartition(PDF_PARTITION);
  hardenSession(ses);
  const blockedRequests: string[] = [];
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url.startsWith('file:');
    if (!allowed) blockedRequests.push(details.url.slice(0, 80));
    callback({ cancel: !allowed });
  });

  const timings: Record<string, number> = {};
  const sizes: Record<string, number> = {};
  for (const variant of S4_VARIANTS) {
    const htmlPath = join(dir, `${variant}.html`);
    writeFileSync(htmlPath, htmlFor(variant, ctx));
    const win = new BrowserWindow({
      show: false,
      webPreferences: pdfRenderPreferences(PDF_PARTITION),
    });
    try {
      const loaded = once(win.webContents, 'did-finish-load');
      await win.loadFile(htmlPath);
      await withTimeout(loaded, 10_000, `${variant} load`);
      const started = performance.now();
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="font-size:8px;width:100%;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        margins: { top: 0.5, bottom: 0.6, left: 0.5, right: 0.5 },
        generateTaggedPDF: true,
      });
      timings[variant] = Math.round(performance.now() - started);
      sizes[variant] = pdf.length;
      writeFileSync(join(dir, `${variant}.pdf`), pdf);
    } finally {
      win.destroy();
    }
  }

  const ms = timings['bundled-font'] ?? Number.POSITIVE_INFINITY;
  checks.push(
    check(
      's4.generated',
      'All three PDFs generated (bundled font + two negative controls)',
      3,
      Object.keys(sizes).length,
      Object.keys(sizes).length === 3,
    ),
    check(
      's4.render-time',
      'printToPDF time for the bundled-font report (ms)',
      '< 5000',
      ms,
      ms < 5000,
    ),
    check(
      's4.no-network',
      'No non-file requests attempted by the render window',
      0,
      blockedRequests.length,
      blockedRequests.length === 0,
    ),
  );
  return { checks, facts: { timingsMs: timings, sizesBytes: sizes, outputDir: 's4/' } };
}
