// Quote request and customer validation (FR-01 to FR-04; TC-01 to TC-04 at schema level).
// Business limits come from the PLACEHOLDER rule table (Q-B03 to Q-B05); the tests pin its
// boundaries so that a rule change is a visible, reviewed change.
import { describe, expect, it } from 'vitest';
import type { QuoteDraft } from '../src/shared/contracts/quote';
import { rupees } from '../src/shared/money';
import {
  PLACEHOLDER_QUOTE_INPUT_RULES as RULES,
  type QuoteInputRules,
} from '../src/shared/rules/quote-input-rules';
import { preflight } from '../src/shared/validation/preflight';
import { validateQuoteDraft, validateQuoteRequest } from '../src/shared/validation/quote-request';
import { REQUEST, SENSITIVE, expectNoSensitiveValues } from './support/m3-fixtures';

const request = (patch: Record<string, unknown> = {}) => ({ ...REQUEST, ...patch });
const codes = (result: ReturnType<typeof validateQuoteRequest>) =>
  result.ok ? [] : result.issues.map((issue) => `${issue.path}:${issue.code}`);

describe('quote request: valid input (TC-01)', () => {
  it('accepts a valid request and normalises it deterministically', () => {
    const input = request({ pincode: ' 110 001 ' });
    const first = validateQuoteRequest(input, RULES);
    expect(first).toEqual({ ok: true, value: { ...REQUEST, pincode: '110001' } });
    expect(validateQuoteRequest(input, RULES)).toEqual(first);
  });

  it('accepts a single-member individual request', () => {
    const single = request({
      coverType: 'individual',
      members: [{ relationship: 'self', age: 40 }],
    });
    expect(validateQuoteRequest(single, RULES).ok).toBe(true);
  });
});

describe('quote request: pincode (TC-02)', () => {
  it.each(['011001', '12345', '1234567', 'ABCDEF', '', '11000a'])('rejects %j', (pincode) => {
    expect(codes(validateQuoteRequest(request({ pincode }), RULES))).toEqual([
      'pincode:invalid_format',
    ]);
  });
});

describe('quote request: member eligibility (TC-03)', () => {
  const members = (relationship: string, age: number) => [
    { relationship: 'self', age: 40 },
    { relationship, age },
  ];

  it.each([
    ['spouse', 17, ['members.1.age:AGE_BELOW_MINIMUM']],
    ['spouse', 18, []],
    ['spouse', 65, []],
    ['spouse', 66, ['members.1.age:AGE_ABOVE_MAXIMUM']],
    ['son', 0, []],
    ['daughter', 25, []],
    ['daughter', 26, ['members.1.age:AGE_ABOVE_MAXIMUM']],
    ['mother', 80, []],
    ['father', 81, ['members.1.age:AGE_ABOVE_MAXIMUM']],
  ])('%s aged %d', (relationship, age, expected) => {
    expect(
      codes(validateQuoteRequest(request({ members: members(relationship, age) }), RULES)),
    ).toEqual(expected);
  });

  it.each([
    [-1, 'members.1.age:too_small'],
    [121, 'members.1.age:too_big'],
  ])('enforces contract age bounds (%d)', (age, expected) => {
    expect(codes(validateQuoteRequest(request({ members: members('son', age) }), RULES))).toEqual([
      expected,
    ]);
  });

  it('rejects fractional ages and unknown relationships at schema level', () => {
    expect(codes(validateQuoteRequest(request({ members: members('son', 1.5) }), RULES))).toEqual([
      'members.1.age:invalid_type',
    ]);
    expect(codes(validateQuoteRequest(request({ members: members('cousin', 30) }), RULES))).toEqual(
      ['members.1.relationship:invalid_value'],
    );
  });

  it('rejects a relationship the rule table does not allow', () => {
    const rules: QuoteInputRules = { ...RULES, relationships: { self: RULES.relationships.self } };
    expect(codes(validateQuoteRequest(request(), rules))).toEqual([
      'members.1.relationship:RELATIONSHIP_NOT_ALLOWED',
    ]);
  });

  it('limits members per relationship and in total', () => {
    const twoSelves = [
      { relationship: 'self', age: 40 },
      { relationship: 'self', age: 41 },
    ];
    expect(codes(validateQuoteRequest(request({ members: twoSelves }), RULES))).toEqual([
      'members.1.relationship:RELATIONSHIP_LIMIT_EXCEEDED',
    ]);

    const seven = [
      { relationship: 'self', age: 40 },
      ...[1, 2, 3, 4].map((age) => ({ relationship: 'son', age })),
      { relationship: 'daughter', age: 5 },
      { relationship: 'daughter', age: 6 },
    ];
    expect(
      codes(validateQuoteRequest(request({ members: seven, coverType: 'individual' }), RULES)),
    ).toEqual(['members:TOO_MANY_MEMBERS']);
  });

  it('enforces contract member bounds', () => {
    expect(codes(validateQuoteRequest(request({ members: [] }), RULES))).toEqual([
      'members:too_small',
    ]);
  });
});

