// Niva Bupa: UNO's premium calculator for ReAssure 2.0, ReAssure 3.0 and Health Recharge
// (top-up), for a saved health client, by the advisor's path of the recording
// niva-bupa-2026-11-05T08-20-27-977Z (the earlier recording, 07-37-29-027Z, and the advisor's
// screenshots show the same first step):
//   0. UNO's home page (#/landing-page): the Premium Calculator tile.
//   1. Basic Details (#/new-premiumcalculator): "I Know My Plan" (the toggle then reads "Plan
//      Recommendation"), the plan by name in a box suggesting plans ("ReAssure2.0 Individual",
//      "ReAssure2.0 Family Floater"); Adult and Child counters ("-" [n] "+"); dates of birth,
//      read-only boxes with Angular Material calendars: one per member ("Adult1 DOB"), or for a
//      family floater one only ("Eldest Member DOB"); the city (suggesting cities, "Top Cities")
//      and "Phone no. (optional)"; three NO/YES questions (Ionic radios): transfer of a current
//      policy (YES shows "Previous Policy End Date"), a medical practitioner among the insured,
//      "Only for Child Policy". Continue.
//   2. Customize Your Plan (#/new-premiumcalculator/third-step): the sum insured (an Ionic dropdown:
//      ₹ 500,000 to ₹ 10,000,000), the policy period (radios "1 Year ₹…", "2 Year ₹…" in the group
//      formcontrolname="premium"), Acute Care Option, Room Category and Deductable dropdowns, the
//      Key Add-Ons (a "+ Add" per add-on row; Tiered Network's row has "Show more", opening a list
//      to opt in). The footer reads Continue at the top and Calculate Premium once Key Add-Ons is
//      scrolled to. Calculate Premium works the premium out again and shows it by the policy
//      period; Continue then leads to a summary asking the customer's name, email and phone.
// The run does all of that up to Calculate Premium, presses it (the calculator's own sum, nothing
// is saved or sent to the customer) and reads the premium. It never presses the Continue after it.
// Acute Care, Room Category and Deductable stay as Niva Bupa sets them. Health Recharge's own
// boxes were not in the recording: a top-up stops where Niva Bupa asks something not known.
import { ageOn, type ClientInput, type ClientMember } from '../../shared/contracts/client';
import {
  NIVA_HEALTH_PLAN_NAMES,
  NIVA_HEALTH_PLAN_OPTION,
  type NivaRun,
} from '../../shared/insurers/niva-health';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

export const NIVA_FIRST_STEP_HEADING = 'Who would you like to insure today?';
/** The tile on UNO's home page that opens the calculator. */
export const NIVA_CALCULATOR_TILE = 'Premium Calculator';
/** UNO's home page, as its address ends. */
export const NIVA_HOME_ROUTE = '#/landing-page';
/** The calculator's first step, as its address ends. */
export const NIVA_CALCULATOR_ROUTE = '#/new-premiumcalculator';
/** The policy period radios, which show the premium. */
export const NIVA_PREMIUM_GROUP = 'ion-radio-group[formcontrolname="premium"]';
const SUGGESTING_BOX =
  'input[aria-autocomplete="list"], input.mat-autocomplete-trigger, input.mat-mdc-autocomplete-trigger';

export interface NivaHealthStep extends PlanStep {
  /** After this step, a Niva Bupa message (an alert) stops the run. */
  popupAfter?: boolean;
  /** A date box Niva Bupa may not ask (a family floater asks the eldest member's only). */
  skipIfNoBox?: boolean;
}

export type NivaHealthPlanResult =
  { ok: true; steps: NivaHealthStep[]; byHand: string[] } | { ok: false; problems: string[] };

const ADULTS: ClientMember['relationship'][] = [
  'self',
  'spouse',
  'father',
  'mother',
  'father_in_law',
  'mother_in_law',
];

const who = (m: ClientMember): string =>
  m.relationship === 'self' ? 'proposer (self)' : m.relationship.replace(/_/g, ' ');

/** A sum insured as Niva Bupa's list writes it: "₹ 2,000,000". */
export const nivaRupees = (rupees: number): string => `₹ ${rupees.toLocaleString('en-US')}`;

/** The names Niva Bupa's plan box may give the plan for this cover, in order of preference. */
export function nivaPlanOptions(run: NivaRun, members: number): string[] {
  const kind = members > 1 ? 'Family Floater' : 'Individual';
  const name = NIVA_HEALTH_PLAN_OPTION[run.plan];
  return run.plan === 'health-recharge'
    ? [`${name} ${kind}`, `HealthRecharge ${kind}`, `Health Recharge ${kind}`]
    : [`${name} ${kind}`];
}

