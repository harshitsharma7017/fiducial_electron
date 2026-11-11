// What the quote drawer asks before a United India run: exactly what each form's plan would
// otherwise leave to the advisor. Given everything it asks, the plans leave nothing from the
// record undone (only the client's own answers, uploads and payment); without any one of them, the
// drawer asks for it and the plan would have left it.
import { describe, expect, it } from 'vitest';
import { planUiicHealthQuote } from '../src/main/quotes/uiic-health';
import { planUiicHealthProposal } from '../src/main/quotes/uiic-health-proposal';
import { OMP_ALWAYS_BY_HAND, planUiicOmpProposal } from '../src/main/quotes/uiic-omp-proposal';
import {
  planUiicTravelProposal,
  TRAVEL_ALWAYS_BY_HAND,
} from '../src/main/quotes/uiic-travel-proposal';
import { clientInputSchema } from '../src/shared/contracts/client';
import { ompTripSchema, travelTripSchema } from '../src/shared/contracts/travel';
import { travellerSchema } from '../src/shared/contracts/traveller';
import {
  uiicMissingForClient,
  uiicMissingForTraveller,
  type UiicRequiredKey,
} from '../src/shared/insurers/uiic-required';

const TODAY = new Date(2026, 10, 11);

const CLIENT = {
  customer: { name: 'Synthetic Proposer', phone: '9876543210', email: 'proposer@example.test' },
  pincode: '560001',
  proposerMaritalStatus: 'married',
  members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-04-12', gender: 'female' }],
  preferences: { coverType: 'floater', sumInsuredPaise: 500000_00, tenureYears: 1 },
  proposal: {
    pan: 'ABCDE1234F',
    address: '12 Synthetic Street',
    state: 'Karnataka',
    city: 'Bengaluru',
    village: 'Koramangala',
    occupation: 'Software Professional',
    highRiskCustomer: false,
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'spouse',
    nomineeAddress: '12 Synthetic Street',
    intermediaryPlace: 'Bengaluru',
  },
};

