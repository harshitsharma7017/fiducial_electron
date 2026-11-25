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
// (Recording niva-bupa-2026-11-24T07-46-11-920Z: the plan list loads about 5 seconds after the page
// opens; the "Only for Child Policy" question is not always asked; with no add-ons, the premium
// shows by the period as soon as the sum insured is chosen, and Plan Summary shows the same.)
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
/** Plan Summary, after Customize Your Plan's Continue (recording of 24 November 2026). */
export const NIVA_SUMMARY_ROUTE = '#/new-premiumcalculator/plan-summary';
/** The policy period radios, which show the premium. */
export const NIVA_PREMIUM_GROUP = 'ion-radio-group[formcontrolname="premium"]';
const SUGGESTING_BOX =
  'input[aria-autocomplete="list"], input.mat-autocomplete-trigger, input.mat-mdc-autocomplete-trigger';
/**
 * The typing boxes on the page before "I Know My Plan" (marked then): the autocomplete ones, and
 * any Angular Material text box (the City box, mat-input-11 in the recording of 24 November 2026).
 */
const BOXES_BEFORE = `${SUGGESTING_BOX}, input[id^="mat-input-"]`;
/**
 * The City box: a Material text box there before "I Know My Plan", not a date of birth, not
 * read-only, never the plan box.
 */
const CITY_BOX =
  'input[id^="mat-input-"][data-fqf-before]:not([data-fqf-box="plan"]):not([readonly]):not([placeholder="DD/MM/YYYY"]):not([type="hidden"])';
/** A box one types into (the plan and City boxes): not a date of birth, not read-only. */
const TYPING_BOX = [...SUGGESTING_BOX.split(',').map((x) => x.trim()), 'input[id^="mat-input-"]']
  .map((x) => `${x}:not([readonly]):not([placeholder="DD/MM/YYYY"])`)
  .join(', ');
