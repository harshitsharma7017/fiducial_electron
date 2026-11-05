// Niva Bupa's premium calculator for a health client, by "I Know My Plan": the request, the plan,
// members and dates of birth, the questions, the sum insured, policy period and add-ons, Calculate
// Premium and the premium read, and that the Continue after it is never pressed.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { nivaPlanOptions, nivaRupees, planNivaHealthQuote } from '../src/main/quotes/niva-health';
import { clientInputSchema } from '../src/shared/contracts/client';
import { NIVA_HEALTH_PLANS, nivaRunSchema, type NivaRun } from '../src/shared/insurers/niva-health';
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
const SINGLE = { ...FAMILY, members: [FAMILY.members[2]] };
const RUN: NivaRun = {
  plan: 'reassure-2',
  sumInsured: 2000000,
  years: 1,
  addOns: ['Safeguard'],
  tieredNetwork: false,
  medicalPractitioner: false,
};
const plan = (client: Record<string, unknown> = FAMILY, run: NivaRun = RUN) =>
  planNivaHealthQuote(clientInputSchema.parse(client), run, { today: TODAY });
const steps = (...args: Parameters<typeof plan>) => {
  const r = plan(...args);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.steps;
};
const ops = (...args: Parameters<typeof plan>): PageOp[] => steps(...args).map((s) => s.op);
const labelled = (label: string, ...args: Parameters<typeof plan>) =>
  steps(...args).filter((s) => s.label === label);

