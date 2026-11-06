// United India's Overseas Mediclaim e-proposals (B&H, SCHENGEN, Studies): what the app fills for a
// travel client (the proposer and insured) and a trip entered for this run, step by step.
//
// From the advisor's recording of B&H on 3 November 2026 (ProposalOMPBHhome.html, models under
// OMPBHProposalFormData). The advisor says SCHENGEN and Studies have the same fields; they were not
// recorded, so fields are found by the end of their model's name (whatever the form's prefix) or
// by id, their pages are any of United India's proposal pages, and their tiles' names are as
// recorded on the home page.
// The app fills, chooses the plan, reads the premium, and stops: it never presses Save As Draft or
// Submit, and the advisor checks the whole form before saving it.
// - Filled by the agent (New proposal, if offered).
// - I. General Information: destination, travel days, travel start date and the insured's date of
//   birth (calendars); then "Click here to choose plan" shows the plans for that trip and age, by
//   code (A-1, A-2…) with their premiums. The advisor's choice is by place in that list.
// - II. Proposer Information: as on the Overseas Travel form (title, name, PIN code and lookup,
//   address, phones, e-mail, Aadhaar when saved, PAN, CKYC…). The village box is #villageCode here.
// - III. Insured Information: the insured is the proposer ("Self"), with title, name, occupation,
//   marital status, nationality (Indian, the only one listed), passport (number from the secret
//   vault for this run, issuing authority, issue and expiry dates) and the nominee.
// - X. Premium Details: the total premium read.
// Never filled by the app: IV. Medical History, V. Assignment and VIII. Medical Examination (the
// client's own answers, consent and reports), the signatures and documents (uploads), the payment
// mode, and anything the record or the trip does not hold. IX. Declaration from Intermediary has no
// box to fill here (its place is the proposer's city; the signature is an upload).
import type { Traveller } from '../../shared/contracts/traveller';
import type { OmpForm, OmpTrip, TravelDestination } from '../../shared/contracts/travel';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';
import {
  HIGH_RISK_TYPE,
  iso,
  passportSteps,
  TRAVEL_NOMINEE,
  travelMarital,
  travelTitle,
} from './uiic-travel-proposal';

/** A field by the end of its AngularJS model, whatever the form's prefix (OMPBHProposalFormData…). */
const model = (tag: string, name: string): string =>
  ['ng-model', 'data-ng-model', 'x-ng-model'].map((a) => `${tag}[${a}$=".${name}"]`).join(', ');

/** Each form's tile, as recorded on the home page, and its page. */
export const UIIC_OMP_FORMS: Record<
  OmpForm,
  { name: string; tile: string; path: string | RegExp }
> = {
  'business-holiday': {
    name: 'Overseas Mediclaim B&H',
    tile: 'Overseas Mediclaim Policy B&H E-Proposal Form',
    path: '/CustomerAppLive/data/ProposalOMPBHhome.html',
  },
  schengen: {
    name: 'Overseas Mediclaim SCHENGEN',
    tile: 'Overseas Mediclaim Policy SCHENGEN E-Proposal Form',
    path: /^\/CustomerAppLive\/data\/Proposal[A-Za-z]+home\.html$/,
  },
  studies: {
    name: 'Overseas Mediclaim Studies',
    tile: 'Overseas Mediclaim Policy Studies E-Proposal Form',
    path: /^\/CustomerAppLive\/data\/Proposal[A-Za-z]+home\.html$/,
  },
};

/** Travel Destination values, as recorded on B&H. */
const DESTINATION: Record<TravelDestination, string> = {
  worldwide: 'World_Wide',
  'worldwide-excluding-usa-canada': 'World_Wide_Restricted',
};

/** What the advisor always does on these forms: the client's own answers, uploads and payment. */
export const OMP_ALWAYS_BY_HAND = [
  'IV. Medical History: the insured’s answers',
  'V. Assignment: the client’s declaration',
  'VIII. Medical Examination report, signatures and documents (uploads)',
  'payment mode (X. Premium Details)',
];

export type OmpProposalPlan =
  | { ok: true; steps: PlanStep[]; /** Left for the advisor to fill by hand. */ byHand: string[] }
  | { ok: false; problems: string[] };

