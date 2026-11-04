// New India overseas travel quote forms for a travel client: the request and trip, what is
// filled, what is left to the advisor, and that nothing is saved.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { niaTravelForm, planNiaTravelQuote } from '../src/main/quotes/nia-travel';
import { travellerSchema } from '../src/shared/contracts/traveller';
import { NIA_TRAVEL_FORMS, niaTripSchema, type NiaTrip } from '../src/shared/insurers/nia-travel';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 4);
const TRAVELLER = {
  customer: { name: 'Synthetic Traveller', phone: '9876543210' },
  pincode: '560001',
  dateOfBirth: '1986-04-12',
  gender: 'male',
  occupation: 'Salaried',
  passport: { expiryDate: '2030-01-14' },
  proposal: { nomineeName: 'Synthetic Nominee', nomineeRelationship: 'brother' },
};
const EASE: NiaTrip = {
  form: 'travel-ease',
  destination: 'worldwide-excluding-usa-canada',
  purpose: 'business',
  leavingDate: '2026-11-20',
  returnDate: '2026-11-25',
  plan: '25000',
};

function plan(
  trip: NiaTrip = EASE,
  traveller: Record<string, unknown> = {},
  passportNumber: string | null = 'Z1234567',
) {
  return planNiaTravelQuote(travellerSchema.parse({ ...TRAVELLER, ...traveller }), trip, {
    passportNumber,
    today: TODAY,
  });
}
function ok(...args: Parameters<typeof plan>) {
  const result = plan(...args);
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result;
}
const valueOf = (list: PageOp[], selector: string) =>
  list.find(
    (o): o is Extract<PageOp, { op: 'setField' }> => o.op === 'setField' && o.selector === selector,
  )?.value;

describe('the New India travel request', () => {
  it('names a travel client, the trip and the pre-existing illness confirmation', () => {
    const request = {
      product: 'nia-travel',
      travellerId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      insurerId: 'new-india',
      trip: EASE,
      noPreExistingConfirmed: true,
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    const { travellerId, ...rest } = request;
    expect(quoteRunRequestSchema.safeParse({ ...rest, clientId: travellerId }).success).toBe(false);
  });

  it('takes each form its own trip details', () => {
    expect(niaTripSchema.safeParse({ ...EASE, purpose: 'studies' }).success).toBe(false);
    expect(niaTripSchema.safeParse({ ...EASE, plan: '75000' }).success).toBe(false);
    expect(
      niaTripSchema.safeParse({
        form: 'studies-employment',
        destination: 'worldwide',
        purpose: 'employment',
        leavingDate: '2026-11-20',
        months: 13,
        plan: 1,
      }).success,
    ).toBe(false);
    expect(
      niaTripSchema.safeParse({
        form: 'business-holiday',
        destination: 'E1',
        purpose: 'holiday',
        leavingDate: '2026-11-20',
      }).success,
    ).toBe(true);
  });

  it('opens each form by its recorded heading', () => {
    for (const form of NIA_TRAVEL_FORMS) {
      const f = niaTravelForm(form);
      expect(f.tiles).toEqual([f.heading.replace(/ Insurance$/, '')]);
    }
  });
});

describe('planNiaTravelQuote', () => {
  it('Travel Ease: the trip, the policy holder, the passport as ID, and the nominee', () => {
    const result = ok();
    const list = result.steps.map((s) => s.op);
    expect(list).toContainEqual({
      op: 'check',
      selector: 'input[type="radio"][name="TravelDestination"][value="WEUC"]',
      checked: true,
    });
    expect(list).toContainEqual({ op: 'typeDate', input: '#returningIndia', date: '2026-11-25' });
    expect(valueOf(list, '#Plan')).toBe('Basic ($25,000)');
    expect(valueOf(list, '#typeOfOrg')).toBe('Mr.');
    expect(valueOf(list, '#firstNameCreate')).toBe('Synthetic');
    expect(valueOf(list, '#lastNameCreate')).toBe('Traveller');
    expect(valueOf(list, '#middleNameCreate')).toBeUndefined();
    expect(valueOf(list, '#propIdDocNo')).toBe('Z1234567');
    // A brother is "Others" on New India's list.
    expect(valueOf(list, '#relationshipNominee')).toBe('Others');
    // Salaried has no match on New India's occupation list.
    expect(valueOf(list, '#occupation')).toBeUndefined();
    expect(result.byHand).toContain(
      "occupation (New India's list differs from the travel client's)",
    );
    expect(result.byHand).toContain('address (building no., street)');
  });

  it('never presses a premium, save, submit or payment button, nor answers PAN or bank', () => {
    for (const trip of [
      EASE,
      {
        form: 'studies-employment',
        destination: 'worldwide',
        purpose: 'studies',
        leavingDate: '2026-11-20',
        months: 6,
        plan: 1,
      } as const,
      {
        form: 'business-holiday',
        destination: 'E1',
        purpose: 'holiday',
        leavingDate: '2026-11-20',
      } as const,
    ]) {
      const json = JSON.stringify(ok(trip).steps);
      expect(json).not.toMatch(
        /Calculate Premium|Save|Submit|Approve|panNumber|doUHavePan|ifscCode|bankAccNumber|consent/,
      );
    }
  });

  it('Business & Holiday fills Travel Details only', () => {
    const result = ok({
      form: 'business-holiday',
      destination: 'E2',
      purpose: 'holiday',
      leavingDate: '2026-11-20',
    });
    const list = result.steps.map((s) => s.op);
    expect(valueOf(list, 'select[name="TravelDestination"]')).toBe('E2');
    expect(JSON.stringify(list)).not.toMatch(/Policy Holder|passport/);
  });

  it('Employment & Studies picks the plan by its place and keeps its name', () => {
    const steps = ok({
      form: 'studies-employment',
      destination: 'worldwide',
      purpose: 'employment',
      leavingDate: '2026-11-20',
      months: 4,
      plan: 3,
    }).steps;
    expect(steps).toContainEqual({
      label: 'Plan',
      op: { op: 'pickNth', name: 'Plan', index: 3, timeoutMs: 10_000 },
      keep: 'plan',
    });
    expect(
      valueOf(
        steps.map((s) => s.op),
        '#travelDuration',
      ),
    ).toBe('4');
  });

  it('refuses a past leaving date, a return before it, and a passport expiring first', () => {
    expect(plan({ ...EASE, leavingDate: '2026-11-01' })).toEqual({
      ok: false,
      problems: ['The leaving date has passed.'],
    });
    expect(plan({ ...EASE, returnDate: '2026-11-19' })).toEqual({
      ok: false,
      problems: ['The return date is before the leaving date.'],
    });
    expect(plan(EASE, { passport: { expiryDate: '2026-11-20' } })).toEqual({
      ok: false,
      problems: ["The traveller's passport expires before the trip starts."],
    });
  });

  it('leaves a missing or over-long passport number to the advisor', () => {
    expect(ok(EASE, {}, null).byHand).toContain('passport number');
    expect(ok(EASE, {}, 'Z12345678').byHand).toContain('passport number');
  });
});
