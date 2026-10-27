// Comparison engine (FR-12; TC-09, TC-10, TC-11, TC-27; ARCH §7.7) under the PROVISIONAL rule.
// Covers normalisation, validity, eligibility, comparability, cheapest selection, ties, the
// explicit no-highlight results, determinism and the absence of sensitive data in output.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkComparability,
  findTermDifferences,
  memberSetKey,
} from '../src/shared/comparison/comparability';
import { compareQuotes } from '../src/shared/comparison/compare';
import { checkEligibility } from '../src/shared/comparison/eligibility';
import { normalizeResult } from '../src/shared/comparison/normalize';
import { type Candidate, selectCheapest } from '../src/shared/comparison/selection';
import { checkValidity, findDuplicates } from '../src/shared/comparison/validity';
import {
  type ComparisonResult,
  HIGHLIGHT_LABEL,
  comparisonResultSchema,
} from '../src/shared/contracts/comparison';
import type {
  InsurerResultInput,
  NormalizedResult,
  QuoteRequest,
} from '../src/shared/contracts/quote';
import { RUN_STATUSES } from '../src/shared/contracts/status';
import { rupees } from '../src/shared/money';
import {
  type ComparisonRule,
  PROVISIONAL_COMPARISON_RULE as RULE,
} from '../src/shared/rules/comparison-rule';
import {
  REQUEST,
  SENSITIVE,
  comparableResult,
  expectNoSensitiveValues,
  failedResult,
  knownTerms,
} from './support/m3-fixtures';

const request = REQUEST as unknown as QuoteRequest;

function normalized(input: InsurerResultInput): NormalizedResult {
  const result = normalizeResult(input);
  if (!result.ok) throw new Error('fixture invalid');
  return result.value;
}

function compare(results: readonly unknown[], rule: unknown = RULE): ComparisonResult {
  const outcome = compareQuotes(REQUEST, results, rule);
  if (!outcome.ok) throw new Error('comparison input invalid');
  expect(comparisonResultSchema.safeParse(outcome.value).success).toBe(true);
  return outcome.value;
}

const codesOf = (findings: readonly { code: string; path?: string }[]) =>
  findings.map((finding) => `${finding.path ?? ''}:${finding.code}`);

const excludedCodes = (result: ComparisonResult) =>
  Object.fromEntries(
    result.excluded.map((entry) => [entry.resultId ?? `#${entry.index}`, codesOf(entry.findings)]),
  );

describe('normalizeResult', () => {
  it('parses premium text and records failures as codes only', () => {
    const value = normalized(
      comparableResult('r1', 'insurer-a', 0, {
        premium: {
          total: { text: '₹12,345.50' },
          base: { text: SENSITIVE.secret },
          gst: { paise: 188_322 },
          basis: 'incl_gst',
        },
      }),
    );
    expect(value.premium).toEqual({
      totalPaise: 1_234_550,
      basePaise: null,
      gstPaise: 188_322,
      basis: 'incl_gst',
    });
    expect(value.amountIssues).toEqual([{ field: 'premium.base', reason: 'INVALID_FORMAT' }]);
    expectNoSensitiveValues(value, [SENSITIVE.secret]);
  });

  it('never fills in missing values: nulls and unknown terms, not zero or the request', () => {
    const value = normalized({
      resultId: 'r1',
      insurerId: 'insurer-a',
      status: 'completed',
      source: 'manual',
      retrievedAt: '2026-10-27T10:00:00Z',
    });
    expect(value).toMatchObject({
      planLabel: null,
      currency: null,
      premium: { totalPaise: null, basePaise: null, gstPaise: null, basis: 'unknown' },
      sumInsuredPaise: null,
      coverType: null,
      tenureYears: null,
      members: null,
      terms: {
        coPay: { status: 'unknown' },
        deductible: { status: 'unknown' },
        roomRent: { status: 'unknown' },
        addOns: { status: 'unknown' },
      },
      reviewFlags: [],
      amountIssues: [],
      errorCode: null,
      evidenceRef: null,
    });
  });

  it('canonicalises currency, add-ons, review flags and whitespace', () => {
    const value = normalized(
      comparableResult('r1', 'insurer-a', 100, {
        currency: ' inr ',
        planLabel: '  Synthetic   Plan ',
        reviewFlags: ['partial_page', 'ambiguous_premium', 'partial_page'],
        coverage: {
          terms: { addOns: { status: 'known', value: ['opd-cover', 'maternity', 'opd-cover'] } },
        },
      }),
    );
    expect(value.currency).toBe('INR');
    expect(value.planLabel).toBe('Synthetic Plan');
    expect(value.reviewFlags).toEqual(['ambiguous_premium', 'partial_page']);
    expect(value.terms.addOns).toEqual({ status: 'known', value: ['maternity', 'opd-cover'] });
    expect(value.terms.coPay).toEqual({ status: 'unknown' });
  });

  it('rejects malformed results with paths and codes only (TC-09)', () => {
    const result = normalizeResult({
      ...comparableResult('r1', 'insurer-a', 100),
      premium: { total: { paise: '12,000', note: SENSITIVE.secret } },
      sessionCookie: SENSITIVE.secret,
    });
    expect(result.ok).toBe(false);
    expectNoSensitiveValues(result, [SENSITIVE.secret, 'sessionCookie', '12,000']);
  });

  it.each([
    ['fractional paise', { premium: { total: { paise: 100.5 } } }],
    ['unknown status', { status: 'done' }],
    ['unknown review flag', { reviewFlags: ['looks_fine'] }],
    ['unexpected coverage term', { coverage: { terms: { waitingPeriod: { status: 'unknown' } } } }],
    ['term known without value', { coverage: { terms: { coPay: { status: 'known' } } } }],
    ['co-pay above 100%', { coverage: { terms: { coPay: { status: 'known', value: 101 } } } }],
    ['evidence path instead of ID', { evidenceRef: '/Users/someone/evidence.png' }],
    ['time without offset', { retrievedAt: '2026-10-27T10:00:00' }],
  ])('rejects %s', (_label, patch) => {
    expect(normalizeResult({ ...comparableResult('r1', 'insurer-a', 100), ...patch }).ok).toBe(
      false,
    );
  });
});

