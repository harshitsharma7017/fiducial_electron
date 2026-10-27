// M3 domain contracts: states, progress events, adapter metadata, coverage terms and the
// comparison result envelope. Contracts are DRAFT until the M3 contract review.
import { describe, expect, it } from 'vitest';
import { adapterMetadataSchema } from '../src/shared/contracts/adapter';
import { HIGHLIGHT_LABEL, comparisonResultSchema } from '../src/shared/contracts/comparison';
import { CONTRACTS_STATUS, CONTRACTS_VERSION } from '../src/shared/contracts/common';
import { coverageTermsSchema, termValueKey } from '../src/shared/contracts/coverage';
import { memberSchema } from '../src/shared/contracts/customer';
import { planIdentity } from '../src/shared/contracts/insurer';
import { issuesFromZod, parseWith } from '../src/shared/contracts/issues';
import {
  CONNECTION_STATUSES,
  RUN_STATUSES,
  TERMINAL_RUN_STATUSES,
  progressEventSchema,
} from '../src/shared/contracts/status';
import {
  PROVISIONAL_COMPARISON_RULE,
  comparisonRuleSchema,
} from '../src/shared/rules/comparison-rule';
import {
  PLACEHOLDER_QUOTE_INPUT_RULES,
  quoteInputRulesSchema,
} from '../src/shared/rules/quote-input-rules';
import { SENSITIVE, expectNoSensitiveValues } from './support/m3-fixtures';

describe('contract metadata', () => {
  it('is a draft until the contract review freezes it', () => {
    expect(CONTRACTS_VERSION).toBe('0.1.0');
    expect(CONTRACTS_STATUS).toBe('draft');
  });

  it('ships rules that are explicitly not approved', () => {
    expect(comparisonRuleSchema.parse(PROVISIONAL_COMPARISON_RULE).status).toBe('provisional');
    expect(quoteInputRulesSchema.parse(PLACEHOLDER_QUOTE_INPUT_RULES).status).toBe('placeholder');
  });
});

describe('states (ARCH §3.4)', () => {
  it('matches the documented run and connection states', () => {
    expect(RUN_STATUSES).toEqual([
      'pending',
      'running',
      'login_required',
      'otp_required',
      'manual_action_required',
      'manual_required',
      'completed',
      'failed',
      'timed_out',
      'cancelled',
      'unsupported',
    ]);
    expect(CONNECTION_STATUSES).toEqual([
      'not_connected',
      'connecting',
      'connected',
      'login_required',
      'otp_required',
      'manual_action_required',
      'blocked',
    ]);
    for (const status of TERMINAL_RUN_STATUSES) expect(RUN_STATUSES).toContain(status);
  });
});