describe('quote request: individual versus floater', () => {
  it('requires at least two members for floater cover (placeholder rule)', () => {
    const single = request({ members: [{ relationship: 'self', age: 40 }] });
    expect(codes(validateQuoteRequest(single, RULES))).toEqual(['members:FLOATER_TOO_FEW_MEMBERS']);
  });

  it('caps floater size independently of the overall cap', () => {
    const rules: QuoteInputRules = { ...RULES, floater: { minMembers: 2, maxMembers: 2 } };
    const three = request({ members: [...REQUEST.members, { relationship: 'son', age: 3 }] });
    expect(codes(validateQuoteRequest(three, rules))).toEqual(['members:FLOATER_TOO_MANY_MEMBERS']);
    expect(validateQuoteRequest({ ...three, coverType: 'individual' }, rules).ok).toBe(true);
  });

  it('rejects an unknown cover type', () => {
    expect(codes(validateQuoteRequest(request({ coverType: 'family' }), RULES))).toEqual([
      'coverType:invalid_value',
    ]);
  });
});

describe('quote request: sum insured and tenure', () => {
  it.each([
    [rupees(1_00_000), true],
    [rupees(1_00_00_000), true],
    [rupees(5_50_000), true],
    [rupees(50_000), false],
    [rupees(1_00_50_000), false],
    [rupees(5_25_000), false],
    [rupees(5_00_000) + 1, false],
  ])('range rule: %d paise allowed = %s', (sumInsuredPaise, allowed) => {
    expect(codes(validateQuoteRequest(request({ sumInsuredPaise }), RULES))).toEqual(
      allowed ? [] : ['sumInsuredPaise:SUM_INSURED_NOT_ALLOWED'],
    );
  });

  it('supports a fixed list of sums insured', () => {
    const rules: QuoteInputRules = {
      ...RULES,
      sumInsured: { kind: 'list', valuesPaise: [rupees(3_00_000), rupees(5_00_000)] },
    };
    expect(validateQuoteRequest(request(), rules).ok).toBe(true);
    expect(
      codes(validateQuoteRequest(request({ sumInsuredPaise: rupees(4_00_000) }), rules)),
    ).toEqual(['sumInsuredPaise:SUM_INSURED_NOT_ALLOWED']);
  });

  it.each([0, -100, 1.5])('rejects a non-positive or fractional sum insured (%d)', (value) => {
    expect(validateQuoteRequest(request({ sumInsuredPaise: value }), RULES).ok).toBe(false);
  });

  it('applies the tenure rule table and the contract bounds', () => {
    const oneYearOnly: QuoteInputRules = { ...RULES, tenureYears: [1] };
    expect(codes(validateQuoteRequest(request({ tenureYears: 2 }), oneYearOnly))).toEqual([
      'tenureYears:TENURE_NOT_ALLOWED',
    ]);
    expect(validateQuoteRequest(request({ tenureYears: 3 }), RULES).ok).toBe(true);
    expect(codes(validateQuoteRequest(request({ tenureYears: 6 }), RULES))).toEqual([
      'tenureYears:too_big',
    ]);
  });

  it('reports every rule problem at once', () => {
    const bad = request({
      members: [{ relationship: 'self', age: 17 }],
      sumInsuredPaise: rupees(50_000),
    });
    expect(codes(validateQuoteRequest(bad, RULES))).toEqual([
      'members.0.age:AGE_BELOW_MINIMUM',
      'members:FLOATER_TOO_FEW_MEMBERS',
      'sumInsuredPaise:SUM_INSURED_NOT_ALLOWED',
    ]);
  });
});

describe('rule tables are validated configuration', () => {
  it.each([
    [
      'inverted age range',
      { ...RULES, relationships: { self: { minAge: 60, maxAge: 18, maxCount: 1 } } },
    ],
    ['no tenures', { ...RULES, tenureYears: [] }],
    ['inverted floater size', { ...RULES, floater: { minMembers: 4, maxMembers: 2 } }],
    [
      'inverted sum insured range',
      { ...RULES, sumInsured: { kind: 'range', minPaise: 10, maxPaise: 5, stepPaise: 1 } },
    ],
    ['unexpected field', { ...RULES, approvedBy: 'nobody' }],
  ])('rejects %s', (_label, rules) => {
    expect(validateQuoteRequest(request(), rules)).toEqual({
      ok: false,
      issues: [{ path: 'rules', code: 'RULES_INVALID' }],
    });
  });

  it('marks the shipped table as a placeholder', () => {
    expect(RULES.status).toBe('placeholder');
  });
});

