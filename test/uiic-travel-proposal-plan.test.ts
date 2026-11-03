// United India Overseas Travel e-proposal for a travel client: the trip and travel client
// contracts, what the app fills, what it leaves to the advisor, and that it never saves or submits.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import {
  planUiicTravelProposal,
  TRAVEL_ALWAYS_BY_HAND,
} from '../src/main/quotes/uiic-travel-proposal';
import { passportNumberSchema, travelTripSchema } from '../src/shared/contracts/travel';
import { travellerSchema } from '../src/shared/contracts/traveller';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 3);
const TRAVELLER = {
  customer: { name: 'Synthetic Traveller', phone: '9876543210', email: 'traveller@example.test' },
  pincode: '560001',
  dateOfBirth: '1986-04-12',
  gender: 'female',
  maritalStatus: 'married',
  occupation: 'Salaried',
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
  passport: {
    issuingAuthority: 'Passport Office, Bengaluru',
    issueDate: '2020-01-15',
    expiryDate: '2030-01-14',
  },
};
const TRIP = { destination: 'worldwide', sumInsured: '100000', startDate: '2026-11-10', days: 14 };

function plan(
  traveller: Record<string, unknown> = {},
  trip: Record<string, unknown> = {},
  numbers: { aadhaar?: string | null; passportNumber?: string | null } = {
    passportNumber: 'Z1234567',
  },
) {
  return planUiicTravelProposal(
    travellerSchema.parse({ ...TRAVELLER, ...traveller }),
    travelTripSchema.parse({ ...TRIP, ...trip }),
    { ...numbers, today: TODAY },
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

describe('the trip and travel client contracts', () => {
  it('refuses 5,00,000 excluding USA and Canada and bad days or dates', () => {
    expect(travelTripSchema.parse(TRIP)).toEqual(TRIP);
    for (const bad of [
      { destination: 'worldwide-excluding-usa-canada', sumInsured: '500000' },
      { days: 0 },
      { days: 2.5 },
      { startDate: '2026-02-30' },
      { sumInsured: '75000' },
      // The passport and occupation belong to the travel client now.
      { passportNumber: 'Z1234567' },
    ]) {
      expect(() => travelTripSchema.parse({ ...TRIP, ...bad })).toThrow();
    }
  });

  it('a travel client needs a date of birth; its passport expires after it was issued', () => {
    expect(travellerSchema.parse(TRAVELLER).dateOfBirth).toBe('1986-04-12');
    const { dateOfBirth: _dob, ...noBirth } = TRAVELLER;
    expect(() => travellerSchema.parse(noBirth)).toThrow();
    expect(() =>
      travellerSchema.parse({
        ...TRAVELLER,
        passport: { issueDate: '2030-01-14', expiryDate: '2020-01-15' },
      }),
    ).toThrow();
    // The health forms' occupation list is not a travel client's.
    expect(() =>
      travellerSchema.parse({ ...TRAVELLER, proposal: { occupation: 'Student' } }),
    ).toThrow();
  });

  it('tidies passport numbers and refuses malformed ones', () => {
    expect(passportNumberSchema.parse('z 1234567')).toBe('Z1234567');
    expect(() => passportNumberSchema.parse('Z-12')).toThrow();
  });

  it('a travel-proposal request names a travel client and the trip', () => {
    const request = {
      product: 'travel-proposal',
      travellerId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      insurerId: 'united-india',
      trip: TRIP,
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    const { trip: _trip, ...noTrip } = request;
    expect(quoteRunRequestSchema.safeParse(noTrip).success).toBe(false);
    const { travellerId, ...rest } = request;
    expect(quoteRunRequestSchema.safeParse({ ...rest, clientId: travellerId }).success).toBe(false);
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

  it('fills the proposer and the insured (Self) with their passport, and the intermediary', () => {
    const result = ok({}, {}, { aadhaar: '999941057058', passportNumber: 'Z1234567' });
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
    expect(valueOf(list, '#insuredPassportIssuingAuth')).toBe('Passport Office, Bengaluru');
    expect(list).toContainEqual({
      op: 'pickDate',
      input: 'input#insuredPassportIssueDate',
      date: '2020-01-15',
    });
    expect(list).toContainEqual({
      op: 'pickDate',
      input: 'input#insuredPassportExpDate',
      date: '2030-01-14',
    });
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
    const titleOf = (traveller: Record<string, unknown>) =>
      valueOf(ops(traveller), '#proposerTitle');
    expect(titleOf({ gender: 'male' })).toBe('Mr');
    expect(titleOf({ gender: 'male', dateOfBirth: '2011-01-01' })).toBe('Master');
    expect(titleOf({ gender: 'female', maritalStatus: 'unmarried' })).toBe('Miss');
    expect(titleOf({ gender: 'transgender' })).toBe('Others');
    expect(titleOf({ gender: 'female', maritalStatus: 'widowed' })).toBeUndefined();
    expect(ok({ maritalStatus: 'divorced' }).byHand).toContain('title (Mr., Mrs., Miss…)');
  });

  it('leaves what the travel client lacks to the advisor', () => {
    const result = ok(
      {
        customer: { name: 'Synthetic Sparse' },
        maritalStatus: undefined,
        occupation: undefined,
        passport: undefined,
        proposal: { nomineeRelationship: 'brother' },
      },
      {},
      {},
    );
    expect(result.byHand).toEqual(
      expect.arrayContaining([
        'state, district, village (after the PIN code lookup)',
        'address',
        'mobile number',
        'e-mail',
        "insured's occupation",
        'marital status',
        'passport number',
        "nominee's name",
        "intermediary's place of signing",
      ]),
    );
    const list = result.steps.map((s) => s.op);
    // Nothing of the passport is filled when nothing is saved; a brother is "Others" here.
    expect(JSON.stringify(list)).not.toMatch(/insuredPassport/);
    expect(valueOf(list, '#insuredNomineeRelation')).toBe('Others');
  });

  it('refuses a trip that has started, or a passport that expires before it', () => {
    expect(plan({}, { startDate: '2026-11-02' })).toEqual({
      ok: false,
      problems: ['The travel start date has passed.'],
    });
    expect(plan({ passport: { expiryDate: '2026-11-09' } })).toEqual({
      ok: false,
      problems: ["The traveller's passport expires before the trip starts."],
    });
  });
});
