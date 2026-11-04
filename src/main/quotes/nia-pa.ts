// New India: three Personal Accident quote forms (QuoteNonCustomer.html) for a health client's
// proposer ("Self"), with what the advisor chooses for the run. Built from the recording
// new-india-2026-11-04T10-41-14-769Z, in which each form was opened from the dashboard (Product
// Selection, PERSONAL ACCIDENT, the policy's tile), New India's PAN question answered, and the
// sections opened. Answering "Yes" to a claim in the previous three years brought New India's
// alert that the policy cannot be issued through the portal. Nothing was typed and no premium was
// worked out, so dates are typed as dd/mm/yyyy and the run stops before Save & Calculate.
//   Janata PA Sukshma Bima and Personal Janta (one model, miscJYModelObj): Policy Details (the
//     previous claim; Sukshma also its group type), Policy Period (duration), Insured Details
//     (status, occupation, date of birth, gender, disabilities, nominee, sum insured; Sukshma
//     also the insured's name and address and the owner or beneficiary; Janta the excess).
//   Pension Protect (miscPWModelObj): Policy Details (new policy, previous claim), Pension Details
//     (name, date of birth, monthly pension, physical defects, last organisation, previous claim),
//     Nominee Details.
import type { ClientInput } from '../../shared/contracts/client';
import {
  NIA_PA_FORM_NAMES,
  NIA_PA_STATUSES,
  type NiaPaForm,
  type NiaPaRun,
} from '../../shared/insurers/nia-pa';
import type { NiaHealthStep } from './nia-health';
import type { PageOp } from './page-ops';
import { policyHolderSteps } from './nia-travel';

const HEADINGS: Record<NiaPaForm, string> = {
  sukshma: 'Janata PA Sukshma Bima Policy Insurance',
  janta: 'Personal Janta Insurance Insurance',
  pension: 'New India Pension Protect Personal Accident Policy Insurance',
};

/** The form New India opens: its heading and the dashboard tile that likely opens it. */
export function niaPaForm(form: NiaPaForm): { name: string; heading: string; tiles: string[] } {
  const heading = HEADINGS[form];
  return {
    name: NIA_PA_FORM_NAMES[form],
    heading,
    tiles: [heading.replace(/\s*Insurance$/, '')],
  };
}

/** The Janata forms' occupation list (Gramin), matched by name to the client's occupation. */
const GRAMIN = [
  'Agriculturalist',
  'Business',
  'Driver',
  'Housewife',
  'Others',
  'Professional',
  'Retired',
  'Service',
  'Student',
];
/** Nominee relationships as each form lists them; others are left to the advisor. */
const JANATA_NOMINEE: Record<string, string> = {
  spouse: 'Spouse',
  father: 'Father',
  mother: 'Mother',
  son: 'Son',
  daughter: 'Daughter',
  brother: 'Brother',
  sister: 'Sister',
};
const PENSION_NOMINEE: Record<string, string> = {
  spouse: 'Spouse',
  father: 'Father',
  mother: 'Mother',
  father_in_law: 'Father-in-law',
  mother_in_law: 'Mother-in-law',
  son: 'Son',
  daughter: 'Daughter',
};
const GENDER = { male: 'Male', female: 'Female', transgender: 'Third Gender' } as const;

export type NiaPaPlan =
  { ok: true; steps: NiaHealthStep[]; byHand: string[] } | { ok: false; problems: string[] };