describe('checkValidity', () => {
  const validity = (overrides: Partial<InsurerResultInput>) =>
    codesOf(checkValidity(normalized(comparableResult('r1', 'insurer-a', 100_000, overrides))));

  it('passes a complete result', () => {
    expect(validity({})).toEqual([]);
  });

  it.each(RUN_STATUSES.filter((status) => status !== 'completed'))(
    'reports only the status for a %s result',
    (status) => {
      expect(codesOf(checkValidity(normalized(failedResult('r1', 'insurer-a', status))))).toEqual([
        'status:STATUS_NOT_COMPLETED',
      ]);
    },
  );

  it('never treats a missing premium as zero (TC-10)', () => {
    expect(validity({ premium: { basis: 'incl_gst' } })).toEqual(['premium.total:PREMIUM_MISSING']);
    expect(validity({ premium: undefined })).toEqual(['premium.total:PREMIUM_MISSING']);
  });

  it.each([
    [{ total: { text: 'Call for quote' } }, ['premium.total:PREMIUM_UNPARSEABLE']],
    [{ total: { paise: 0 } }, ['premium.total:PREMIUM_NOT_POSITIVE']],
    [{ total: { paise: -500 } }, ['premium.total:PREMIUM_NOT_POSITIVE']],
    [{ total: { paise: 100 }, base: { paise: -1 } }, ['premium.base:PREMIUM_PARTS_INVALID']],
    [{ total: { paise: 100 }, gst: { paise: -1 } }, ['premium.gst:PREMIUM_PARTS_INVALID']],
    [
      { total: { paise: 11_800 }, base: { paise: 10_000 }, gst: { paise: 1_700 } },
      ['premium:PREMIUM_INCONSISTENT'],
    ],
    [{ total: { paise: 10_000 }, base: { paise: 10_001 } }, ['premium:PREMIUM_INCONSISTENT']],
    [{ total: { paise: 10_000 }, gst: { paise: 10_001 } }, ['premium:PREMIUM_INCONSISTENT']],
    [{ total: { paise: 11_800 }, base: { paise: 10_000 }, gst: { paise: 1_800 } }, []],
    [{ total: { paise: 11_800 }, base: { paise: 10_000 } }, []],
    [{ total: { paise: 100 }, gst: { text: 'GST extra' } }, ['premium.gst:AMOUNT_UNPARSEABLE']],
  ])('checks premium %j', (premium, expected) => {
    expect(validity({ premium: { basis: 'incl_gst', ...premium } })).toEqual(expected);
  });

  it.each([
    // A GST-exclusive total equals the base; GST shown alongside is not part of it.
    ['excl_gst', { total: { paise: 10_000 }, base: { paise: 10_000 }, gst: { paise: 1_800 } }, []],
    ['excl_gst', { total: { paise: 10_000 }, gst: { paise: 1_800 } }, []],
    [
      'excl_gst',
      { total: { paise: 11_800 }, base: { paise: 10_000 }, gst: { paise: 1_800 } },
      ['premium:PREMIUM_INCONSISTENT'],
    ],
    // With an unknown basis the parts cannot be checked against the total, beyond their size.
    ['unknown', { total: { paise: 10_000 }, base: { paise: 9_000 }, gst: { paise: 1_800 } }, []],
    [
      'unknown',
      { total: { paise: 10_000 }, base: { paise: 10_001 } },
      ['premium:PREMIUM_INCONSISTENT'],
    ],
  ] as const)('checks a %s premium %j against its parts', (basis, premium, expected) => {
    expect(validity({ premium: { basis, ...premium } })).toEqual(expected);
  });

  it('requires a plan label and INR currency', () => {
    expect(validity({ planLabel: undefined })).toEqual(['planLabel:PLAN_LABEL_MISSING']);
    expect(validity({ currency: undefined })).toEqual(['currency:CURRENCY_MISSING']);
    expect(validity({ currency: 'USD' })).toEqual(['currency:CURRENCY_UNSUPPORTED']);
  });

  it('keeps flagged results out', () => {
    expect(validity({ reviewFlags: ['ambiguous_premium'] })).toEqual([
      'reviewFlags:REVIEW_REQUIRED',
    ]);
  });

  it('leaves an unreadable sum insured to comparability (it is part of the key)', () => {
    expect(validity({ coverage: { sumInsured: { text: '5L' } } })).toEqual([]);
  });
});

