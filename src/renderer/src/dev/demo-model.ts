// DEVELOPMENT-ONLY view model for the M3 comparison demonstration. It runs the real M3 entry
// points and only arranges their output for display:
//   1. `validateQuoteDraft` with the placeholder input rules (as the future quote.create will);
//   2. `compareQuotes` with its default (provisional) comparison rule;
//   3. `normalizeResult` per quote, solely to show what the engine read from each record.
// No eligibility, comparability, exclusion or selection decision is made here. Each row's
// outcome is looked up in the engine's `comparable`, `excluded` and `cheapest` fields.
// Pure TypeScript: no React, DOM, IPC, storage or network, so it can be unit-tested in Node.
import { compareQuotes } from '../../../shared/comparison/compare';
import { normalizeResult } from '../../../shared/comparison/normalize';
import type {
  ComparabilityCode,
  ComparisonResult,
  Difference,
  EligibilityCode,
  Finding,
  NoHighlightReason,
  ValidityCode,
} from '../../../shared/contracts/comparison';
import type {
  CoverageTermName,
  CoverageTerms,
  CoverType,
  PremiumBasis,
} from '../../../shared/contracts/coverage';
import type { Member, Relationship } from '../../../shared/contracts/customer';
import type { ValidationIssue } from '../../../shared/contracts/issues';
import type { NormalizedResult, QuoteDraft } from '../../../shared/contracts/quote';
import type { ResultSource, RunStatus } from '../../../shared/contracts/status';
import { formatInr } from '../../../shared/money';
import { PLACEHOLDER_QUOTE_INPUT_RULES } from '../../../shared/rules/quote-input-rules';
import { type RequestRuleCode, validateQuoteDraft } from '../../../shared/validation/quote-request';
import type { DemoScenario } from './demo-scenarios';

export type StageStatus = 'passed' | 'failed' | 'not_assessed';

export interface DemoRow {
  /** Position in the scenario's quote list (the engine's `excluded[].index`). */
  index: number;
  resultId: string | null;
  insurerLabel: string;
  /** What `normalizeResult` produced; null when the record is malformed. */
  normalized: NormalizedResult | null;
  /** Taken from the engine output: in `cheapest.resultIds`, in `comparable`, or in `excluded`. */
  outcome: 'highlighted' | 'comparable' | 'excluded';
  validity: Exclude<StageStatus, 'not_assessed'>;
  /** The engine checks eligibility and comparability only for valid results. */
  eligibility: StageStatus;
  comparability: StageStatus;
  /** The engine's findings for this quote, unchanged. Empty for comparable quotes. */
  findings: readonly Finding[];
}

export type DemoRun =
  | { kind: 'request-invalid'; issues: ValidationIssue[] }
  | { kind: 'engine-rejected'; issues: ValidationIssue[] }
  | { kind: 'compared'; draft: QuoteDraft; comparison: ComparisonResult; rows: DemoRow[] };

/**
 * Runs one scenario through the real M3 engine. `comparisonRule` is passed straight to
 * `compareQuotes`; leaving it undefined uses the engine's own default (the provisional rule).
 */
export function runDemo(scenario: DemoScenario, comparisonRule?: unknown): DemoRun {
  const draft = validateQuoteDraft(
    { customer: scenario.customer, request: scenario.request },
    PLACEHOLDER_QUOTE_INPUT_RULES,
  );
  if (!draft.ok) return { kind: 'request-invalid', issues: draft.issues };

  const compared = compareQuotes(draft.value.request, scenario.quotes, comparisonRule);
  if (!compared.ok) return { kind: 'engine-rejected', issues: compared.issues };

  return {
    kind: 'compared',
    draft: draft.value,
    comparison: compared.value,
    rows: buildRows(scenario, compared.value),
  };
}

function insurerLabel(scenario: DemoScenario, insurerId: string | null): string {
  return (
    scenario.insurers.find((insurer) => insurer.id === insurerId)?.displayName ??
    insurerId ??
    'Unidentified quote record'
  );
}

function stageStatus(findings: readonly Finding[], stage: Finding['stage']): StageStatus {
  return findings.some((finding) => finding.stage === stage) ? 'failed' : 'passed';
}

