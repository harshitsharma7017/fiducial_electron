// The comparability rule (Q-B01, Q-B02, Q-B10; DM-06). PROVISIONAL: the values follow the
// DM-06 recommended defaults where DM-06 gives one and the strictest option where it does not
// (co-pay, deductible, room rent). None of it is approved by the product owner. The rule is
// versioned so that a stored comparison or PDF can name the rule that produced it (ARCH §7.7).
import { z } from 'zod';
import { slugSchema } from '../contracts/common';

const termPolicySchema = z.enum(['must_match', 'ignore']);

export const comparisonRuleSchema = z.strictObject({
  id: slugSchema,
  version: z.string().min(1).max(20),
  status: z.enum(['provisional', 'approved']),
  /** The only premium basis that is ranked. Results with another or unknown basis are not. */
  premiumBasis: z.enum(['incl_gst', 'excl_gst']),
  /** Tenures whose premiums may be ranked. */
  rankedTenureYears: z.array(z.int().min(1).max(5)).min(1),
  /**
   * `base_only`: add-ons must be known and none. `must_match`: known and identical across the
   * comparable set. `ignore`: not considered.
   */
  addOns: z.enum(['base_only', 'must_match', 'ignore']),
  /** `must_match`: the term must be known and identical across the comparable set. */
  terms: z.strictObject({
    coPay: termPolicySchema,
    deductible: termPolicySchema,
    roomRent: termPolicySchema,
  }),
  manualResults: z.enum(['rank', 'exclude']),
  ties: z.enum(['highlight_all', 'no_highlight']),
  /**
   * What happens when a valid result fails eligibility or comparability: `suppress_highlight`
   * (no highlight for the whole set; TC-27 first option, ARCH §3.7) or `exclude_and_rank_rest`.
   */
  incomparable: z.enum(['suppress_highlight', 'exclude_and_rank_rest']),
  /** Minimum number of comparable results before anything is highlighted. */
  minComparableForHighlight: z.int().min(1).max(20),
});

export type ComparisonRule = z.infer<typeof comparisonRuleSchema>;

/** PROVISIONAL (DM-06 recommended defaults; Q-B01, Q-B02, Q-B10). Not approved. */
export const PROVISIONAL_COMPARISON_RULE: ComparisonRule = {
  id: 'dm06-provisional',
  version: '0.1.0',
  status: 'provisional',
  premiumBasis: 'incl_gst',
  rankedTenureYears: [1],
  addOns: 'base_only',
  terms: { coPay: 'must_match', deductible: 'must_match', roomRent: 'must_match' },
  manualResults: 'rank',
  ties: 'highlight_all',
  incomparable: 'suppress_highlight',
  minComparableForHighlight: 2,
};
