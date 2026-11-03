// United India's health e-proposals: what the app fills for a saved client, step by step.
//
// Four forms, the same first sections (field ids, models and pop-ups as recorded):
// - Family Medicare (recording of 3 November 2026, ProposalFMhome.html);
// - Individual Health (recording of 3 November 2026, ProposalIHPhome.html), where the
//   intermediary's declaration is section X instead of XI;
// - Arogya Sanjeevani and Super Top-up: not recorded. The advisor says their forms are the same as
//   Individual Health's (3 November 2026). Their tiles' names are as recorded on the home page, but
//   not their pages' addresses or section numbers: the page is any of United India's proposal
//   pages (Proposal…home.html) and the intermediary's section is found by its name.
// Sections I and II only (the advisor records the other sections later). The app fills and stops:
// it never presses Save As Draft or Submit, and the advisor checks the whole form before saving it
// (decision of 3 November 2026).
// - Opening: the "Important Instructions" pop-up is closed.
// - Proposal filled by the agent, then a new proposal (not "fetch details"). ("Filled by customer"
//   shows a short form that sends the proposal to the client instead: never used here.)
// - I. Proposer Details: "Is High Risk Customer?", name, date of birth (calendar), gender, marital
//   status, occupation, PAN, e-insurance account number, PIN code, village, address, landline,
//   mobile, e-mail and CKYC number.
// - II. Nomination: the nominee's name, relationship, address and contact number.
// - Declaration from Intermediary (XI or X): the intermediary's place of signing.
// The Aadhaar number is filled when the client has one saved (kept apart in the secret vault and
// passed in for this run only). Never filled by the app: anything the client's record does not
// hold. They are listed for the advisor, with United India's own messages about missing
// fields.
import type { ClientInput, HighRiskType, NomineeRelationship } from '../../shared/contracts/client';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

/** A field by its AngularJS model (ng-model, data-ng-model or x-ng-model). */
const model = (tag: string, name: string): string =>
  ['ng-model', 'data-ng-model', 'x-ng-model'].map((a) => `${tag}[${a}="${name}"]`).join(', ');

const NOMINEE: Record<NomineeRelationship, string> = {
  spouse: 'Spouse',
  father: 'Father',
  mother: 'Mother',
  son: 'Son',
  daughter: 'Daughter',
  father_in_law: 'Father In-law',
  mother_in_law: 'Mother In-law',
  brother: 'Brother',
  sister: 'Sister',
};

/** "Customer High Risk Type" values: HNI, PEP or close relative, NRI who is also HNI, trust/NGO. */
const UIIC_HIGH_RISK_TYPE: Record<HighRiskType, string> = {
  hni: '1',
  pep: '2',
  'nri-hni': '3',
  'trust-ngo': '4',
};

export type UiicProposalForm =
  'family-medicare' | 'individual-health' | 'arogya-sanjeevani' | 'super-top-up';

/** United India's proposal pages, for a form whose own page was not recorded. */
const ANY_PROPOSAL_PAGE = /^\/CustomerAppLive\/data\/Proposal[A-Za-z]+home\.html$/;

/** What differs between the forms. */
export const UIIC_PROPOSAL_FORMS: Record<
  UiicProposalForm,
  {
    name: string;
    /** The home page tile, as recorded. */
    tile: string;
    /** The form's page: as recorded, or any proposal page. */
    path: string | RegExp;
    /** The intermediary's section as recorded, or null to find it by name whatever its number. */
    intermediarySection: string | null;
  }
> = {
  'family-medicare': {
    name: 'Family Medicare',
    tile: 'Family Medicare E-Proposal Form',
    path: '/CustomerAppLive/data/ProposalFMhome.html',
    intermediarySection: 'XI. Declaration from Intermediary',
  },
  'individual-health': {
    name: 'Individual Health',
    tile: 'Individual Health E-Proposal Form',
    path: '/CustomerAppLive/data/ProposalIHPhome.html',
    intermediarySection: 'X. Declaration from Intermediary',
  },
  'arogya-sanjeevani': {
    name: 'Arogya Sanjeevani',
    tile: 'Arogya Sanjeevani E-Proposal Form',
    path: ANY_PROPOSAL_PAGE,
    intermediarySection: null,
  },
  'super-top-up': {
    name: 'Super Top-up',
    tile: 'Super Top-up Policy E-Proposal Form',
    path: ANY_PROPOSAL_PAGE,
    intermediarySection: null,
  },
};

export type HealthProposalPlan =
  | { ok: true; steps: PlanStep[]; /** Left for the advisor to fill by hand. */ byHand: string[] }
  | { ok: false; problems: string[] };

