// United India's Overseas Travel Insurance e-proposal: what the app fills for a travel client and a
// trip entered for this run, step by step.
//
// From the advisor's recording of 3 November 2026 (ProposalOTIhome.html; every field's model is
// under OTIProposalFormData). The app fills, presses View Premium and reads the premium if United
// India shows it, then stops: it never presses Save As Draft or Submit, and the advisor checks the
// whole form before saving it.
// - Filled by the agent, then a new proposal. ("Filled by customer" sends a short form to the
//   client instead: never used here.)
// - I. General Information: purpose (Business & Holiday, the only one listed), destination, plan
//   (by sum insured: plans B1-B4 for Worldwide, A1-A3 excluding USA and Canada), travel start date
//   (calendar) and days. United India works out the policy dates.
// - II. Proposer Information: "Is High Risk Customer?" and its type, title (United India works out
//   the gender from it), name, PIN code and its lookup (state, district, village), address,
//   landline, mobile, e-mail, e-insurance account, Aadhaar (when saved), PAN and CKYC numbers.
// - III. Insured Information: the insured is the proposer ("Self": United India copies the title
//   and name), with occupation, date of birth (calendar), marital status, passport (number, issuing
//   authority, issue and expiry dates) and the nominee.
// For a travel client (../../shared/contracts/traveller.ts): the traveller is the proposer and
// insured; their passport number comes from the secret vault for this run only.
// - IX. Declaration from Intermediary: the intermediary's place of signing.
// - VIII. Premium Details: View Premium, and the total premium read.
// Never filled by the app: IV. Medical History and V. Declaration (the client's own answers and
// consent), the signatures and documents (uploads), the payment mode, and anything the client's
// record or the trip does not hold. They are listed for the advisor.
import { ageOn, type NomineeRelationship } from '../../shared/contracts/client';
import type { TravelTrip } from '../../shared/contracts/travel';
import type { Traveller } from '../../shared/contracts/traveller';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

/** A field by its AngularJS model (ng-model, data-ng-model or x-ng-model). */
const model = (tag: string, name: string): string =>
  ['ng-model', 'data-ng-model', 'x-ng-model']
    .map((a) => `${tag}[${a}="OTIProposalFormData.${name}"]`)
    .join(', ');

/** Travel Destination values, as recorded. */
const DESTINATION: Record<TravelTrip['destination'], string> = {
  worldwide: 'Worldwide Including USA Or CANADA',
  'worldwide-excluding-usa-canada': 'Worldwide Excluding USA Or CANADA',
};

/** Plan Type values, as recorded: B for Worldwide, A excluding USA and Canada. */
const PLAN: Record<TravelTrip['destination'], Partial<Record<TravelTrip['sumInsured'], string>>> = {
  worldwide: { '50000': 'PLAN B1', '100000': 'PLAN B2', '250000': 'PLAN B3', '500000': 'PLAN B4' },
  'worldwide-excluding-usa-canada': {
    '50000': 'PLAN A1',
    '100000': 'PLAN A2',
    '250000': 'PLAN A3',
  },
};

/** Nominee Relation: the form lists fewer than the client record holds; the rest are "Others". */
export const TRAVEL_NOMINEE: Record<NomineeRelationship, string> = {
  spouse: 'Spouse',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  father_in_law: 'Others',
  mother_in_law: 'Others',
  brother: 'Others',
  sister: 'Others',
};

/** "Customer High Risk Type" values, as on United India's other proposal forms. */
export const HIGH_RISK_TYPE = { hni: '1', pep: '2', 'nri-hni': '3', 'trust-ngo': '4' } as const;

export const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The traveller's title, from which United India works out the gender. Widowed or divorced women,
 * and a traveller without a gender, are left to the advisor (null).
 */
export function travelTitle(traveller: Traveller, today: Date): string | null {
  if (traveller.gender === 'male')
    return ageOn(traveller.dateOfBirth, today) < 18 ? 'Master' : 'Mr';
  if (traveller.gender === 'transgender') return 'Others';
  if (traveller.gender === 'female') {
    if (traveller.maritalStatus === 'married') return 'Mrs';
    if (traveller.maritalStatus === 'unmarried') return 'Miss';
  }
  return null;
}

/** Marital status as the travel forms list it: Married or Unmarried ("Single"); else null. */
export const travelMarital = (traveller: Traveller): string | null =>
  traveller.maritalStatus === 'married'
    ? 'Married'
    : traveller.maritalStatus === 'unmarried'
      ? 'Single'
      : null;

/**
 * The passport steps of section III, the same on every travel form: the number (from the vault)
 * and, when saved, the issuing authority and the issue and expiry dates (calendars; left to the
 * advisor, who is told, if the page does not take them).
 */
