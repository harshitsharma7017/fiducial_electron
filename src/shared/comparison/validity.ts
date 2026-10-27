// Validity: is a normalised result usable at all? Independent of the request and the rule,
// except for duplicates, which need the whole set (TC-09, TC-10).
import type { ValidityFinding } from '../contracts/comparison';
import { planIdentity } from '../contracts/insurer';
import type { NormalizedResult } from '../contracts/quote';

const SUPPORTED_CURRENCY = 'INR';

export function checkValidity(result: NormalizedResult): ValidityFinding[] {
  const findings: ValidityFinding[] = [];
  const add = (code: ValidityFinding['code'], path: string) =>
    findings.push({ stage: 'validity', code, path });

  if (result.status !== 'completed') {
    add('STATUS_NOT_COMPLETED', 'status');
    return findings;
  }
  if (result.planLabel === null) add('PLAN_LABEL_MISSING', 'planLabel');
  if (result.currency === null) add('CURRENCY_MISSING', 'currency');
  else if (result.currency !== SUPPORTED_CURRENCY) add('CURRENCY_UNSUPPORTED', 'currency');

  // An unreadable sum insured is a comparability failure (it is part of the comparability key),
  // not a validity one, so it is reported by `checkComparability` instead.
  for (const issue of result.amountIssues) {
    if (issue.field === 'coverage.sumInsured') continue;
    add(
      issue.field === 'premium.total' ? 'PREMIUM_UNPARSEABLE' : 'AMOUNT_UNPARSEABLE',
      issue.field,
    );
  }

  const { totalPaise, basePaise, gstPaise } = result.premium;
  const totalUnparseable = result.amountIssues.some((issue) => issue.field === 'premium.total');
  if (totalPaise === null && !totalUnparseable) add('PREMIUM_MISSING', 'premium.total');
  if (totalPaise !== null && totalPaise <= 0) add('PREMIUM_NOT_POSITIVE', 'premium.total');
  if (basePaise !== null && basePaise < 0) add('PREMIUM_PARTS_INVALID', 'premium.base');
  if (gstPaise !== null && gstPaise < 0) add('PREMIUM_PARTS_INVALID', 'premium.gst');
  if (totalPaise !== null && totalPaise > 0) {
    const expected = expectedTotal(result.premium);
    const sumMismatch = expected !== null && expected !== totalPaise;
    const partTooLarge = (basePaise ?? 0) > totalPaise || (gstPaise ?? 0) > totalPaise;
    if (sumMismatch || partTooLarge) add('PREMIUM_INCONSISTENT', 'premium');
  }

  if (result.reviewFlags.length > 0) add('REVIEW_REQUIRED', 'reviewFlags');
  return findings;
}

/**
 * What the total must equal, given its parts and basis: base plus GST for a GST-inclusive total,
 * the base alone for a GST-exclusive one. Nothing can be checked when the basis is unknown.
 */
function expectedTotal(premium: NormalizedResult['premium']): number | null {
  switch (premium.basis) {
    case 'incl_gst':
      return premium.basePaise !== null && premium.gstPaise !== null
        ? premium.basePaise + premium.gstPaise
        : null;
    case 'excl_gst':
      return premium.basePaise;
    case 'unknown':
      return null;
  }
}

/**
 * Set-level validity. Results sharing an ID, and completed results with the same insurer and
 * plan label, are all marked: the engine cannot tell which one is right (Q-B16). Returns a
 * lookup for each result of the set.
 */
export function findDuplicates(
  results: readonly NormalizedResult[],
): (result: NormalizedResult) => ValidityFinding[] {
  const planKey = (result: NormalizedResult) =>
    result.status === 'completed' && result.planLabel !== null
      ? planIdentity(result.insurerId, result.planLabel)
      : null;
  const count = (keys: readonly (string | null)[]) => {
    const counts = new Map<string | null, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  };
  const ids = count(results.map((result) => result.resultId));
  const plans = count(results.map(planKey));

  return (result) => {
    const findings: ValidityFinding[] = [];
    if (ids.get(result.resultId)! > 1) {
      findings.push({ stage: 'validity', code: 'DUPLICATE_RESULT_ID', path: 'resultId' });
    }
    const key = planKey(result);
    if (key !== null && plans.get(key)! > 1) {
      findings.push({ stage: 'validity', code: 'DUPLICATE_PLAN', path: 'planLabel' });
    }
    return findings;
  };
}
