// Development-only M3 comparison demo (src/renderer/src/dev/). Checks that the view model shows
// exactly what the real engine returns, that each scenario demonstrates what its title says,
// that all data is labelled synthetic and that the demo code has no I/O.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareQuotes } from '../src/shared/comparison/compare';
import {
  COMPARABILITY_CODES,
  ELIGIBILITY_CODES,
  NO_HIGHLIGHT_REASONS,
  VALIDITY_CODES,
} from '../src/shared/contracts/comparison';
import { PROVISIONAL_COMPARISON_RULE } from '../src/shared/rules/comparison-rule';
import { PLACEHOLDER_QUOTE_INPUT_RULES } from '../src/shared/rules/quote-input-rules';
import { REQUEST_RULE_CODES, validateQuoteDraft } from '../src/shared/validation/quote-request';
import { rupees } from '../src/shared/money';
import {
  type DemoRun,
  FINDING_TEXT,
  FINDING_TITLE,
  NO_HIGHLIGHT_TEXT,
  NO_HIGHLIGHT_TITLE,
  REQUEST_ISSUE_TEXT,
  REVIEW_FLAG_LABEL,
  RUN_STATUS_LABEL,
  STAGE_GROUP,
  buildRows,
  cellValue,
  describeBasis,
  describeCoverType,
  describeDifference,
  describeIssue,
  describeIssueLocation,
  describeMembers,
  describeOutcome,
  describeSource,
  describeTenure,
  describeTerm,
  differingTerms,
  exclusionCounts,
  findingsAt,
  formatAmount,
  formatQuoteAmount,
  groupFindings,
  memberIndexOf,
  missingValueLabel,
  outcomeBadge,
  premiumText,
  relationshipLabel,
  runDemo,
  sentenceCase,
  sumInsuredText,
  termCellText,
} from '../src/renderer/src/dev/demo-model';
import type { CoverageTerms } from '../src/shared/contracts/coverage';
import { REVIEW_FLAGS } from '../src/shared/contracts/quote';
import { RUN_STATUSES } from '../src/shared/contracts/status';
import {
  DEMO_DISCLAIMER,
  DEMO_INSURERS,
  DEMO_SCENARIOS,
  type DemoScenario,
} from '../src/renderer/src/dev/demo-scenarios';

function scenario(id: string): DemoScenario {
  const found = DEMO_SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`no scenario ${id}`);
  return found;
}

function compared(id: string): Extract<DemoRun, { kind: 'compared' }> {
  const run = runDemo(scenario(id));
  if (run.kind !== 'compared') throw new Error(`scenario ${id} was not compared`);
  return run;
}

function rowFor(run: Extract<DemoRun, { kind: 'compared' }>, label: string) {
  const row = run.rows.find((r) => r.insurerLabel === label);
  if (!row) throw new Error(`no row for ${label}`);
  return row;
}

describe('demo view model uses the real engine output', () => {
  it.each(DEMO_SCENARIOS.filter((s) => s.id !== 'invalid-request').map((s) => [s.id]))(
    '%s: comparison equals a direct compareQuotes call',
    (id) => {
      const s = scenario(id);
      const draft = validateQuoteDraft(
        { customer: s.customer, request: s.request },
        PLACEHOLDER_QUOTE_INPUT_RULES,
      );
      expect(draft.ok).toBe(true);
      const direct = compareQuotes(s.request, s.quotes);
      expect(direct.ok).toBe(true);
      expect(compared(id).comparison).toEqual(direct.ok && direct.value);
    },
  );

  it.each(DEMO_SCENARIOS.filter((s) => s.id !== 'invalid-request').map((s) => [s.id]))(
    '%s: every quote has one row whose outcome and findings come from the engine',
    (id) => {
      const { comparison, rows } = compared(id);
      expect(rows.map((row) => row.index)).toEqual(scenario(id).quotes.map((_, i) => i));
      const highlighted = new Set(comparison.cheapest?.resultIds ?? []);
      for (const row of rows) {
        const excluded = comparison.excluded.find((e) => e.index === row.index);
        if (excluded) {
          expect(row.outcome).toBe('excluded');
          expect(row.findings).toBe(excluded.findings);
          expect(row.resultId).toBe(excluded.resultId);
        } else {
          expect(comparison.comparable.map((c) => c.resultId)).toContain(row.resultId);
          expect(row.findings).toEqual([]);
          expect(row.outcome).toBe(highlighted.has(row.resultId!) ? 'highlighted' : 'comparable');
        }
      }
      expect(rows.filter((r) => r.outcome === 'highlighted').map((r) => r.resultId)).toEqual(
        comparison.cheapest?.resultIds ?? [],
      );
    },
  );

  it('passes the comparison rule straight to the engine', () => {
    const noTies = { ...PROVISIONAL_COMPARISON_RULE, ties: 'no_highlight' };
    const run = runDemo(scenario('tied-premiums'), noTies);
    expect(run.kind === 'compared' && run.comparison.noHighlightReason).toBe('TIE_NOT_HIGHLIGHTED');
  });

  it('reports engine rejection instead of throwing', () => {
    const run = runDemo(scenario('distinct-premiums'), { id: 'Not A Slug' });
    expect(run.kind).toBe('engine-rejected');
    expect(run.kind !== 'compared' && run.issues.every((i) => i.path.startsWith('rule'))).toBe(
      true,
    );
  });

  it('refuses to show a quote the engine output does not account for', () => {
    // Guards against a future engine defect: an unaccounted quote must never appear comparable.
    const { comparison } = compared('distinct-premiums');
    const missing = { ...comparison, comparable: comparison.comparable.slice(1) };
    expect(() => buildRows(scenario('distinct-premiums'), missing)).toThrow(/does not account/);
  });
});