/** Checks the client and the run against the calculator and lists every step. */
export function planNivaHealthQuote(
  client: ClientInput,
  run: NivaRun,
  options: { today: Date },
): NivaHealthPlanResult {
  const problems: string[] = [];
  // Eldest first (earliest date of birth).
  const byAge = (a: ClientMember, b: ClientMember) =>
    (a.dateOfBirth ?? '').localeCompare(b.dateOfBirth ?? '');
  const adults = client.members.filter((m) => ADULTS.includes(m.relationship)).sort(byAge);
  const children = client.members
    .filter((m) => m.relationship === 'son' || m.relationship === 'daughter')
    .sort(byAge);
  if (adults.length === 0) {
    problems.push("Niva Bupa's calculator needs at least one adult (self, spouse or a parent).");
  }
  for (const m of [...adults, ...children]) {
    if (!m.dateOfBirth) problems.push(`Add the ${who(m)}'s date of birth.`);
  }
  for (const m of adults) {
    if (m.dateOfBirth && ageOn(m.dateOfBirth, options.today) < 18) {
      problems.push(
        `Niva Bupa counts the ${who(m)} as an adult, and its calendar takes adults of 18 or over only.`,
      );
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const steps: NivaHealthStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, more: Partial<NivaHealthStep> = {}) =>
    steps.push({ label, op, ...more });
  const members = adults.length + children.length;
  const optional = (ifMissed: string): Partial<NivaHealthStep> => ({ optional: true, ifMissed });

  // 1. Basic Details.
  add('I Know My Plan', {
    op: 'ensureShown',
    shown: { text: 'Plan Recommendation' },
    open: { text: 'I Know My Plan' },
    timeoutMs: 8000,
  });
  add(
    'Plan',
    {
      op: 'pickOption',
      selector: SUGGESTING_BOX,
      type: NIVA_HEALTH_PLAN_OPTION[run.plan],
      options: nivaPlanOptions(run, members),
      timeoutMs: 10000,
    },
    { keep: 'plan' },
  );
  // Choosing the plan draws the members' boxes again (the date box's caption changes).
  add('Plan', { op: 'pause', ms: 1500 });
  add('Adults', { op: 'stepper', index: 0, count: adults.length, timeoutMs: 15000 });
  add('Children', { op: 'stepper', index: 1, count: children.length, timeoutMs: 5000 });
  // Eldest first: a family floater asks only the eldest member's date of birth (its first box).
  adults.forEach((m, nth) =>
    add(
      `Date of birth (${who(m)})`,
      { op: 'matDate', counter: 0, nth, date: m.dateOfBirth! },
      { skipIfNoBox: nth > 0 },
    ),
  );
  children.forEach((m, nth) =>
    add(
      `Date of birth (${who(m)})`,
      { op: 'matDate', counter: 1, nth, date: m.dateOfBirth! },
      { skipIfNoBox: true },
    ),
  );
  const city = client.proposal?.city;
  if (city) {
    add(
      'City',
      { op: 'typeahead', selector: SUGGESTING_BOX, value: city, timeoutMs: 8000, last: true },
      optional(`city (Niva Bupa does not list "${city}" as written)`),
    );
  } else {
    byHand.push('city (the client record has none), then run again');
  }
  const phone = client.customer.phone;
  if (phone) {
    add(
      'Phone number',
      { op: 'setField', selector: 'input[maxlength="10"]', value: phone },
      optional('phone number'),
    );
  }
  const answer = (label: string, question: string, yes: boolean) =>
    add(label, {
      op: 'ionRadio',
      group: { question },
      label: yes ? 'YES' : 'NO',
      match: 'exact',
      timeoutMs: 5000,
    });
  answer(
    'Transfer of a current policy',
    'transfer the current health insurance policy',
    run.previousPolicyEndDate !== undefined,
  );
  if (run.previousPolicyEndDate) {
    add('Previous Policy End Date', {
      op: 'matDate',
      label: 'Previous Policy End Date',
      date: run.previousPolicyEndDate,
    });
  }
  answer('Medical practitioner', 'medical practitioner', run.medicalPractitioner);
  answer('Only for Child Policy', 'Only for Child Policy', false);
  // The calculator's own next step: nothing is saved.
  add('Continue', { op: 'clickButton', text: 'Continue', timeoutMs: 5000 }, { popupAfter: true });

  // 2. Customize Your Plan.
  add('Customize Your Plan', {
    op: 'waitFor',
    selector: 'app-third-step ion-select',
    timeoutMs: 25000,
  });
  add('Sum insured', {
    op: 'ionPick',
    option: nivaRupees(run.sumInsured),
    exact: true,
    timeoutMs: 10000,
  });
  add('Policy period', {
    op: 'ionRadio',
    group: { selector: NIVA_PREMIUM_GROUP },
    label: `${run.years} Year`,
    timeoutMs: 10000,
  });
  add(
    'Key Add-Ons',
    { op: 'scrollTo', text: 'Key Add-Ons', timeoutMs: 5000 },
    optional('Key Add-Ons (scroll to it)'),
  );
  for (const name of run.addOns) {
    add(
      `Add-on "${name}"`,
      { op: 'addOn', name, timeoutMs: 5000 },
      optional(`add-on "${name}" (not found on Niva Bupa's list as written)`),
    );
  }
  if (run.tieredNetwork) {
    const tiered = optional('Tiered Network (Show more, then choose the tiered list)');
    add(
      'Tiered Network',
      { op: 'clickInRow', row: 'Tiered Network', text: 'Show more', timeoutMs: 5000 },
      tiered,
    );
    add(
      'Tiered Network',
      {
        op: 'ionRadio',
        group: { selector: 'app-tier-network ion-radio-group' },
        label: 'Tiered List',
        match: 'contains',
        timeoutMs: 8000,
      },
      tiered,
    );
    add('Tiered Network', { op: 'pause', ms: 1500 });
  }
  add(
    'Calculate Premium',
    { op: 'clickButton', text: 'Calculate Premium', timeoutMs: 10000 },
    { popupAfter: true },
  );
  // Niva Bupa works the premium out again and shows it by the policy period.
  add('Premium', { op: 'pause', ms: 3000 });
  add(
    'Premium',
    { op: 'ionRadioRead', group: { selector: NIVA_PREMIUM_GROUP }, timeoutMs: 20000 },
    { keep: 'premium' },
  );
  byHand.push(
    `check the ${NIVA_HEALTH_PLAN_NAMES[run.plan]} options Niva Bupa left as they were (Acute Care Option, Room Category, Deductable)`,
  );
  return { ok: true, steps, byHand };
}
