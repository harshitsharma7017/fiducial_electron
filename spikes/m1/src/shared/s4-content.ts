// Fictional report content for the S4 rupee-rendering experiment, shared by the PDF generator
// and the regression test so both agree on what must appear.
import { RUPEE } from './rupee-check';

export const S4_VARIANTS = [
  'bundled-font',
  'control-substituted-glyph',
  'control-system-font',
] as const;
export type S4Variant = (typeof S4_VARIANTS)[number];

export const S4_PREMIUMS = [
  '₹1,23,456.00',
  '₹9,999',
  '₹0.50',
  '₹12,34,56,789.99',
  '₹15,000',
  '₹7,250.75',
  '₹45,600',
  '₹1,00,000.00',
] as const;

export const S4_PUNCTUATION_LINE =
  'Sum insured: ₹5,00,000 — cover type "Floater" (2A + 1C); GST @ 18% / fees & charges: ₹ 2,345.00, it’s indicative!';

export const S4_EXPECTED_STRINGS: readonly string[] = [...S4_PREMIUMS, S4_PUNCTUATION_LINE];

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ReportFonts {
  regularUrl: string;
  boldUrl: string;
}

/** `fonts === null` renders with system fonts only (negative control). */
export function buildReportHtml(fonts: ReportFonts | null, substitute: string | null): string {
  const swap = (s: string): string => (substitute ? s.split(RUPEE).join(substitute) : s);
  const fontFaces = fonts
    ? `@font-face { font-family: 'FQF Report Sans'; src: url('${fonts.regularUrl}') format('truetype'); font-weight: 400; font-display: block; }
       @font-face { font-family: 'FQF Report Sans'; src: url('${fonts.boldUrl}') format('truetype'); font-weight: 700; font-display: block; }`
    : '';
  const family = fonts ? `'FQF Report Sans'` : `Helvetica, Arial, sans-serif`;
  const rows = S4_PREMIUMS.map(
    (premium, i) =>
      `<tr><td>Mock Insurer ${i + 1}</td><td>Spike Health Plan ${i + 1} (Family Floater, 2 Adults + 1 Child)</td><td class="num">${escapeHtml(swap(premium))}</td></tr>`,
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src file:; style-src 'unsafe-inline'">
<title>FQF M1 S4 rupee test</title>
<style>
${fontFaces}
body { font-family: ${family}; font-size: 11pt; color: #111; margin: 0; }
h1 { font-size: 16pt; font-weight: 700; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; }
td.num { text-align: right; white-space: nowrap; }
tr { break-inside: avoid; }
.note { font-size: 9pt; }
</style>
</head>
<body>
<h1>FQF M1 spike — rupee rendering test</h1>
<p class="note">Technical spike output with fictional mock data. Not a quotation.</p>
<p>${escapeHtml(swap(S4_PUNCTUATION_LINE))}</p>
<table>
<thead><tr><th>Insurer</th><th>Plan</th><th>Annual premium (incl. GST)</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p class="note">Premiums are indicative and subject to insurer underwriting.</p>
</body>
</html>`;
}