describe('scenarios demonstrate what they describe (engine output under the provisional rule)', () => {
  it('distinct premiums: the single lowest comparable premium is highlighted', () => {
    const run = compared('distinct-premiums');
    expect(run.comparison.cheapest).toMatchObject({
      resultIds: ['demo-a-1'],
      totalPremiumPaise: rupees(18_450),
      tie: false,
    });
    expect(rowFor(run, 'Demo Insurer C').normalized?.source).toBe('manual');
    expect(rowFor(run, 'Demo Insurer C').outcome).toBe('comparable');
    const timedOut = rowFor(run, 'Demo Insurer D');
    expect(timedOut.outcome).toBe('excluded');
    expect(timedOut.findings.map((f) => f.code)).toEqual(['STATUS_NOT_COMPLETED']);
    expect(timedOut.eligibility).toBe('not_assessed');
    expect(timedOut.comparability).toBe('not_assessed');
  });

  it('tied premiums: both tied quotes are highlighted and the tie is flagged', () => {
    const run = compared('tied-premiums');
    expect(run.comparison.cheapest).toMatchObject({
      resultIds: ['demo-a-1', 'demo-b-1'],
      tie: true,
    });
    expect(run.rows.map((r) => r.outcome)).toEqual(['highlighted', 'highlighted', 'comparable']);
  });

  it('mismatched cover: an incomparable candidate suppresses the highlight', () => {
    const run = compared('mismatched-cover');
    expect(run.comparison.cheapest).toBeNull();
    expect(run.comparison.noHighlightReason).toBe('INCOMPARABLE_CANDIDATES');
    const codes = (label: string) => rowFor(run, label).findings.map((f) => f.code);
    expect(codes('Demo Insurer C')).toEqual(['SUM_INSURED_MISMATCH']);
    expect(codes('Demo Insurer D')).toEqual(['PREMIUM_BASIS_NOT_RANKED']);
    expect(codes('Demo Insurer E')).toEqual(['ADD_ONS_PRESENT']);
    expect(codes('Demo Insurer F')).toEqual(['TENURE_NOT_RANKED', 'TENURE_MISMATCH']);
    expect(rowFor(run, 'Demo Insurer C').comparability).toBe('failed');
    expect(rowFor(run, 'Demo Insurer C').eligibility).toBe('passed');
    expect(rowFor(run, 'Demo Insurer D').eligibility).toBe('failed');
    expect(rowFor(run, 'Demo Insurer D').comparability).toBe('passed');
    // The cheapest premium in the set (C, ₹16,200) is not comparable and is not highlighted.
    expect(run.rows.some((r) => r.outcome === 'highlighted')).toBe(false);
  });

  it('terms differ: the engine reports the co-pay difference and highlights nothing', () => {
    const run = compared('terms-differ');
    expect(run.comparison.noHighlightReason).toBe('TERMS_DIFFER');
    const [difference] = run.comparison.differences;
    expect(difference?.term).toBe('coPay');
    expect(describeDifference(difference!, run.rows)).toBe(
      'Co-pay: none — Demo Insurer A; 20% — Demo Insurer B',
    );
  });

  it('invalid quotes: each record is excluded for its own validity reason', () => {
    const run = compared('invalid-quotes');
    expect(run.comparison.noHighlightReason).toBe('TOO_FEW_COMPARABLE');
    const codes = (label: string) => rowFor(run, label).findings.map((f) => f.code);
    expect(codes('Demo Insurer B')).toEqual(['PREMIUM_MISSING']);
    expect(codes('Demo Insurer C')).toEqual(['PREMIUM_UNPARSEABLE']);
    expect(codes('Demo Insurer D')).toEqual(['REVIEW_REQUIRED']);
    expect(codes('Demo Insurer E')).toEqual(['CURRENCY_UNSUPPORTED']);
    const malformed = rowFor(run, 'Demo Insurer F');
    expect(malformed.normalized).toBeNull();
    expect(malformed.findings).toEqual([
      { stage: 'validity', code: 'MALFORMED_RESULT', path: 'retrievedAt' },
    ]);
    expect(rowFor(run, 'Demo Insurer B').normalized?.premium.totalPaise).toBeNull();
    expect(formatAmount(rowFor(run, 'Demo Insurer B').normalized!.premium.totalPaise)).toBe(
      'Not shown',
    );
  });

  it('no usable quotes: nothing comparable, nothing highlighted', () => {
    const run = compared('no-usable-quotes');
    expect(run.comparison.noHighlightReason).toBe('NO_COMPARABLE_RESULTS');
    expect(run.rows.every((r) => r.outcome === 'excluded')).toBe(true);
  });

  it('no quotes: the empty set is reported, with no rows', () => {
    const run = compared('no-quotes');
    expect(run.comparison.noHighlightReason).toBe('NO_RESULTS');
    expect(run.rows).toEqual([]);
  });

  it('invalid request: validation stops the run before the engine', () => {
    const run = runDemo(scenario('invalid-request'));
    expect(run).toEqual({
      kind: 'request-invalid',
      issues: [{ path: 'request.members.0.age', code: 'AGE_ABOVE_MAXIMUM' }],
    });
  });

  it('a schema-invalid request is reported safely', () => {
    const run = runDemo({ ...scenario('no-quotes'), request: { members: [] } as never });
    expect(run.kind).toBe('request-invalid');
    expect(run.kind !== 'compared' && run.issues.length).toBeGreaterThan(0);
  });
});