describe('quote draft (customer plus request)', () => {
  const draft = (customer: Record<string, unknown>, req: Record<string, unknown> = REQUEST) => ({
    customer,
    request: req,
  });

  it('normalises customer fields', () => {
    const result = validateQuoteDraft(
      draft({
        name: '  Test   Customer ',
        phone: '+91 98765-43210',
        email: ' test.customer@example.com ',
        notes: ' line one\nline two\t ',
      }),
      RULES,
    );
    expect(result.ok && result.value.customer).toEqual({
      name: 'Test Customer',
      phone: '9876543210',
      email: 'test.customer@example.com',
      notes: 'line one\nline two',
    });
  });

  it.each(['9876543210', '09876543210', '919876543210', '+919876543210', '98765 43210'])(
    'accepts mobile number format %j',
    (phone) => {
      const result = validateQuoteDraft(draft({ name: 'Test Customer', phone }), RULES);
      expect(result.ok && result.value.customer.phone).toBe('9876543210');
    },
  );

  it.each(['12345', '5876543210', '98765432101', '+1 9876543210', 'phone'])(
    'rejects phone %j',
    (phone) => {
      const result = validateQuoteDraft(draft({ name: 'Test Customer', phone }), RULES);
      expect(result).toEqual({
        ok: false,
        issues: [{ path: 'customer.phone', code: 'invalid_format' }],
      });
    },
  );

  it('requires only a name; phone, email and notes are optional (data minimisation)', () => {
    expect(validateQuoteDraft(draft({ name: 'Test Customer' }), RULES).ok).toBe(true);
    expect(validateQuoteDraft(draft({}), RULES).ok).toBe(false);
  });

  it.each([
    ['blank name', { name: '   ' }, 'customer.name'],
    ['control character in name', { name: 'Test\u0007Customer' }, 'customer.name'],
    ['C1 control character in name', { name: 'Test\u0085Customer' }, 'customer.name'],
    ['DEL in name', { name: 'Test\u007fCustomer' }, 'customer.name'],
    ['overlong name', { name: 'x'.repeat(101) }, 'customer.name'],
    ['invalid email', { name: 'Test Customer', email: 'not-an-email' }, 'customer.email'],
    ['control character in notes', { name: 'Test Customer', notes: 'a\u0000b' }, 'customer.notes'],
    ['unexpected field', { name: 'Test Customer', companyName: 'X' }, 'customer'],
  ])('rejects %s', (_label, customer, path) => {
    const result = validateQuoteDraft(draft(customer), RULES);
    expect(result.ok ? [] : result.issues.map((issue) => issue.path)).toEqual([path]);
  });

  it('prefixes request rule issues with the request path', () => {
    const result = validateQuoteDraft(
      draft(
        { name: 'Test Customer' },
        { ...REQUEST, members: [{ relationship: 'self', age: 70 }, REQUEST.members[1]] },
      ),
      RULES,
    );
    expect(result).toEqual({
      ok: false,
      issues: [{ path: 'request.members.0.age', code: 'AGE_ABOVE_MAXIMUM' }],
    });
  });

  it('never echoes rejected values or unexpected key names in issues', () => {
    const result = validateQuoteDraft(
      {
        customer: {
          name: `${SENSITIVE.name}\u0007`,
          phone: `${SENSITIVE.phone}9`,
          email: SENSITIVE.email.replace('@', ' at '),
          notes: `${SENSITIVE.secret}\u0000`,
          aadhaarNumber: SENSITIVE.idNumber,
        },
        request: { ...REQUEST, pincode: SENSITIVE.secret, password: SENSITIVE.secret },
      },
      RULES,
    );
    expect(result.ok).toBe(false);
    expectNoSensitiveValues(result, [...Object.values(SENSITIVE), 'aadhaarNumber', 'password']);
  });
});

describe('insurer pre-flight (TC-04)', () => {
  const parsed = (customer: Record<string, unknown>): QuoteDraft => {
    const result = validateQuoteDraft({ customer, request: REQUEST }, RULES);
    if (!result.ok) throw new Error('fixture invalid');
    return result.value;
  };

  it('blocks only the insurer whose required field is missing', () => {
    const outcome = preflight(
      [
        { id: 'insurer-a', requiredFields: ['request.pincode'] },
        { id: 'insurer-b', requiredFields: ['customer.phone', 'customer.email', 'customer.phone'] },
        { id: 'insurer-c', requiredFields: [] },
      ],
      parsed({ name: SENSITIVE.name, email: SENSITIVE.email }),
    );
    expect(outcome).toEqual([
      { insurerId: 'insurer-a', ready: true, missing: [] },
      { insurerId: 'insurer-b', ready: false, missing: ['customer.phone'] },
      { insurerId: 'insurer-c', ready: true, missing: [] },
    ]);
    expectNoSensitiveValues(outcome, [SENSITIVE.name, SENSITIVE.email]);
  });

  it('treats contact fields as present when given', () => {
    const outcome = preflight(
      [{ id: 'insurer-a', requiredFields: ['customer.phone', 'customer.email'] }],
      parsed({ name: 'Test Customer', phone: SENSITIVE.phone, email: SENSITIVE.email }),
    );
    expect(outcome).toEqual([{ insurerId: 'insurer-a', ready: true, missing: [] }]);
  });

  it('always blocks an insurer that requires a date of birth (not captured; C-05)', () => {
    expect(
      preflight(
        [{ id: 'insurer-a', requiredFields: ['members.dateOfBirth'] }],
        parsed({ name: 'T' }),
      ),
    ).toEqual([{ insurerId: 'insurer-a', ready: false, missing: ['members.dateOfBirth'] }]);
  });
});
