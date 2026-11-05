// Niva Bupa: the premium calculator in UNO (#/new-premiumcalculator) for ReAssure 2.0, ReAssure
// 3.0 and Health Recharge (top-up), for a saved health client. Built from the recording
// niva-bupa-2026-11-05T07-37-29-027Z. The calculator is an Ionic/Angular Material app in steps:
//   1. "Who would you like to insure today?": Adult and Child counters ("-" [n] "+"), one date of
//      birth box per member under each (read-only: Angular Material's calendar only; it opens on
//      the month 18 years back for adults), the city (a box suggesting Niva Bupa's cities) and the
//      mobile number (10 digits); Continue.
//   2. The plans (#/new-premiumcalculator/second-step): Ionic dropdowns whose lists name each plan
//      with "Individual" (one member) or "Family Floater" (several).
//   3. Policy period, add-ons, terms (third-step); Calculate Premium leads to a summary.
// The recorder of that day did not see Ionic's own controls (dropdowns, radios, checkboxes, the
// plan cards), so steps 2 and 3 are known only from the lists Niva Bupa opened. The run fills
// step 1, presses Continue (the calculator's own step, nothing is saved), chooses the plan in the
// plan list, and stops: the plan card's sum insured, the policy period, add-ons, the terms box and
// Calculate Premium are the advisor's. A top-up (Health Recharge) needs the top-up product chosen
// at the top of step 1 first (and its own boxes filled); the recording did not show how.
import { ageOn, type ClientInput, type ClientMember } from '../../shared/contracts/client';
import {
  NIVA_HEALTH_PLAN_NAMES,
  NIVA_HEALTH_PLAN_OPTION,
  type NivaHealthPlan,
} from '../../shared/insurers/niva-health';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

export const NIVA_FIRST_STEP_HEADING = 'Who would you like to insure today?';
/** The calculator's first step, as its address ends. */
export const NIVA_CALCULATOR_ROUTE = '#/new-premiumcalculator';

export interface NivaHealthStep extends PlanStep {
  /** After this step, a Niva Bupa message (an alert) stops the run. */
  popupAfter?: boolean;
}

export type NivaHealthPlanResult =
  { ok: true; steps: NivaHealthStep[]; byHand: string[] } | { ok: false; problems: string[] };

const ADULT_ORDER: ClientMember['relationship'][] = [
  'self',
  'spouse',
  'father',
  'mother',
  'father_in_law',
  'mother_in_law',
];

const who = (m: ClientMember): string =>
  m.relationship === 'self' ? 'proposer (self)' : m.relationship.replace(/_/g, ' ');

/** Checks the client against the calculator and lists every step. */
export function planNivaHealthQuote(
  client: ClientInput,
  options: { plan: NivaHealthPlan; today: Date },
): NivaHealthPlanResult {
  const problems: string[] = [];
  const adults = ADULT_ORDER.flatMap((r) => client.members.filter((m) => m.relationship === r));
  const children = client.members.filter(
    (m) => m.relationship === 'son' || m.relationship === 'daughter',
  );
  if (adults.length === 0) {
    problems.push("Niva Bupa's calculator needs at least one adult (self, spouse or a parent).");
  }
  for (const m of [...adults, ...children]) {
    if (!m.dateOfBirth) problems.push(`Add the ${who(m)}'s date of birth.`);
    else if (ageOn(m.dateOfBirth, options.today) < 0) {
      problems.push(`The ${who(m)}'s date of birth is in the future.`);
    }
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

  add('Adults', { op: 'stepper', index: 0, count: adults.length, timeoutMs: 15000 });
  add('Children', { op: 'stepper', index: 1, count: children.length, timeoutMs: 5000 });
  adults.forEach((m, nth) =>
    add(`Date of birth (${who(m)})`, {
      op: 'matDate',
      counter: 0,
      nth,
      date: m.dateOfBirth!,
    }),
  );
  children.forEach((m, nth) =>
    add(`Date of birth (${who(m)})`, {
      op: 'matDate',
      counter: 1,
      nth,
      date: m.dateOfBirth!,
    }),
  );

  const city = client.proposal?.city;
  if (city) {
    add(
      'City',
      {
        op: 'typeahead',
        selector:
          'input[aria-autocomplete="list"], input.mat-autocomplete-trigger, input.mat-mdc-autocomplete-trigger',
        value: city,
        timeoutMs: 8000,
        last: true,
      },
      { optional: true, ifMissed: `city (Niva Bupa does not list "${city}" as written)` },
    );
  } else {
    byHand.push('city (the client record has none)');
  }
  const phone = client.customer.phone;
  if (phone) {
    add(
      'Mobile number',
      { op: 'setField', selector: 'input[maxlength="10"]', value: phone },
      { optional: true, ifMissed: 'mobile number' },
    );
  } else {
    byHand.push('mobile number (the client record has none)');
  }

  // The calculator's own next step: it works out which plans fit, nothing is saved.
  add('Continue', { op: 'clickButton', text: 'Continue', timeoutMs: 5000 }, { popupAfter: true });
  add('Plans', { op: 'waitFor', selector: 'app-second-step', timeoutMs: 20000 });
  add(
    'Plan',
    { op: 'ionPick', option: NIVA_HEALTH_PLAN_OPTION[options.plan], timeoutMs: 20000 },
    { keep: 'plan', popupAfter: true },
  );

  byHand.push(
    `the ${NIVA_HEALTH_PLAN_NAMES[options.plan]} card: its sum insured and options, then Continue`,
    'policy period, add-ons and the Terms & Conditions box',
  );
  return { ok: true, steps, byHand };
}
