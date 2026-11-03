// United India Overseas Travel e-proposal: the trip contract, what the app fills, what it leaves
// to the advisor, and that it never saves or submits.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import {
  planUiicTravelProposal,
  TRAVEL_ALWAYS_BY_HAND,
} from '../src/main/quotes/uiic-travel-proposal';
import { clientInputSchema } from '../src/shared/contracts/client';
import { travelTripSchema } from '../src/shared/contracts/travel';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 3);
const CLIENT = {
  customer: { name: 'Synthetic Traveller', phone: '9876543210', email: 'traveller@example.test' },
  pincode: '560001',
  proposerMaritalStatus: 'married',
  members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-04-12', gender: 'female' }],
  proposal: {
    pan: 'ABCDE1234F',
    address: '12 Synthetic Street',
    state: 'Karnataka',
    city: 'Bengaluru',
    village: 'Koramangala',
    highRiskCustomer: false,
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'spouse',
    intermediaryPlace: 'Bengaluru',
  },
};
const TRIP = {
  destination: 'worldwide',
  sumInsured: '100000',
  startDate: '2026-11-10',
  days: 14,
  occupation: 'Salaried',
  passportNumber: 'z 1234567',
};

function plan(
  client: Record<string, unknown> = {},
  trip: Record<string, unknown> = {},
  aadhaar: string | null = null,
) {
  return planUiicTravelProposal(
    clientInputSchema.parse({ ...CLIENT, ...client }),
    travelTripSchema.parse({ ...TRIP, ...trip }),
    { aadhaar, today: TODAY },
  );
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
const ops = (...args: Parameters<typeof plan>) => ok(...args).steps.map((s) => s.op);

describe('travelTripSchema', () => {
  it('accepts a trip and tidies the passport number', () => {
    expect(travelTripSchema.parse(TRIP).passportNumber).toBe('Z1234567');
  });

  it('refuses 5,00,000 excluding USA and Canada, bad days and bad passport numbers', () => {
    for (const bad of [
      { destination: 'worldwide-excluding-usa-canada', sumInsured: '500000' },
      { days: 0 },
      { days: 2.5 },
      { passportNumber: 'Z-12' },
      { startDate: '2026-02-30' },
      { sumInsured: '75000' },
    ]) {
      expect(() => travelTripSchema.parse({ ...TRIP, ...bad })).toThrow();
    }
  });

  it('is the trip of a travel-proposal request', () => {
    const request = {
      product: 'travel-proposal',
      clientId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      insurerId: 'united-india',
      trip: TRIP,
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    const { trip: _trip, ...noTrip } = request;
    expect(quoteRunRequestSchema.safeParse(noTrip).success).toBe(false);
  });
});

describe('planUiicTravelProposal', () => {
  it('fills the trip: purpose, destination, plan by sum insured, start date and days', () => {
    const list = ops();
    expect(valueOf(list, '#travelPurpose')).toBe('BH');
    expect(valueOf(list, '#travelDestination')).toBe('Worldwide Including USA Or CANADA');
    expect(valueOf(list, '#planType')).toBe('PLAN B2');
    expect(list).toContainEqual({
      op: 'pickDate',
      input: 'input#travelStartDate',
      date: '2026-11-10',
    });
    expect(valueOf(list, '#travelNoOfDays')).toBe('14');
    expect(
      valueOf(
        ops({}, { destination: 'worldwide-excluding-usa-canada', sumInsured: '250000' }),
        '#planType',
      ),
    ).toBe('PLAN A3');
  });

  it('fills the proposer and the insured (Self), and the intermediary', () => {
    const result = ok({}, {}, '999941057058');
    const list = result.steps.map((s) => s.op);
    expect(valueOf(list, '#proposerTitle')).toBe('Mrs');
    expect(valueOf(list, '#proposerName')).toBe('Synthetic Traveller');
    expect(valueOf(list, '#proposerMobileNo')).toBe('9876543210');
    expect(valueOf(list, '#proposerEmail')).toBe('traveller@example.test');
    expect(valueOf(list, '#STATE_CODE2')).toBe('Bengaluru');
    expect(valueOf(list, '#aadharNo')).toBe('999941057058');
    expect(valueOf(list, '#panNo')).toBe('ABCDE1234F');
    expect(valueOf(list, '#insuredRelation')).toBe('Self');
    expect(valueOf(list, '#insuredOccupation')).toBe('Salaried');
    expect(list).toContainEqual({ op: 'pickDate', input: 'input#insuredDOB', date: '1986-04-12' });
    expect(valueOf(list, '#insuredMaritalStatus')).toBe('Married');
    expect(valueOf(list, '#insuredPassportNo')).toBe('Z1234567');
    expect(valueOf(list, '#insuredNomineeRelation')).toBe('Spouse');
    expect(valueOf(list, '#intmSignPlace')).toBe('Bengaluru');
    // Only what the advisor always does is left.
    expect(result.byHand).toEqual(TRAVEL_ALWAYS_BY_HAND);
  });

  it('presses View Premium and reads it, but never saves, submits or answers for the client', () => {
    const list = ops();
    const json = JSON.stringify(list);
    expect(list).toContainEqual({ op: 'clickButton', text: 'View Premium', timeoutMs: 5000 });
    expect(list.at(-1)).toEqual({ op: 'readValue', selector: '#totalPremium', timeoutMs: 8000 });
    expect(json).not.toMatch(/Save As Draft|Submit|saveDraft|Send To Customer/);
    expect(json).not.toMatch(
      /hasPreExistingDis|ynGoodHealth|declaration\d|premiumPayMode|type="file"/,
    );
  });

  it('works the title out from gender, age and marital status, or leaves it', () => {
    const titleOf = (member: Record<string, unknown>, marital?: string) =>
      valueOf(
        ops({
          members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-04-12', ...member }],
          ...(marital ? { proposerMaritalStatus: marital } : {}),
        }),
        '#proposerTitle',
      );
    expect(titleOf({ gender: 'male' })).toBe('Mr');
    expect(titleOf({ gender: 'male', age: 15, dateOfBirth: '2011-01-01' })).toBe('Master');
    expect(titleOf({ gender: 'female' }, 'unmarried')).toBe('Miss');
    expect(titleOf({ gender: 'transgender' })).toBe('Others');
    expect(titleOf({ gender: 'female' }, 'widowed')).toBeUndefined();
    expect(
      ok({
        members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-04-12', gender: 'female' }],
        proposerMaritalStatus: 'divorced',
      }).byHand,
    ).toContain('title (Mr., Mrs., Miss…)');
  });

  it('leaves what the record and trip lack to the advisor', () => {
    const result = ok(
      {
        customer: { name: 'Synthetic Sparse' },
        proposerMaritalStatus: undefined,
        members: [{ relationship: 'self', age: 40, gender: 'male' }],
        proposal: { nomineeRelationship: 'brother' },
      },
      { occupation: undefined, passportNumber: undefined },
    );
    expect(result.byHand).toEqual(
      expect.arrayContaining([
        'state, district, village (after the PIN code lookup)',
        'address',
        'mobile number',
        'e-mail',
        "insured's occupation",
        "insured's date of birth",
        'marital status',
        'passport number',
        "nominee's name",
        "intermediary's place of signing",
      ]),
    );
    // A brother is "Others" on this form.
    expect(
      valueOf(
        result.steps.map((s) => s.op),
        '#insuredNomineeRelation',
      ),
    ).toBe('Others');
  });

  it('refuses a trip that has started, or a client without the proposer', () => {
    expect(plan({}, { startDate: '2026-11-02' })).toEqual({
      ok: false,
      problems: ['The travel start date has passed.'],
    });
    expect(plan({ members: [{ relationship: 'spouse', age: 38 }] }).ok).toBe(false);
  });
});
