// Quote request validation (FR-02, FR-03; TC-01 to TC-03): schema first, then the configurable
// business rules. Issues name a path and a code, never a value.
import { type ValidationIssue, type Validated, parseWith } from '../contracts/issues';
import {
  type QuoteDraft,
  type QuoteRequest,
  quoteDraftSchema,
  quoteRequestSchema,
} from '../contracts/quote';
import { type QuoteInputRules, quoteInputRulesSchema } from '../rules/quote-input-rules';

export const REQUEST_RULE_CODES = [
  'RULES_INVALID',
  'RELATIONSHIP_NOT_ALLOWED',
  'RELATIONSHIP_LIMIT_EXCEEDED',
  'AGE_BELOW_MINIMUM',
  'AGE_ABOVE_MAXIMUM',
  'TOO_MANY_MEMBERS',
  'FLOATER_TOO_FEW_MEMBERS',
  'FLOATER_TOO_MANY_MEMBERS',
  'SUM_INSURED_NOT_ALLOWED',
  'TENURE_NOT_ALLOWED',
] as const;

export type RequestRuleCode = (typeof REQUEST_RULE_CODES)[number];

/**
 * Member eligibility and request rules for an already schema-valid request. Every rule is
 * checked, so the advisor sees all problems at once.
 */
export function checkRequestRules(
  request: QuoteRequest,
  rules: QuoteInputRules,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, code: RequestRuleCode) => issues.push({ path, code });

  const counts = new Map<string, number>();
  request.members.forEach((member, index) => {
    const rule = rules.relationships[member.relationship];
    if (!rule) {
      add(`members.${index}.relationship`, 'RELATIONSHIP_NOT_ALLOWED');
      return;
    }
    const count = (counts.get(member.relationship) ?? 0) + 1;
    counts.set(member.relationship, count);
    if (count > rule.maxCount) add(`members.${index}.relationship`, 'RELATIONSHIP_LIMIT_EXCEEDED');
    if (member.age < rule.minAge) add(`members.${index}.age`, 'AGE_BELOW_MINIMUM');
    if (member.age > rule.maxAge) add(`members.${index}.age`, 'AGE_ABOVE_MAXIMUM');
  });

  const memberCount = request.members.length;
  if (memberCount > rules.maxMembers) add('members', 'TOO_MANY_MEMBERS');
  if (request.coverType === 'floater') {
    if (memberCount < rules.floater.minMembers) add('members', 'FLOATER_TOO_FEW_MEMBERS');
    if (memberCount > rules.floater.maxMembers) add('members', 'FLOATER_TOO_MANY_MEMBERS');
  }

  if (!isAllowedSumInsured(request.sumInsuredPaise, rules.sumInsured)) {
    add('sumInsuredPaise', 'SUM_INSURED_NOT_ALLOWED');
  }
  if (!rules.tenureYears.includes(request.tenureYears)) add('tenureYears', 'TENURE_NOT_ALLOWED');

  return issues;
}

function isAllowedSumInsured(paise: number, rule: QuoteInputRules['sumInsured']): boolean {
  if (rule.kind === 'list') return rule.valuesPaise.includes(paise);
  return (
    paise >= rule.minPaise &&
    paise <= rule.maxPaise &&
    (paise - rule.minPaise) % rule.stepPaise === 0
  );
}

function withRules<T>(
  parsed: Validated<T>,
  rules: unknown,
  request: (value: T) => QuoteRequest,
  prefix: string,
): Validated<T> {
  const validRules = quoteInputRulesSchema.safeParse(rules);
  if (!validRules.success) return { ok: false, issues: [{ path: 'rules', code: 'RULES_INVALID' }] };
  if (!parsed.ok) return parsed;
  const issues = checkRequestRules(request(parsed.value), validRules.data).map((issue) => ({
    path: prefix + issue.path,
    code: issue.code,
  }));
  return issues.length > 0 ? { ok: false, issues } : parsed;
}

/** Validates and normalises a quote request against the given rule table. */
export function validateQuoteRequest(input: unknown, rules: unknown): Validated<QuoteRequest> {
  return withRules(parseWith(quoteRequestSchema, input), rules, (request) => request, '');
}

/** Validates and normalises a customer plus request, as the future `quote.create` would. */
export function validateQuoteDraft(input: unknown, rules: unknown): Validated<QuoteDraft> {
  return withRules(parseWith(quoteDraftSchema, input), rules, (draft) => draft.request, 'request.');
}
