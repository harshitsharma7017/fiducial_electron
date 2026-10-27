// Comparability (Q-B01, TC-27). A result is comparable only if it shows the same sum insured,
// cover type, members and tenure as the request, and every term the rule cares about is known.
// An unknown value never matches: the request's values are not assumed. Terms with no requested
// value (co-pay, deductible, room rent) must also agree across the comparable set.
import type { ComparabilityFinding, Difference } from '../contracts/comparison';
import { type CoverageTermName, termValueKey } from '../contracts/coverage';
import type { Member } from '../contracts/customer';
import type { NormalizedResult, QuoteRequest } from '../contracts/quote';
import type { ComparisonRule } from '../rules/comparison-rule';

/** Order-insensitive member set, for equality checks only. Never stored or returned. */
export function memberSetKey(members: readonly Member[]): string {
  return members
    .map((member) => `${member.relationship}:${member.age}`)
    .sort()
    .join('|');
}

/** Terms that must be known and identical across the comparable set under this rule. */
function matchedTerms(rule: ComparisonRule): CoverageTermName[] {
  const terms: CoverageTermName[] = [];
  if (rule.terms.coPay === 'must_match') terms.push('coPay');
  if (rule.terms.deductible === 'must_match') terms.push('deductible');
  if (rule.terms.roomRent === 'must_match') terms.push('roomRent');
  if (rule.addOns === 'must_match') terms.push('addOns');
  return terms;
}

export function checkComparability(
  result: NormalizedResult,
  request: QuoteRequest,
  rule: ComparisonRule,
): ComparabilityFinding[] {
  const findings: ComparabilityFinding[] = [];
  const add = (code: ComparabilityFinding['code'], path: string) =>
    findings.push({ stage: 'comparability', code, path });

  if (result.sumInsuredPaise === null) {
    const unreadable = result.amountIssues.some((issue) => issue.field === 'coverage.sumInsured');
    add(unreadable ? 'SUM_INSURED_UNPARSEABLE' : 'SUM_INSURED_UNKNOWN', 'coverage.sumInsured');
  } else if (result.sumInsuredPaise !== request.sumInsuredPaise) {
    add('SUM_INSURED_MISMATCH', 'coverage.sumInsured');
  }

  if (result.coverType === null) add('COVER_TYPE_UNKNOWN', 'coverage.coverType');
  else if (result.coverType !== request.coverType) add('COVER_TYPE_MISMATCH', 'coverage.coverType');

  if (result.members === null) add('MEMBERS_UNKNOWN', 'coverage.members');
  else if (memberSetKey(result.members) !== memberSetKey(request.members)) {
    add('MEMBERS_MISMATCH', 'coverage.members');
  }

  if (result.tenureYears === null) add('TENURE_UNKNOWN', 'coverage.tenureYears');
  else if (result.tenureYears !== request.tenureYears) {
    add('TENURE_MISMATCH', 'coverage.tenureYears');
  }

  const termsToKnow = matchedTerms(rule);
  if (rule.addOns === 'base_only') termsToKnow.push('addOns');
  for (const name of termsToKnow) {
    if (result.terms[name].status === 'unknown') add('TERM_UNKNOWN', `coverage.terms.${name}`);
  }
  if (
    rule.addOns === 'base_only' &&
    result.terms.addOns.status === 'known' &&
    result.terms.addOns.value.length > 0
  ) {
    add('ADD_ONS_PRESENT', 'coverage.terms.addOns');
  }
  return findings;
}

/**
 * Terms on which otherwise comparable results disagree. Each difference lists the value groups
 * and their result IDs, so the UI and PDF can show what differs instead of a highlight.
 */
export function findTermDifferences(
  comparable: readonly NormalizedResult[],
  rule: ComparisonRule,
): Difference[] {
  const differences: Difference[] = [];
  for (const term of matchedTerms(rule)) {
    const groups = new Map<string, string[]>();
    for (const result of comparable) {
      const key = termValueKey(result.terms, term);
      if (key === null) continue;
      groups.set(key, [...(groups.get(key) ?? []), result.resultId]);
    }
    if (groups.size > 1) {
      differences.push({
        term,
        groups: [...groups.entries()]
          .sort(([a], [b]) => compareText(a, b))
          .map(([valueKey, resultIds]) => ({
            valueKey,
            resultIds: [...resultIds].sort(compareText),
          })),
      });
    }
  }
  return differences;
}

/** Locale-independent string order, so results never depend on the machine's locale. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
