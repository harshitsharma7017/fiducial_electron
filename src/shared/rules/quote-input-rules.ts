// Business rules for quote input (FR-02, FR-03). PLACEHOLDER VALUES: the product owner has not
// answered Q-B03 (sums insured), Q-B04 (ages, relationships, member count) or Q-B05 (floater
// rules, pincode). The values below only make the engine testable; they are not approved and
// must be replaced before release. Rules are data, so replacing them needs no code change.
import { z } from 'zod';
import { RELATIONSHIPS, type Relationship } from '../contracts/customer';
import { MAX_CONTRACT_MEMBERS } from '../contracts/quote';
import { positivePaiseSchema, rupees } from '../money';
import { slugSchema } from '../contracts/common';

const relationshipRuleSchema = z
  .strictObject({
    minAge: z.int().min(0).max(120),
    maxAge: z.int().min(0).max(120),
    maxCount: z.int().min(1).max(MAX_CONTRACT_MEMBERS),
  })
  .refine((rule) => rule.minAge <= rule.maxAge);

export const quoteInputRulesSchema = z.strictObject({
  id: slugSchema,
  version: z.string().min(1).max(20),
  status: z.enum(['placeholder', 'approved']),
  maxMembers: z.int().min(1).max(MAX_CONTRACT_MEMBERS),
  /** Relationships absent from this table are not allowed. */
  relationships: z.partialRecord(z.enum(RELATIONSHIPS), relationshipRuleSchema),
  floater: z
    .strictObject({
      minMembers: z.int().min(1).max(MAX_CONTRACT_MEMBERS),
      maxMembers: z.int().min(1).max(MAX_CONTRACT_MEMBERS),
    })
    .refine((rule) => rule.minMembers <= rule.maxMembers),
  sumInsured: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('list'), valuesPaise: z.array(positivePaiseSchema).min(1) }),
    z
      .strictObject({
        kind: z.literal('range'),
        minPaise: positivePaiseSchema,
        maxPaise: positivePaiseSchema,
        stepPaise: positivePaiseSchema,
      })
      .refine((rule) => rule.minPaise <= rule.maxPaise),
  ]),
  tenureYears: z.array(z.int().min(1).max(5)).min(1),
});

export type QuoteInputRules = z.infer<typeof quoteInputRulesSchema>;

const ADULT = { minAge: 18, maxAge: 65, maxCount: 1 } as const;
const CHILD = { minAge: 0, maxAge: 25, maxCount: 4 } as const;
const PARENT = { minAge: 18, maxAge: 80, maxCount: 1 } as const;

/** PLACEHOLDER (Q-B03, Q-B04, Q-B05). Not approved. */
export const PLACEHOLDER_QUOTE_INPUT_RULES: QuoteInputRules = {
  id: 'quote-input-placeholder',
  version: '0.1.0',
  status: 'placeholder',
  maxMembers: 6,
  relationships: {
    self: ADULT,
    spouse: ADULT,
    son: CHILD,
    daughter: CHILD,
    father: PARENT,
    mother: PARENT,
    father_in_law: PARENT,
    mother_in_law: PARENT,
  } satisfies Record<Relationship, unknown>,
  floater: { minMembers: 2, maxMembers: 6 },
  // ₹1 lakh to ₹1 crore in steps of ₹50,000.
  sumInsured: {
    kind: 'range',
    minPaise: rupees(1_00_000),
    maxPaise: rupees(1_00_00_000),
    stepPaise: rupees(50_000),
  },
  tenureYears: [1, 2, 3],
};