export function planNiaPaQuote(
  client: ClientInput,
  run: NiaPaRun,
  options: { noClaims: boolean; noDisabilities: boolean },
): NiaPaPlan {
  const name = NIA_PA_FORM_NAMES[run.form];
  const self = client.members.find((m) => m.relationship === 'self');
  const problems: string[] = [];
  if (!self) problems.push('The client needs a member who is "Self" (the insured).');
  else {
    if (!self.dateOfBirth) problems.push("Add the proposer's (self) date of birth.");
    if (!self.gender) problems.push("Add the proposer's (self) gender.");
  }
  if (!options.noClaims) {
    problems.push(
      `New India does not issue ${name} through its portal after a claim in the previous three years. Confirm there was none, or quote it with New India's office.`,
    );
  }
  if (problems.length > 0 || !self) return { ok: false, problems };

  const steps: NiaHealthStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, more: Partial<NiaHealthStep> = {}) =>
    steps.push({ label, op, ...more });
  const field = (label: string, selector: string, value: string) =>
    add(label, { op: 'setField', selector, value });
  const section = (link: string, selector: string) =>
    add(link, { op: 'ensureShown', shown: { selector }, open: { link }, timeoutMs: 8000 });
  const { customer, proposal } = client;

  policyHolderSteps(
    {
      name: customer.name,
      gender: self.gender,
      maritalStatus: client.proposerMaritalStatus,
      dateOfBirth: self.dateOfBirth,
      address: proposal?.address,
      phone: customer.phone,
      email: customer.email,
      landline:
        proposal?.landlineStdCode && proposal.landlineNumber
          ? proposal.landlineStdCode + proposal.landlineNumber
          : undefined,
      eInsuranceAccountNumber: proposal?.eInsuranceAccountNumber,
    },
    steps,
    byHand,
  );

  if (run.form === 'pension') {
    section('Policy Details', '#PolicyType');
    field('Policy type', '#PolicyType', 'new policy');
    field('Claim in the previous 3 years', '#vPreviousClaim', 'No');
    section('Pension Details', '#insuredName');
    if (customer.name.length <= 30) field('Name of the insured', '#insuredName', customer.name);
    else byHand.push('name of the insured (New India takes 30 characters)');
    add('Date of birth', { op: 'typeDate', input: '#dateOfBirth_Pol', date: self.dateOfBirth! });
    field('Loss of monthly pension', '#lossOfMonthlyPension', String(run.monthlyPensionRupees));
    // New India works the sums insured out from the monthly pension.
    add('Loss of monthly pension', { op: 'pause', ms: 1000 });
    if (options.noDisabilities) field('Any physical defects', '#physicalDefects', 'No');
    else byHand.push('physical defects');
    field('Organisation before retirement', '#organisationBeforeRetirement', run.organisation);
    field('Any previous claim', '#previousClaim', 'No');
    byHand.push(
      'capital sum insured (if New India does not work it out)',
      'medical fitness certificate',
      'special conditions',
    );
    section('Nominee Details', '#nomineeName1');
    if (proposal?.nomineeName && proposal.nomineeName.length <= 30) {
      field('Nominee 1', '#nomineeName1', proposal.nomineeName);
    } else byHand.push("nominee's name (30 characters at most)");
    const relation = proposal?.nomineeRelationship
      ? PENSION_NOMINEE[proposal.nomineeRelationship]
      : undefined;
    if (relation) field("Nominee 1's relationship", '#relationWithNominee1', relation);
    else byHand.push("nominee's relationship");
    byHand.push("nominee's date of birth");
    return { ok: true, steps, byHand };
  }

  // Janata PA Sukshma Bima and Personal Janta.
  section('Policy Details', '#vPreviousClaim');
  field('Claim in the previous 3 years', '#vPreviousClaim', 'No');
  if (run.form === 'sukshma') byHand.push('type of group');
  section('Policy Period', '#term');
  field('Policy duration', '#term', String(run.term));
  section('Insured Details', '#vStatusInsured_1');
  if (run.form === 'sukshma') {
    if (customer.name.length <= 50) {
      field('Name of the insured', '#vNameInsured_1', customer.name);
    } else byHand.push('name of the insured (50 characters at most)');
    if (proposal?.address) {
      field('Address of the insured', '#vAddressInsured_2', proposal.address.slice(0, 100));
    } else byHand.push('address of the insured');
    byHand.push('name and address of the owner or beneficiary');
  }
  field('Status of the insured', '#vStatusInsured_1', NIA_PA_STATUSES[run.status]);
  const occupation = GRAMIN.find(
    (o) => o.toLowerCase() === proposal?.occupation?.trim().toLowerCase(),
  );
  if (occupation) field('Occupation (Gramin)', '#vOccupationGramin_1', occupation);
  else byHand.push("occupation (New India's Gramin list)");
  add('Date of birth', { op: 'typeDate', input: '#vDateBirth_1', date: self.dateOfBirth! });
  field('Gender', '#vSexInsured_1', GENDER[self.gender!]);
  if (options.noDisabilities) {
    field('Existing physical disabilities', '#vDetailsExistingPhysicalDisabilities_2', 'None');
  } else byHand.push('details of existing physical disabilities');
  if (proposal?.nomineeName && proposal.nomineeName.length <= 20) {
    field('Nominee name', '#vNomineesName_1', proposal.nomineeName);
  } else byHand.push("nominee's name (New India takes 20 characters)");
  if (proposal?.nomineeAddress && proposal.nomineeAddress.length <= 50) {
    field('Nominee address', '#vNomineesAddress_1', proposal.nomineeAddress);
  } else byHand.push("nominee's address (50 characters at most)");
  const relation = proposal?.nomineeRelationship
    ? (JANATA_NOMINEE[proposal.nomineeRelationship] ?? 'Any other')
    : undefined;
  if (relation) field('Relationship with the insured', '#vRelationshipNomineeInsured_2', relation);
  else byHand.push("nominee's relationship");
  byHand.push('details of relationship');
  if (run.form === 'sukshma') byHand.push("nominee's date of birth (optional)");
  field('Sum insured', '#vSumInsuredRupees_1', run.sumInsured);
  if (run.form === 'janta') field('Excess (%)', '#vExcess_2', run.excess);
  return { ok: true, steps, byHand };
}
