// Comparison findings and results (FR-12, ARCH §7.7, 08 §3). The engine highlights the lowest
// premium among comparable quotes. It never ranks coverage, never calls a quote "best" and never
// recommends a plan. Reason codes drive the "why not ranked" text in the UI and PDF (TC-27).
import { z } from 'zod';
import { positivePaiseSchema } from '../money';
import { entityIdSchema, slugSchema } from './common';
import { COVERAGE_TERM_NAMES } from './coverage';
import { insurerIdSchema } from './insurer';
import { resultSourceSchema } from './status';

/** Shown with every highlight (DM-06; 08 §3). Premiums are indicative and not advice. */
export const HIGHLIGHT_LABEL = 'Lowest premium among comparable quotes — not a recommendation';

/** Is the result usable at all? Independent of the request and of other results. */
export const VALIDITY_CODES = [
  'MALFORMED_RESULT',
  'DUPLICATE_RESULT_ID',
  'DUPLICATE_PLAN',
  'STATUS_NOT_COMPLETED',
  'PLAN_LABEL_MISSING',
  'CURRENCY_MISSING',
  'CURRENCY_UNSUPPORTED',
  'PREMIUM_MISSING',
  'PREMIUM_UNPARSEABLE',
  'PREMIUM_NOT_POSITIVE',
  'PREMIUM_PARTS_INVALID',
  'PREMIUM_INCONSISTENT',
  'AMOUNT_UNPARSEABLE',
  'REVIEW_REQUIRED',
] as const;

/** Does the comparison rule allow this kind of result to be ranked? */
export const ELIGIBILITY_CODES = [
  'MANUAL_NOT_RANKED',
  'PREMIUM_BASIS_UNKNOWN',
  'PREMIUM_BASIS_NOT_RANKED',
  'TENURE_NOT_RANKED',
] as const;

/** Does the result cover the same thing as the request? Unknown is never assumed to match. */
export const COMPARABILITY_CODES = [
  'SUM_INSURED_UNKNOWN',
  'SUM_INSURED_UNPARSEABLE',
  'SUM_INSURED_MISMATCH',
  'COVER_TYPE_UNKNOWN',
  'COVER_TYPE_MISMATCH',
  'MEMBERS_UNKNOWN',
  'MEMBERS_MISMATCH',
  'TENURE_UNKNOWN',
  'TENURE_MISMATCH',
  'TERM_UNKNOWN',
  'ADD_ONS_PRESENT',
] as const;

export type ValidityCode = (typeof VALIDITY_CODES)[number];
export type EligibilityCode = (typeof ELIGIBILITY_CODES)[number];
export type ComparabilityCode = (typeof COMPARABILITY_CODES)[number];

export const findingSchema = z.discriminatedUnion('stage', [
  z.strictObject({
    stage: z.literal('validity'),
    code: z.enum(VALIDITY_CODES),
    path: z.string().max(100).optional(),
  }),
  z.strictObject({
    stage: z.literal('eligibility'),
    code: z.enum(ELIGIBILITY_CODES),
    path: z.string().max(100).optional(),
  }),
  z.strictObject({
    stage: z.literal('comparability'),
    code: z.enum(COMPARABILITY_CODES),
    path: z.string().max(100).optional(),
  }),
]);

export type Finding = z.infer<typeof findingSchema>;
export type ValidityFinding = Extract<Finding, { stage: 'validity' }>;
export type EligibilityFinding = Extract<Finding, { stage: 'eligibility' }>;
export type ComparabilityFinding = Extract<Finding, { stage: 'comparability' }>;

/** Results that agree on everything else but show different values for one coverage term. */
export const differenceSchema = z.strictObject({
  term: z.enum(COVERAGE_TERM_NAMES),
  groups: z
    .array(
      z.strictObject({
        valueKey: z.string().max(200),
        resultIds: z.array(entityIdSchema).min(1),
      }),
    )
    .min(2),
});

export type Difference = z.infer<typeof differenceSchema>;

export const NO_HIGHLIGHT_REASONS = [
  /** The comparison set was empty. */
  'NO_RESULTS',
  /** No result passed validity, eligibility and comparability. */
  'NO_COMPARABLE_RESULTS',
  /** Fewer comparable results than the rule requires for a highlight. */
  'TOO_FEW_COMPARABLE',
  /** A valid result failed eligibility or comparability, and the rule suppresses (TC-27). */
  'INCOMPARABLE_CANDIDATES',
  /** Comparable results differ on a coverage term the rule requires to match. */
  'TERMS_DIFFER',
  /** Two or more results share the lowest premium and the rule does not highlight ties. */
  'TIE_NOT_HIGHLIGHTED',
] as const;

export const noHighlightReasonSchema = z.enum(NO_HIGHLIGHT_REASONS);
export type NoHighlightReason = z.infer<typeof noHighlightReasonSchema>;

export const comparisonResultSchema = z
  .strictObject({
    contractsVersion: z.string(),
    rule: z.strictObject({
      id: slugSchema,
      version: z.string(),
      status: z.enum(['provisional', 'approved']),
    }),
    /** Comparable results, ordered by premium, then insurer ID, then result ID. Not a ranking of coverage. */
    comparable: z.array(
      z.strictObject({
        resultId: entityIdSchema,
        insurerId: insurerIdSchema,
        source: resultSourceSchema,
        totalPremiumPaise: positivePaiseSchema,
      }),
    ),
    /** Results kept out of the comparison, in input order, with every reason found. */
    excluded: z.array(
      z.strictObject({
        index: z.int().nonnegative(),
        resultId: entityIdSchema.nullable(),
        insurerId: insurerIdSchema.nullable(),
        findings: z.array(findingSchema).min(1),
      }),
    ),
    differences: z.array(differenceSchema),
    cheapest: z
      .strictObject({
        resultIds: z.array(entityIdSchema).min(1),
        totalPremiumPaise: positivePaiseSchema,
        tie: z.boolean(),
        label: z.literal(HIGHLIGHT_LABEL),
      })
      .nullable(),
    noHighlightReason: noHighlightReasonSchema.nullable(),
  })
  .refine((result) => (result.cheapest === null) !== (result.noHighlightReason === null), {
    message: 'exactly one of cheapest and noHighlightReason',
  });

export type ComparisonResult = z.infer<typeof comparisonResultSchema>;
