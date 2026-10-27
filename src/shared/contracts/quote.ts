// Quote request, insurer result input and normalised insurer result (FR-03, FR-10, FR-11;
// 04 §2; ARCH §7.7). The request schema enforces shape only; business rules such as age limits
// and allowed sums insured are applied by `validateQuoteRequest` from configurable rule tables.
import { z } from 'zod';
import { AMOUNT_PARSE_FAILURES, positivePaiseSchema } from '../money';
import { entityIdSchema, isoDateTimeSchema } from './common';
import {
  coverageTermsInputSchema,
  coverageTermsSchema,
  coverTypeSchema,
  premiumBasisSchema,
  tenureYearsSchema,
} from './coverage';
import { customerSchema, memberSchema } from './customer';
import { insurerIdSchema, planLabelSchema } from './insurer';
import { appErrorCodeSchema, resultSourceSchema, runStatusSchema } from './status';

/** Hard bound on members per request; the business limit is a rule (Q-B04). */
export const MAX_CONTRACT_MEMBERS = 12;

/** Six digits, first digit 1–9. Format only: serviceability is insurer-specific (Q-B05). */
export const pincodeSchema = z
  .string()
  .max(12)
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^[1-9]\d{5}$/));

export const quoteRequestSchema = z.strictObject({
  members: z.array(memberSchema).min(1).max(MAX_CONTRACT_MEMBERS),
  coverType: coverTypeSchema,
  /** Requested sum insured in paise; per member for individual cover, shared for floater. */
  sumInsuredPaise: positivePaiseSchema,
  tenureYears: tenureYearsSchema,
  pincode: pincodeSchema,
});

export type QuoteRequestInput = z.input<typeof quoteRequestSchema>;
export type QuoteRequest = z.output<typeof quoteRequestSchema>;

/** Payload for the future `quote.create` call (16 §2). No IPC channel is registered in M3. */
export const quoteDraftSchema = z.strictObject({
  customer: customerSchema,
  request: quoteRequestSchema,
});

export type QuoteDraftInput = z.input<typeof quoteDraftSchema>;
export type QuoteDraft = z.output<typeof quoteDraftSchema>;

/**
 * An amount as an adapter or the manual form supplies it: either whole paise or the displayed
 * text, which is parsed strictly. Integers may be negative here so that the engine can report
 * them as invalid instead of rejecting the whole result.
 */
export const amountInputSchema = z.union([
  z.strictObject({ paise: z.int() }),
  z.strictObject({ text: z.string().max(200) }),
]);

export type AmountInput = z.infer<typeof amountInputSchema>;

/** Review flags raised by a parser or the advisor. Any flag keeps a result out of ranking. */
export const REVIEW_FLAGS = ['ambiguous_premium', 'ambiguous_coverage', 'partial_page'] as const;
export const reviewFlagSchema = z.enum(REVIEW_FLAGS);

/** Insurer result as produced by an adapter's `parse` or by manual entry (04 §2, §7). */
export const insurerResultInputSchema = z.strictObject({
  resultId: entityIdSchema,
  insurerId: insurerIdSchema,
  status: runStatusSchema,
  source: resultSourceSchema,
  retrievedAt: isoDateTimeSchema,
  planLabel: planLabelSchema.optional(),
  currency: z
    .string()
    .max(8)
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/))
    .optional(),
  premium: z
    .strictObject({
      total: amountInputSchema.optional(),
      base: amountInputSchema.optional(),
      gst: amountInputSchema.optional(),
      basis: premiumBasisSchema.optional(),
    })
    .optional(),
  coverage: z
    .strictObject({
      sumInsured: amountInputSchema.optional(),
      coverType: coverTypeSchema.optional(),
      tenureYears: tenureYearsSchema.optional(),
      /** The members the insurer quoted for, if it shows them. */
      members: z.array(memberSchema).min(1).max(MAX_CONTRACT_MEMBERS).optional(),
      terms: coverageTermsInputSchema.optional(),
    })
    .optional(),
  reviewFlags: z.array(reviewFlagSchema).max(REVIEW_FLAGS.length).optional(),
  errorCode: appErrorCodeSchema.optional(),
  /** Local evidence reference only (ID, never a path or URL). */
  evidenceRef: entityIdSchema.optional(),
});

export type InsurerResultInput = z.input<typeof insurerResultInputSchema>;

export const AMOUNT_FIELDS = [
  'premium.total',
  'premium.base',
  'premium.gst',
  'coverage.sumInsured',
] as const;

export const amountParseIssueSchema = z.strictObject({
  field: z.enum(AMOUNT_FIELDS),
  reason: z.enum(AMOUNT_PARSE_FAILURES),
});

/**
 * Normalised insurer result. Missing values are `null` (premiums) or `unknown` (terms), never
 * zero and never copied from the request. Amount texts that failed to parse are listed in
 * `amountIssues` with a reason code; their text is not kept.
 */
export const normalizedResultSchema = z.strictObject({
  resultId: entityIdSchema,
  insurerId: insurerIdSchema,
  status: runStatusSchema,
  source: resultSourceSchema,
  retrievedAt: isoDateTimeSchema,
  planLabel: planLabelSchema.nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  premium: z.strictObject({
    totalPaise: z.int().nullable(),
    basePaise: z.int().nullable(),
    gstPaise: z.int().nullable(),
    basis: premiumBasisSchema,
  }),
  sumInsuredPaise: z.int().nullable(),
  coverType: coverTypeSchema.nullable(),
  tenureYears: tenureYearsSchema.nullable(),
  members: z.array(memberSchema).nullable(),
  terms: coverageTermsSchema,
  reviewFlags: z.array(reviewFlagSchema),
  amountIssues: z.array(amountParseIssueSchema),
  errorCode: appErrorCodeSchema.nullable(),
  evidenceRef: entityIdSchema.nullable(),
});

export type NormalizedResult = z.infer<typeof normalizedResultSchema>;