describe('findDuplicates', () => {
  it('marks every result that shares an ID or a completed insurer plan', () => {
    const results = [
      comparableResult('r1', 'insurer-a', 100),
      comparableResult('r1', 'insurer-b', 100),
      comparableResult('r2', 'insurer-c', 100, { planLabel: 'Plan X' }),
      comparableResult('r3', 'insurer-c', 100, { planLabel: '  plan   x ' }),
      comparableResult('r4', 'insurer-c', 100, { planLabel: 'Plan Y' }),
      { ...failedResult('r5', 'insurer-d'), planLabel: 'Plan Z' },
      { ...failedResult('r6', 'insurer-d'), planLabel: 'Plan Z' },
    ].map(normalized);
    const duplicatesOf = findDuplicates(results);
    expect(results.map((result) => codesOf(duplicatesOf(result)))).toEqual([
      ['resultId:DUPLICATE_RESULT_ID'],
      ['resultId:DUPLICATE_RESULT_ID'],
      ['planLabel:DUPLICATE_PLAN'],
      ['planLabel:DUPLICATE_PLAN'],
      [],
      [],
      [],
    ]);
  });
});

describe('checkEligibility', () => {
  const eligibility = (overrides: Partial<InsurerResultInput>, rule: ComparisonRule = RULE) =>
    codesOf(
      checkEligibility(normalized(comparableResult('r1', 'insurer-a', 100, overrides)), rule),
    );

  it('ranks GST-inclusive one-year results, automated or manual (DM-06, Q-B10)', () => {
    expect(eligibility({})).toEqual([]);
    expect(eligibility({ source: 'manual' })).toEqual([]);
  });

  it('can exclude manual results by rule', () => {
    expect(eligibility({ source: 'manual' }, { ...RULE, manualResults: 'exclude' })).toEqual([
      'source:MANUAL_NOT_RANKED',
    ]);
  });

  it('does not rank an unknown or different premium basis', () => {
    expect(eligibility({ premium: { total: { paise: 100 } } })).toEqual([
      'premium.basis:PREMIUM_BASIS_UNKNOWN',
    ]);
    expect(eligibility({ premium: { total: { paise: 100 }, basis: 'excl_gst' } })).toEqual([
      'premium.basis:PREMIUM_BASIS_NOT_RANKED',
    ]);
  });

  it('ranks only the tenures the rule allows', () => {
    expect(eligibility({ coverage: { tenureYears: 2 } })).toEqual([
      'coverage.tenureYears:TENURE_NOT_RANKED',
    ]);
    expect(eligibility({ coverage: { tenureYears: undefined } })).toEqual([]);
  });
});