describe('synthetic labelling', () => {
  it('shows the exact disclaimer', () => {
    expect(DEMO_DISCLAIMER).toBe(
      'Demonstration only — all customer and quote data is synthetic. No real insurer quotes are retrieved.',
    );
  });

  it('uses only fictional demo insurers, plans and customer', () => {
    for (const insurer of DEMO_INSURERS) {
      expect(insurer.id).toMatch(/^demo-insurer-[a-f]$/);
      expect(insurer.displayName).toMatch(/^Demo Insurer [A-F]$/);
    }
    for (const s of DEMO_SCENARIOS) {
      expect(s.customer.name).toMatch(/synthetic/i);
      expect(s.customer.phone).toBeUndefined();
      expect(s.customer.email).toBeUndefined();
      for (const q of s.quotes as Record<string, unknown>[]) {
        expect(q['insurerId']).toMatch(/^demo-insurer-/);
        if (q['planLabel'] !== undefined) expect(q['planLabel']).toMatch(/^Demo /);
      }
    }
  });

  it('has unique scenario IDs', () => {
    const ids = DEMO_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('display text', () => {
  it('explains every engine finding, no-highlight reason and request rule code', () => {
    for (const code of [...VALIDITY_CODES, ...ELIGIBILITY_CODES, ...COMPARABILITY_CODES]) {
      expect(FINDING_TEXT[code]).toMatch(/\S/);
    }
    for (const reason of NO_HIGHLIGHT_REASONS) expect(NO_HIGHLIGHT_TEXT[reason]).toMatch(/\S/);
    for (const code of REQUEST_RULE_CODES) expect(REQUEST_ISSUE_TEXT[code]).toMatch(/\S/);
  });

  it('never calls a quote best or recommended', () => {
    const outcomes = DEMO_SCENARIOS.flatMap((s) => {
      const run = runDemo(s);
      return run.kind === 'compared' ? [describeOutcome(run.comparison, run.rows)] : [];
    });
    const text = JSON.stringify([
      FINDING_TEXT,
      FINDING_TITLE,
      NO_HIGHLIGHT_TEXT,
      NO_HIGHLIGHT_TITLE,
      STAGE_GROUP,
      DEMO_SCENARIOS,
      outcomes,
    ]);
    expect(text).not.toMatch(/\b(best|winner|recommend)/i);
  });

  it('page copy disclaims suitability and recommendation', () => {
    const page = readFileSync(
      join(__dirname, '../src/renderer/src/dev/ComparisonDemo.tsx'),
      'utf8',
    );
    expect(page).toContain('Premium alone does not establish whether a policy suits the customer.');
    expect(page).toContain('{DEMO_DISCLAIMER}');
    expect(page).not.toMatch(/\b(best|winner)\b/i);
  });

  it('describes request issues, falling back to the schema code', () => {
    expect(describeIssue({ path: 'tenureYears', code: 'TENURE_NOT_ALLOWED' })).toBe(
      'The policy tenure is not an allowed value.',
    );
    expect(describeIssue({ path: 'members', code: 'too_small' })).toMatch(/\(too_small\)/);
  });

  it('formats amounts without turning missing or invalid values into zero', () => {
    expect(formatAmount(null)).toBe('Not shown');
    expect(formatAmount(-100)).toBe('Invalid amount');
    expect(formatAmount(1.5)).toBe('Invalid amount');
    expect(formatAmount(rupees(18_450))).toBe('₹18,450.00');
  });

  it('describes members and tenure', () => {
    expect(describeMembers(null)).toBe('Not shown');
    expect(describeMembers([{ relationship: 'father_in_law', age: 70 }])).toBe('Father-in-law, 70');
    expect(describeTenure(null)).toBe('Not shown');
    expect(describeTenure(1)).toBe('1 year');
    expect(describeTenure(2)).toBe('2 years');
  });

  it('describes each coverage term form', () => {
    const unknown = {
      coPay: { status: 'unknown' },
      deductible: { status: 'unknown' },
      roomRent: { status: 'unknown' },
      addOns: { status: 'unknown' },
    } as const;
    for (const name of ['coPay', 'deductible', 'roomRent', 'addOns'] as const) {
      expect(describeTerm(unknown, name, 'INR')).toBe('not shown');
    }
    const known = (roomRent: object) =>
      ({
        coPay: { status: 'known', value: 10 },
        deductible: { status: 'known', value: rupees(25_000) },
        roomRent: { status: 'known', value: roomRent },
        addOns: { status: 'known', value: ['demo-a', 'demo-b'] },
      }) as never;
    const k = known({ kind: 'per_day_cap', capPaise: rupees(5_000) });
    expect(describeTerm(k, 'coPay', 'INR')).toBe('10%');
    expect(describeTerm(k, 'deductible', 'INR')).toBe('₹25,000.00');
    expect(describeTerm(k, 'addOns', 'INR')).toBe('demo-a, demo-b');
    expect(describeTerm(k, 'roomRent', 'INR')).toBe('₹5,000.00 per day');
    expect(
      describeTerm(known({ kind: 'percent_of_sum_insured', basisPoints: 100 }), 'roomRent', 'INR'),
    ).toBe('1% of sum insured per day');
    expect(
      describeTerm(known({ kind: 'room_category', category: 'shared' }), 'roomRent', 'INR'),
    ).toBe('shared room');
    expect(
      describeTerm(known({ kind: 'room_category', category: 'single_private' }), 'roomRent', 'INR'),
    ).toBe('single private room');
  });

  it('formats term amounts in the quote currency, never as rupees for other currencies', () => {
    const terms: CoverageTerms = {
      coPay: { status: 'known', value: 0 },
      deductible: { status: 'known', value: rupees(25_000) },
      roomRent: { status: 'known', value: { kind: 'per_day_cap', capPaise: rupees(5_000) } },
      addOns: { status: 'known', value: [] },
    };
    expect(describeTerm(terms, 'deductible', 'USD')).toBe('25,000.00 USD');
    expect(describeTerm(terms, 'roomRent', 'USD')).toBe('5,000.00 USD per day');
    expect(describeTerm(terms, 'deductible', null)).toBe('25,000.00 (currency not stated)');
    expect(describeTerm(terms, 'roomRent', null)).toBe('5,000.00 (currency not stated) per day');
    // Zero and percentage terms carry no currency.
    expect(
      describeTerm({ ...terms, deductible: { status: 'known', value: 0 } }, 'deductible', 'USD'),
    ).toBe('none');
    expect(
      describeTerm(
        {
          ...terms,
          roomRent: {
            status: 'known',
            value: { kind: 'percent_of_sum_insured', basisPoints: 100 },
          },
        },
        'roomRent',
        'USD',
      ),
    ).toBe('1% of sum insured per day');
  });

  it('falls back to the value key and result ID when a difference has no matching row', () => {
    expect(
      describeDifference(
        {
          term: 'deductible',
          groups: [
            { valueKey: '0', resultIds: ['x-1'] },
            { valueKey: '100', resultIds: ['y-1'] },
          ],
        },
        [],
      ),
    ).toBe('Deductible: 0 — x-1; 100 — y-1');
  });

  it('labels a quote by its insurer ID when the insurer list does not name it', () => {
    // Replaces the label-fallback check that used the removed previewQuote helper.
    const s = scenario('distinct-premiums');
    const run = runDemo({ ...s, insurers: [] });
    expect(run.kind === 'compared' && run.rows.map((r) => r.insurerLabel)).toEqual([
      'demo-insurer-a',
      'demo-insurer-b',
      'demo-insurer-c',
      'demo-insurer-d',
    ]);
    const malformed = rowFor(compared('invalid-quotes'), 'Demo Insurer F');
    expect(malformed.normalized).toBeNull();
    const unidentified = buildRows(
      { ...s, quotes: [{ resultId: 'bad id!' }] },
      {
        ...compared('no-quotes').comparison,
        excluded: [
          {
            index: 0,
            resultId: null,
            insurerId: null,
            findings: [{ stage: 'validity', code: 'MALFORMED_RESULT' }],
          },
        ],
      },
    );
    expect(unidentified[0]?.insurerLabel).toBe('Unidentified quote record');
  });
});

describe('currency display (regression: no rupee sign on non-INR amounts)', () => {
  it('shows every amount of the USD quote in USD, and every INR quote amount in rupees', () => {
    const run = compared('invalid-quotes');
    const usd = rowFor(run, 'Demo Insurer E').normalized!;
    expect(usd.currency).toBe('USD');
    expect(premiumText(usd)).toBe('230.00 USD');
    expect(sumInsuredText(usd)).toBe('5,00,000.00 USD');

    const inr = rowFor(run, 'Demo Insurer A').normalized!;
    expect(inr.currency).toBe('INR');
    expect(premiumText(inr)).toBe('₹18,450.00');
    expect(sumInsuredText(inr)).toBe('₹5,00,000.00');
  });

  it('formats deductible and room-rent caps in the quote currency through the table cells', () => {
    const base = rowFor(compared('invalid-quotes'), 'Demo Insurer A').normalized!;
    const withAmounts = {
      ...base,
      terms: {
        ...base.terms,
        deductible: { status: 'known', value: rupees(25_000) },
        roomRent: { status: 'known', value: { kind: 'per_day_cap', capPaise: rupees(5_000) } },
      },
    } as const;
    expect(termCellText(withAmounts, 'deductible')).toBe('₹25,000.00');
    expect(termCellText(withAmounts, 'roomRent')).toBe('₹5,000.00 per day');
    const asUsd = { ...withAmounts, currency: 'USD' };
    expect(termCellText(asUsd, 'deductible')).toBe('25,000.00 USD');
    expect(termCellText(asUsd, 'roomRent')).toBe('5,000.00 USD per day');
  });

  it('keeps missing and unstated-currency amounts explicit', () => {
    const q = rowFor(compared('invalid-quotes'), 'Demo Insurer A').normalized!;
    expect(premiumText({ ...q, premium: { ...q.premium, totalPaise: null } })).toBeNull();
    expect(sumInsuredText({ ...q, sumInsuredPaise: null })).toBeNull();
    expect(sumInsuredText({ ...q, currency: null })).toBe('5,00,000.00 (currency not stated)');
    expect(premiumText({ ...q, premium: { ...q.premium, totalPaise: -1 } })).toBe('Invalid amount');
  });

  it('no displayed amount of any non-INR quote in any scenario contains the rupee sign', () => {
    let nonInrQuotes = 0;
    for (const s of DEMO_SCENARIOS) {
      const run = runDemo(s);
      if (run.kind !== 'compared') continue;
      for (const row of run.rows) {
        const q = row.normalized;
        if (q === null || q.currency === 'INR') continue;
        nonInrQuotes += 1;
        const texts = [
          premiumText(q),
          sumInsuredText(q),
          ...(['coPay', 'deductible', 'roomRent', 'addOns'] as const).map((n) =>
            termCellText(q, n),
          ),
        ];
        for (const text of texts) expect(text ?? '').not.toContain('₹');
      }
    }
    expect(nonInrQuotes).toBeGreaterThan(0);
  });

  it('every comparable or highlighted quote is INR, so INR-only summary formatting is safe', () => {
    for (const s of DEMO_SCENARIOS) {
      const run = runDemo(s);
      if (run.kind !== 'compared') continue;
      for (const row of run.rows.filter((r) => r.outcome !== 'excluded')) {
        expect(row.normalized?.currency).toBe('INR');
      }
    }
  });

  it('leaves the engine finding for the USD quote unchanged', () => {
    const usd = rowFor(compared('invalid-quotes'), 'Demo Insurer E');
    expect(usd.outcome).toBe('excluded');
    expect(usd.findings).toEqual([
      { stage: 'validity', code: 'CURRENCY_UNSUPPORTED', path: 'currency' },
    ]);
  });

  it('the screen formats insurer-result amounts only through the currency-aware helpers', () => {
    const page = readFileSync(
      join(__dirname, '../src/renderer/src/dev/ComparisonDemo.tsx'),
      'utf8',
    );
    // formatAmount (rupees only) must never receive a field of a quote (`q.`, `quote.`, `row.`).
    expect(page).not.toMatch(/formatAmount\(\s*(q|quote|row|normalized)\b/);
    expect(page).toMatch(/value: \(q\) => premiumText\(q\)/);
    expect(page).toMatch(/value: \(q\) => sumInsuredText\(q\)/);
    expect(page).toMatch(/value: \(q\) => termCellText\(q, name\)/);
  });
});

describe('demo code has no I/O', () => {
  const dir = join(__dirname, '../src/renderer/src/dev');
  const sources = readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const);

  it('finds the demo sources', () => {
    expect(sources.map(([f]) => f).sort()).toEqual([
      'ComparisonDemo.tsx',
      'demo-model.ts',
      'demo-scenarios.ts',
      'icons.tsx',
    ]);
  });

  it.each(sources)('%s uses no IPC, network, storage or clock', (_file, text) => {
    for (const pattern of [
      /window\.fqf/,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /EventSource/,
      /sendBeacon/,
      /localStorage|sessionStorage|indexedDB/,
      /from 'electron'/,
      /\bnew Date\b|Date\.now/,
      /Math\.random/,
      /https?:\/\//,
      /@import|url\(/,
      /<img\b/,
    ]) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('App.tsx loads the demo only behind import.meta.env.DEV', () => {
    const app = readFileSync(join(__dirname, '../src/renderer/src/App.tsx'), 'utf8');
    const imports = app.match(/import\(['"][^'"]*dev\/[^'"]*['"]\)/g) ?? [];
    expect(imports).toEqual(["import('./dev/ComparisonDemo')"]);
    expect(app).toMatch(
      /import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) =>\s*import\('\.\/dev\/ComparisonDemo'\)/,
    );
    expect(app).not.toMatch(/^import .*\.\/dev\//m);
  });
});

describe('presentation helpers read engine output only', () => {
  it('has a scenario focus line for every scenario', () => {
    for (const s of DEMO_SCENARIOS) expect(s.focus).toMatch(/\S/);
  });

  it('has a plain-language title for every finding and no-highlight reason', () => {
    for (const code of [...VALIDITY_CODES, ...ELIGIBILITY_CODES, ...COMPARABILITY_CODES]) {
      expect(FINDING_TITLE[code]).toMatch(/\S/);
    }
    for (const reason of NO_HIGHLIGHT_REASONS) expect(NO_HIGHLIGHT_TITLE[reason]).toMatch(/\S/);
  });

  it('describes the outcome from cheapest or noHighlightReason', () => {
    const single = compared('distinct-premiums');
    expect(describeOutcome(single.comparison, single.rows)).toMatchObject({
      tone: 'positive',
      title: 'Lowest comparable premium identified',
    });
    expect(describeOutcome(single.comparison, single.rows).detail).toContain('Demo Insurer A');

    const tie = compared('tied-premiums');
    const tied = describeOutcome(tie.comparison, tie.rows);
    expect(tied.title).toBe('Lowest comparable premium is shared by 2 quotes');
    expect(tied.detail).toContain('Demo Insurer A and Demo Insurer B');
    expect(tied.detail).toContain('Both are highlighted');

    const three = {
      ...tie.comparison,
      cheapest: { ...tie.comparison.cheapest!, resultIds: ['demo-a-1', 'demo-b-1', 'gone-1'] },
    };
    expect(describeOutcome(three, tie.rows).detail).toContain('gone-1');
    expect(describeOutcome(three, tie.rows).detail).toContain('All are highlighted');

    const none = compared('mismatched-cover');
    expect(describeOutcome(none.comparison, none.rows)).toEqual({
      tone: 'warning',
      title: NO_HIGHLIGHT_TITLE.INCOMPARABLE_CANDIDATES,
      detail: NO_HIGHLIGHT_TEXT.INCOMPARABLE_CANDIDATES,
    });

    const empty = compared('no-quotes');
    expect(describeOutcome(empty.comparison, empty.rows).tone).toBe('neutral');
    // Defensive default; the result schema forbids both fields being null.
    const neither = { ...empty.comparison, noHighlightReason: null };
    expect(describeOutcome(neither, []).title).toBe(NO_HIGHLIGHT_TITLE.NO_RESULTS);
  });

  it('labels each quote by its engine outcome and failed stage', () => {
    const mismatched = compared('mismatched-cover');
    const label = (name: string) => outcomeBadge(rowFor(mismatched, name), false).label;
    expect(label('Demo Insurer A')).toBe('Comparable');
    expect(label('Demo Insurer C')).toBe('Not comparable');
    expect(label('Demo Insurer D')).toBe('Not eligible');
    expect(label('Demo Insurer F')).toBe('Not eligible');

    const invalid = compared('invalid-quotes');
    expect(outcomeBadge(rowFor(invalid, 'Demo Insurer B'), false)).toEqual({
      tone: 'danger',
      label: 'Cannot be used',
    });

    const tie = compared('tied-premiums');
    expect(outcomeBadge(rowFor(tie, 'Demo Insurer A'), true).label).toBe('Tied lowest premium');
    const single = compared('distinct-premiums');
    expect(outcomeBadge(rowFor(single, 'Demo Insurer A'), false).label).toBe(
      'Lowest comparable premium',
    );
  });

  it('counts exclusions by the engine stage that failed', () => {
    expect(exclusionCounts(compared('mismatched-cover').rows)).toEqual({
      invalid: 0,
      notRanked: 4,
    });
    expect(exclusionCounts(compared('invalid-quotes').rows)).toEqual({ invalid: 5, notRanked: 0 });
    expect(exclusionCounts(compared('tied-premiums').rows)).toEqual({ invalid: 0, notRanked: 0 });
  });

  it('groups a quote’s findings by stage in severity order', () => {
    const f = rowFor(compared('mismatched-cover'), 'Demo Insurer F');
    expect(groupFindings(f.findings)).toEqual([
      { stage: 'eligibility', findings: [f.findings[0]] },
      { stage: 'comparability', findings: [f.findings[1]] },
    ]);
    expect(
      groupFindings([
        { stage: 'comparability', code: 'TERM_UNKNOWN' },
        { stage: 'validity', code: 'PREMIUM_MISSING' },
      ]).map((g) => g.stage),
    ).toEqual(['validity', 'comparability']);
    expect(STAGE_GROUP.validity.tone).toBe('danger');
  });

  it('locates findings on table attributes by exact engine path', () => {
    const c = rowFor(compared('mismatched-cover'), 'Demo Insurer C');
    expect(findingsAt(c, ['coverage.sumInsured']).map((f) => f.code)).toEqual([
      'SUM_INSURED_MISMATCH',
    ]);
    expect(findingsAt(c, ['coverage.tenureYears'])).toEqual([]);
    const malformed = rowFor(compared('invalid-quotes'), 'Demo Insurer F');
    expect(findingsAt(malformed, ['retrievedAt'])).toHaveLength(1);
    const noPath = { ...c, findings: [{ stage: 'validity', code: 'REVIEW_REQUIRED' }] as const };
    expect(findingsAt(noPath, ['reviewFlags'])).toEqual([]);
  });

  it('marks only the quotes the engine lists in a term difference', () => {
    const run = compared('terms-differ');
    expect([...differingTerms(run.comparison, 'demo-a-1')]).toEqual(['coPay']);
    expect([...differingTerms(run.comparison, 'demo-b-1')]).toEqual(['coPay']);
    expect(differingTerms(run.comparison, null).size).toBe(0);
    expect(differingTerms(compared('tied-premiums').comparison, 'demo-a-1').size).toBe(0);
  });

  it('explains missing values without implying zero', () => {
    const invalid = compared('invalid-quotes');
    expect(missingValueLabel(rowFor(invalid, 'Demo Insurer F'))).toBe('Unreadable');
    expect(missingValueLabel(rowFor(invalid, 'Demo Insurer B'))).toBe('Not shown');
    expect(missingValueLabel(rowFor(compared('no-usable-quotes'), 'Demo Insurer A'))).toBe(
      'Not returned',
    );
  });

  it('fills table cells without inventing values', () => {
    const invalid = compared('invalid-quotes');
    const a = rowFor(invalid, 'Demo Insurer A');
    expect(cellValue(a, ['premium.total'], '₹18,450.00')).toEqual({
      value: '₹18,450.00',
      missing: false,
    });
    // Premium range text the normaliser could not parse.
    expect(cellValue(rowFor(invalid, 'Demo Insurer C'), ['premium.total'], null)).toEqual({
      value: 'Unreadable',
      missing: true,
    });
    // No premium at all.
    expect(cellValue(rowFor(invalid, 'Demo Insurer B'), ['premium.total'], null)).toEqual({
      value: 'Not shown',
      missing: true,
    });
    // Malformed record: even a value is not shown, because the record could not be read.
    expect(cellValue(rowFor(invalid, 'Demo Insurer F'), ['premium.total'], 'x').value).toBe(
      'Unreadable',
    );
    const timedOut = rowFor(compared('distinct-premiums'), 'Demo Insurer D');
    expect(cellValue(timedOut, ['premium.total'], null).value).toBe('Not returned');
  });

  it('never shows a non-INR amount with the rupee sign', () => {
    expect(formatQuoteAmount(rupees(18_450), 'INR')).toBe('₹18,450.00');
    expect(formatQuoteAmount(rupees(230), 'USD')).toBe('230.00 USD');
    expect(formatQuoteAmount(rupees(230), null)).toBe('230.00 (currency not stated)');
    expect(formatQuoteAmount(null, 'INR')).toBeNull();
    expect(formatQuoteAmount(-1, 'INR')).toBe('Invalid amount');
    const usd = rowFor(compared('invalid-quotes'), 'Demo Insurer E').normalized!;
    expect(formatQuoteAmount(usd.premium.totalPaise, usd.currency)).not.toContain('₹');
  });

  it('labels contract enums', () => {
    for (const status of RUN_STATUSES) expect(RUN_STATUS_LABEL[status]).toMatch(/\S/);
    for (const flag of REVIEW_FLAGS) expect(REVIEW_FLAG_LABEL[flag]).toMatch(/\S/);
    expect(describeCoverType('floater')).toBe('Family floater');
    expect(describeCoverType('individual')).toBe('Individual');
    expect(describeCoverType(null)).toBeNull();
    expect(describeBasis('incl_gst')).toBe('Includes GST');
    expect(describeBasis('excl_gst')).toBe('Excludes GST');
    expect(describeBasis('unknown')).toBeNull();
    expect(describeSource('manual')).toBe('Manual entry');
    expect(describeSource('automated')).toBe('Automated');
    expect(relationshipLabel('mother_in_law')).toBe('Mother-in-law');
    expect(sentenceCase('no limit')).toBe('No limit');
    expect(sentenceCase('')).toBe('');
  });

  it('shows coverage terms in cells without altering add-on identifiers', () => {
    const e = rowFor(compared('mismatched-cover'), 'Demo Insurer E').normalized!;
    expect(termCellText(e, 'addOns')).toBe('demo-room-upgrade');
    expect(termCellText(e, 'roomRent')).toBe('No limit');
    expect(termCellText(e, 'coPay')).toBe('None');
    const a = rowFor(compared('mismatched-cover'), 'Demo Insurer A').normalized!;
    expect(termCellText(a, 'addOns')).toBe('None');
    const timedOut = rowFor(compared('distinct-premiums'), 'Demo Insurer D').normalized!;
    expect(termCellText(timedOut, 'deductible')).toBeNull();
  });

  it('describes where a request issue is', () => {
    const members = [{ relationship: 'self' }, { relationship: 'spouse' }] as const;
    const at = (path: string) => describeIssueLocation({ path, code: 'x' }, members);
    expect(at('request.members.0.age')).toBe('Member 1 (Self)');
    expect(at('request.members.1')).toBe('Member 2 (Spouse)');
    expect(at('request.members.7.age')).toBe('Member 8');
    expect(at('request.members')).toBe('Members');
    expect(at('request.sumInsuredPaise')).toBe('Sum insured');
    expect(at('request.tenureYears')).toBe('Policy tenure');
    expect(at('customer.email')).toBe('Customer');
    expect(at('request.unknownField')).toBe('Request');
    expect(at('')).toBe('Request');
    expect(memberIndexOf({ path: 'request.members.0.age', code: 'x' })).toBe(0);
    expect(memberIndexOf({ path: 'request.members', code: 'x' })).toBeNull();
  });

  it('flags the invalid member in the invalid-request scenario', () => {
    const run = runDemo(scenario('invalid-request'));
    expect(run.kind).toBe('request-invalid');
    if (run.kind !== 'request-invalid') return;
    expect(run.issues.map(memberIndexOf)).toEqual([0]);
    expect(describeIssueLocation(run.issues[0]!, scenario('invalid-request').request.members)).toBe(
      'Member 1 (Self)',
    );
  });
});
