// Bajaj Allianz's Personal Accident form (src/shared/insurers/bajaj.ts), for a health client's
// proposer ("Self"), by the advisor's path of the recording bajaj-allianz-2026-11-25T06-17-21-912Z:
//   Policy Plan (#policy_plan), Policy Tenure (a searchable list: "1Y", "2Y", "3Y" with its
//   discount), Pincode (Bajaj fills the city and GST state), Family Income; the member: First Name,
//   Gender, Date of Birth (dd/mm/yyyy), Gross Monthly Income, Occupation (Bajaj's codes); the
//   covers' sums insured (death, permanent partial and permanent total disability); then Calculate
//   Premium, Bajaj's quick quote (nothing is saved or sent). The premium is read by the captions
//   premiums commonly have (the recording did not reach one); Bajaj's own message (a toast with a
//   "Reference code") is reported in its words.
import type { ClientInput, ClientMember } from '../../shared/contracts/client';
import { BAJAJ_PA_PLANS, type BajajPaRun } from '../../shared/insurers/bajaj';
import { GUESSED_READING } from './hand-over';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

export interface BajajStep extends PlanStep {
  /** After this step, Bajaj's message (an error toast) stops the run. */
  messageAfter?: boolean;
}

export type BajajPlan =
  { ok: true; steps: BajajStep[]; byHand: string[] } | { ok: false; problems: string[] };

/** The tenure box: Bajaj's searchable list ("Policy Tenure*" while empty). */
const TENURE_BOX =
  'input.vs__search[placeholder="Policy Tenure*"], #vs1__combobox input.vs__search, #vs1__combobox input[type="search"]';
/** Bajaj's error toast and its messages ("… Reference code : '…'"). */
export const BAJAJ_MESSAGE = 'Reference code|Please select|Timeout occurred|is required|invalid';

const GENDER: Record<NonNullable<ClientMember['gender']>, string> = {
  male: 'M',
  female: 'F',
  transgender: 'T',
};

/** Where Bajaj's premium is read: the captions premiums commonly have. */
export const BAJAJ_PREMIUM: Extract<PageOp, { op: 'readAmount' }> = {
  ...(GUESSED_READING as Extract<PageOp, { op: 'readAmount' }>),
  label: 'Total Premium',
  alsoLabels: [
    'Total Payable Premium',
    'Total Premium Payable',
    'Premium Payable',
    'Final Premium',
    'Gross Premium',
    'Net Premium',
    'Premium (incl',
  ],
};

export function planBajajPaQuote(client: ClientInput, run: BajajPaRun): BajajPlan {
  const self = client.members.find((m) => m.relationship === 'self');
  const problems: string[] = [];
  if (!self) {
    problems.push("Bajaj's Personal Accident form insures the proposer: add the proposer (Self).");
  } else {
    if (!self.dateOfBirth) problems.push("Add the proposer's date of birth.");
    if (!self.gender) problems.push("Add the proposer's gender.");
  }
  if (problems.length > 0 || !self) return { ok: false, problems };

  const steps: BajajStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, more: Partial<BajajStep> = {}) =>
    steps.push({ label, op, ...more });
  const [first, ...rest] = client.customer.name.trim().split(/\s+/);
  const amount = (n: number) => String(n);

  // Basic Details.
  add('Policy Plan', { op: 'waitFor', selector: '#policy_plan', timeoutMs: 25000 });
  // Bajaj loads its plans after the page shows (getplanlist): the plan's option is waited for.
  add('Policy Plan', { op: 'setField', selector: '#policy_plan', value: run.plan, waitMs: 25000 });
  // Choosing the plan loads its details (the tenure list among them).
  add('Policy Plan', { op: 'pause', ms: 1500 });
  add('Policy Tenure', {
    op: 'pickOption',
    selector: TENURE_BOX,
    type: String(run.tenureYears),
    options: [`${run.tenureYears}Y`],
    startsWith: true,
    timeoutMs: 10000,
    suggestMs: 8000,
    // A vue-select: the choice shows beside the box, which is emptied.
    shownIn: '.vs__selected',
  });
  add('Pincode', { op: 'setField', selector: '#pincode', value: client.pincode });
  // Bajaj looks the pincode up and fills the city.
  add('Pincode', { op: 'waitForValue', selector: '#city', timeoutMs: 15000, soft: true });
  add('Family Income', {
    op: 'setField',
    selector: '#familyIncome',
    value: amount(run.familyIncome),
  });
  // Member Details: the proposer ("Self").
  add('First Name', { op: 'setField', selector: '#member_firstname0', value: first ?? '' });
  if (rest.length > 0) {
    add(
      'Last Name',
      { op: 'setField', selector: '#member_lastname0', value: rest.join(' ') },
      { optional: true },
    );
  }
  add('Gender', {
    op: 'setField',
    selector: '#member_gender0',
    value: GENDER[self.gender!],
    waitMs: 10000,
  });
  add('Date of Birth', { op: 'typeDate', input: '#member_dob0', date: self.dateOfBirth! });
  add('Gross Monthly Income', {
    op: 'setField',
    selector: '#member_income0',
    value: amount(run.monthlyIncome),
  });
  add('Occupation', {
    op: 'setField',
    selector: '#member_occupation0',
    value: run.occupation,
    waitMs: 10000,
  });
  // Cover Details: the sums insured given (Bajaj asks at least one).
  const covers: [string, string, number | undefined][] = [
    ['Death Sum Insured', '#deathSumInsured0', run.deathSumInsured],
    [
      'Permanent Partial Disability Sum Insured',
      '#permanentPartialDisabilitySumInsured0',
      run.partialDisabilitySumInsured,
    ],
    [
      'Permanent Total Disability Sum Insured',
      '#permanentTotalDisabilitySumInsured0',
      run.totalDisabilitySumInsured,
    ],
  ];
  for (const [label, selector, value] of covers) {
    if (value !== undefined) add(label, { op: 'setField', selector, value: amount(value) });
  }
  // Bajaj's quick quote (nothing is saved), then the premium it shows.
  add(
    'Calculate Premium',
    { op: 'clickButton', text: 'Calculate Premium', timeoutMs: 10000 },
    { messageAfter: true },
  );
  add(
    'Premium',
    { ...BAJAJ_PREMIUM, fresh: true, timeoutMs: 45000, errorPattern: BAJAJ_MESSAGE },
    { keep: 'premium' },
  );
  if (run.plan !== '8428') {
    byHand.push(
      `check what ${BAJAJ_PA_PLANS[run.plan]} asks besides (only Global Personal Guard was recorded)`,
    );
  }
  return { ok: true, steps, byHand };
}