describe('progress event (16 §4)', () => {
  const event = {
    runId: 'run-1',
    insurerId: 'insurer-a',
    status: 'otp_required',
    progressStep: 'awaiting-otp',
    safeMessage: 'Complete the OTP step in the insurer window.',
    occurredAt: '2026-10-27T10:00:00.000Z',
  };

  it('accepts a sanitised event', () => {
    expect(progressEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([
    ['member details', { members: [{ relationship: 'self', age: 34 }] }],
    ['an OTP', { otp: '123456' }],
    ['a session token', { sessionToken: SENSITIVE.secret }],
    ['a screenshot', { screenshot: 'data:image/png;base64,AAAA' }],
  ])('rejects an event carrying %s', (_label, extra) => {
    const result = parseWith(progressEventSchema, { ...event, ...extra });
    expect(result).toEqual({ ok: false, issues: [{ path: '', code: 'unrecognized_keys' }] });
  });

  it('rejects control characters and unknown error codes', () => {
    expect(progressEventSchema.safeParse({ ...event, safeMessage: 'a\u001bb' }).success).toBe(
      false,
    );
    expect(progressEventSchema.safeParse({ ...event, errorCode: 'OOPS' }).success).toBe(false);
  });
});

describe('adapter metadata (ARCH §3.6)', () => {
  const metadata = {
    id: 'insurer-a',
    displayName: 'Synthetic Insurer A',
    version: '0.1.0',
    mode: 'assisted',
    allowedOrigins: ['https://portal.example'],
    requiredFields: ['customer.phone'],
  };

  it('accepts HTTPS origins only, without paths or credentials', () => {
    expect(adapterMetadataSchema.safeParse(metadata).success).toBe(true);
    for (const origin of [
      'http://portal.example',
      'https://portal.example/login',
      'https://user:pass@portal.example',
      'not a url',
      'file:///etc/passwd',
    ]) {
      expect(
        adapterMetadataSchema.safeParse({ ...metadata, allowedOrigins: [origin] }).success,
      ).toBe(false);
    }
  });

  it('rejects unknown modes, required fields and version formats', () => {
    expect(adapterMetadataSchema.safeParse({ ...metadata, mode: 'stealth' }).success).toBe(false);
    expect(
      adapterMetadataSchema.safeParse({ ...metadata, requiredFields: ['customer.password'] })
        .success,
    ).toBe(false);
    expect(adapterMetadataSchema.safeParse({ ...metadata, version: 'latest' }).success).toBe(false);
  });
});

describe('members and coverage terms', () => {
  it('has no name, gender or date of birth on members (C-04, C-05)', () => {
    expect(Object.keys(memberSchema.shape)).toEqual(['relationship', 'age']);
    expect(
      memberSchema.safeParse({ relationship: 'self', age: 30, dateOfBirth: '1996-01-01' }).success,
    ).toBe(false);
  });

  it('requires every term to be explicitly known or unknown', () => {
    const unknown = { status: 'unknown' };
    const terms = { coPay: unknown, deductible: unknown, roomRent: unknown, addOns: unknown };
    expect(coverageTermsSchema.safeParse(terms).success).toBe(true);
    expect(coverageTermsSchema.safeParse({ ...terms, coPay: undefined }).success).toBe(false);
    expect(
      coverageTermsSchema.safeParse({
        ...terms,
        roomRent: { status: 'known', value: { kind: 'any' } },
      }).success,
    ).toBe(false);
  });

  it('keys term values stably and returns null for unknown terms', () => {
    const terms = coverageTermsSchema.parse({
      coPay: { status: 'unknown' },
      deductible: { status: 'known', value: 0 },
      roomRent: { status: 'unknown' },
      addOns: { status: 'known', value: ['b-cover', 'a-cover'] },
    });
    expect(termValueKey(terms, 'coPay')).toBeNull();
    expect(termValueKey(terms, 'deductible')).toBe('0');
    expect(termValueKey(terms, 'roomRent')).toBeNull();
    expect(termValueKey(terms, 'addOns')).toBe('a-cover,b-cover');
    expect(termValueKey({ ...terms, addOns: { status: 'unknown' } }, 'addOns')).toBeNull();
  });

  it('identifies plans case- and whitespace-insensitively per insurer', () => {
    expect(planIdentity('insurer-a', ' Plan  X ')).toBe(planIdentity('insurer-a', 'plan x'));
    expect(planIdentity('insurer-a', 'Plan X')).not.toBe(planIdentity('insurer-b', 'Plan X'));
  });
});

describe('comparison result envelope', () => {
  const base = {
    contractsVersion: CONTRACTS_VERSION,
    rule: { id: 'dm06-provisional', version: '0.1.0', status: 'provisional' },
    comparable: [],
    excluded: [],
    differences: [],
  };

  it('requires exactly one of a highlight and a no-highlight reason', () => {
    const cheapest = {
      resultIds: ['r1'],
      totalPremiumPaise: 100,
      tie: false,
      label: HIGHLIGHT_LABEL,
    };
    expect(
      comparisonResultSchema.safeParse({ ...base, cheapest, noHighlightReason: null }).success,
    ).toBe(true);
    expect(
      comparisonResultSchema.safeParse({ ...base, cheapest: null, noHighlightReason: 'NO_RESULTS' })
        .success,
    ).toBe(true);
    expect(
      comparisonResultSchema.safeParse({ ...base, cheapest: null, noHighlightReason: null })
        .success,
    ).toBe(false);
    expect(
      comparisonResultSchema.safeParse({ ...base, cheapest, noHighlightReason: 'NO_RESULTS' })
        .success,
    ).toBe(false);
  });

  it('only accepts the fixed, non-advisory highlight label', () => {
    const cheapest = { resultIds: ['r1'], totalPremiumPaise: 100, tie: false, label: 'Best plan' };
    expect(
      comparisonResultSchema.safeParse({ ...base, cheapest, noHighlightReason: null }).success,
    ).toBe(false);
  });
});

describe('validation issues', () => {
  it('report paths and codes only, and cap the count', () => {
    const many = Array.from({ length: 30 }, () => ({ relationship: SENSITIVE.name, age: -1 }));
    const result = memberSchema.array().safeParse(many);
    expect(result.success).toBe(false);
    const issues = issuesFromZod(result.error!);
    expect(issues).toHaveLength(20);
    expect(Object.keys(issues[0]!).sort()).toEqual(['code', 'path']);
    expectNoSensitiveValues(issues, [SENSITIVE.name]);
  });
});