/** Joins each input quote to its place in the engine output. Exported for tests. */
export function buildRows(scenario: DemoScenario, comparison: ComparisonResult): DemoRow[] {
  const labelOf = (insurerId: string | null): string => insurerLabel(scenario, insurerId);
  const highlighted = new Set(comparison.cheapest?.resultIds ?? []);

  return scenario.quotes.map((raw, index): DemoRow => {
    const normalizedEntry = normalizeResult(raw);
    const normalized = normalizedEntry.ok ? normalizedEntry.value : null;
    const excluded = comparison.excluded.find((entry) => entry.index === index);

    if (excluded) {
      const invalid = excluded.findings.some((finding) => finding.stage === 'validity');
      return {
        index,
        resultId: excluded.resultId,
        insurerLabel: labelOf(excluded.insurerId),
        normalized,
        outcome: 'excluded',
        validity: invalid ? 'failed' : 'passed',
        eligibility: invalid ? 'not_assessed' : stageStatus(excluded.findings, 'eligibility'),
        comparability: invalid ? 'not_assessed' : stageStatus(excluded.findings, 'comparability'),
        findings: excluded.findings,
      };
    }

    const candidate = comparison.comparable.find(
      (entry) => normalized !== null && entry.resultId === normalized.resultId,
    );
    if (!candidate) {
      // The engine places every input in `comparable` or `excluded`; anything else is a defect.
      throw new Error(`engine output does not account for quote ${index}`);
    }
    return {
      index,
      resultId: candidate.resultId,
      insurerLabel: labelOf(candidate.insurerId),
      normalized,
      outcome: highlighted.has(candidate.resultId) ? 'highlighted' : 'comparable',
      validity: 'passed',
      eligibility: 'passed',
      comparability: 'passed',
      findings: [],
    };
  });
}

// ---- Display text. Demo copy only; the approved user-facing wording is an M6 deliverable. ----

export const FINDING_TEXT: Record<ValidityCode | EligibilityCode | ComparabilityCode, string> = {
  MALFORMED_RESULT: 'The quote record does not match the result contract and cannot be read.',
  DUPLICATE_RESULT_ID: 'Another quote in this set has the same result ID.',
  DUPLICATE_PLAN: 'Another quote from this insurer has the same plan label.',
  STATUS_NOT_COMPLETED: 'The insurer run did not complete, so there is no quote to compare.',
  PLAN_LABEL_MISSING: 'The quote has no plan label.',
  CURRENCY_MISSING: 'The quote does not state its currency.',
  CURRENCY_UNSUPPORTED: 'The quote is not in Indian rupees (INR).',
  PREMIUM_MISSING: 'The quote has no total premium. A missing premium is never treated as zero.',
  PREMIUM_UNPARSEABLE: 'The total premium text could not be read as a single rupee amount.',
  PREMIUM_NOT_POSITIVE: 'The total premium is zero or negative.',
  PREMIUM_PARTS_INVALID: 'The base premium or GST amount is negative.',
  PREMIUM_INCONSISTENT: 'The base premium and GST do not add up to the total premium.',
  AMOUNT_UNPARSEABLE: 'A premium component could not be read as a rupee amount.',
  REVIEW_REQUIRED: 'The quote is flagged for advisor review.',
  MANUAL_NOT_RANKED: 'The comparison rule does not rank manually entered quotes.',
  PREMIUM_BASIS_UNKNOWN: 'It is not known whether the premium includes GST.',
  PREMIUM_BASIS_NOT_RANKED: 'The premium is on a different GST basis from the one the rule ranks.',
  TENURE_NOT_RANKED: 'The comparison rule does not rank premiums for this policy tenure.',
  SUM_INSURED_UNKNOWN: 'The quote does not show its sum insured.',
  SUM_INSURED_UNPARSEABLE: 'The sum insured could not be read as a rupee amount.',
  SUM_INSURED_MISMATCH: 'The sum insured differs from the requested sum insured.',
  COVER_TYPE_UNKNOWN: 'The quote does not show whether it is individual or floater cover.',
  COVER_TYPE_MISMATCH: 'The cover type differs from the request.',
  MEMBERS_UNKNOWN: 'The quote does not show which members it covers.',
  MEMBERS_MISMATCH: 'The covered members differ from the request.',
  TENURE_UNKNOWN: 'The quote does not show its policy tenure.',
  TENURE_MISMATCH: 'The policy tenure differs from the request.',
  TERM_UNKNOWN: 'A coverage term the rule requires is not shown.',
  ADD_ONS_PRESENT: 'The premium includes add-ons; the rule compares base plans only.',
};

