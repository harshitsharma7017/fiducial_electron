import { describe, expect, it } from 'vitest';
import { findRupeeFontProblems, findRupeeTextProblems } from '../src/shared/rupee-check';

const expected = ['₹1,23,456.00'];

describe('findRupeeTextProblems', () => {
  it('passes correct text', () => {
    expect(findRupeeTextProblems('Premium ₹1,23,456.00 incl. GST', expected)).toEqual([]);
  });

  it.each([
    ['black square', 'Premium ■1,23,456.00'],
    ['white square', 'Premium □1,23,456.00'],
    ['replacement character', 'Premium �1,23,456.00'],
    ['question mark', 'Premium ?1,23,456.00'],
    ['missing symbol', 'Premium 1,23,456.00'],
    ['Rs. substitution', 'Premium Rs. 1,23,456.00'],
  ])('fails when the rupee sign is replaced (%s)', (_label, text) => {
    expect(findRupeeTextProblems(text, expected).length).toBeGreaterThan(0);
  });

  it('tolerates extraction whitespace differences', () => {
    expect(findRupeeTextProblems('Premium\n₹1,23,456.00', expected)).toEqual([]);
  });
});

describe('findRupeeFontProblems', () => {
  const items = [{ str: '₹9,999', fontName: 'f1' }];

  it('passes when the rupee is drawn with the embedded bundled font', () => {
    expect(
      findRupeeFontProblems(
        items,
        { f1: { name: 'BAAAAA+NotoSans-Regular', embedded: true } },
        'NotoSans',
      ),
    ).toEqual([]);
  });

  it('fails for a system fallback font or a non-embedded font', () => {
    expect(
      findRupeeFontProblems(
        items,
        { f1: { name: 'CAAAAA+Helvetica', embedded: true } },
        'NotoSans',
      ),
    ).toHaveLength(1);
    expect(
      findRupeeFontProblems(
        items,
        { f1: { name: 'NotoSans-Regular', embedded: false } },
        'NotoSans',
      ),
    ).toHaveLength(1);
  });
});