describe('checkComparability', () => {
  const comparability = (
    coverage: NonNullable<Parameters<typeof comparableResult>[3]>['coverage'],
    rule: ComparisonRule = RULE,
  ) =>
    codesOf(
      checkComparability(
        normalized(comparableResult('r1', 'insurer-a', 100, { coverage })),
        request,
        rule,
      ),
    );

  it('accepts a result that matches the request on every attribute', () => {
    expect(comparability({})).toEqual([]);
  });

  it('never assumes an unknown attribute matches the request', () => {
    expect(
      comparability({
        sumInsured: undefined,
        coverType: undefined,
        tenureYears: undefined,
        members: undefined,
        terms: {},
      }),
    ).toEqual([
      'coverage.sumInsured:SUM_INSURED_UNKNOWN',
      'coverage.coverType:COVER_TYPE_UNKNOWN',
      'coverage.members:MEMBERS_UNKNOWN',
      'coverage.tenureYears:TENURE_UNKNOWN',
      'coverage.terms.coPay:TERM_UNKNOWN',
      'coverage.terms.deductible:TERM_UNKNOWN',
      'coverage.terms.roomRent:TERM_UNKNOWN',
      'coverage.terms.addOns:TERM_UNKNOWN',
    ]);
  });

  it('reports each mismatch with the request', () => {
    expect(
      comparability({
        sumInsured: { paise: rupees(10_00_000) },
        coverType: 'individual',
        tenureYears: 2,
        members: [{ relationship: 'self', age: 34 }],
      }),
    ).toEqual([
      'coverage.sumInsured:SUM_INSURED_MISMATCH',
      'coverage.coverType:COVER_TYPE_MISMATCH',
      'coverage.members:MEMBERS_MISMATCH',
      'coverage.tenureYears:TENURE_MISMATCH',
    ]);
  });

  it('compares sums insured exactly, to the paisa', () => {
    expect(comparability({ sumInsured: { paise: REQUEST.sumInsuredPaise + 1 } })).toEqual([
      'coverage.sumInsured:SUM_INSURED_MISMATCH',
    ]);
    expect(comparability({ sumInsured: { text: '₹5,00,000' } })).toEqual([]);
    expect(comparability({ sumInsured: { text: '5 Lakh' } })).toEqual([
      'coverage.sumInsured:SUM_INSURED_UNPARSEABLE',
    ]);
  });

  it('compares member sets regardless of order but including age', () => {
    expect(comparability({ members: [...REQUEST.members].reverse() })).toEqual([]);
    expect(
      comparability({
        members: [
          { relationship: 'self', age: 34 },
          { relationship: 'spouse', age: 32 },
        ],
      }),
    ).toEqual(['coverage.members:MEMBERS_MISMATCH']);
    expect(memberSetKey(REQUEST.members)).toBe(memberSetKey([...REQUEST.members].reverse()));
  });

  it('keeps base-plan-only: add-ons present are not comparable (DM-06)', () => {
    expect(
      comparability({
        terms: { ...knownTerms(), addOns: { status: 'known', value: ['opd-cover'] } },
      }),
    ).toEqual(['coverage.terms.addOns:ADD_ONS_PRESENT']);
  });

  it('honours ignore and must_match term policies', () => {
    const relaxed: ComparisonRule = {
      ...RULE,
      addOns: 'ignore',
      terms: { coPay: 'ignore', deductible: 'ignore', roomRent: 'ignore' },
    };
    expect(comparability({ terms: {} }, relaxed)).toEqual([]);
    expect(comparability({ terms: {} }, { ...RULE, addOns: 'must_match' })).toContain(
      'coverage.terms.addOns:TERM_UNKNOWN',
    );
    expect(
      comparability(
        { terms: { ...knownTerms(), addOns: { status: 'known', value: ['opd-cover'] } } },
        { ...RULE, addOns: 'must_match' },
      ),
    ).toEqual([]);
  });
});

describe('findTermDifferences', () => {
  it('lists value groups for each differing term, sorted', () => {
    const results = [
      comparableResult('r3', 'insurer-c', 100, {
        coverage: { terms: { ...knownTerms(), coPay: { status: 'known', value: 20 } } },
      }),
      comparableResult('r1', 'insurer-a', 100),
      comparableResult('r2', 'insurer-b', 100, {
        coverage: {
          terms: {
            ...knownTerms(),
            coPay: { status: 'known', value: 20 },
            roomRent: { status: 'known', value: { kind: 'per_day_cap', capPaise: rupees(5_000) } },
          },
        },
      }),
    ].map(normalized);
    expect(findTermDifferences(results, RULE)).toEqual([
      {
        term: 'coPay',
        groups: [
          { valueKey: '0', resultIds: ['r1'] },
          { valueKey: '20', resultIds: ['r2', 'r3'] },
        ],
      },
      {
        term: 'roomRent',
        groups: [
          { valueKey: 'no_limit', resultIds: ['r1', 'r3'] },
          { valueKey: 'per_day_cap:500000', resultIds: ['r2'] },
        ],
      },
    ]);
  });

  it.each([
    [{ kind: 'percent_of_sum_insured', basisPoints: 100 }, 'percent_of_sum_insured:100'],
    [{ kind: 'room_category', category: 'single_private' }, 'room_category:single_private'],
  ] as const)('keys room rent %j as %s', (value, key) => {
    const results = [
      comparableResult('r1', 'insurer-a', 100),
      comparableResult('r2', 'insurer-b', 100, {
        coverage: { terms: { ...knownTerms(), roomRent: { status: 'known', value } } },
      }),
    ].map(normalized);
    expect(findTermDifferences(results, RULE)[0]?.groups.map((group) => group.valueKey)).toEqual(
      ['no_limit', key].sort(),
    );
  });

  it('compares deductibles and add-on sets when the rule requires a match', () => {
    const results = [
      comparableResult('r1', 'insurer-a', 100, {
        coverage: {
          terms: { ...knownTerms(), addOns: { status: 'known', value: ['b-cover', 'a-cover'] } },
        },
      }),
      comparableResult('r2', 'insurer-b', 100, {
        coverage: {
          terms: { ...knownTerms(), deductible: { status: 'known', value: rupees(25_000) } },
        },
      }),
      comparableResult('r3', 'insurer-c', 100, { coverage: { terms: {} } }),
    ].map(normalized);
    expect(findTermDifferences(results, { ...RULE, addOns: 'must_match' })).toEqual([
      {
        term: 'deductible',
        groups: [
          { valueKey: '0', resultIds: ['r1'] },
          { valueKey: '2500000', resultIds: ['r2'] },
        ],
      },
      {
        term: 'addOns',
        groups: [
          { valueKey: 'a-cover,b-cover', resultIds: ['r1'] },
          { valueKey: 'none', resultIds: ['r2'] },
        ],
      },
    ]);
  });
});