export const NO_HIGHLIGHT_TEXT: Record<NoHighlightReason, string> = {
  NO_RESULTS: 'No quotes were supplied, so there is nothing to compare.',
  NO_COMPARABLE_RESULTS: 'No quote passed every validity, eligibility and comparability check.',
  TOO_FEW_COMPARABLE: 'Too few quotes are comparable for the rule to highlight a lowest premium.',
  INCOMPARABLE_CANDIDATES:
    'At least one otherwise valid quote is not eligible or not comparable. Under the current rule this withholds the highlight for the whole set, so a cheaper but different quote is never hidden behind a highlight.',
  TERMS_DIFFER:
    'The comparable quotes differ on a coverage term the rule requires to match, so their premiums are not like for like.',
  TIE_NOT_HIGHLIGHTED:
    'Two or more quotes share the lowest premium and the rule does not highlight ties.',
};

export const REQUEST_ISSUE_TEXT: Record<RequestRuleCode, string> = {
  RULES_INVALID: 'The input rule table is invalid.',
  RELATIONSHIP_NOT_ALLOWED: 'This relationship is not allowed by the input rules.',
  RELATIONSHIP_LIMIT_EXCEEDED: 'Too many members have this relationship.',
  AGE_BELOW_MINIMUM: 'The age is below the minimum for this relationship.',
  AGE_ABOVE_MAXIMUM: 'The age is above the maximum for this relationship.',
  TOO_MANY_MEMBERS: 'The request has too many members.',
  FLOATER_TOO_FEW_MEMBERS: 'Floater cover needs more members.',
  FLOATER_TOO_MANY_MEMBERS: 'Floater cover allows fewer members.',
  SUM_INSURED_NOT_ALLOWED: 'The sum insured is not an allowed value.',
  TENURE_NOT_ALLOWED: 'The policy tenure is not an allowed value.',
};

export function describeIssue(issue: ValidationIssue): string {
  const text = (REQUEST_ISSUE_TEXT as Record<string, string | undefined>)[issue.code];
  return text ?? `The value does not satisfy the contract schema (${issue.code}).`;
}

export const STAGE_LABEL: Record<Finding['stage'], string> = {
  validity: 'Invalid',
  eligibility: 'Not eligible',
  comparability: 'Not comparable',
};

/**
 * Rupee text, never formatting a missing amount as zero. Use it only for amounts that are INR by
 * contract: the request (`quoteRequestSchema` amounts are paise) and the engine's comparable and
 * cheapest premiums (validity excludes any result whose currency is not INR). Amounts taken from
 * an insurer result must use `formatQuoteAmount` with that result's currency.
 */
export function formatAmount(paise: number | null): string {
  if (paise === null) return 'Not shown';
  if (!Number.isSafeInteger(paise) || paise < 0) return 'Invalid amount';
  return formatInr(paise);
}

const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  self: 'Self',
  spouse: 'Spouse',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  father_in_law: 'Father-in-law',
  mother_in_law: 'Mother-in-law',
};

export function relationshipLabel(relationship: Relationship): string {
  return RELATIONSHIP_LABEL[relationship];
}

export function describeMembers(members: readonly Member[] | null): string {
  if (members === null) return 'Not shown';
  return members
    .map((member) => `${RELATIONSHIP_LABEL[member.relationship]}, ${member.age}`)
    .join(' · ');
}

export function describeTenure(years: number | null): string {
  if (years === null) return 'Not shown';
  return years === 1 ? '1 year' : `${years} years`;
}

export const TERM_LABEL: Record<CoverageTermName, string> = {
  coPay: 'Co-pay',
  deductible: 'Deductible',
  roomRent: 'Room rent',
  addOns: 'Add-ons',
};

/**
 * One coverage term as shown on the quote, or "not shown" when it is unknown. Amounts (deductible,
 * room-rent cap) are in the quote's own `currency`, so the caller must pass it: only INR amounts
 * get the rupee sign.
 */
export function describeTerm(
  terms: CoverageTerms,
  name: CoverageTermName,
  currency: string | null,
): string {
  // Term amounts are never null here (the term is known), so `?? ''` is unreachable.
  const amount = (paise: number): string => formatQuoteAmount(paise, currency) ?? '';
  switch (name) {
    case 'coPay':
      if (terms.coPay.status === 'unknown') return 'not shown';
      return terms.coPay.value === 0 ? 'none' : `${terms.coPay.value}%`;
    case 'deductible':
      if (terms.deductible.status === 'unknown') return 'not shown';
      return terms.deductible.value === 0 ? 'none' : amount(terms.deductible.value);
    case 'addOns':
      if (terms.addOns.status === 'unknown') return 'not shown';
      return terms.addOns.value.length === 0 ? 'none' : terms.addOns.value.join(', ');
    case 'roomRent': {
      if (terms.roomRent.status === 'unknown') return 'not shown';
      const rent = terms.roomRent.value;
      switch (rent.kind) {
        case 'no_limit':
          return 'no limit';
        case 'per_day_cap':
          return `${amount(rent.capPaise)} per day`;
        case 'percent_of_sum_insured':
          return `${rent.basisPoints / 100}% of sum insured per day`;
        case 'room_category':
          return rent.category === 'shared' ? 'shared room' : 'single private room';
      }
    }
  }
}