export function planUiicHealthProposal(
  client: ClientInput,
  options: { form: UiicProposalForm; aadhaar?: string | null },
): HealthProposalPlan {
  const form = UIIC_PROPOSAL_FORMS[options.form];
  const self = client.members.find((m) => m.relationship === 'self');
  if (!self) {
    return {
      ok: false,
      problems: ['Add the proposer ("self") with their date of birth and gender to this client.'],
    };
  }
  const p = client.proposal ?? {};
  const steps: PlanStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, extra: Partial<PlanStep> = {}) =>
    steps.push({ label, op, ...extra });
  const fill = (label: string, selector: string, value: string | undefined, missing: string) => {
    if (value) add(label, { op: 'setField', selector, value });
    else byHand.push(missing);
  };

  add(
    'Close the instructions',
    { op: 'clickButton', text: 'Close', within: 'Important Instructions', timeoutMs: 20_000 },
    { optional: true },
  );

  add('Proposal filled by the agent', {
    op: 'check',
    selector: model('input[value="agent"]', 'formData.proposalFilledBy'),
    checked: true,
  });
  add('New proposal', {
    op: 'check',
    selector: model('input[value="new"]', 'formData.chooseProposal'),
    checked: true,
  });
  add('Proposer details shown', {
    op: 'waitFor',
    selector: 'input#proposerDOB',
    timeoutMs: 20_000,
  });

  // I. Proposer Details. A high-risk customer's type of risk is not saved: the advisor chooses it.
  add('Is High Risk Customer?', {
    op: 'setField',
    selector: model('select', 'formData.ynHighRisk'),
    value: p.highRiskCustomer ? 'Yes' : 'No',
  });
  if (p.highRiskCustomer && p.highRiskType) {
    // Shown once Yes is chosen; United India's values (recorded 3 November 2026).
    add('Customer High Risk Type', {
      op: 'setField',
      selector: model('select', 'formData.highRiskType'),
      value: UIIC_HIGH_RISK_TYPE[p.highRiskType],
    });
  } else if (p.highRiskCustomer) byHand.push('customer high risk type');
  add("Proposer's name", {
    op: 'setField',
    selector: '#proposerName',
    value: client.customer.name,
  });
  if (self.dateOfBirth) {
    add("Proposer's date of birth", {
      op: 'pickDate',
      input: 'input#proposerDOB',
      date: self.dateOfBirth,
    });
  } else byHand.push('date of birth');
  if (self.gender) {
    const value = { male: 'Male', female: 'Female', transgender: 'Transgender' }[self.gender];
    add("Proposer's gender", {
      op: 'check',
      selector: model(`input[value="${value}"]`, 'formData.proposerGender'),
      checked: true,
    });
  } else byHand.push('gender');
  // United India offers Single or Married only: widowed and divorced are left to the advisor.
  const marital =
    client.proposerMaritalStatus === 'married'
      ? 'Married'
      : client.proposerMaritalStatus === 'unmarried'
        ? 'Single'
        : null;
  if (marital) {
    add('Marital status', {
      op: 'check',
      selector: model(`input[value="${marital}"]`, 'formData.proposerMaritalStatus'),
      checked: true,
    });
  } else byHand.push('marital status');
  fill('Occupation', '#OCCUPATION_CODE', p.occupation, 'occupation');
  fill('PAN', '#proposerPANCardNo', p.pan, 'PAN');
  fill(
    'Aadhaar number',
    '#proposerAadhaarCard_PassportNo',
    options.aadhaar ?? undefined,
    'Aadhaar number (none saved for this client)',
  );
  // Optional on the form: filled when known, never listed as missing.
  const optional = (label: string, selector: string, value: string | undefined) => {
    if (value) add(label, { op: 'setField', selector, value });
  };
  optional('E-insurance account number', '#proposerEInsuranceAccountNo', p.eInsuranceAccountNumber);
  add('PIN code', { op: 'setField', selector: '#proposerPINCode', value: client.pincode });
  // United India looks the PIN code up (city, state and its villages) before the address.
  add('PIN code lookup', { op: 'pause', ms: 2000 });
  // State, city and village are chosen by name among what the lookup found; a name it does not list
  // is left to the advisor, who is told which (the run goes on).
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
  place('City', '#STATE_CODE2', p.city);
  place('Village', '#Village_Code', p.village);
  const unknownPlaces = [
    p.state ? null : 'state',
    p.city ? null : 'city',
    p.village ? null : 'village',
  ].filter((x) => x !== null);
  if (unknownPlaces.length > 0) {
    byHand.push(`${unknownPlaces.join(', ')} (after the PIN code lookup)`);
  }
  fill('Address', '#proposerAddress', p.address, 'address');
  optional('Landline STD code', '#proposerTelNoSTDCode', p.landlineStdCode);
  optional('Landline number', '#proposerTelNoHome', p.landlineNumber);
  fill("Proposer's mobile", '#proposerTelNoMobile', client.customer.phone, 'mobile number');
  fill("Proposer's e-mail", '#proposerEmail', client.customer.email, 'e-mail');
  optional('CKYC number', '#proposerCKYCNo', p.ckycNumber);

  // II. Nomination. Opening it makes United India list what section I still lacks (the Aadhaar
  // number at least): that pop-up is closed and its message kept for the advisor.
  add('Open Nomination', { op: 'clickLink', text: 'II. Nomination' }, { closeErrors: true });
  add('Nomination shown', { op: 'pause', ms: 800 }, { closeErrors: true });
  fill("Nominee's name", '#nomineeName', p.nomineeName, "nominee's name");
  if (p.nomineeRelationship) {
    add('Nominee relationship', {
      op: 'setField',
      selector: '#nomineeRelationship',
      value: NOMINEE[p.nomineeRelationship],
    });
  } else byHand.push('nominee relationship');
  fill("Nominee's address", '#nomineeAddress', p.nomineeAddress, "nominee's address");
  optional("Nominee's contact number", '#nomineeContactNo', p.nomineeContact);

  // Declaration from Intermediary: opened the same way (United India may list what the sections
  // before it lack).
  if (p.intermediaryPlace) {
    add(
      'Open Declaration from Intermediary',
      form.intermediarySection
        ? { op: 'clickLink', text: form.intermediarySection }
        : { op: 'clickLink', text: 'Declaration from Intermediary', numbered: true },
      { closeErrors: true },
    );
    add('Declaration shown', { op: 'pause', ms: 800 }, { closeErrors: true });
    add("Intermediary's place of signing", {
      op: 'setField',
      selector: '#IntermediaryDeclarationPlace',
      value: p.intermediaryPlace,
    });
  } else byHand.push("intermediary's place of signing");

  return { ok: true, steps, byHand };
}
