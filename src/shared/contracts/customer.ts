// Customer and member contracts (FR-01, FR-02). Data minimisation (OPEN_QUESTIONS C-04, C-05):
// no company name, no member names, no gender and no date of birth. Members carry relationship
// and age only. A date of birth is added later only if an insurer adapter requires it (FR-04).
import { z } from 'zod';
import { multiLineText, singleLineText } from './common';

/** Contract-level relationship list. Which ones are accepted is a rule (Q-B04), not the schema. */
export const RELATIONSHIPS = [
  'self',
  'spouse',
  'son',
  'daughter',
  'father',
  'mother',
  'father_in_law',
  'mother_in_law',
] as const;

export const relationshipSchema = z.enum(RELATIONSHIPS);
export type Relationship = z.infer<typeof relationshipSchema>;

/** Hard bounds only. Business age limits per relationship are rules (Q-B04). */
export const MAX_CONTRACT_AGE = 120;

export const memberSchema = z.strictObject({
  relationship: relationshipSchema,
  /** Age in completed years. Infants under one year are 0 (months are not modelled; Q-B04). */
  age: z.int().min(0).max(MAX_CONTRACT_AGE),
});

export type Member = z.infer<typeof memberSchema>;

/**
 * Indian mobile number: ten digits starting 6–9. Spaces and hyphens, a `+91`/`91` country code
 * or a leading `0` are accepted and removed. Landlines are not accepted (provisional).
 */
export const indianMobileSchema = z
  .string()
  .max(20)
  .transform((value) =>
    value.replace(/[\s-]/g, '').replace(/^(?:\+91|91(?=\d{10}$)|0(?=\d{10}$))/, ''),
  )
  .pipe(z.string().regex(/^[6-9]\d{9}$/));

export const customerSchema = z.strictObject({
  name: singleLineText(100),
  phone: indianMobileSchema.optional(),
  email: z.string().trim().max(254).pipe(z.email()).optional(),
  notes: multiLineText(1000).optional(),
});

export type CustomerInput = z.input<typeof customerSchema>;
export type Customer = z.output<typeof customerSchema>;
