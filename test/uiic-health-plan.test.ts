// United India health calculator: which clients fit the recorded flow, and the steps it runs.
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/main/logging/logger';
import { createQuoteService } from '../src/main/quotes/service';
import { planUiicHealthQuote, UIIC_SUM_INSURED_RUPEES } from '../src/main/quotes/uiic-health';
import { clientInputSchema, type ClientInputRaw } from '../src/shared/contracts/client';

vi.mock('electron', () => ({}));

const TODAY = new Date(2026, 10, 2);
const COUPLE: ClientInputRaw = {
  customer: { name: 'Synthetic Couple' },
  pincode: '560001',
  proposerMaritalStatus: 'married',
  members: [
    { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
    { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02', gender: 'female' },
  ],
  preferences: { coverType: 'floater', sumInsuredPaise: 500000_00, tenureYears: 1 },
};

function plan(raw: ClientInputRaw, goodHealth = true) {
  return planUiicHealthQuote(clientInputSchema.parse(raw), { goodHealth, today: TODAY });
}

describe('planUiicHealthQuote', () => {
  it('plans the recorded flow for a couple, ending at the User Details pop-up', () => {
    const result = plan(COUPLE);
    if (!result.ok) throw new Error(result.problems.join('; '));
    const ops = result.steps.map((s) => s.op);
    expect(ops).toContainEqual({ op: 'select', selector: '#selectProductType', value: 'Base' });
    expect(ops).toContainEqual({
      op: 'select',
      selector: '#selectCoverType',
      value: 'familyFloater',
    });
    expect(ops).toContainEqual({ op: 'select', selector: '#selectCoverReq', value: '500000' });
    expect(ops).toContainEqual({ op: 'type', selector: '#pincodeString', value: '560001' });
    expect(ops).toContainEqual(expect.objectContaining({ op: 'pickDate', date: '1985-03-14' }));
    expect(ops).toContainEqual(
      expect.objectContaining({ op: 'pickDate', date: '1988-07-02', within: 'Add Spouse' }),
    );
    expect(ops).toContainEqual(expect.objectContaining({ op: 'select', value: 'Male' }));
    expect(ops).toContainEqual(
      expect.objectContaining({ op: 'select', value: 'Female', within: 'Add Spouse' }),
    );
    expect(ops.filter((o) => o.op === 'radio').map((o) => 'value' in o && o.value)).toEqual([
      'No',
      'No',
    ]);
    // It ends waiting for "User Details", and never presses Check Premium.
    expect(ops.at(-1)).toEqual({ op: 'waitForDialog', text: 'User Details', timeoutMs: 20_000 });
    expect(JSON.stringify(ops)).not.toContain('Check Premium');
  });

  it('plans children after the spouse: a new row each, Son/Daughter, Unmarried, then Save', () => {
    const result = plan({
      ...COUPLE,
      members: [
        ...COUPLE.members,
        { relationship: 'son', age: 12, dateOfBirth: '2014-05-20', gender: 'male' },
        { relationship: 'daughter', age: 8, dateOfBirth: '2018-09-09', gender: 'female' },
      ],
    });
    if (!result.ok) throw new Error(result.problems.join('; '));
    const labels = result.steps.map((s) => s.label);
    expect(labels.indexOf('Add children')).toBeGreaterThan(labels.lastIndexOf('Save spouse'));
    expect(labels.indexOf('Save children')).toBeLessThan(labels.indexOf('Get Quote'));
    const childOps = result.steps.filter((s) => s.label.startsWith('Child')).map((s) => s.op);
    expect(childOps.filter((o) => o.op === 'ensureEmptyRow')).toHaveLength(2);
    expect(childOps).toContainEqual(
      expect.objectContaining({ op: 'pickDate', date: '2014-05-20', row: 'current' }),
    );
    expect(childOps).toContainEqual(expect.objectContaining({ op: 'select', value: 'Son' }));
    expect(childOps).toContainEqual(expect.objectContaining({ op: 'select', value: 'Daughter' }));
    expect(childOps.filter((o) => o.op === 'select' && o.value === 'Unmarried')).toHaveLength(2);
  });

  it('plans a proposer alone, without the spouse steps', () => {
    const result = plan({
      ...COUPLE,
      proposerMaritalStatus: 'unmarried',
      members: [COUPLE.members[0]!],
    });
    if (!result.ok) throw new Error(result.problems.join('; '));
    expect(JSON.stringify(result.steps)).not.toContain('Add Spouse');
    expect(result.steps.map((s) => s.op)).toContainEqual(
      expect.objectContaining({ op: 'select', value: 'Unmarried' }),
    );
  });

  it.each([
    [
      'parents',
      {
        members: [
          ...COUPLE.members,
          { relationship: 'father', age: 70, dateOfBirth: '1956-01-01', gender: 'male' },
        ],
      },
      'no parents',
    ],
    [
      'a child without a date of birth',
      { members: [...COUPLE.members, { relationship: 'son', age: 9, gender: 'male' }] },
      "child 1's date of birth",
    ],
    [
      'individual cover',
      { preferences: { coverType: 'individual', sumInsuredPaise: 500000_00, tenureYears: 1 } },
      'family floater',
    ],
    [
      'a sum insured United India does not offer',
      { preferences: { coverType: 'floater', sumInsuredPaise: 123456_00, tenureYears: 1 } },
      'does not offer',
    ],
    ['no quote details', { preferences: undefined }, 'quote details'],
    [
      'a missing date of birth',
      { members: [{ relationship: 'self', age: 41, gender: 'male' }] },
      'date of birth',
    ],
    [
      'a missing gender',
      { members: [{ relationship: 'self', age: 41, dateOfBirth: '1985-03-14' }] },
      'gender',
    ],
    ['no marital status', { proposerMaritalStatus: undefined }, 'marital status'],
    [
      'a spouse with an unmarried proposer',
      { proposerMaritalStatus: 'unmarried' },
      'must be married',
    ],
    ['no proposer', { members: [COUPLE.members[1]!] }, 'exactly one member who is "Self"'],
  ])('refuses %s, saying why', (_label, change, reason) => {
    const result = plan({ ...COUPLE, ...change } as ClientInputRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toContain(reason);
  });

  it('refuses unless the advisor confirms the good health declaration for this quote', () => {
    const result = plan(COUPLE, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toContain('good health');
  });

  it('knows the 23 sum insured options of the calculator', () => {
    expect(UIIC_SUM_INSURED_RUPEES).toHaveLength(23);
    expect(UIIC_SUM_INSURED_RUPEES[0]).toBe(50000);
    expect(UIIC_SUM_INSURED_RUPEES.at(-1)).toBe(2500000);
  });
});

describe('the quote service', () => {
  const record = {
    id: 'c1',
    client: clientInputSchema.parse(COUPLE),
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
  };
  const service = (enabled: boolean, windows: unknown[] = []) =>
    createQuoteService({
      enabled,
      clients: {
        get: () => Promise.resolve(record),
        aadhaarFor: () => Promise.resolve(null),
        getVehicle: () => Promise.reject(new Error('not used')),
        getTraveller: () => Promise.reject(new Error('not used')),
        passportFor: () => Promise.resolve(null),
      },
      windowsOf: () => windows as never,
      logger: createLogger([]),
      now: () => TODAY,
    });
  const request = {
    clientId: 'c1',
    insurerId: 'united-india',
    product: 'health' as const,
    goodHealthConfirmed: true,
  };

  it('is off unless the automation features are switched on', async () => {
    await expect(service(false).run(request)).rejects.toMatchObject({ code: 'UNSUPPORTED_FLOW' });
  });

  it('refuses insurers that are not automated yet', async () => {
    const result = await service(true).run({ ...request, insurerId: 'bajaj-allianz' });
    expect(result.outcome).toBe('refused');
    expect(result.message).toContain('not built for this insurer');
  });

  it('asks the advisor to open and sign in to United India first', async () => {
    expect(await service(true).run(request)).toMatchObject({
      outcome: 'refused',
      message: 'Open United India and sign in first.',
    });
  });

  it('lists every reason a client cannot be quoted, before touching the portal', async () => {
    const result = await service(true).run({ ...request, goodHealthConfirmed: false });
    expect(result.outcome).toBe('refused');
    expect(result.problems.join(' ')).toContain('good health');
  });
});