describe('selectCheapest', () => {
  const candidate = (
    resultId: string,
    insurerId: string,
    totalPremiumPaise: number,
  ): Candidate => ({
    resultId,
    insurerId,
    source: 'automated',
    totalPremiumPaise,
  });

  it('returns an explicit no-highlight result for an empty set', () => {
    expect(selectCheapest([], RULE)).toEqual({
      cheapest: null,
      noHighlightReason: 'NO_COMPARABLE_RESULTS',
    });
  });

  it('needs the rule minimum before highlighting', () => {
    expect(selectCheapest([candidate('r1', 'insurer-a', 100)], RULE)).toEqual({
      cheapest: null,
      noHighlightReason: 'TOO_FEW_COMPARABLE',
    });
    expect(
      selectCheapest([candidate('r1', 'insurer-a', 100)], { ...RULE, minComparableForHighlight: 1 })
        .cheapest?.resultIds,
    ).toEqual(['r1']);
  });

  it('picks the lowest premium, by a single paisa if need be', () => {
    expect(
      selectCheapest(
        [candidate('r1', 'insurer-a', 1_234_501), candidate('r2', 'insurer-b', 1_234_500)],
        RULE,
      ),
    ).toEqual({
      cheapest: {
        resultIds: ['r2'],
        totalPremiumPaise: 1_234_500,
        tie: false,
        label: HIGHLIGHT_LABEL,
      },
      noHighlightReason: null,
    });
  });

  it('highlights every tied result in a fixed order, or none, by rule', () => {
    const tied = [
      candidate('r9', 'insurer-b', 500),
      candidate('r2', 'insurer-a', 700),
      candidate('r1', 'insurer-b', 500),
      candidate('r5', 'insurer-a', 500),
    ];
    expect(selectCheapest(tied, RULE).cheapest).toEqual({
      resultIds: ['r5', 'r1', 'r9'],
      totalPremiumPaise: 500,
      tie: true,
      label: HIGHLIGHT_LABEL,
    });
    expect(selectCheapest(tied, { ...RULE, ties: 'no_highlight' })).toEqual({
      cheapest: null,
      noHighlightReason: 'TIE_NOT_HIGHLIGHTED',
    });
  });

  it.each([0, -1, 10.5, Number.NaN])('refuses a candidate premium of %d', (premium) => {
    expect(() => selectCheapest([candidate('r1', 'insurer-a', premium)], RULE)).toThrow(RangeError);
  });
});

