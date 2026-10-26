// Extracts text, text runs and font information from a PDF with pdf.js, for the S4 checks.
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** @param {string} path */
export async function inspectPdf(path) {
  const data = new Uint8Array(await readFile(path));
  const loadingTask = getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    // pdf.js 6 only exposes embedded font names (e.g. "BAAAAA+NotoSans-Regular") with this on.
    fontExtraProperties: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  const pages = [];
  const items = [];
  const fonts = {};
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str + (item.hasEOL ? '\n' : '');
      items.push({ str: item.str, fontName: item.fontName });
    }
    // Loading the operator list resolves the font objects referenced by the text runs.
    await page.getOperatorList();
    for (const item of items) {
      if (item.fontName in fonts) continue;
      try {
        const font = page.commonObjs.get(item.fontName);
        fonts[item.fontName] = {
          name: String(font.name ?? 'unnamed'),
          embedded: font.missingFile !== true,
        };
      } catch {
        // Font belongs to another page; resolved when that page is processed.
      }
    }
    pages.push(text);
  }
  const numPages = doc.numPages;
  await loadingTask.destroy();
  return { numPages, text: pages.join('\n'), items, fonts };
}
