// Checks text extracted from a generated PDF for a correctly rendered rupee sign (U+20B9).
// The doc pack's own PDFs show the failure mode this guards against: "₹" printed as "■".

export const RUPEE = '₹';

/** Characters a broken renderer or font typically produces instead of the rupee sign. */
export const SUBSTITUTE_GLYPHS: Readonly<Record<string, string>> = {
  '■': 'U+25A0 BLACK SQUARE',
  '□': 'U+25A1 WHITE SQUARE',
  '�': 'U+FFFD REPLACEMENT CHARACTER',
  '\u0000': 'U+0000 NULL',
};

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** Returns human-readable problems; an empty array means the text passed. */
export function findRupeeTextProblems(text: string, expected: readonly string[]): string[] {
  const problems: string[] = [];
  const flat = normalise(text);
  if (!flat.includes(RUPEE)) problems.push('no U+20B9 rupee sign found');
  for (const [char, label] of Object.entries(SUBSTITUTE_GLYPHS)) {
    if (flat.includes(char)) problems.push(`substitute glyph present: ${label}`);
  }
  if (/\?\s?\d/.test(flat)) problems.push('"?" directly before a number (likely a missing glyph)');
  for (const want of expected) {
    if (!flat.includes(normalise(want))) problems.push(`expected text missing: ${want}`);
  }
  return problems;
}

export interface ExtractedItem {
  str: string;
  fontName: string;
}

export interface ExtractedFont {
  name: string;
  embedded: boolean;
}

/**
 * Every text run containing a rupee sign must be drawn with an embedded font whose name
 * contains `expectedFont`; otherwise the sign came from a system fallback font.
 */
export function findRupeeFontProblems(
  items: readonly ExtractedItem[],
  fonts: Readonly<Record<string, ExtractedFont>>,
  expectedFont: string,
): string[] {
  const problems: string[] = [];
  const rupeeItems = items.filter((i) => i.str.includes(RUPEE));
  if (rupeeItems.length === 0) problems.push('no text run contains U+20B9');
  for (const item of rupeeItems) {
    const font = fonts[item.fontName];
    if (!font) problems.push(`unknown font for run "${item.str}"`);
    else if (!font.embedded) problems.push(`font ${font.name} is not embedded`);
    else if (!font.name.includes(expectedFont)) {
      problems.push(`rupee drawn with ${font.name}, expected ${expectedFont}`);
    }
  }
  return [...new Set(problems)];
}