describe('compareQuotes', () => {
  it('highlights the cheapest of the comparable results', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_250)),
      comparableResult('r2', 'insurer-b', rupees(14_999)),
      comparableResult('r3', 'insurer-c', rupees(16_000), { source: 'manual' }),
    ]);
    expect(result).toEqual({
      contractsVersion: '0.1.0',
      rule: { id: 'dm06-provisional', version: '0.1.0', status: 'provisional' },
      comparable: [
        {
          resultId: 'r2',
          insurerId: 'insurer-b',
          source: 'automated',
          totalPremiumPaise: 1_499_900,
        },
        {
          resultId: 'r1',
          insurerId: 'insurer-a',
          source: 'automated',
          totalPremiumPaise: 1_525_000,
        },
        { resultId: 'r3', insurerId: 'insurer-c', source: 'manual', totalPremiumPaise: 1_600_000 },
      ],
      excluded: [],
      differences: [],
      cheapest: {
        resultIds: ['r2'],
        totalPremiumPaise: 1_499_900,
        tie: false,
        label: HIGHLIGHT_LABEL,
      },
      noHighlightReason: null,
    });
  });

  it('labels a cheapest manual result as manual (TC-11)', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(12_000), { source: 'manual' }),
    ]);
    expect(result.cheapest?.resultIds).toEqual(['r2']);
    expect(result.comparable[0]).toMatchObject({ resultId: 'r2', source: 'manual' });
  });

  it('keeps failed results out without suppressing the highlight (TC-05 at engine level)', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      failedResult('r2', 'insurer-b'),
      failedResult('r3', 'insurer-c', 'otp_required'),
      comparableResult('r4', 'insurer-d', rupees(14_000)),
    ]);
    expect(result.cheapest?.resultIds).toEqual(['r4']);
    expect(excludedCodes(result)).toEqual({
      r2: ['status:STATUS_NOT_COMPLETED'],
      r3: ['status:STATUS_NOT_COMPLETED'],
    });
  });

  it('never ranks a missing premium as zero (TC-10)', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
      { ...comparableResult('r3', 'insurer-c', 1), premium: { basis: 'incl_gst' } },
    ]);
    expect(result.cheapest?.resultIds).toEqual(['r1']);
    expect(excludedCodes(result)).toEqual({ r3: ['premium.total:PREMIUM_MISSING'] });
    expect(result.comparable.map((entry) => entry.resultId)).not.toContain('r3');
  });

  it('turns a malformed result into a parse failure without a premium (TC-09)', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
      { ...comparableResult('r3', 'insurer-c', 1), premium: { total: { paise: 'cheap' } } },
      { resultId: 'bad id!', insurerId: 'Insurer C', status: 'completed' },
      null,
      'not a result',
    ]);
    expect(result.cheapest?.resultIds).toEqual(['r1']);
    expect(result.excluded.map((entry) => [entry.index, entry.resultId, entry.insurerId])).toEqual([
      [2, 'r3', 'insurer-c'],
      [3, null, null],
      [4, null, null],
      [5, null, null],
    ]);
    for (const entry of result.excluded) {
      expect(entry.findings.every((finding) => finding.code === 'MALFORMED_RESULT')).toBe(true);
    }
  });

  it('suppresses the highlight when a valid result covers something else (TC-27)', () => {
    const results = [
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
      comparableResult('r3', 'insurer-c', rupees(9_000), {
        coverage: { sumInsured: { paise: rupees(3_00_000) } },
      }),
    ];
    const suppressed = compare(results);
    expect(suppressed.cheapest).toBeNull();
    expect(suppressed.noHighlightReason).toBe('INCOMPARABLE_CANDIDATES');
    expect(excludedCodes(suppressed)).toEqual({ r3: ['coverage.sumInsured:SUM_INSURED_MISMATCH'] });

    const ranked = compare(results, { ...RULE, incomparable: 'exclude_and_rank_rest' });
    expect(ranked.cheapest?.resultIds).toEqual(['r1']);
    expect(ranked.excluded).toEqual(suppressed.excluded);
  });

  it('suppresses for individual-versus-floater and unknown coverage too', () => {
    const individual = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(14_000), {
        coverage: { coverType: 'individual' },
      }),
    ]);
    expect(individual.noHighlightReason).toBe('INCOMPARABLE_CANDIDATES');

    const unknownCoPay = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
      comparableResult('r3', 'insurer-c', rupees(14_000), {
        coverage: { terms: { ...knownTerms(), coPay: { status: 'unknown' } } },
      }),
    ]);
    expect(unknownCoPay.noHighlightReason).toBe('INCOMPARABLE_CANDIDATES');
    expect(excludedCodes(unknownCoPay)).toEqual({ r3: ['coverage.terms.coPay:TERM_UNKNOWN'] });
  });

  it('shows differences instead of a highlight when co-pay, deductible or room rent differ', () => {
    const results = [
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(12_000), {
        coverage: { terms: { ...knownTerms(), coPay: { status: 'known', value: 20 } } },
      }),
    ];
    for (const incomparable of ['suppress_highlight', 'exclude_and_rank_rest'] as const) {
      const result = compare(results, { ...RULE, incomparable });
      expect(result.cheapest).toBeNull();
      expect(result.noHighlightReason).toBe('TERMS_DIFFER');
      expect(result.comparable).toHaveLength(2);
      expect(result.differences).toEqual([
        {
          term: 'coPay',
          groups: [
            { valueKey: '0', resultIds: ['r1'] },
            { valueKey: '20', resultIds: ['r2'] },
          ],
        },
      ]);
    }
  });

  it('treats a manual result excluded by rule as a reason to suppress, or ranks the rest', () => {
    const results = [
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
      comparableResult('r3', 'insurer-c', rupees(9_000), { source: 'manual' }),
    ];
    const rule: ComparisonRule = { ...RULE, manualResults: 'exclude' };
    expect(compare(results, rule).noHighlightReason).toBe('INCOMPARABLE_CANDIDATES');
    expect(
      compare(results, { ...rule, incomparable: 'exclude_and_rank_rest' }).cheapest?.resultIds,
    ).toEqual(['r1']);
  });

  it('does not rank GST-exclusive or unknown-basis premiums against inclusive ones', () => {
    const result = compare(
      [
        comparableResult('r1', 'insurer-a', rupees(15_000)),
        comparableResult('r2', 'insurer-b', rupees(16_000)),
        comparableResult('r3', 'insurer-c', rupees(12_712), {
          premium: { total: { paise: rupees(12_712) }, basis: 'excl_gst' },
        }),
        comparableResult('r4', 'insurer-d', rupees(12_000), {
          premium: { total: { paise: rupees(12_000) } },
        }),
      ],
      { ...RULE, incomparable: 'exclude_and_rank_rest' },
    );
    expect(result.cheapest?.resultIds).toEqual(['r1']);
    expect(excludedCodes(result)).toEqual({
      r3: ['premium.basis:PREMIUM_BASIS_NOT_RANKED'],
      r4: ['premium.basis:PREMIUM_BASIS_UNKNOWN'],
    });
  });

  it('treats a GST-exclusive quote with a GST breakdown as not ranked, not inconsistent', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
      comparableResult('r3', 'insurer-c', rupees(10_000), {
        premium: {
          total: { paise: rupees(10_000) },
          base: { paise: rupees(10_000) },
          gst: { paise: rupees(1_800) },
          basis: 'excl_gst',
        },
      }),
    ]);
    expect(excludedCodes(result)).toEqual({ r3: ['premium.basis:PREMIUM_BASIS_NOT_RANKED'] });
    expect(result.noHighlightReason).toBe('INCOMPARABLE_CANDIDATES');
  });

  it('suppresses for an unreadable sum insured exactly as for a missing one', () => {
    const base = [
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
    ];
    const unreadable = compare([
      ...base,
      comparableResult('r3', 'insurer-c', rupees(9_000), {
        coverage: { sumInsured: { text: '5 Lakh' } },
      }),
    ]);
    const missing = compare([
      ...base,
      comparableResult('r3', 'insurer-c', rupees(9_000), { coverage: { sumInsured: undefined } }),
    ]);
    expect(unreadable.noHighlightReason).toBe('INCOMPARABLE_CANDIDATES');
    expect(missing.noHighlightReason).toBe('INCOMPARABLE_CANDIDATES');
    expect(excludedCodes(unreadable)).toEqual({
      r3: ['coverage.sumInsured:SUM_INSURED_UNPARSEABLE'],
    });
  });

  it('does not let validity exclusions suppress the highlight (ARCH §3.7; pending PO, OPEN_QUESTIONS §0.6)', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
      comparableResult('r3', 'insurer-c', rupees(9_000), { reviewFlags: ['ambiguous_coverage'] }),
      comparableResult('r4', 'insurer-d', rupees(8_000)),
      comparableResult('r5', 'insurer-d', rupees(8_500)),
    ]);
    expect(result.cheapest?.resultIds).toEqual(['r1']);
    expect(excludedCodes(result)).toEqual({
      r3: ['reviewFlags:REVIEW_REQUIRED'],
      r4: ['planLabel:DUPLICATE_PLAN'],
      r5: ['planLabel:DUPLICATE_PLAN'],
    });
  });

  it('does not rank multi-year premiums under the one-year rule', () => {
    const multiYear = { ...REQUEST, tenureYears: 2 };
    const outcome = compareQuotes(multiYear, [
      comparableResult('r1', 'insurer-a', rupees(28_000), { coverage: { tenureYears: 2 } }),
      comparableResult('r2', 'insurer-b', rupees(29_000), { coverage: { tenureYears: 2 } }),
    ]);
    expect(outcome.ok && outcome.value.noHighlightReason).toBe('NO_COMPARABLE_RESULTS');
    expect(outcome.ok && outcome.value.excluded.map((entry) => codesOf(entry.findings))).toEqual([
      ['coverage.tenureYears:TENURE_NOT_RANKED'],
      ['coverage.tenureYears:TENURE_NOT_RANKED'],
    ]);
  });

  it('treats a premium in text and in paise identically, and ties are highlighted together', () => {
    const result = compare([
      comparableResult('r2', 'insurer-b', 0, {
        premium: { total: { text: 'Rs. 12,345/-' }, basis: 'incl_gst' },
      }),
      comparableResult('r1', 'insurer-a', 1_234_500),
      comparableResult('r3', 'insurer-c', 1_234_501),
    ]);
    expect(result.cheapest).toEqual({
      resultIds: ['r1', 'r2'],
      totalPremiumPaise: 1_234_500,
      tie: true,
      label: HIGHLIGHT_LABEL,
    });
  });

  it('excludes duplicates and flagged results', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', rupees(16_000)),
      comparableResult('r2', 'insurer-c', rupees(14_000)),
      comparableResult('r4', 'insurer-d', rupees(13_000), { reviewFlags: ['ambiguous_premium'] }),
    ]);
    expect(result.cheapest).toBeNull();
    expect(result.noHighlightReason).toBe('TOO_FEW_COMPARABLE');
    expect(excludedCodes(result)).toEqual({
      r2: ['resultId:DUPLICATE_RESULT_ID'],
      r4: ['reviewFlags:REVIEW_REQUIRED'],
    });
    expect(result.excluded).toHaveLength(3);
  });

  it.each([
    ['no results at all', [], 'NO_RESULTS'],
    [
      'only failures',
      [failedResult('r1', 'insurer-a'), failedResult('r2', 'insurer-b', 'cancelled')],
      'NO_COMPARABLE_RESULTS',
    ],
    [
      'a single comparable result',
      [comparableResult('r1', 'insurer-a', 100)],
      'TOO_FEW_COMPARABLE',
    ],
  ])('returns an explicit no-highlight result for %s', (_label, results, reason) => {
    const result = compare(results);
    expect(result.cheapest).toBeNull();
    expect(result.noHighlightReason).toBe(reason);
  });

  it('rejects an invalid request or rule with prefixed paths and no values', () => {
    expect(compareQuotes({ ...REQUEST, pincode: SENSITIVE.secret }, [], RULE)).toEqual({
      ok: false,
      issues: [{ path: 'request.pincode', code: 'invalid_format' }],
    });
    expect(compareQuotes(null, [], RULE)).toEqual({
      ok: false,
      issues: [{ path: 'request', code: 'invalid_type' }],
    });
    expect(compareQuotes(REQUEST, [], { ...RULE, ties: 'random' })).toEqual({
      ok: false,
      issues: [{ path: 'rule.ties', code: 'invalid_value' }],
    });
    const both = compareQuotes({}, [], { ...RULE, minComparableForHighlight: 0 });
    expect(both.ok ? [] : both.issues.map((issue) => issue.path.split('.')[0])).toEqual([
      'rule',
      'request',
      'request',
      'request',
      'request',
      'request',
    ]);
  });

  it('never calls anything "best" or "recommended"', () => {
    const text = JSON.stringify(
      compare([comparableResult('r1', 'insurer-a', 100), comparableResult('r2', 'insurer-b', 200)]),
    ).replace(HIGHLIGHT_LABEL, '');
    expect(text).not.toMatch(/best|recommend|winner/i);
    expect(HIGHLIGHT_LABEL).toMatch(/not a recommendation/);
  });

  it('keeps customer, member and sensitive input values out of the output', () => {
    const result = compare([
      comparableResult('r1', 'insurer-a', rupees(15_000)),
      comparableResult('r2', 'insurer-b', 0, {
        premium: { total: { text: SENSITIVE.secret }, basis: 'incl_gst' },
      }),
      {
        ...comparableResult('r3', 'insurer-c', 100),
        customerName: SENSITIVE.name,
        phone: SENSITIVE.phone,
      },
    ]);
    expectNoSensitiveValues(result, [...Object.values(SENSITIVE), 'customerName', REQUEST.pincode]);
    expect(JSON.stringify(result)).not.toMatch(/"(?:age|relationship|members)"/);
  });
});

