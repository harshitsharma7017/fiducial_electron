// S4 / DM-08: the bundled font files are the verified upstream files, carry the SIL OFL 1.1
// licence in their own name table, and map U+20B9 to a real glyph.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { glyphIdFor, NAME_ID, nameTable } from '../src/shared/ttf';

const FONTS_DIR = join(__dirname, '../resources/fonts');

// SHA-256 recorded when the files were downloaded from notofonts/notofonts.github.io
// (fonts/NotoSans/hinted/ttf/, git blob SHAs matched the GitHub API) on 2026-10-26.
const FONTS = {
  'NotoSans-Regular.ttf': '478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823',
  'NotoSans-Bold.ttf': '1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913',
} as const;

describe.each(Object.entries(FONTS))('%s', (file, sha256) => {
  const font = readFileSync(join(FONTS_DIR, file));

  it('matches the verified upstream file', () => {
    expect(createHash('sha256').update(font).digest('hex')).toBe(sha256);
  });

  it('declares the SIL Open Font License 1.1 in its name table', () => {
    const names = nameTable(font);
    expect(names.get(NAME_ID.family)).toBe('Noto Sans');
    expect(names.get(NAME_ID.licenseDescription)).toMatch(/SIL Open Font License, Version 1\.1/);
    expect(names.get(NAME_ID.licenseUrl)).toMatch(/openfontlicense\.org|scripts\.sil\.org\/OFL/);
  });

  it('maps the rupee sign U+20B9 to a real glyph', () => {
    expect(glyphIdFor(font, 0x20b9)).toBeGreaterThan(0);
  });

  it('control: reports a missing glyph for an unassigned code point', () => {
    expect(glyphIdFor(font, 0x10ffff)).toBe(0);
  });
});

describe('licence file', () => {
  it('ships the OFL text next to the fonts', () => {
    const ofl = readFileSync(join(FONTS_DIR, 'OFL.txt'), 'utf8');
    expect(ofl).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
  });
});