/** "Co-pay: none — Demo Insurer A; 20% — Demo Insurer B", from the engine's difference groups. */
export function describeDifference(difference: Difference, rows: readonly DemoRow[]): string {
  const groups = difference.groups.map((group) => {
    const members = group.resultIds.map((id) =>
      rows.find((row) => row.resultId === id && row.outcome !== 'excluded'),
    );
    const sample = members.find((row) => row?.normalized)?.normalized;
    const value = sample
      ? describeTerm(sample.terms, difference.term, sample.currency)
      : group.valueKey;
    const labels = members.map((row, i) => row?.insurerLabel ?? group.resultIds[i]).join(', ');
    return `${value} — ${labels}`;
  });
  return `${TERM_LABEL[difference.term]}: ${groups.join('; ')}`;
}

// ---- Presentation helpers for the redesigned screen. Each one reads engine output only. ----

type FindingCode = Finding['code'];

/** Short, plain-language headline per finding; FINDING_TEXT gives the longer explanation. */
export const FINDING_TITLE: Record<FindingCode, string> = {
  MALFORMED_RESULT: 'Quote record is unreadable',
  DUPLICATE_RESULT_ID: 'Duplicate quote record',
  DUPLICATE_PLAN: 'Duplicate plan from the same insurer',
  STATUS_NOT_COMPLETED: 'Quote result is incomplete',
  PLAN_LABEL_MISSING: 'Plan name is missing',
  CURRENCY_MISSING: 'Currency is missing',
  CURRENCY_UNSUPPORTED: 'Currency is not INR',
  PREMIUM_MISSING: 'Premium is missing',
  PREMIUM_UNPARSEABLE: 'Premium could not be read',
  PREMIUM_NOT_POSITIVE: 'Premium is not a positive amount',
  PREMIUM_PARTS_INVALID: 'Premium breakdown is invalid',
  PREMIUM_INCONSISTENT: 'Premium breakdown does not add up',
  AMOUNT_UNPARSEABLE: 'An amount could not be read',
  REVIEW_REQUIRED: 'Required information needs review',
  MANUAL_NOT_RANKED: 'Manual quotes are not ranked',
  PREMIUM_BASIS_UNKNOWN: 'Premium tax basis is unknown',
  PREMIUM_BASIS_NOT_RANKED: 'Premium tax basis differs',
  TENURE_NOT_RANKED: 'Policy tenure is not ranked',
  SUM_INSURED_UNKNOWN: 'Sum insured is not shown',
  SUM_INSURED_UNPARSEABLE: 'Sum insured could not be read',
  SUM_INSURED_MISMATCH: 'Sum insured does not match the requested amount',
  COVER_TYPE_UNKNOWN: 'Cover type is not shown',
  COVER_TYPE_MISMATCH: 'Cover type differs',
  MEMBERS_UNKNOWN: 'Covered members are not shown',
  MEMBERS_MISMATCH: 'Covered members differ',
  TENURE_UNKNOWN: 'Policy tenure is not shown',
  TENURE_MISMATCH: 'Policy tenure differs',
  TERM_UNKNOWN: 'A coverage term is not shown',
  ADD_ONS_PRESENT: 'Premium includes add-ons',
};

export type Tone = 'positive' | 'info' | 'neutral' | 'warning' | 'danger';

/** Severity group per engine stage. Validity failures make a quote unusable. */
export const STAGE_GROUP: Record<Finding['stage'], { title: string; tone: Tone }> = {
  validity: { title: 'Cannot be used', tone: 'danger' },
  eligibility: { title: 'Not eligible for ranking', tone: 'warning' },
  comparability: { title: 'Not comparable with the request', tone: 'warning' },
};

const STAGE_ORDER: readonly Finding['stage'][] = ['validity', 'eligibility', 'comparability'];