export function passportSteps(
  traveller: Traveller,
  passportNumber: string | null | undefined,
  add: (label: string, op: PageOp, extra?: Partial<PlanStep>) => void,
  byHand: string[],
): void {
  if (passportNumber) {
    add('Passport number', {
      op: 'setField',
      selector: '#insuredPassportNo',
      value: passportNumber,
    });
  } else byHand.push('passport number');
  const p = traveller.passport ?? {};
  if (p.issuingAuthority) {
    add(
      'Passport issuing authority',
      { op: 'setField', selector: '#insuredPassportIssuingAuth', value: p.issuingAuthority },
      { optional: true, ifMissed: 'passport issuing authority: fill it in by hand' },
    );
  }
  if (p.issueDate) {
    add(
      'Passport issue date',
      { op: 'pickDate', input: 'input#insuredPassportIssueDate', date: p.issueDate },
      { optional: true, ifMissed: 'passport issue date: choose it by hand' },
    );
  }
  if (p.expiryDate) {
    add(
      'Passport expiry date',
      { op: 'pickDate', input: 'input#insuredPassportExpDate', date: p.expiryDate },
      { optional: true, ifMissed: 'passport expiry date: choose it by hand' },
    );
  }
}

export type TravelProposalPlan =
  | { ok: true; steps: PlanStep[]; /** Left for the advisor to fill by hand. */ byHand: string[] }
  | { ok: false; problems: string[] };

/** What the advisor always does on this form: the client's own answers, uploads and payment. */
export const TRAVEL_ALWAYS_BY_HAND = [
  'IV. Medical History: the insured’s answers',
  'V. Declaration: the client’s consent boxes',
  'signature of the proposer and documents (uploads)',
  'payment mode (VIII. Premium Details)',
];

