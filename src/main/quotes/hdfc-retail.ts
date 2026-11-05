// HDFC ERGO: PIE's retail health forms, Energy, Optima Secure and Optima Restore
// (pie.hdfcergo.com/<Product>/CreateQuote), new business, for a saved health client, to work the
// premium out. From the recording hdfc-ergo-2026-11-05T11-50-09-251Z, in which Energy and Optima
// Secure were filled through PRODUCT DETAILS to BASIC DETAILS and Optima Restore was opened for
// renewals only. One layout:
// - a questionnaire: "I would like to Insure" (#ProductType_Individual / #ProductType_Family), and
//   boxes that open a list of links when pressed: Business Type (#BusinessType: New Business),
//   Optima Secure's Plan Type (#OptimaSecurePlanType), Policy Period ("1 Year"), Sum Insured in
//   lakh ("5"), I stay in (#IStayIn: Mumbai … Any other city); the age of the individual or eldest
//   member (#AgeOfIndividual, #AgeOfIndividualFmly); Energy's existing health insurance (Yes/No
//   buttons, its sum insured);
// - PRODUCT DETAILS: Energy's Plan Type (#PlanType: SILVER WITH NO COPYAMENT …), the members
//   ("1Adult+1Child"), whether the intermediary is a POSP (#PospType) and the SP/POSP name or code
//   (#VcSppospName, suggesting as you type);
// - BASIC DETAILS.
// The recording did not reach a premium on these forms: after BASIC DETAILS the run reads the
// premium under the captions PIE uses on its other forms ("Total Payable Premium", …), and if
// none shows, stops and says so. Riders and add-ons are left as PIE sets them. Steps the recording
// did not show on a form (Optima Restore borrows Energy's and Optima Secure's) are optional and
// listed for the advisor if the form does not take them. The run never presses Generate Quote,
// Generate Proposal or anything after.
import { ageOn, type ClientInput, type ClientMember } from '../../shared/contracts/client';
import { HDFC_RETAIL_NAMES, type HdfcRetailRun } from '../../shared/insurers/hdfc';
import type { PageOp } from './page-ops';
import { PIE_COMPLAINTS, PIE_PREMIUM_LABEL, type HdfcPlan, type HdfcStep } from './hdfc-motor';

/** Captions PIE may write a premium after (its motor and MST forms: Total Payable Premium). */
export const PIE_PREMIUM_CAPTIONS = [
  'Total Premium',
  'Premium Payable',
  'Final Premium',
  'Net Premium',
];

const who = (m: ClientMember): string =>
  m.relationship === 'self' ? 'proposer (self)' : m.relationship.replace(/_/g, ' ');

