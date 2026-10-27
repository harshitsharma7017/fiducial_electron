// Coverage terms (sum insured, cover type, tenure, co-pay, deductible, room rent, add-ons).
// Every term is explicitly `known` or `unknown`. A term the insurer did not show, or that the
// contract cannot express (for example an age-dependent co-pay), is recorded as `unknown`;
// it is never filled in from the request or from a default.
import { z } from 'zod';
import { paiseSchema, positivePaiseSchema } from '../money';
import { slugSchema } from './common';

export const COVER_TYPES = ['individual', 'floater'] as const;
export const coverTypeSchema = z.enum(COVER_TYPES);
export type CoverType = z.infer<typeof coverTypeSchema>;

/** Hard bounds only; which tenures may be requested or ranked are rules (DM-06, Q-B02). */
export const tenureYearsSchema = z.int().min(1).max(5);

export const PREMIUM_BASES = ['incl_gst', 'excl_gst', 'unknown'] as const;
export const premiumBasisSchema = z.enum(PREMIUM_BASES);
export type PremiumBasis = z.infer<typeof premiumBasisSchema>;

const unknownTerm = z.strictObject({ status: z.literal('unknown') });

function term<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('status', [
    unknownTerm,
    z.strictObject({ status: z.literal('known'), value }),
  ]);
}

/** Flat co-pay as a whole percentage of each claim (0 means no co-pay). */
export const coPaySchema = term(z.int().min(0).max(100));

/** Aggregate deductible in paise (0 means no deductible). */
export const deductibleSchema = term(paiseSchema);

export const ROOM_CATEGORIES = ['shared', 'single_private'] as const;

export const roomRentSchema = term(
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('no_limit') }),
    z.strictObject({ kind: z.literal('per_day_cap'), capPaise: positivePaiseSchema }),
    z.strictObject({
      kind: z.literal('percent_of_sum_insured'),
      /** Hundredths of a percent: 100 means 1% of the sum insured per day. */
      basisPoints: z.int().min(1).max(10_000),
    }),
    z.strictObject({ kind: z.literal('room_category'), category: z.enum(ROOM_CATEGORIES) }),
  ]),
);

/** Optional add-ons included in the premium, as slugs; an empty list means the base plan only. */
export const addOnsSchema = term(z.array(slugSchema).max(20));

export const coverageTermsSchema = z.strictObject({
  coPay: coPaySchema,
  deductible: deductibleSchema,
  roomRent: roomRentSchema,
  addOns: addOnsSchema,
});

export type CoverageTerms = z.infer<typeof coverageTermsSchema>;
export type CoverageTermName = keyof CoverageTerms;
export const COVERAGE_TERM_NAMES = ['coPay', 'deductible', 'roomRent', 'addOns'] as const;

/** Input form: any term may be omitted, and an omitted term normalises to `unknown`. */
export const coverageTermsInputSchema = coverageTermsSchema.partial();

/**
 * A stable text key for a known term value, used to group and compare values, for example
 * `20`, `per_day_cap:500000` or `none`. Returns null for an unknown term. Add-ons are
 * order-insensitive.
 */
export function termValueKey(terms: CoverageTerms, name: CoverageTermName): string | null {
  switch (name) {
    case 'coPay':
      return terms.coPay.status === 'known' ? String(terms.coPay.value) : null;
    case 'deductible':
      return terms.deductible.status === 'known' ? String(terms.deductible.value) : null;
    case 'addOns':
      return terms.addOns.status === 'known'
        ? [...new Set(terms.addOns.value)].sort().join(',') || 'none'
        : null;
    case 'roomRent': {
      if (terms.roomRent.status === 'unknown') return null;
      const rent = terms.roomRent.value;
      switch (rent.kind) {
        case 'no_limit':
          return rent.kind;
        case 'per_day_cap':
          return `${rent.kind}:${rent.capPaise}`;
        case 'percent_of_sum_insured':
          return `${rent.kind}:${rent.basisPoints}`;
        case 'room_category':
          return `${rent.kind}:${rent.category}`;
      }
    }
  }
}
