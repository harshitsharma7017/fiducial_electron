// Cheapest selection (FR-12). Picks the lowest total premium among comparable results. This is
// the cheapest premium only: it says nothing about which coverage is better and is not a
// recommendation. Ties are deterministic; nothing is highlighted when the rule's conditions fail.
import { HIGHLIGHT_LABEL, type ComparisonResult } from '../contracts/comparison';
import type { ComparisonRule } from '../rules/comparison-rule';
import { compareText } from './comparability';

export type Candidate = ComparisonResult['comparable'][number];
export type Selection = Pick<ComparisonResult, 'cheapest' | 'noHighlightReason'>;

/** Premium, then insurer ID, then result ID: a total order that ignores input order. */
export function orderCandidates(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort(
    (a, b) =>
      a.totalPremiumPaise - b.totalPremiumPaise ||
      compareText(a.insurerId, b.insurerId) ||
      compareText(a.resultId, b.resultId),
  );
}

export function selectCheapest(
  candidates: readonly Candidate[],
  rule: Pick<ComparisonRule, 'ties' | 'minComparableForHighlight'>,
): Selection {
  for (const candidate of candidates) {
    if (!Number.isSafeInteger(candidate.totalPremiumPaise) || candidate.totalPremiumPaise <= 0) {
      throw new RangeError('selectCheapest accepts only positive whole-paise premiums');
    }
  }
  if (candidates.length === 0) {
    return { cheapest: null, noHighlightReason: 'NO_COMPARABLE_RESULTS' };
  }
  if (candidates.length < rule.minComparableForHighlight) {
    return { cheapest: null, noHighlightReason: 'TOO_FEW_COMPARABLE' };
  }

  const lowest = Math.min(...candidates.map((candidate) => candidate.totalPremiumPaise));
  const tied = orderCandidates(candidates).filter(
    (candidate) => candidate.totalPremiumPaise === lowest,
  );
  if (tied.length > 1 && rule.ties === 'no_highlight') {
    return { cheapest: null, noHighlightReason: 'TIE_NOT_HIGHLIGHTED' };
  }
  return {
    cheapest: {
      resultIds: tied.map((candidate) => candidate.resultId),
      totalPremiumPaise: lowest,
      tie: tied.length > 1,
      label: HIGHLIGHT_LABEL,
    },
    noHighlightReason: null,
  };
}
