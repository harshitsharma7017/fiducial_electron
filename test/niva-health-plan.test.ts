// Niva Bupa's premium calculator for a health client: the request, the members and dates of
// birth, the plan chosen, what is left to the advisor, and that Calculate Premium is never pressed.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { planNivaHealthQuote } from '../src/main/quotes/niva-health';
import { clientInputSchema } from '../src/shared/contracts/client';
import { NIVA_HEALTH_PLANS, type NivaHealthPlan } from '../src/shared/insurers/niva-health';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 5);
const FAMILY = {
  customer: { name: 'Synthetic Insured', phone: '9876543210' },
  pincode: '380001',
  members: [
    { relationship: 'son', age: 8, dateOfBirth: '2018-03-14' },
    { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02' },
    { relationship: 'self', age: 40, dateOfBirth: '1986-01-25' },
  ],
  proposal: { city: 'Ahmedabad' },
};
const plan = (client: Record<string, unknown> = FAMILY, which: NivaHealthPlan = 'reassure-2') =>
  planNivaHealthQuote(clientInputSchema.parse(client), { plan: which, today: TODAY });
const ops = (...args: Parameters<typeof plan>): PageOp[] => {
  const r = plan(...args);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.steps.map((s) => s.op);
};

describe('Niva Bupa premium calculator', () => {
  it('a request names a health client, Niva Bupa and one of the three plans', () => {
    const request = {
      product: 'niva-health',
      clientId: '018f2b8e-7c1a-7b3e-9d4f-1a2b3c4d5e6f',
      insurerId: 'niva-bupa',
      plan: 'reassure-3',
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    expect(quoteRunRequestSchema.safeParse({ ...request, plan: 'aspire' }).success).toBe(false);
    expect(NIVA_HEALTH_PLANS).toEqual(['reassure-2', 'reassure-3', 'health-recharge']);
  });

  it('counts adults and children, then their dates of birth: adults self first, children after', () => {
    expect(ops().slice(0, 5)).toEqual([
      { op: 'stepper', index: 0, count: 2, timeoutMs: 15000 },
      { op: 'stepper', index: 1, count: 1, timeoutMs: 5000 },
      { op: 'matDate', counter: 0, nth: 0, date: '1986-01-25' },
      { op: 'matDate', counter: 0, nth: 1, date: '1988-07-02' },
      { op: 'matDate', counter: 1, nth: 0, date: '2018-03-14' },
    ]);
  });

  it('sets the children to none when there are none (a count left from an earlier run)', () => {
    const single = { ...FAMILY, members: [FAMILY.members[2]] };
    expect(ops(single).slice(0, 3)).toEqual([
      { op: 'stepper', index: 0, count: 1, timeoutMs: 15000 },
      { op: 'stepper', index: 1, count: 0, timeoutMs: 5000 },
      { op: 'matDate', counter: 0, nth: 0, date: '1986-01-25' },
    ]);
  });

  it('then the city (last suggesting box), the mobile number, Continue and the plan', () => {
    const list = ops();
    expect(list.slice(5)).toEqual([
      expect.objectContaining({ op: 'typeahead', value: 'Ahmedabad', last: true }),
      { op: 'setField', selector: 'input[maxlength="10"]', value: '9876543210' },
      { op: 'clickButton', text: 'Continue', timeoutMs: 5000 },
      { op: 'waitFor', selector: 'app-second-step', timeoutMs: 20000 },
      { op: 'ionPick', option: 'ReAssure2.0', timeoutMs: 20000 },
    ]);
    expect(ops(FAMILY, 'reassure-3').at(-1)).toMatchObject({ option: 'ReAssure3.0' });
    expect(ops(FAMILY, 'health-recharge').at(-1)).toMatchObject({ option: 'HealthRecharge' });
  });

  it('never presses Calculate Premium; the card, period, add-ons and premium are the advisor’s', () => {
    const r = plan();
    if (!r.ok) throw new Error('refused');
    const clicks = r.steps
      .map((s) => s.op)
      .filter((o): o is Extract<PageOp, { op: 'clickButton' }> => o.op === 'clickButton');
    expect(clicks.map((c) => c.text)).toEqual(['Continue']);
    expect(r.byHand).toEqual([
      'the ReAssure 2.0 card: its sum insured and options, then Continue',
      'policy period, add-ons and the Terms & Conditions box',
    ]);
    expect(r.steps.find((s) => s.op.op === 'ionPick')?.keep).toBe('plan');
  });

  it('without a city or mobile number, leaves them to the advisor', () => {
    const bare = { ...FAMILY, customer: { name: 'Synthetic Insured' }, proposal: {} };
    const r = plan(bare);
    if (!r.ok) throw new Error('refused');
    expect(r.steps.some((s) => s.op.op === 'typeahead' || s.op.op === 'setField')).toBe(false);
    expect(r.byHand.slice(0, 2)).toEqual([
      'city (the client record has none)',
      'mobile number (the client record has none)',
    ]);
  });

  it('refuses without an adult, a date of birth, or with an adult under 18', () => {
    const child = { ...FAMILY, members: [FAMILY.members[0]] };
    expect(plan(child)).toMatchObject({ ok: false, problems: [expect.stringContaining('adult')] });
    const noDob = { ...FAMILY, members: [{ relationship: 'self', age: 40 }] };
    expect(plan(noDob)).toEqual({
      ok: false,
      problems: ["Add the proposer (self)'s date of birth."],
    });
    const young = {
      ...FAMILY,
      members: [{ relationship: 'spouse', age: 17, dateOfBirth: '2009-06-01' }],
    };
    expect(plan(young)).toMatchObject({
      ok: false,
      problems: [expect.stringContaining('18 or over')],
    });
  });
});
