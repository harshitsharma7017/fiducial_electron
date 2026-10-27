// Money in integer paise (05 §3, ARCH §3.7). Parsing is strict: anything ambiguous is rejected
// with a reason code and is never guessed, rounded or defaulted to zero. Failures carry a code
// only, never the text that failed.
import { z } from 'zod';

/** A non-negative whole number of paise (1 rupee = 100 paise), within the safe-integer range. */
export const paiseSchema = z.int().nonnegative();
export const positivePaiseSchema = z.int().positive();

export const PAISE_PER_RUPEE = 100;
export const RUPEE_SIGN = '\u20B9';

export const AMOUNT_PARSE_FAILURES = [
  'EMPTY',
  'TOO_LONG',
  'MULTIPLE_AMOUNTS',
  'NEGATIVE',
  'INVALID_FORMAT',
  'INVALID_GROUPING',
  'TOO_MANY_DECIMALS',
  'OUT_OF_RANGE',
] as const;

export type AmountParseFailure = (typeof AMOUNT_PARSE_FAILURES)[number];
export type AmountParseResult =
  { ok: true; paise: number } | { ok: false; reason: AmountParseFailure };

const MAX_AMOUNT_TEXT = 40;
// No-break, narrow no-break and thin spaces appear between the sign and the digits on portals.
const SPACE_VARIANTS = /[\u00A0\u202F\u2009]/g;
const CURRENCY_PREFIX = /^(?:\u20B9|rs\.?|inr)\s*/i;
// The common Indian "only" suffix, as in "Rs. 12,000/-".
const SLASH_DASH_SUFFIX = /\s*\/-$/;
const DIGIT_RUN = /\d[\d,]*(?:\.\d+)?/g;
const AMOUNT_SHAPE = /^([\d,]+)(?:\.(\d*))?$/;
// Indian grouping: the last group has three digits, earlier groups two, the first one or two.
const INDIAN_GROUPED = /^[1-9]\d?(?:,\d{2})*,\d{3}$/;
const UNGROUPED = /^(?:0|[1-9]\d*)$/;

/**
 * Parses a rupee amount such as `₹1,23,456.50`, `Rs. 12,000/-`, `INR 999` or `4500` into paise.
 * Accepts plain digits or Indian digit grouping, at most two decimal places and at most one
 * currency prefix. Rejects negatives, ranges, Western or mixed grouping, and extra text.
 */
export function parseInrAmount(text: string): AmountParseResult {
  if (typeof text !== 'string') return { ok: false, reason: 'INVALID_FORMAT' };
  if (text.length > MAX_AMOUNT_TEXT) return { ok: false, reason: 'TOO_LONG' };

  const body = text
    .replace(SPACE_VARIANTS, ' ')
    .trim()
    .replace(SLASH_DASH_SUFFIX, '')
    .replace(CURRENCY_PREFIX, '');
  if (body === '') return { ok: false, reason: 'EMPTY' };
  if ((body.match(DIGIT_RUN) ?? []).length > 1) return { ok: false, reason: 'MULTIPLE_AMOUNTS' };
  if (/[-−]/.test(body)) return { ok: false, reason: 'NEGATIVE' };

  const shape = AMOUNT_SHAPE.exec(body);
  if (!shape) return { ok: false, reason: 'INVALID_FORMAT' };
  const [, whole = '', fraction] = shape;
  if (!(whole.includes(',') ? INDIAN_GROUPED : UNGROUPED).test(whole)) {
    return { ok: false, reason: 'INVALID_GROUPING' };
  }
  if (fraction !== undefined && fraction.length === 0) {
    return { ok: false, reason: 'INVALID_FORMAT' };
  }
  if (fraction !== undefined && fraction.length > 2) {
    return { ok: false, reason: 'TOO_MANY_DECIMALS' };
  }

  const paise =
    BigInt(whole.replaceAll(',', '')) * BigInt(PAISE_PER_RUPEE) +
    BigInt((fraction ?? '').padEnd(2, '0'));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'OUT_OF_RANGE' };
  return { ok: true, paise: Number(paise) };
}

/** Groups a string of digits the Indian way: 1,23,45,678. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const pairs = head.replace(/\B(?=(\d{2})+$)/g, ',');
  return `${pairs},${digits.slice(-3)}`;
}

/**
 * Formats paise as `₹1,23,456.00`. Always shows two decimal places so the output is exact and
 * parses back to the same value. Does not use `Intl`, whose output differs across ICU builds.
 */
export function formatInr(paise: number, options: { symbol?: boolean } = {}): string {
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new RangeError('formatInr expects a non-negative safe integer number of paise');
  }
  const rupees = Math.floor(paise / PAISE_PER_RUPEE).toString();
  const fraction = (paise % PAISE_PER_RUPEE).toString().padStart(2, '0');
  return `${options.symbol === false ? '' : RUPEE_SIGN}${groupIndian(rupees)}.${fraction}`;
}

/** Whole rupees to paise, for rule tables and tests. */
export function rupees(amount: number): number {
  const paise = amount * PAISE_PER_RUPEE;
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(paise)) {
    throw new RangeError('rupees expects a non-negative whole number of rupees');
  }
  return paise;
}