const TRAVELLER = {
  customer: { name: 'Synthetic Traveller', phone: '9876543210', email: 'traveller@example.test' },
  pincode: '560001',
  dateOfBirth: '1986-04-12',
  gender: 'female',
  maritalStatus: 'married',
  occupation: 'Salaried',
  proposal: {
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

const TRIP = { destination: 'worldwide', sumInsured: '100000', startDate: '2026-11-20', days: 14 };
const OMP_TRIP = {
  form: 'business-holiday',
  destination: 'worldwide',
  startDate: '2026-11-20',
  days: 10,
  plan: 1,
};

/** The record without the detail a key names. */
function without(record: Record<string, unknown>, key: UiicRequiredKey): Record<string, unknown> {
  const r = structuredClone(record) as {
    customer: Record<string, unknown>;
    proposal: Record<string, unknown>;
    members?: Record<string, unknown>[];
    [k: string]: unknown;
  };
  if (key === 'email' || key === 'phone') delete r.customer[key];
  else if (key === 'maritalStatus') {
    delete r.proposerMaritalStatus;
    delete r.maritalStatus;
  } else if ((key === 'dateOfBirth' || key === 'gender') && r.members) delete r.members[0]![key];
  else if (key === 'gender') delete r.gender;
  else if (key === 'travelOccupation') delete r.occupation;
  else delete r.proposal[key];
  return r;
}

const clientPlanLeaves = (raw: Record<string, unknown>, aadhaar: string | null): string[] => {
  const result = planUiicHealthProposal(clientInputSchema.parse(raw), {
    form: 'family-medicare',
    aadhaar,
  });
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result.byHand;
};
const travelPlanLeaves = (raw: Record<string, unknown>, passport: string | null): string[] => {
  const result = planUiicTravelProposal(travellerSchema.parse(raw), travelTripSchema.parse(TRIP), {
    passportNumber: passport,
    today: TODAY,
  });
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result.byHand.filter((t) => !TRAVEL_ALWAYS_BY_HAND.includes(t));
};
const ompPlanLeaves = (raw: Record<string, unknown>, passport: string | null): string[] => {
  const result = planUiicOmpProposal(travellerSchema.parse(raw), ompTripSchema.parse(OMP_TRIP), {
    passportNumber: passport,
    today: TODAY,
  });
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result.byHand.filter((t) => !OMP_ALWAYS_BY_HAND.includes(t));
};

describe('United India health e-proposals', () => {
  const missing = (raw: Record<string, unknown>, aadhaar: boolean) =>
    uiicMissingForClient('proposal', clientInputSchema.parse(raw), { aadhaar });

  it('asks nothing of a complete record, and the plan then leaves nothing', () => {
    expect(missing(CLIENT, true)).toEqual([]);
    expect(clientPlanLeaves(CLIENT, '999941057058')).toEqual([]);
  });

  const KEYS: UiicRequiredKey[] = [
    'email',
    'phone',
    'dateOfBirth',
    'gender',
    'maritalStatus',
    'occupation',
    'pan',
    'state',
    'city',
    'village',
    'address',
    'nomineeName',
    'nomineeRelationship',
    'nomineeAddress',
    'intermediaryPlace',
  ];
  it.each(KEYS)('asks for %s when the record lacks it, which the plan would have left', (key) => {
    const raw = without(CLIENT, key);
    expect(missing(raw, true)).toEqual([key]);
    expect(clientPlanLeaves(raw, '999941057058')).not.toEqual([]);
  });

  it('asks for the Aadhaar number when none is saved', () => {
    expect(missing(CLIENT, false)).toEqual(['aadhaar']);
    expect(clientPlanLeaves(CLIENT, null)).not.toEqual([]);
  });

  it("asks a high-risk customer's type", () => {
    const raw = { ...CLIENT, proposal: { ...CLIENT.proposal, highRiskCustomer: true } };
    expect(missing(raw, true)).toEqual(['highRiskType']);
  });
});

describe('United India health calculator', () => {
  it('asks only for the e-mail and mobile (User Details), as the plan needs', () => {
    const raw = { ...CLIENT, customer: { name: 'Synthetic Proposer' } };
    const client = clientInputSchema.parse(raw);
    expect(uiicMissingForClient('health', client, { aadhaar: false })).toEqual(['email', 'phone']);
    expect(planUiicHealthQuote(client, { goodHealth: true, today: TODAY }).ok).toBe(false);
    const complete = clientInputSchema.parse(CLIENT);
    expect(uiicMissingForClient('health', complete, { aadhaar: false })).toEqual([]);
    expect(planUiicHealthQuote(complete, { goodHealth: true, today: TODAY }).ok).toBe(true);
  });
});

describe('United India travel e-proposals', () => {
  const KEYS: UiicRequiredKey[] = [
    'gender',
    'maritalStatus',
    'state',
    'city',
    'village',
    'address',
    'phone',
    'email',
    'travelOccupation',
    'nomineeName',
    'nomineeRelationship',
  ];
  const missing = (form: 'travel' | 'omp', raw: Record<string, unknown>, passport: boolean) =>
    uiicMissingForTraveller(form, travellerSchema.parse(raw), { passport });

  it('ask nothing of a complete record, and the plans then leave only the client’s own part', () => {
    expect(missing('travel', TRAVELLER, true)).toEqual([]);
    expect(missing('omp', TRAVELLER, true)).toEqual([]);
    expect(travelPlanLeaves(TRAVELLER, 'Z1234567')).toEqual([]);
    expect(ompPlanLeaves(TRAVELLER, 'Z1234567')).toEqual([]);
  });

  it.each(KEYS)('ask for %s when the record lacks it, which the plans would have left', (key) => {
    const raw = without(TRAVELLER, key);
    expect(missing('travel', raw, true)).toEqual([key]);
    expect(missing('omp', raw, true)).toEqual([key]);
    expect(travelPlanLeaves(raw, 'Z1234567')).not.toEqual([]);
    expect(ompPlanLeaves(raw, 'Z1234567')).not.toEqual([]);
  });

  it('ask for the passport number when none is saved', () => {
    expect(missing('travel', TRAVELLER, false)).toEqual(['passportNumber']);
    expect(travelPlanLeaves(TRAVELLER, null)).not.toEqual([]);
  });

  it("asks the intermediary's place for Overseas Travel only (Mediclaim has no box for it)", () => {
    const raw = without(TRAVELLER, 'intermediaryPlace');
    expect(missing('travel', raw, true)).toEqual(['intermediaryPlace']);
    expect(missing('omp', raw, true)).toEqual([]);
    expect(travelPlanLeaves(raw, 'Z1234567')).not.toEqual([]);
    expect(ompPlanLeaves(raw, 'Z1234567')).toEqual([]);
  });
});