/** The plan box, once the Plan step has named it. */
const PLAN_BOX = 'input[data-fqf-box="plan"]';
/** A suggesting box not on the page before "I Know My Plan" (markPresent). */
const NOT_MARKED_SUGGESTING_BOX = SUGGESTING_BOX.split(',')
  .map((s) => `${s.trim()}:not([data-fqf-before])`)
  .join(', ');

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

  // 1. Basic Details. A tab left in "Plan Recommendation" mode (an earlier run) is set back first,
  // so "I Know My Plan" is pressed afresh and the plan dropdown loads again.
  add(
    'I Know My Plan',
    {
      op: 'ensureShown',
      shown: { text: 'I Know My Plan' },
      open: { text: 'Plan Recommendation' },
      timeoutMs: 5000,
    },
    { optional: true },
  );
  // The boxes on the page before "I Know My Plan" (the City box) are marked: the
  // plan box is the one that appears after it (recording of 24 November 2026: mat-input-11, the
  // city, is there from the start; mat-input-12, the plan, appears once it is pressed).
  add('I Know My Plan', {
    op: 'markPresent',
    selector: BOXES_BEFORE,
    unlessText: 'Plan Recommendation',
  });
  add('I Know My Plan', {
    op: 'ensureShown',
    shown: { text: 'Plan Recommendation' },
    open: { text: 'I Know My Plan' },
    timeoutMs: 8000,
  });
  // First the plan dropdown must have appeared (it takes a moment), then 2 seconds before anything
  // is filled (request of 24 November 2026); nothing goes on without it.
  // The plan box is recognised by its caption ("Select Plan", not "City"), and named: Niva Bupa's
  // plan and City boxes suggest alike, and which one is drawn first cannot be relied on. Only when
  // no caption is found does the box that appeared after "I Know My Plan" do.
  add('Plan', {
    op: 'nameBox',
    name: 'plan',
    selector: TYPING_BOX,
    near: 'Select Plan',
    avoid: 'City',
    fallback: NOT_MARKED_SUGGESTING_BOX,
    fallbackAfterMs: 5000,
    timeoutMs: 20000,
  });
  add('Plan', { op: 'pause', ms: 2000 });
  // The plan box is the suggesting box that appears once "I Know My Plan" is pressed (under "Select
  // Plan"): the run waits for it, and never takes the City box for it (both suggest as you type).
  // When the page was already in this mode (nothing marked), it is the first suggesting box.
  add(
    'Plan',
    {
      op: 'pickOption',
      selector: PLAN_BOX,
      type: NIVA_HEALTH_PLAN_OPTION[run.plan],
      options: nivaPlanOptions(run, members),
      timeoutMs: 15000,
      // Niva Bupa loads its plans after the page opens (about 5 seconds in the recording of 24
      // November 2026), and fills its list only once something is typed: the plan is typed, and
      // typed again every 1.5 seconds, until the list shows (up to 20 seconds).
      suggestMs: 20000,
      // Named, so the City step never takes it.
      markAs: 'plan',
    },
    { keep: 'plan' },
  );
  // Before the client's details, the plan dropdown is checked again: still shown, and showing the
  // plan picked (not just the name typed); then 2 seconds before anything else is filled (choosing
  // the plan draws the members' boxes again: the date box's caption changes).
  add('Plan', { op: 'waitFor', selector: PLAN_BOX, timeoutMs: 10000 });
  add('Plan', {
    op: 'waitForValue',
    selector: PLAN_BOX,
    rejectValues: [NIVA_HEALTH_PLAN_OPTION[run.plan]],
    timeoutMs: 5000,
  });
  add('Plan', { op: 'pause', ms: 2000 });
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
    // The City box: by its caption ("City", not "Select Plan"), never the plan box; else a box
    // there before "I Know My Plan".
    add(
      'City',
      {
        op: 'nameBox',
        name: 'city',
        selector: `${TYPING_BOX.split(',')
          .map((x) => `${x.trim()}:not([data-fqf-box="plan"])`)
          .join(', ')}`,
        near: 'City',
        avoid: 'Select Plan',
        fallback: CITY_BOX,
        fallbackAfterMs: 2000,
        timeoutMs: 8000,
      },
      optional('city (the City box was not found)'),
    );
    add(
      'City',
      {
        op: 'typeahead',
        // The City box named above (never the plan box).
        selector: 'input[data-fqf-box="city"]',
        value: city,
        timeoutMs: 8000,
      },
      optional(`city (Niva Bupa does not list "${city}" as written)`),
    );
    // The plan dropdown must still show the plan picked (the city was not typed into it): a
    // "Plan" step, so the run stops rather than go on with the plan changed.
    add('Plan', {
      op: 'waitForValue',
      selector: PLAN_BOX,
      rejectValues: [NIVA_HEALTH_PLAN_OPTION[run.plan], city],
      timeoutMs: 3000,
    });
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
  // Not always asked (the recording of 24 November 2026 shows it for some plans only): left alone
  // when not shown, and not listed for the advisor.
  add(
    'Only for Child Policy',
    {
      op: 'ionRadio',
      group: { question: 'Only for Child Policy' },
      label: 'NO',
      match: 'exact',
      timeoutMs: 3000,
    },
    { optional: true },
  );
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
  // Choosing the sum insured and the period makes Niva Bupa work the premium out (the recording of
  // 24 November 2026 shows it by the period, with nothing more pressed). Add-ons and the Tiered
  // Network change it only once Calculate Premium is pressed: only then is it pressed.
  const extras = run.addOns.length > 0 || run.tieredNetwork;
  if (extras) {
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
    // The footer reads Calculate Premium only once Key Add-Ons is scrolled to, and Niva Bupa's page
    // scrolls inside its own panel (Ionic's ion-content), not the window: the panel is scrolled
    // there (then through, a step at a time) until the button shows, and it is pressed.
    add(
      'Calculate Premium',
      { op: 'revealButton', text: 'Calculate Premium', near: 'Key Add-Ons', timeoutMs: 20000 },
      { popupAfter: true },
    );
  }
  // Niva Bupa works the premium out (again) and shows it by the policy period.
  add('Premium', { op: 'pause', ms: 3000 });
  add(
    'Premium',
    {
      op: 'ionRadioRead',
      group: { selector: NIVA_PREMIUM_GROUP },
      timeoutMs: 20000,
      // The client's sum insured and period, not Niva Bupa's recommended ones (a handed-over form
      // is read only once the advisor has chosen them).
      requires: { select: nivaRupees(run.sumInsured), label: `${run.years} Year` },
    },
    { keep: 'premium' },
  );
  byHand.push(
    `check the ${NIVA_HEALTH_PLAN_NAMES[run.plan]} options Niva Bupa left as they were (Acute Care Option, Room Category, Deductable)`,
  );
  return { ok: true, steps, byHand };
}
