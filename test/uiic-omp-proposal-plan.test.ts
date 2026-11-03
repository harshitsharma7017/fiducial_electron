// United India Overseas Mediclaim e-proposals (B&H, SCHENGEN, Studies): the trip contract, what
// the app fills, what it leaves to the advisor, and that it never saves or submits.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import {
  OMP_ALWAYS_BY_HAND,
  planUiicOmpProposal,
  UIIC_OMP_FORMS,
} from '../src/main/quotes/uiic-omp-proposal';
import { ompTripSchema } from '../src/shared/contracts/travel';
import { travellerSchema } from '../src/shared/contracts/traveller';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 3);
const TRAVELLER = {
  customer: { name: 'Synthetic Traveller', phone: '9876543210', email: 'traveller@example.test' },
  pincode: '560001',
  dateOfBirth: '1986-04-12',
  gender: 'male',
  maritalStatus: 'unmarried',
  occupation: 'Professional',
  passport: { issuingAuthority: 'Passport Office, Bengaluru', expiryDate: '2031-06-30' },
  proposal: {
    pan: 'ABCDE1234F',
    address: '12 Synthetic Street',
    state: 'Karnataka',
    city: 'Bengaluru',
    village: 'Koramangala',
    highRiskCustomer: false,
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'mother',
    intermediaryPlace: 'Bengaluru',
  },
};
const TRIP = {
  form: 'business-holiday',
  destination: 'worldwide-excluding-usa-canada',
  startDate: '2026-11-20',
  days: 10,
  plan: 2,
};

function plan(
  traveller: Record<string, unknown> = {},
  trip: Record<string, unknown> = {},
  passportNumber: string | null = 'Z1234567',
) {
  return planUiicOmpProposal(
    travellerSchema.parse({ ...TRAVELLER, ...traveller }),
    ompTripSchema.parse({ ...TRIP, ...trip }),
    { aadhaar: '999941057058', passportNumber, today: TODAY },
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

describe('ompTripSchema', () => {
  it('takes one of the three forms and a plan by its place in the list', () => {
    expect(ompTripSchema.parse(TRIP).plan).toBe(2);
    for (const bad of [{ form: 'family' }, { plan: 0 }, { plan: 9 }, { days: 0 }]) {
      expect(() => ompTripSchema.parse({ ...TRIP, ...bad })).toThrow();
    }
    expect(
      quoteRunRequestSchema.safeParse({
        product: 'omp-proposal',
        travellerId: '0f8fad5b-d9cb-469f-a165-70867728950e',
        insurerId: 'united-india',
        trip: TRIP,
      }).success,
    ).toBe(true);
  });
});

describe('planUiicOmpProposal', () => {
  it('fills the trip and the insured’s date of birth, then chooses the plan by place', () => {
    const steps = ok().steps;
    const list = steps.map((s) => s.op);
    expect(valueOf(list, '#travelNoOfDays')).toBe('10');
    expect(JSON.stringify(list)).toContain('trvDestGrp');
    expect(list).toContainEqual({
      op: 'setField',
      selector:
        'select[ng-model$=".trvDestGrp"], select[data-ng-model$=".trvDestGrp"], select[x-ng-model$=".trvDestGrp"]',
      value: 'World_Wide_Restricted',
    });
    expect(list).toContainEqual({
      op: 'pickDate',
      input: 'input#travelStartDate',
      date: '2026-11-20',
    });
    expect(list).toContainEqual({ op: 'pickDate', input: 'input#insuredDOB', date: '1986-04-12' });
    // The plans are asked for once the trip and age are in, then one is chosen and kept.
    const show = list.findIndex(
      (o) => o.op === 'clickButton' && o.text === 'Click here to choose plan',
    );
    const dob = list.findIndex((o) => o.op === 'pickDate' && o.input === 'input#insuredDOB');
    expect(show).toBeGreaterThan(dob);
    expect(steps[show + 1]).toMatchObject({
      op: { op: 'pickNth', name: 'plan', index: 2 },
      keep: 'plan',
    });
  });

  it('fills the proposer and insured (Self), and reads the total premium', () => {
    const result = ok();
    const list = result.steps.map((s) => s.op);
    expect(valueOf(list, '#proposerTitle')).toBe('Mr');
    expect(valueOf(list, '#villageCode, #Village_Code')).toBe('Koramangala');
    expect(valueOf(list, '#aadharNo')).toBe('999941057058');
    expect(valueOf(list, '#insuredRelation')).toBe('Self');
    expect(valueOf(list, '#Select2')).toBe('Mr');
    expect(valueOf(list, '#insuredName')).toBe('Synthetic Traveller');
    expect(valueOf(list, '#insuredMaritalStatus')).toBe('Single');
    expect(valueOf(list, '#insuredPassportNo')).toBe('Z1234567');
    expect(valueOf(list, '#insuredPassportIssuingAuth')).toBe('Passport Office, Bengaluru');
    expect(list).toContainEqual({
      op: 'pickDate',
      input: 'input#insuredPassportExpDate',
      date: '2031-06-30',
    });
    expect(valueOf(list, '#insuredNomineeRelation')).toBe('Mother');
    expect(result.steps.at(-1)).toMatchObject({
      op: { op: 'readValue', selector: '#totalPremium', last: true },
      keep: 'premium',
    });
    // IX has nothing to type on these forms: the place is not asked for.
    expect(JSON.stringify(list)).not.toContain('intmSignPlace');
    expect(result.byHand).toEqual(OMP_ALWAYS_BY_HAND);
  });

  it('never saves, submits or answers for the client', () => {
    const json = JSON.stringify(ok().steps);
    expect(json).not.toMatch(/Save As Draft|Submit|saveDraft|Send To Customer/);
    expect(json).not.toMatch(/hasPreExistingDis|ynGoodHealth|premiumPayMode|type="file"/);
  });

  it('is the same plan for the three forms; only the tile and page differ', () => {
    const steps = (form: string) => JSON.stringify(ok({}, { form }).steps);
    expect(steps('schengen')).toBe(steps('business-holiday'));
    expect(steps('studies')).toBe(steps('business-holiday'));
    expect(UIIC_OMP_FORMS.schengen.tile).toBe('Overseas Mediclaim Policy SCHENGEN E-Proposal Form');
    expect(UIIC_OMP_FORMS.studies.tile).toBe('Overseas Mediclaim Policy Studies E-Proposal Form');
    expect(UIIC_OMP_FORMS['business-holiday'].path).toBe(
      '/CustomerAppLive/data/ProposalOMPBHhome.html',
    );
  });

  it('refuses a past trip, or a passport that expires before it', () => {
    expect(plan({}, { startDate: '2026-11-01' }).ok).toBe(false);
    expect(plan({ passport: { expiryDate: '2026-11-19' } })).toEqual({
      ok: false,
      problems: ["The traveller's passport expires before the trip starts."],
    });
  });

  it('leaves what the record and trip lack to the advisor', () => {
    const result = ok(
      {
        customer: { name: 'Synthetic Sparse' },
        maritalStatus: 'widowed',
        occupation: undefined,
        passport: undefined,
        proposal: {},
      },
      {},
      null,
    );
    expect(result.byHand).toEqual(
      expect.arrayContaining([
        'state, district, village (after the PIN code lookup)',
        'address',
        'mobile number',
        "insured's occupation",
        'marital status',
        'passport number',
        "nominee's name",
        'nominee relation',
      ]),
    );
  });
});