export function planHdfcRetailQuote(
  client: ClientInput,
  run: HdfcRetailRun,
  options: { today: Date },
): HdfcPlan {
  const name = HDFC_RETAIL_NAMES[run.product];
  const adults = client.members.filter(
    (m) => m.relationship !== 'son' && m.relationship !== 'daughter',
  );
  const children = client.members.filter(
    (m) => m.relationship === 'son' || m.relationship === 'daughter',
  );
  const problems: string[] = [];
  for (const m of client.members) {
    if (!m.dateOfBirth) problems.push(`Add the ${who(m)}'s date of birth.`);
  }
  if (run.cover === 'individual' && client.members.length > 1) {
    problems.push(`An individual ${name} quote covers one member: choose Family for this client.`);
  }
  if (run.product === 'energy' && run.cover === 'family') {
    problems.push('PIE offers Energy for an individual only.');
  }
  if (adults.length === 0 && run.cover === 'family') {
    problems.push(`${name} for a family needs at least one adult.`);
  }
  if (problems.length > 0) return { ok: false, problems };

  const eldest = Math.max(...client.members.map((m) => ageOn(m.dateOfBirth!, options.today)));
  const steps: HdfcStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, more: Partial<HdfcStep> = {}) =>
    steps.push({ label, op, ...more });
  const optional = (ifMissed: string): Partial<HdfcStep> => ({ optional: true, ifMissed });
  const pick = (label: string, input: string, option: string, more: Partial<HdfcStep> = {}) =>
    add(label, { op: 'pickFromList', input, option, timeoutMs: 8000 }, more);

  // The questionnaire.
  add(
    'I would like to Insure',
    {
      op: 'clickSelector',
      selector: run.cover === 'family' ? '#ProductType_Family' : '#ProductType_Individual',
      timeoutMs: 15000,
    },
    run.product === 'energy' ? optional('I would like to Insure (Individual)') : {},
  );
  pick('Business type', '#BusinessType', 'New Business');
  add('Business type', { op: 'pause', ms: 800 });
  if (run.product === 'optima-secure') {
    pick('Plan type', '#OptimaSecurePlanType', run.plan ?? 'Optima Secure');
  }
  add('Age', {
    op: 'setField',
    selector: '#AgeOfIndividualFmly, #AgeOfIndividual',
    value: String(eldest),
  });
  if (run.product !== 'optima-secure') {
    pick('I stay in', '#IStayIn', run.city, optional(`I stay in (${run.city})`));
    pick(
      'Cover sufficient for',
      '#CoverSufficientFor',
      String(run.years),
      optional(
        `"This cover should be sufficient for" (${run.years} year${run.years > 1 ? 's' : ''})`,
      ),
    );
  }
  if (run.product === 'energy') {
    add('Existing health insurance', {
      op: 'clickSelector',
      selector: 'button[name="ExistingHealthInsurance"]',
      text: run.existingSumInsured ? 'Yes' : 'No',
      timeoutMs: 5000,
    });
    if (run.existingSumInsured) {
      add('Existing sum insured', {
        op: 'setField',
        selector: '[name="ExistingSI"]',
        value: String(run.existingSumInsured),
      });
    }
  }
  if (run.product !== 'energy') {
    pick(
      'Policy period',
      '[name="PolicyPeriod"]',
      `${run.years} Year`,
      optional(`policy period (${run.years} year${run.years > 1 ? 's' : ''})`),
    );
    if (run.sumInsuredLacs) {
      pick(
        'Sum insured',
        '[name="SumInsuredInLacs"]',
        String(run.sumInsuredLacs),
        optional(`sum insured (${run.sumInsuredLacs} lakh)`),
      );
    } else byHand.push('sum insured (left as PIE sets it)');
  }
  add(
    'PRODUCT DETAILS',
    {
      op: 'clickSelector',
      selector: 'button[name="name"], button',
      text: 'PRODUCT DETAILS',
      timeoutMs: 5000,
    },
    { popupAfter: true },
  );
  add('PRODUCT DETAILS', { op: 'pause', ms: 1500 });

  // Product details.
  if (run.product === 'energy') {
    pick('Plan type', '#PlanType', run.plan ?? 'SILVER WITH NO COPYAMENT');
    pick('Policy period', '[name="PolicyPeriod"]', '1 Year', optional('policy period (1 year)'));
  }
  if (run.cover === 'family') {
    pick(
      'Members',
      '[name="IndividualFamilyPlan"]',
      `${adults.length}Adult+${children.length}Child`,
      optional(`members (${adults.length} adult, ${children.length} child)`),
    );
  }
  pick('POSP', '#PospType', 'POSP', optional('whether the intermediary is a POSP'));
  add(
    'SP/POSP name or code',
    {
      op: 'pickOption',
      selector: '#VcSppospName',
      type: run.posp,
      options: [run.posp],
      startsWith: true,
      timeoutMs: 8000,
    },
    optional(`SP/POSP name or code (${run.posp})`),
  );
  add(
    'BASIC DETAILS',
    {
      op: 'clickSelector',
      selector: 'button[name="name"], button',
      text: 'BASIC DETAILS',
      timeoutMs: 5000,
    },
    { popupAfter: true },
  );
  add('Premium', { op: 'pause', ms: 2000 });
  add(
    'Premium',
    {
      op: 'readAmount',
      label: PIE_PREMIUM_LABEL,
      alsoLabels: PIE_PREMIUM_CAPTIONS,
      errorPattern: PIE_COMPLAINTS,
      timeoutMs: 25000,
    },
    { keep: 'premium', popupAfter: true },
  );
  byHand.push(`the ${name} riders and add-ons (left as PIE sets them)`);
  return { ok: true, steps, byHand };
}
