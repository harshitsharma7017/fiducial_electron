// The comparison entry point (ARCH §7.7): a pure, deterministic function of the request, the
// insurer results and a versioned rule. No I/O, no clock, no randomness, no locale.
//
// Each result passes through validity, then (if valid) eligibility and comparability. Valid
// results that fail eligibility or comparability are "unranked candidates": under the
// `suppress_highlight` policy any one of them suppresses the highlight for the whole set (TC-27).
import type { ComparisonResult, Finding, ValidityFinding } from '../contracts/comparison';
import { CONTRACTS_VERSION, entityIdSchema } from '../contracts/common';
import { insurerIdSchema } from '../contracts/insurer';
import { type ValidationIssue, type Validated, parseWith } from '../contracts/issues';
import { type NormalizedResult, quoteRequestSchema } from '../contracts/quote';
import { PROVISIONAL_COMPARISON_RULE, comparisonRuleSchema } from '../rules/comparison-rule';
import { checkComparability, findTermDifferences } from './comparability';
import { checkEligibility } from './eligibility';
import { normalizeResult } from './normalize';
import { type Candidate, orderCandidates, selectCheapest } from './selection';
import { checkValidity, findDuplicates } from './validity';

function prefixed(prefix: string, issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path ? `${prefix}.${issue.path}` : prefix,
    code: issue.code,
  }));
}

/** Reads an ID from a malformed result only if it is itself well-formed. */
function safeId(raw: unknown, key: 'resultId' | 'insurerId'): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const parsed = (key === 'resultId' ? entityIdSchema : insurerIdSchema).safeParse(
    (raw as Record<string, unknown>)[key],
  );
  return parsed.success ? parsed.data : null;
}

export function compareQuotes(
  request: unknown,
  results: readonly unknown[],
  rule: unknown = PROVISIONAL_COMPARISON_RULE,
): Validated<ComparisonResult> {
  const parsedRule = parseWith(comparisonRuleSchema, rule);
  const parsedRequest = parseWith(quoteRequestSchema, request);
  if (!parsedRule.ok || !parsedRequest.ok) {
    return {
      ok: false,
      issues: [
        ...(parsedRule.ok ? [] : prefixed('rule', parsedRule.issues)),
        ...(parsedRequest.ok ? [] : prefixed('request', parsedRequest.issues)),
      ],
    };
  }
  const activeRule = parsedRule.value;

  const normalized = results.map((raw) => normalizeResult(raw));
  const duplicatesOf = findDuplicates(
    normalized.flatMap((entry) => (entry.ok ? [entry.value] : [])),
  );

  const excluded: ComparisonResult['excluded'] = [];
  const comparable: NormalizedResult[] = [];
  let unrankedCandidates = 0;

  normalized.forEach((entry, index) => {
    if (!entry.ok) {
      const findings: ValidityFinding[] = entry.issues.map((issue) => ({
        stage: 'validity',
        code: 'MALFORMED_RESULT',
        path: issue.path,
      }));
      excluded.push({
        index,
        resultId: safeId(results[index], 'resultId'),
        insurerId: safeId(results[index], 'insurerId'),
        findings,
      });
      return;
    }

    const result = entry.value;
    const validity = [...duplicatesOf(result), ...checkValidity(result)];
    const findings: Finding[] =
      validity.length > 0
        ? validity
        : [
            ...checkEligibility(result, activeRule),
            ...checkComparability(result, parsedRequest.value, activeRule),
          ];
    if (findings.length === 0) {
      comparable.push(result);
      return;
    }
    if (validity.length === 0) unrankedCandidates += 1;
    excluded.push({ index, resultId: result.resultId, insurerId: result.insurerId, findings });
  });

  const candidates: Candidate[] = orderCandidates(
    comparable.map((result) => ({
      resultId: result.resultId,
      insurerId: result.insurerId,
      source: result.source,
      // Validity guarantees a positive total premium for every comparable result.
      totalPremiumPaise: result.premium.totalPaise as number,
    })),
  );
  const differences = findTermDifferences(comparable, activeRule);

  let selection: Pick<ComparisonResult, 'cheapest' | 'noHighlightReason'>;
  if (results.length === 0) selection = { cheapest: null, noHighlightReason: 'NO_RESULTS' };
  else if (candidates.length === 0) {
    selection = { cheapest: null, noHighlightReason: 'NO_COMPARABLE_RESULTS' };
  } else if (unrankedCandidates > 0 && activeRule.incomparable === 'suppress_highlight') {
    selection = { cheapest: null, noHighlightReason: 'INCOMPARABLE_CANDIDATES' };
  } else if (differences.length > 0) {
    selection = { cheapest: null, noHighlightReason: 'TERMS_DIFFER' };
  } else selection = selectCheapest(candidates, activeRule);

  return {
    ok: true,
    value: {
      contractsVersion: CONTRACTS_VERSION,
      rule: { id: activeRule.id, version: activeRule.version, status: activeRule.status },
      comparable: candidates,
      excluded,
      differences,
      ...selection,
    },
  };
}
