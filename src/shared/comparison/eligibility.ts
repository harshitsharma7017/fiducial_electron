// Ranking eligibility: does the comparison rule allow this kind of result to be ranked at all?
// Covers the policy gates of DM-06: manual results (Q-B10), premium basis and ranked tenure (Q-B02).
// Member eligibility (ages, relationships, floater size) is checked on the request instead,
// by `checkRequestRules`.
import type { EligibilityFinding } from '../contracts/comparison';
import type { NormalizedResult } from '../contracts/quote';
import type { ComparisonRule } from '../rules/comparison-rule';

export function checkEligibility(
  result: NormalizedResult,
  rule: ComparisonRule,
): EligibilityFinding[] {
  const findings: EligibilityFinding[] = [];
  const add = (code: EligibilityFinding['code'], path: string) =>
    findings.push({ stage: 'eligibility', code, path });

  if (result.source === 'manual' && rule.manualResults === 'exclude') {
    add('MANUAL_NOT_RANKED', 'source');
  }
  if (result.premium.basis === 'unknown') add('PREMIUM_BASIS_UNKNOWN', 'premium.basis');
  else if (result.premium.basis !== rule.premiumBasis) {
    add('PREMIUM_BASIS_NOT_RANKED', 'premium.basis');
  }
  if (result.tenureYears !== null && !rule.rankedTenureYears.includes(result.tenureYears)) {
    add('TENURE_NOT_RANKED', 'coverage.tenureYears');
  }
  return findings;
}
