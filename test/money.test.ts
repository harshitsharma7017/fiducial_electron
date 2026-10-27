// Money parsing and formatting in integer paise (05 §3, ARCH §3.7), including property-based
// round trips. Ambiguous amounts must fail with a code, never be guessed.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatInr, parseInrAmount, rupees } from '../src/shared/money';

describe('parseInrAmount', () => {
  it.each([
    ['₹1,23,456.50', 12_345_650],
    ['Rs. 12,000/-', 1_200_000],
    ['Rs 12,000', 1_200_000],
    ['rs.5', 500],
    ['INR 999', 99_900],
    ['inr 1,000.5', 100_050],
    ['4500', 450_000],
    ['  ₹ 99.99  ', 9_999],
    ['₹ 1,000', 100_000],
    ['₹ 1,000', 100_000],
    ['₹1,000/-', 100_000],
    ['12,345', 1_234_500],
    ['1,00,00,000.00', 1_000_000_000],
    ['0.5', 50],
    ['0.05', 5],
    ['0', 0],
  ])('parses %j to %d paise', (text, paise) => {
    expect(parseInrAmount(text)).toEqual({ ok: true, paise });
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['₹', 'EMPTY'],
    ['Rs.', 'EMPTY'],
    ['/-', 'EMPTY'],
    ['1'.repeat(41), 'TOO_LONG'],
    ['₹12,000 - ₹15,000', 'MULTIPLE_AMOUNTS'],
    ['12000 or 13000', 'MULTIPLE_AMOUNTS'],
    ['12 000', 'MULTIPLE_AMOUNTS'],
    ['1e5', 'MULTIPLE_AMOUNTS'],
    ['-500', 'NEGATIVE'],
    ['₹−500', 'NEGATIVE'],
    ['Rs.-1', 'NEGATIVE'],
    ['12,000 + GST', 'INVALID_FORMAT'],
    ['₹₹100', 'INVALID_FORMAT'],
    ['$100', 'INVALID_FORMAT'],
    ['100 USD', 'INVALID_FORMAT'],
    ['.50', 'INVALID_FORMAT'],
    ['12.', 'INVALID_FORMAT'],
    ['abc', 'INVALID_FORMAT'],
    ['१२३', 'INVALID_FORMAT'],
    ['1,234,567', 'INVALID_GROUPING'],
    ['123,456', 'INVALID_GROUPING'],
    ['1,23,4567', 'INVALID_GROUPING'],
    ['1,,000', 'INVALID_GROUPING'],
    [',123', 'INVALID_GROUPING'],
    ['012', 'INVALID_GROUPING'],
    ['00', 'INVALID_GROUPING'],
    ['1.234', 'TOO_MANY_DECIMALS'],
    ['1,234.567', 'TOO_MANY_DECIMALS'],
    ['99999999999999999', 'OUT_OF_RANGE'],
  ])('rejects %j with %s', (text, reason) => {
    expect(parseInrAmount(text)).toEqual({ ok: false, reason });
  });

  it('rejects non-string input without throwing', () => {
    expect(parseInrAmount(12 as unknown as string)).toEqual({
      ok: false,
      reason: 'INVALID_FORMAT',
    });
  });

  it('accepts the largest safe amount and rejects one paisa more', () => {
    expect(parseInrAmount('90071992547409.91')).toEqual({
      ok: true,
      paise: Number.MAX_SAFE_INTEGER,
    });
    expect(parseInrAmount('90071992547409.92')).toEqual({ ok: false, reason: 'OUT_OF_RANGE' });
  });
});

describe('formatInr', () => {
  it.each([
    [0, '₹0.00'],
    [5, '₹0.05'],
    [100, '₹1.00'],
    [99_999, '₹999.99'],
    [100_000, '₹1,000.00'],
    [12_345_650, '₹1,23,456.50'],
    [1_000_000_000, '₹1,00,00,000.00'],
    [Number.MAX_SAFE_INTEGER, '₹9,00,71,99,25,47,409.91'],
  ])('formats %d paise as %s', (paise, text) => {
    expect(formatInr(paise)).toBe(text);
  });

  it('can omit the rupee sign', () => {
    expect(formatInr(12_345_650, { symbol: false })).toBe('1,23,456.50');
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuses %d without echoing it',
    (paise) => {
      expect(() => formatInr(paise)).toThrow(RangeError);
      expect(() => formatInr(paise)).toThrow(/^formatInr expects a non-negative safe integer/);
    },
  );
});

describe('rupees', () => {
  it('converts whole rupees to paise', () => {
    expect(rupees(5_00_000)).toBe(50_000_000);
    expect(rupees(0)).toBe(0);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER])('refuses %d', (amount) => {
    expect(() => rupees(amount)).toThrow(RangeError);
  });
});

describe('money properties', () => {
  const paise = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });

  it('round-trips every safe amount through format and parse', () => {
    fc.assert(
      fc.property(paise, (value) => {
        expect(parseInrAmount(formatInr(value))).toEqual({ ok: true, paise: value });
        expect(parseInrAmount(formatInr(value, { symbol: false }))).toEqual({
          ok: true,
          paise: value,
        });
        expect(parseInrAmount(`Rs. ${formatInr(value, { symbol: false })}/-`)).toEqual({
          ok: true,
          paise: value,
        });
      }),
    );
  });

  it('always formats with Indian grouping and two decimal places', () => {
    fc.assert(
      fc.property(paise, (value) => {
        expect(formatInr(value)).toMatch(/^₹(?:\d{1,3}|[1-9]\d?(?:,\d{2})*,\d{3})\.\d{2}$/);
      }),
    );
  });

  it('parses plain rupees and paise exactly, without floating-point error', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 12 }),
        fc.integer({ min: 0, max: 99 }),
        (r, p) => {
          const text = `${r}.${String(p).padStart(2, '0')}`;
          expect(parseInrAmount(text)).toEqual({ ok: true, paise: r * 100 + p });
        },
      ),
    );
  });

  it('rejects Western grouping for amounts of one lakh and above', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100_000, max: 10 ** 12 }), (r) => {
        const western = r.toString().replace(/\B(?=(\d{3})+$)/g, ',');
        expect(parseInrAmount(western)).toEqual({ ok: false, reason: 'INVALID_GROUPING' });
      }),
    );
  });

  it('never throws, and failures carry only a reason code', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (text) => {
        const result = parseInrAmount(text);
        if (result.ok) {
          expect(Number.isSafeInteger(result.paise) && result.paise >= 0).toBe(true);
        } else {
          expect(Object.keys(result).sort()).toEqual(['ok', 'reason']);
        }
      }),
    );
  });
});