/** The engine's findings for one quote, grouped by stage in severity order. Empty groups omitted. */
export function groupFindings(
  findings: readonly Finding[],
): { stage: Finding['stage']; findings: Finding[] }[] {
  return STAGE_ORDER.map((stage) => ({
    stage,
    findings: findings.filter((finding) => finding.stage === stage),
  })).filter((group) => group.findings.length > 0);
}

export const NO_HIGHLIGHT_TITLE: Record<NoHighlightReason, string> = {
  NO_RESULTS: 'No quotes to compare',
  NO_COMPARABLE_RESULTS: 'No comparable quotes',
  TOO_FEW_COMPARABLE: 'Not enough comparable quotes to highlight a premium',
  INCOMPARABLE_CANDIDATES: 'No premium highlighted: some quotes are not comparable',
  TERMS_DIFFER: 'No premium highlighted: coverage terms differ',
  TIE_NOT_HIGHLIGHTED: 'No premium highlighted: the lowest premium is tied',
};

export interface OutcomeSummary {
  tone: Tone;
  title: string;
  detail: string;
}

/** The overall result, from `cheapest` or `noHighlightReason` (exactly one is set). */
export function describeOutcome(
  comparison: ComparisonResult,
  rows: readonly DemoRow[],
): OutcomeSummary {
  const { cheapest, noHighlightReason } = comparison;
  if (cheapest) {
    const labels = cheapest.resultIds.map(
      (id) => rows.find((row) => row.resultId === id)?.insurerLabel ?? id,
    );
    return cheapest.tie
      ? {
          tone: 'positive',
          title: `Lowest comparable premium is shared by ${labels.length} quotes`,
          detail: `${labels.join(' and ')} quote the same lowest premium of ${formatAmount(cheapest.totalPremiumPaise)}. ${labels.length === 2 ? 'Both are' : 'All are'} highlighted; none is preferred.`,
        }
      : {
          tone: 'positive',
          title: 'Lowest comparable premium identified',
          detail: `${labels.join(', ')} quotes the lowest premium among comparable quotes, at ${formatAmount(cheapest.totalPremiumPaise)}.`,
        };
  }
  const reason = noHighlightReason ?? 'NO_RESULTS';
  return {
    tone: reason === 'NO_RESULTS' ? 'neutral' : 'warning',
    title: NO_HIGHLIGHT_TITLE[reason],
    detail: NO_HIGHLIGHT_TEXT[reason],
  };
}

/** Badge for a quote's column header, from its engine outcome and stage results. */
export function outcomeBadge(row: DemoRow, tie: boolean): { tone: Tone; label: string } {
  switch (row.outcome) {
    case 'highlighted':
      return { tone: 'positive', label: tie ? 'Tied lowest premium' : 'Lowest comparable premium' };
    case 'comparable':
      return { tone: 'info', label: 'Comparable' };
    case 'excluded':
      if (row.validity === 'failed') return { tone: 'danger', label: 'Cannot be used' };
      if (row.eligibility === 'failed') return { tone: 'warning', label: 'Not eligible' };
      return { tone: 'warning', label: 'Not comparable' };
  }
}

/** Excluded quotes split by whether the engine found them invalid or only unranked. */
export function exclusionCounts(rows: readonly DemoRow[]): { invalid: number; notRanked: number } {
  const excluded = rows.filter((row) => row.outcome === 'excluded');
  const invalid = excluded.filter((row) => row.validity === 'failed').length;
  return { invalid, notRanked: excluded.length - invalid };
}

/** Engine findings for this quote whose path is exactly one of `paths`. */
export function findingsAt(row: DemoRow, paths: readonly string[]): Finding[] {
  return row.findings.filter(
    (finding) => finding.path !== undefined && paths.includes(finding.path),
  );
}

/**
 * An amount in the quote's own currency. Only INR gets the rupee sign: a USD amount must never
 * be shown as rupees. Returns null for a missing amount so the caller can say why it is missing.
 */
export function formatQuoteAmount(paise: number | null, currency: string | null): string | null {
  if (paise === null) return null;
  if (!Number.isSafeInteger(paise) || paise < 0) return 'Invalid amount';
  if (currency === 'INR') return formatInr(paise);
  return `${formatInr(paise, { symbol: false })} ${currency ?? '(currency not stated)'}`;
}

export const REVIEW_FLAG_LABEL: Record<NormalizedResult['reviewFlags'][number], string> = {
  ambiguous_premium: 'Premium unclear',
  ambiguous_coverage: 'Coverage unclear',
  partial_page: 'Partial page captured',
};

/** Capitalises the first letter, for table values such as "no limit". */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type QuoteMoney = Pick<NormalizedResult, 'currency'>;