export function planUiicOmpProposal(
  traveller: Traveller,
  trip: OmpTrip,
  options: { aadhaar?: string | null; passportNumber?: string | null; today: Date },
): OmpProposalPlan {
  const problems: string[] = [];
  if (trip.startDate < iso(options.today)) problems.push('The travel start date has passed.');
  const passportExpiry = traveller.passport?.expiryDate;
  if (passportExpiry && passportExpiry < trip.startDate) {
    problems.push("The traveller's passport expires before the trip starts.");
  }
  if (problems.length > 0) return { ok: false, problems };

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
    add(`Open ${section}`, { op: 'clickLink', text: section }, { closeErrors: true });
    add(`${section} shown`, { op: 'pause', ms: 800 }, { closeErrors: true });
  };

  add(
    'Close the instructions',
    { op: 'clickButton', text: 'Close', within: 'Important Instructions', timeoutMs: 4000 },
    { optional: true },
  );
  add('Proposal filled by the agent', {
    op: 'check',
    selector: 'input[name="proposalfilledBy"][value="agent"]',
    checked: true,
  });
  // B&H showed the trip at once (New already chosen); chosen here in case a form asks.
  add(
    'New proposal',
    { op: 'check', selector: 'input[name="chooseProposal"][value="new"]', checked: true },
    { optional: true },
  );
  const destination = model('select', 'trvDestGrp');
  add('General information shown', { op: 'waitFor', selector: destination, timeoutMs: 20_000 });

  // I. General Information.
  add('Travel destination', {
    op: 'setField',
    selector: destination,
    value: DESTINATION[trip.destination],
    waitMs: 15_000,
  });
  add('Travel days', { op: 'setField', selector: '#travelNoOfDays', value: String(trip.days) });
  add('Travel start date', {
    op: 'pickDate',
    input: 'input#travelStartDate',
    date: trip.startDate,
  });
  add("Insured's date of birth", {
    op: 'pickDate',
    input: 'input#insuredDOB',
    date: traveller.dateOfBirth,
  });
  // United India works out the plans and premiums for this trip and age (it may list what is
  // missing instead: the run stops with its message).
  add('Show the plans', { op: 'clickButton', text: 'Click here to choose plan', timeoutMs: 5000 });
  add(
    'Plan',
    { op: 'pickNth', name: 'plan', index: trip.plan, timeoutMs: 15_000 },
    { keep: 'plan' },
  );

  // II. Proposer Information.
  open('II. Proposer Information');
  add('Is High Risk Customer?', {
    op: 'setField',
    selector: model('select', 'ynHighRisk'),
    value: p.highRiskCustomer ? 'Yes' : 'No',
  });
  if (p.highRiskCustomer && p.highRiskType) {
    add(
      'Customer High Risk Type',
      {
        op: 'setField',
        selector: model('select', 'highRiskType'),
        value: HIGH_RISK_TYPE[p.highRiskType],
      },
      {
        optional: true,
        ifMissed: 'customer high risk type: choose it by hand',
      },
    );
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
  place('Village', '#villageCode, #Village_Code', p.village);
  const unknownPlaces = [
    p.state ? null : 'state',
    p.city ? null : 'district',
    p.village ? null : 'village',
  ].filter((x) => x !== null);
  if (unknownPlaces.length > 0) {
    byHand.push(`${unknownPlaces.join(', ')} (after the PIN code lookup)`);
  }
  fill('Address', '#proposerAddress', p.address, 'address');
  optional('Landline STD code', '#proposerSTDCode', p.landlineStdCode);
  optional('Landline number', '#proposerResidenceTelNo', p.landlineNumber);
  fill("Proposer's mobile", '#proposerMobileNo', traveller.customer.phone, 'mobile number');
  fill("Proposer's e-mail", '#proposerEmail', traveller.customer.email, 'e-mail');
  optional('E-insurance account number', '#eInsuranceAccNo', p.eInsuranceAccountNumber);
  optional('Aadhaar number', '#aadharNo', options.aadhaar ?? undefined);
  optional('PAN', '#panNo', p.pan);
  optional('CKYC number', '#CKYCNo', p.ckycNumber);

  // III. Insured Information: the proposer. Its title and name are filled (the form may already
  // have copied them from the proposer and locked them: that is fine).
  open('III. Insured Information');
  add('Relationship with proposer', {
    op: 'setField',
    selector: '#insuredRelation',
    value: 'Self',
  });
  if (title) {
    add(
      "Insured's title",
      { op: 'setField', selector: '#Select2', value: title },
      { optional: true },
    );
  }
  add(
    "Insured's name",
    { op: 'setField', selector: '#insuredName', value: traveller.customer.name },
    { optional: true },
  );
  fill("Insured's occupation", '#insuredOccupation', traveller.occupation, "insured's occupation");
  const marital = travelMarital(traveller);
  if (marital) {
    add('Marital status', { op: 'setField', selector: '#insuredMaritalStatus', value: marital });
  } else byHand.push('marital status');
  add(
    'Nationality',
    { op: 'setField', selector: '#insuredNationality', value: 'Indian' },
    { optional: true },
  );
  passportSteps(traveller, options.passportNumber, add, byHand);
  fill("Nominee's name", '#insuredNomineeName', p.nomineeName, "nominee's name");
  if (p.nomineeRelationship) {
    add('Nominee relation', {
      op: 'setField',
      selector: '#insuredNomineeRelation',
      value: TRAVEL_NOMINEE[p.nomineeRelationship],
    });
  } else byHand.push('nominee relation');

  // X. Premium Details: the plan's premium, worked out when it was chosen. The page repeats the
  // id: the total comes after the net premium.
  open('X. Premium Details');
  add(
    'Read the premium',
    { op: 'readValue', selector: '#totalPremium', timeoutMs: 8000, last: true },
    { optional: true, closeErrors: true, keep: 'premium' },
  );

  return { ok: true, steps, byHand: [...byHand, ...OMP_ALWAYS_BY_HAND] };
}
