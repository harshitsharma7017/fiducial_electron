// ICICI Lombard's NYSA health-site forms (recordings of 26 November 2026): the requests, Elevate's
// run built from the client's details, and the steps each form takes. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { clientInputSchema } from '../src/shared/contracts/client';
import { iciciElevateFromChoices } from '../src/shared/contracts/client-quote';
import { iciciIntlTravelRunSchema } from '../src/shared/insurers/icici-nysa';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';
import {
  planIciciElevate,
  planIciciIntlTravel,
  planIciciStudentTravel,
  tripDays,
} from '../src/main/quotes/icici-nysa';
import { finishStart, premiumButton } from '../src/main/quotes/hand-over';

const ID = '00000000-0000-4000-8000-000000000000';
const CLIENT = clientInputSchema.parse({
  customer: { name: 'Synthetic Insured Person' },
  pincode: '380001',
  members: [
    { relationship: 'self', age: 40, dateOfBirth: '1986-01-25', gender: 'male' },
    { relationship: 'son', age: 8, dateOfBirth: '2018-03-14', gender: 'male' },
  ],
});
const ELEVATE = { sumInsured: 1000000, tenure: 2, annualIncome: 800000, preExistingDisease: false };
const TRAVELLER = {
  customer: { name: 'Synthetic Traveller' },
  pincode: '400001',
  dateOfBirth: '1990-02-20',
};
const TRIP = {
  departureDate: '2026-12-10',
  returnDate: '2026-12-30',
  state: 'Gujarat',
};

describe("ICICI Lombard's NYSA health-site forms", () => {
  it('takes the three products, ICICI only, and the trip in order', () => {
    expect(
      quoteRunRequestSchema.safeParse({
        product: 'icici-elevate',
        clientId: ID,
        insurerId: 'icici-lombard',
        run: ELEVATE,
        adjust: true,
      }).success,
    ).toBe(true);
    expect(
      quoteRunRequestSchema.safeParse({
        product: 'icici-elevate',
        clientId: ID,
        insurerId: 'hdfc-ergo',
        run: ELEVATE,
      }).success,
    ).toBe(false);
    expect(
      quoteRunRequestSchema.safeParse({
        product: 'icici-student-travel',
        travellerId: ID,
        insurerId: 'icici-lombard',
        run: { ...TRIP, visitingUsaCanada: true },
      }).success,
    ).toBe(true);
    // A plan by ICICI's own name.
    expect(
      quoteRunRequestSchema.safeParse({
        product: 'icici-intl-travel',
        travellerId: ID,
        insurerId: 'icici-lombard',
        run: { ...TRIP, destination: 'asia', plan: 'GOLD_A_25' },
      }).success,
    ).toBe(true);
    expect(
      iciciIntlTravelRunSchema.safeParse({
        ...TRIP,
        returnDate: '2026-12-01',
        destination: 'asia',
        plan: 'GOLD_W_50',
      }).success,
    ).toBe(false);
  });

  it("builds Elevate from the client's ICICI details, naming what is missing", () => {
    const missing = iciciElevateFromChoices(undefined);
    expect(!missing.ok && missing.missing).toEqual([
      "the applicant's annual income (Edit client, Additional details, ICICI Lombard)",
      'whether any member has a pre-existing disease (Edit client, Additional details, ICICI Lombard)',
    ]);
    const built = iciciElevateFromChoices({
      'icici-lombard': { annualIncome: 800000, preExistingDisease: false, tenure: 2 },
    });
    expect(built.ok && built.value).toEqual({
      sumInsured: 1000000,
      tenure: 2,
      annualIncome: 800000,
      preExistingDisease: false,
    });
  });

  it("fills Elevate's members by their place, then presses Generate Quote and reads the plans", () => {
    const plan = planIciciElevate(CLIENT, ELEVATE);
    if (!plan.ok) throw new Error('refused');
    const ops = plan.steps.map((s) => s.op);
    expect(ops).toContainEqual({ op: 'countTo', label: 'Adult', count: 1, timeoutMs: 10000 });
    expect(ops).toContainEqual({ op: 'countTo', label: 'Child', count: 1, timeoutMs: 10000 });
    expect(ops).toContainEqual(
      expect.objectContaining({
        op: 'matSelect',
        selector: 'mat-select#childDetails',
        nth: 0,
        pick: { anyOf: ['SON', 'EMPLOYEE SON'] },
      }),
    );
    expect(ops).toContainEqual(
      expect.objectContaining({
        op: 'matSelect',
        selector: '#applicantAnnualIncome',
        pick: { range: 800000 },
      }),
    );
    // Generate Quote starts the finish steps (never pressed while anything is left).
    expect(plan.steps[finishStart(plan.steps)]!.label).toBe('Generate Quote');
    expect(premiumButton(plan.steps)).toBe('Generate Quote');
    expect(ops.at(-1)).toMatchObject({
      op: 'readCards',
      ids: ['Basic', 'Essential', 'Recommended'],
    });
  });

  it("refuses what Elevate cannot take, before touching ICICI's page", () => {
    const r = planIciciElevate(
      clientInputSchema.parse({
        ...CLIENT,
        members: [
          { relationship: 'self', age: 40 },
          { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02' },
          { relationship: 'father', age: 66, dateOfBirth: '1960-01-01' },
        ],
      }),
      ELEVATE,
    );
    expect(!r.ok && r.problems).toEqual([
      'Elevate takes at most 2 adults (this client has 3).',
      'Add the date of birth of the self.',
    ]);
  });

  it('chooses the travel plan by its exact name and the student duration by the studies', () => {
    const intl = planIciciIntlTravel(TRAVELLER, {
      ...TRIP,
      destination: 'other',
      plan: 'GOLD_X_50',
    });
    if (!intl.ok) throw new Error('refused');
    const iops = intl.steps.map((s) => s.op);
    expect(iops).toContainEqual(
      expect.objectContaining({
        op: 'matSelect',
        selector: '#plan',
        pick: { text: 'GOLD_X_50', exact: true },
      }),
    );
    expect(iops).toContainEqual(
      expect.objectContaining({
        op: 'clickSelector',
        selector: 'label[for="otherCountries"], td:has(#otherCountries) label',
      }),
    );
    expect(premiumButton(intl.steps)).toBe('Get quote');
    expect(tripDays('2026-12-10', '2027-02-20')).toBe(73);
    const student = planIciciStudentTravel(TRAVELLER, {
      ...TRIP,
      returnDate: '2027-02-20',
      visitingUsaCanada: true,
    });
    if (!student.ok) throw new Error('refused');
    // No plan given: none chosen, and the advisor is told to (Get quote is then theirs).
    expect(student.steps.some((s) => s.label.startsWith('Plan'))).toBe(false);
    expect(student.byHand).toEqual(["Plan: choose it in ICICI's list, then press Get quote."]);
    expect(student.steps.map((s) => s.op)).toContainEqual(
      expect.objectContaining({ selector: '#policyDuration', pick: { atLeastDays: 73 } }),
    );
  });
});
