// What the advisor changed on a handed-over form before its PDF ("let me change it first").
import { describe, expect, it } from 'vitest';
import { formChanges, parseFormValues } from '../src/main/quotes/form-changes';

describe('changes the advisor made on the form', () => {
  it('names each box whose value changed, by its caption', () => {
    expect(
      formChanges(
        [
          ['Sum Insured', '5 Lakh'],
          ['Policy Period', '1 Year'],
          ['Pincode', '380001'],
        ],
        [
          ['Sum Insured', '10 Lakh'],
          ['Policy Period', '1 Year'],
          ['Pincode', ''],
        ],
      ),
    ).toEqual(['Sum Insured: 5 Lakh → 10 Lakh', 'Pincode: 380001 → (empty)']);
  });

  it('tells a caption shown twice apart by its order, and ignores boxes that came or went', () => {
    expect(
      formChanges(
        [
          ['Date of Birth', '01/01/1980'],
          ['Date of Birth', '01/01/1982'],
          ['Old box', 'x'],
        ],
        [
          ['Date of Birth', '01/01/1980'],
          ['Date of Birth', '02/02/1982'],
          ['New box', 'y'],
        ],
      ),
    ).toEqual(['Date of Birth: 01/01/1982 → 02/02/1982']);
  });

  it('reads the page op’s JSON, and nothing from anything else', () => {
    expect(parseFormValues('[["Plan","Gold"],["bad"],[1,2]]')).toEqual([['Plan', 'Gold']]);
    expect(parseFormValues('not json')).toBeNull();
    expect(parseFormValues(undefined)).toBeNull();
  });
});