/** A quote's total premium in its own currency, or null when the quote shows none. */
export function premiumText(quote: QuoteMoney & Pick<NormalizedResult, 'premium'>): string | null {
  return formatQuoteAmount(quote.premium.totalPaise, quote.currency);
}

/** A quote's sum insured in its own currency, or null when the quote shows none. */
export function sumInsuredText(
  quote: QuoteMoney & Pick<NormalizedResult, 'sumInsuredPaise'>,
): string | null {
  return formatQuoteAmount(quote.sumInsuredPaise, quote.currency);
}

/**
 * A coverage term for a table cell, in the quote's own currency, or null when unknown. Add-on
 * identifiers are shown exactly as the quote states them, because capitalising a slug would
 * change the value shown.
 */
export function termCellText(
  quote: QuoteMoney & Pick<NormalizedResult, 'terms'>,
  name: CoverageTermName,
): string | null {
  const { terms } = quote;
  if (terms[name].status === 'unknown') return null;
  const text = describeTerm(terms, name, quote.currency);
  if (name === 'addOns' && terms.addOns.status === 'known' && terms.addOns.value.length > 0) {
    return text;
  }
  return sentenceCase(text);
}

/** Coverage terms on which the engine reported this quote as differing from other comparable ones. */
export function differingTerms(
  comparison: ComparisonResult,
  resultId: string | null,
): Set<CoverageTermName> {
  return new Set(
    comparison.differences
      .filter((difference) =>
        difference.groups.some((group) => resultId !== null && group.resultIds.includes(resultId)),
      )
      .map((difference) => difference.term),
  );
}

/** What to show for a value the quote does not have, without implying zero. */
export function missingValueLabel(row: DemoRow): string {
  if (row.normalized === null) return 'Unreadable';
  if (row.normalized.status !== 'completed') return 'Not returned';
  return 'Not shown';
}

/**
 * The text for one table cell. `shown` is the attribute's formatted value, or null when the quote
 * does not have it. A missing amount whose text the normaliser could not parse is "Unreadable".
 */
export function cellValue(
  row: DemoRow,
  paths: readonly string[],
  shown: string | null,
): { value: string; missing: boolean } {
  if (shown !== null && row.normalized !== null) return { value: shown, missing: false };
  const unreadable =
    row.normalized?.amountIssues.some((issue) => paths.includes(issue.field)) ?? false;
  return { value: unreadable ? 'Unreadable' : missingValueLabel(row), missing: true };
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  login_required: 'Login required',
  otp_required: 'OTP required',
  manual_action_required: 'Action required',
  manual_required: 'Manual entry required',
  completed: 'Completed',
  failed: 'Failed',
  timed_out: 'Timed out',
  cancelled: 'Cancelled',
  unsupported: 'Not supported',
};

export function describeCoverType(coverType: CoverType | null): string | null {
  if (coverType === null) return null;
  return coverType === 'floater' ? 'Family floater' : 'Individual';
}

export function describeBasis(basis: PremiumBasis): string | null {
  if (basis === 'unknown') return null;
  return basis === 'incl_gst' ? 'Includes GST' : 'Excludes GST';
}

export function describeSource(source: ResultSource): string {
  return source === 'manual' ? 'Manual entry' : 'Automated';
}

const REQUEST_FIELD_LABEL: Record<string, string> = {
  members: 'Members',
  coverType: 'Cover type',
  sumInsuredPaise: 'Sum insured',
  tenureYears: 'Policy tenure',
  pincode: 'Pincode',
};

/** Index of the member a request issue points at, if any (`request.members.N...`). */
export function memberIndexOf(issue: ValidationIssue): number | null {
  const match = /^request\.members\.(\d+)(?:\.|$)/.exec(issue.path);
  return match ? Number(match[1]) : null;
}

/** Where a request issue is, in words: "Member 1 (Self)", "Sum insured", "Customer". */
export function describeIssueLocation(
  issue: ValidationIssue,
  members: readonly Pick<Member, 'relationship'>[],
): string {
  const index = memberIndexOf(issue);
  if (index !== null) {
    const member = members[index];
    return member
      ? `Member ${index + 1} (${RELATIONSHIP_LABEL[member.relationship]})`
      : `Member ${index + 1}`;
  }
  if (issue.path.startsWith('customer')) return 'Customer';
  const field = issue.path.replace(/^request\.?/, '').split('.')[0] ?? '';
  return REQUEST_FIELD_LABEL[field] ?? 'Request';
}
