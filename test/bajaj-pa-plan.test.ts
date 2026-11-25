// Bajaj Allianz's Personal Accident form (recording bajaj-allianz-2026-11-25T06-17-21-912Z): the
// request, its building from the client's details (the quote screen asks only the plan), and the
// steps the run takes. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { clientInputSchema } from '../src/shared/contracts/client';
import { bajajPaFromChoices } from '../src/shared/contracts/client-quote';
import { bajajPaRunSchema, BAJAJ_OCCUPATIONS, BAJAJ_PA_PLANS } from '../src/shared/insurers/bajaj';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';
import { planBajajPaQuote } from '../src/main/quotes/bajaj-pa';
import type { PageOp } from '../src/main/quotes/page-ops';

const CLIENT = clientInputSchema.parse({
  customer: { name: 'Synthetic Insured Person' },
  pincode: '380001',
  members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-01-25', gender: 'male' }],
});
const RUN = bajajPaRunSchema.parse({
  plan: '8428',
  tenureYears: 3,
  familyIncome: 1200000,
  monthlyIncome: 60000,
  occupation: 'R',
  deathSumInsured: 500000,
});

describe("Bajaj Allianz's Personal Accident form", () => {
  it('takes Bajaj’s plan and occupation codes, and at least one cover', () => {
    expect(Object.keys(BAJAJ_PA_PLANS)).toContain('8428');
    expect(BAJAJ_OCCUPATIONS.R).toBe('Student');
    expect(bajajPaRunSchema.safeParse({ ...RUN, occupation: '999' }).success).toBe(false);
    const { deathSumInsured: _drop, ...noCover } = RUN;
    expect(bajajPaRunSchema.safeParse(noCover).success).toBe(false);
    expect(
      quoteRunRequestSchema.safeParse({
        product: 'bajaj-pa',
        clientId: '00000000-0000-4000-8000-000000000000',
        insurerId: 'bajaj-allianz',
        run: RUN,
      }).success,
    ).toBe(true);
  });

  it("builds the run from the client's details, naming what is missing and where", () => {
    const missing = bajajPaFromChoices('8428', undefined);
    expect(!missing.ok && missing.missing).toEqual([
      'the family income (Edit client, Additional details, Bajaj Allianz)',
      'the gross monthly income (Edit client, Additional details, Bajaj Allianz)',
      'the occupation (Edit client, Additional details, Bajaj Allianz)',
      'a sum insured for at least one cover (Edit client, Additional details, Bajaj Allianz)',
    ]);
    const built = bajajPaFromChoices('8428', {
      'bajaj-allianz': {
        familyIncome: 1200000,
        monthlyIncome: 60000,
        occupation: '108',
        totalDisabilitySumInsured: 300000,
      },
    });
    expect(built.ok && bajajPaRunSchema.parse(built.value)).toEqual({
      plan: '8428',
      tenureYears: 1,
      familyIncome: 1200000,
      monthlyIncome: 60000,
      occupation: '108',
      totalDisabilitySumInsured: 300000,
    });
  });

  it("refuses without the proposer's date of birth and gender", () => {
    const bare = clientInputSchema.parse({
      ...CLIENT,
      members: [{ relationship: 'self', age: 40 }],
    });
    const r = planBajajPaQuote(bare, RUN);
    expect(!r.ok && r.problems).toEqual([
      "Add the proposer's date of birth.",
      "Add the proposer's gender.",
    ]);
  });

  it('fills the form in the recorded order, then Calculate Premium and the premium', () => {
    const r = planBajajPaQuote(CLIENT, RUN);
    if (!r.ok) throw new Error('refused');
    const ops = r.steps.map((s) => s.op);
    const value = (selector: string) =>
      (
        ops.find((o) => (o.op === 'setField' || o.op === 'select') && o.selector === selector) as
          Extract<PageOp, { op: 'setField' }> | undefined
      )?.value;
    expect(value('#policy_plan')).toBe('8428');
    expect(ops.find((o) => o.op === 'pickOption')).toMatchObject({
      type: '3',
      options: ['3Y'],
      startsWith: true,
      shownIn: '.vs__selected',
    });
    expect(value('#pincode')).toBe('380001');
    expect(value('#familyIncome')).toBe('1200000');
    expect(value('#member_firstname0')).toBe('Synthetic');
    expect(value('#member_lastname0')).toBe('Insured Person');
    expect(value('#member_gender0')).toBe('M');
    expect(ops.find((o) => o.op === 'typeDate')).toEqual({
      op: 'typeDate',
      input: '#member_dob0',
      date: '1986-01-25',
    });
    expect(value('#member_income0')).toBe('60000');
    expect(value('#member_occupation0')).toBe('R');
    expect(value('#deathSumInsured0')).toBe('500000');
    // Covers not given are left alone.
    expect(value('#permanentPartialDisabilitySumInsured0')).toBeUndefined();
    expect(ops.at(-2)).toMatchObject({ op: 'clickButton', text: 'Calculate Premium' });
    expect(ops.at(-1)).toMatchObject({ op: 'readAmount', label: 'Total Premium', fresh: true });
    // Only the recorded plan has nothing more to check.
    expect(r.byHand).toEqual([]);
    const other = planBajajPaQuote(CLIENT, { ...RUN, plan: '6402' });
    expect(other.ok && other.byHand[0]).toMatch(/^check what Sankat Mochan asks/);
  });
});