describe('Niva Bupa premium calculator (I Know My Plan)', () => {
  it('a request names a health client, Niva Bupa and the run’s choices', () => {
    const request = {
      product: 'niva-health',
      clientId: '018f2b8e-7c1a-7b3e-9d4f-1a2b3c4d5e6f',
      insurerId: 'niva-bupa',
      run: { ...RUN, previousPolicyEndDate: '2026-11-18' },
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    expect(nivaRunSchema.safeParse({ ...RUN, plan: 'aspire' }).success).toBe(false);
    expect(nivaRunSchema.safeParse({ ...RUN, years: 4 }).success).toBe(false);
    expect(NIVA_HEALTH_PLANS).toEqual(['reassure-2', 'reassure-3', 'health-recharge']);
  });

  it('goes "I Know My Plan", then picks the plan by name: Individual or Family Floater', () => {
    const list = ops();
    expect(list[0]).toEqual({
      op: 'ensureShown',
      shown: { text: 'Plan Recommendation' },
      open: { text: 'I Know My Plan' },
      timeoutMs: 8000,
    });
    expect(list[1]).toMatchObject({
      op: 'pickOption',
      type: 'ReAssure2.0',
      options: ['ReAssure2.0 Family Floater'],
    });
    expect(ops(SINGLE)[1]).toMatchObject({ options: ['ReAssure2.0 Individual'] });
    expect(nivaPlanOptions({ ...RUN, plan: 'reassure-3' }, 1)).toEqual(['ReAssure3.0 Individual']);
    expect(nivaPlanOptions({ ...RUN, plan: 'health-recharge' }, 2)[0]).toBe(
      'HealthRechargeV2 Family Floater',
    );
  });

  it('counts the members, then dates of birth eldest first; a floater may ask only the eldest', () => {
    expect(ops().slice(3, 8)).toEqual([
      { op: 'stepper', index: 0, count: 2, timeoutMs: 15000 },
      { op: 'stepper', index: 1, count: 1, timeoutMs: 5000 },
      { op: 'matDate', counter: 0, nth: 0, date: '1986-01-25' },
      { op: 'matDate', counter: 0, nth: 1, date: '1988-07-02' },
      { op: 'matDate', counter: 1, nth: 0, date: '2018-03-14' },
    ]);
    // The eldest's box is always asked; the others are skipped when Niva Bupa shows no box.
    expect(
      steps()
        .slice(5, 8)
        .map((s) => s.skipIfNoBox),
    ).toEqual([false, true, true]);
  });

  it('answers the three questions: no transfer, not a practitioner, not a child-only policy', () => {
    const answers = steps().filter((s) => s.op.op === 'ionRadio' && s.op.group.question);
    expect(answers.map((s) => [s.label, (s.op as { label: string }).label])).toEqual([
      ['Transfer of a current policy', 'NO'],
      ['Medical practitioner', 'NO'],
      ['Only for Child Policy', 'NO'],
    ]);
  });

  it('a transfer answers YES and picks the previous policy’s end date; a practitioner, YES', () => {
    const run = { ...RUN, previousPolicyEndDate: '2026-11-18', medicalPractitioner: true };
    expect(labelled('Transfer of a current policy', FAMILY, run)[0]?.op).toMatchObject({
      label: 'YES',
    });
    expect(labelled('Previous Policy End Date', FAMILY, run)[0]?.op).toEqual({
      op: 'matDate',
      label: 'Previous Policy End Date',
      date: '2026-11-18',
    });
    expect(labelled('Medical practitioner', FAMILY, run)[0]?.op).toMatchObject({ label: 'YES' });
  });

  it('then Continue, the sum insured as Niva Bupa writes it, the policy period, add-ons', () => {
    const list = ops(FAMILY, { ...RUN, years: 2, addOns: ['Safeguard', 'Hospital Cash'] });
    const at = list.findIndex((o) => o.op === 'clickButton' && o.text === 'Continue');
    expect(list.slice(at, at + 7)).toEqual([
      { op: 'clickButton', text: 'Continue', timeoutMs: 5000 },
      { op: 'waitFor', selector: 'app-third-step ion-select', timeoutMs: 25000 },
      { op: 'ionPick', option: '₹ 2,000,000', exact: true, timeoutMs: 10000 },
      {
        op: 'ionRadio',
        group: { selector: 'ion-radio-group[formcontrolname="premium"]' },
        label: '2 Year',
        timeoutMs: 10000,
      },
      { op: 'scrollTo', text: 'Key Add-Ons', timeoutMs: 5000 },
      { op: 'addOn', name: 'Safeguard', timeoutMs: 5000 },
      { op: 'addOn', name: 'Hospital Cash', timeoutMs: 5000 },
    ]);
    expect(nivaRupees(500000)).toBe('₹ 500,000');
  });

  it('Tiered Network only when asked: Show more in its row, then the tiered list', () => {
    expect(labelled('Tiered Network')).toEqual([]);
    const tiered = labelled('Tiered Network', FAMILY, { ...RUN, tieredNetwork: true });
    expect(tiered.map((s) => s.op.op)).toEqual(['clickInRow', 'ionRadio', 'pause']);
  });

  it('presses Calculate Premium, reads the premium, and never presses the Continue after it', () => {
    const r = plan();
    if (!r.ok) throw new Error('refused');
    const clicks = r.steps
      .map((s) => s.op)
      .filter((o): o is Extract<PageOp, { op: 'clickButton' }> => o.op === 'clickButton')
      .map((o) => o.text);
    expect(clicks).toEqual(['Continue', 'Calculate Premium']);
    expect(r.steps.at(-1)).toMatchObject({
      op: { op: 'ionRadioRead', group: { selector: 'ion-radio-group[formcontrolname="premium"]' } },
      keep: 'premium',
    });
  });

  it('without a city, leaves it to the advisor; the phone number is optional on Niva Bupa', () => {
    const bare = { ...FAMILY, customer: { name: 'Synthetic Insured' }, proposal: {} };
    const r = plan(bare);
    if (!r.ok) throw new Error('refused');
    expect(r.steps.some((s) => s.op.op === 'typeahead' || s.op.op === 'setField')).toBe(false);
    expect(r.byHand[0]).toBe('city (the client record has none), then run again');
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