export function planUiicTravelProposal(
  traveller: Traveller,
  trip: TravelTrip,
  options: { aadhaar?: string | null; passportNumber?: string | null; today: Date },
): TravelProposalPlan {
  const problems: string[] = [];
  if (trip.startDate < iso(options.today)) problems.push('The travel start date has passed.');
  const passportExpiry = traveller.passport?.expiryDate;
  if (passportExpiry && passportExpiry < trip.startDate) {
    problems.push("The traveller's passport expires before the trip starts.");
  }
  const plan = PLAN[trip.destination][trip.sumInsured];
  if (!plan) problems.push('Worldwide excluding USA and Canada goes up to 250000.');
  if (!plan || problems.length > 0) return { ok: false, problems };

  const p = traveller.proposal ?? {};
  const steps: PlanStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, extra: Partial<PlanStep> = {}) =>
    steps.push({ label, op, ...extra });
  const fill = (label: string, selector: string, value: string | undefined, missing: string) => {
    if (value) add(label, { op: 'setField', selector, value });
    else byHand.push(missing);
  };
  const optional = (label: string, selector: string, value: string | undefined) => {
    if (value) add(label, { op: 'setField', selector, value });
  };
  const open = (section: string) => {
    // Opening a section may make United India list what the ones before it lack: that pop-up is
    // closed and its message kept for the advisor.
    add(`Open ${section}`, { op: 'clickLink', text: section }, { closeErrors: true });
    add(`${section} shown`, { op: 'pause', ms: 800 }, { closeErrors: true });
  };

  // Not seen in the recording, but closed if it appears (as on the health forms).
  add(
    'Close the instructions',
    { op: 'clickButton', text: 'Close', within: 'Important Instructions', timeoutMs: 4000 },
    { optional: true },
  );
  add('Proposal filled by the agent', {
    op: 'check',
    selector: model('input[value="agent"]', 'proposalFilledBy'),
    checked: true,
  });
  add('New proposal', {
    op: 'check',
    selector: model('input[value="new"]', 'chooseProposal'),
    checked: true,
  });
  add('General information shown', {
    op: 'waitFor',
    selector: '#travelPurpose',
    timeoutMs: 20_000,
  });

  // I. General Information. Each choice makes United India load the next list.
  add('Purpose of visit', { op: 'setField', selector: '#travelPurpose', value: 'BH' });
  add('Destinations loaded', { op: 'pause', ms: 1500 });
  add('Travel destination', {
    op: 'setField',
    selector: '#travelDestination',
    value: DESTINATION[trip.destination],
  });
  add('Plans loaded', { op: 'pause', ms: 1500 });
  add('Plan type', { op: 'setField', selector: '#planType', value: plan });
  add('Travel start date', {
    op: 'pickDate',
    input: 'input#travelStartDate',
    date: trip.startDate,
  });
  add('Travel days', { op: 'setField', selector: '#travelNoOfDays', value: String(trip.days) });

  // II. Proposer Information.
  open('II. Proposer Information');
  add('Is High Risk Customer?', {
    op: 'setField',
    selector: model('select', 'ynHighRisk'),
    value: p.highRiskCustomer ? 'Yes' : 'No',
  });
  if (p.highRiskCustomer && p.highRiskType) {
    add('Customer High Risk Type', {
      op: 'setField',
      selector: model('select', 'highRiskType'),
      value: HIGH_RISK_TYPE[p.highRiskType],
    });
  } else if (p.highRiskCustomer) byHand.push('customer high risk type');
  const title = travelTitle(traveller, options.today);
  if (title) add('Title', { op: 'setField', selector: '#proposerTitle', value: title });
  else byHand.push('title (Mr., Mrs., Miss…)');
  add("Proposer's name", {
    op: 'setField',
    selector: '#proposerName',
    value: traveller.customer.name,
  });
  add(
    'Customer type',
    { op: 'setField', selector: '#customerType', value: 'Individual' },
    { optional: true },
  );
  add('PIN code', { op: 'setField', selector: '#proposerPINCode', value: traveller.pincode });
  add('PIN code lookup', { op: 'pause', ms: 2000 });
  const place = (label: string, selector: string, value: string | undefined) => {
    if (!value) return;
    add(
      label,
      { op: 'setField', selector, value },
      {
        optional: true,
        ifMissed: `${label} "${value}" is not in United India's list for this PIN code: choose it by hand`,
      },
    );
  };
  place('State', '#STATE_CODE1', p.state);
  place('District', '#STATE_CODE2', p.city);
  place('Village', '#Village_Code', p.village);
  const unknownPlaces = [
    p.state ? null : 'state',
    p.city ? null : 'district',
    p.village ? null : 'village',
  ].filter((x) => x !== null);
  if (unknownPlaces.length > 0)
    byHand.push(`${unknownPlaces.join(', ')} (after the PIN code lookup)`);
  fill('Address', '#proposerAddress', p.address, 'address');
  optional('Landline STD code', '#proposerSTDCode', p.landlineStdCode);
  optional('Landline number', '#proposerResidenceTelNo', p.landlineNumber);
  fill("Proposer's mobile", '#proposerMobileNo', traveller.customer.phone, 'mobile number');
  fill("Proposer's e-mail", '#proposerEmail', traveller.customer.email, 'e-mail');
  optional('E-insurance account number', '#eInsuranceAccNo', p.eInsuranceAccountNumber);
  // Aadhaar and PAN are optional on this form: filled when known, never listed as missing.
  optional('Aadhaar number', '#aadharNo', options.aadhaar ?? undefined);
  optional('PAN', '#panNo', p.pan);
  optional('CKYC number', '#CKYCNo', p.ckycNumber);

  // III. Insured Information: the proposer. United India copies the title and name.
  open('III. Insured Information');
  add('Relationship with proposer', {
    op: 'setField',
    selector: '#insuredRelation',
    value: 'Self',
  });
  fill("Insured's occupation", '#insuredOccupation', traveller.occupation, "insured's occupation");
  add("Insured's date of birth", {
    op: 'pickDate',
    input: 'input#insuredDOB',
    date: traveller.dateOfBirth,
  });
  // Widowed or divorced is left to the advisor.
  const marital = travelMarital(traveller);
  if (marital) {
    add('Marital status', { op: 'setField', selector: '#insuredMaritalStatus', value: marital });
  } else byHand.push('marital status');
  passportSteps(traveller, options.passportNumber, add, byHand);
  fill("Nominee's name", '#insuredNomineeName', p.nomineeName, "nominee's name");
  if (p.nomineeRelationship) {
    add('Nominee relation', {
      op: 'setField',
      selector: '#insuredNomineeRelation',
      value: TRAVEL_NOMINEE[p.nomineeRelationship],
    });
  } else byHand.push('nominee relation');

  // IX. Declaration from Intermediary (the short "filled by customer" form has a box with the same
  // id, hidden here: the visible one is filled).
  if (p.intermediaryPlace) {
    open('IX. Declaration from Intermediary');
    add("Intermediary's place of signing", {
      op: 'setField',
      selector: '#intmSignPlace',
      value: p.intermediaryPlace,
    });
  } else byHand.push("intermediary's place of signing");

  // VIII. Premium Details: View Premium works the premium out (it saves nothing). United India may
  // first list what is still missing: then no premium is read, and the advisor is told why.
  open('VIII. Premium Details');
  add(
    'View premium',
    { op: 'clickButton', text: 'View Premium', timeoutMs: 5000 },
    { optional: true, closeErrors: true },
  );
  add(
    'Read the premium',
    { op: 'readValue', selector: '#totalPremium', timeoutMs: 8000 },
    { optional: true, closeErrors: true },
  );

  return { ok: true, steps, byHand: [...byHand, ...TRAVEL_ALWAYS_BY_HAND] };
}