describe('determinism', () => {
  const pool: InsurerResultInput[] = [
    comparableResult('r1', 'insurer-a', rupees(15_000)),
    comparableResult('r2', 'insurer-b', rupees(14_000)),
    comparableResult('r3', 'insurer-c', rupees(14_000)),
    comparableResult('r4', 'insurer-d', rupees(16_000), { source: 'manual' }),
    comparableResult('r5', 'insurer-e', rupees(9_000), { coverage: { coverType: 'individual' } }),
    comparableResult('r6', 'insurer-f', rupees(12_000), {
      coverage: {
        terms: { ...knownTerms(), deductible: { status: 'known', value: rupees(10_000) } },
      },
    }),
    failedResult('r7', 'insurer-g', 'timed_out'),
    {
      ...comparableResult('r8', 'insurer-h', 1),
      premium: { total: { text: '₹ 12,000 - 15,000' }, basis: 'incl_gst' },
    },
  ];

  const ignoringOrder = (result: ComparisonResult) => ({
    ...result,
    excluded: result.excluded
      .map(({ index: _index, ...entry }) => entry)
      .sort((a, b) => (a.resultId! < b.resultId! ? -1 : 1)),
  });

  it('gives the same output for the same input, and does not mutate the input', () => {
    const frozen = structuredClone(pool);
    const first = compare(pool);
    expect(compare(pool)).toEqual(first);
    expect(pool).toEqual(frozen);
  });

  it('gives the same comparison for any order and any subset of the results', () => {
    for (const incomparable of ['suppress_highlight', 'exclude_and_rank_rest'] as const) {
      const rule = { ...RULE, incomparable };
      fc.assert(
        fc.property(
          fc
            .subarray(pool)
            .chain((subset) =>
              fc.tuple(
                fc.constant(subset),
                fc.shuffledSubarray(subset, { minLength: subset.length }),
              ),
            ),
          ([subset, shuffled]) => {
            expect(ignoringOrder(compare(shuffled, rule))).toEqual(
              ignoringOrder(compare(subset, rule)),
            );
          },
        ),
        { numRuns: 200 },
      );
    }
  });

  it('never highlights a result that is excluded or not the lowest comparable premium', () => {
    fc.assert(
      fc.property(fc.subarray(pool), (subset) => {
        const result = compare(subset, {
          ...RULE,
          incomparable: 'exclude_and_rank_rest',
          addOns: 'ignore',
        });
        if (!result.cheapest) return;
        const excludedIds = new Set(result.excluded.map((entry) => entry.resultId));
        const lowest = Math.min(...result.comparable.map((entry) => entry.totalPremiumPaise));
        for (const id of result.cheapest.resultIds) expect(excludedIds.has(id)).toBe(false);
        expect(result.cheapest.totalPremiumPaise).toBe(lowest);
      }),
    );
  });
});
