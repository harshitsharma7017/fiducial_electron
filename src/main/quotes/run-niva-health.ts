// Runs a Niva Bupa premium calculator plan (niva-health.ts) in Niva Bupa's own page (UNO). From
// UNO's home page it opens the calculator (its Premium Calculator tile); on the calculator's first
// step it starts there. It presses "I Know My Plan", then fills stage by stage as far as
// NIVA_FILL_UNTIL says (for now: the plan, then the client's Basic Details, stopping before
// Continue), and hands the rest over. Filling all, it
// fills Basic Details and Customize Your Plan, presses Calculate Premium when add-ons are chosen
// and reads the premium. It never presses the Continue after it (the summary that asks the
// customer's name and email).
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import { NIVA_HEALTH_PLAN_NAMES, type NivaRun } from '../../shared/insurers/niva-health';
import {
  NIVA_CALCULATOR_ROUTE,
  NIVA_CALCULATOR_TILE,
  NIVA_FIRST_STEP_HEADING,
  NIVA_HOME_ROUTE,
  nivaPlanOptions,
  nivaRupees,
  planNivaHealthQuote,
  type NivaHealthStep,
} from './niva-health';
import { exec, type QuoteRunResult } from './run-uiic-health';
import { FillProgress, handedOver } from './hand-over';

/**
 * How far the run fills Niva Bupa's calculator, stage by stage (24 November 2026):
 * - 'i-know-my-plan': opens the calculator, presses "I Know My Plan", stops (fills nothing);
 * - 'plan': then waits for the plan dropdown and picks the plan, on its own, and stops;
 * - 'details': then fills the client's Basic Details (members, dates of birth, city, phone, the
 *   questions) and stops before Continue, for the advisor to check;
 * - 'all': then fills the rest (members, dates of birth, city, questions, sum insured…) and reads
 *   the premium. Kept, and tested, for when it is turned on.
 * Where it stops, it hands the form over with what is left, and saves the PDF when the premium
 * shows.
 */
export type NivaFillStage = 'i-know-my-plan' | 'plan' | 'details' | 'all';
export const NIVA_FILL_UNTIL: NivaFillStage = 'details';

/** What the advisor fills after "I Know My Plan", from the client's details. */
function nivaByHand(client: ClientInput, run: NivaRun, stage: NivaFillStage): string[] {
  const customize = [
    `Then Continue. Sum insured ${nivaRupees(run.sumInsured)}, policy period ${run.years} year${run.years > 1 ? 's' : ''}`,
    ...(run.addOns.length > 0
      ? [`Key Add-Ons: ${run.addOns.join(', ')}, then Calculate Premium`]
      : []),
    ...(run.tieredNetwork ? ['Tiered Network: Show more, then the tiered list'] : []),
  ];
  if (stage === 'details') {
    return ['Check the Basic Details the app filled, then press Continue', ...customize];
  }
  const children = client.members.filter(
    (m) => m.relationship === 'son' || m.relationship === 'daughter',
  ).length;
  const adults = client.members.length - children;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const city = client.proposal?.city;
  return [
    ...(stage === 'plan' ? [] : [`Select Plan: ${nivaPlanOptions(run, client.members.length)[0]}`]),
    `Members: ${plural(adults, 'adult', 'adults')}, ${plural(children, 'child', 'children')}, and their dates of birth (eldest first)`,
    city ? `City: ${city}` : "City: the client's details have none (Additional details, Niva Bupa)",
    ...(client.customer.phone ? [`Phone: ${client.customer.phone}`] : []),
    `Questions: transfer of a current policy ${run.previousPolicyEndDate ? `YES (previous policy ends ${run.previousPolicyEndDate})` : 'NO'}; medical practitioner ${run.medicalPractitioner ? 'YES' : 'NO'}`,
    ...customize,
  ];
}

/** What a step's failure means, in the advisor's words; null when the app knows no more than "failed". */
function explain(step: NivaHealthStep, run: NivaRun, detail: string | undefined): string | null {
  const { label } = step;
  const offered = /\(offered: (.*)\)$/.exec(detail ?? '')?.[1];
  const stuck = /^stuck at (\d+)$/.exec(detail ?? '');
  if (stuck) {
    return `Niva Bupa's calculator stops at ${stuck[1]} ${label.toLowerCase()}: it does not take this many members together. Change the members by hand.`;
  }
  if (detail?.startsWith('date-box-not-found')) {
    return `Niva Bupa shows no date box for "${label}" (${detail.replace(/^date-box-not-found ?/, '') || 'none shown'}). Check the Adult and Child counts, then fill the rest by hand.`;
  }
  if (detail === 'date-disabled') {
    return `Niva Bupa's calendar does not offer this date at "${label}" (outside the dates it takes). Check it, or pick the date by hand.`;
  }
  if (label === 'Plan' && detail?.startsWith('not-found')) {
    return 'Niva Bupa\'s plan box ("Select Plan") did not show after "I Know My Plan". Choose the plan yourself, then fill the rest by hand.';
  }
  if (label === 'Plan' && detail?.startsWith('still-empty')) {
    return "Niva Bupa's plan dropdown does not show the plan picked (or it changed, as when the city goes into it). Check the plan and the city, then fill the rest by hand.";
  }
  if (label === 'Plan' && detail === 'no-match (no suggestions)') {
    return "Niva Bupa's plan dropdown showed no plans (the app typed the plan's name for 20 seconds). Choose the plan yourself, then fill the rest by hand.";
  }
  if (label === 'Plan' && detail?.startsWith('no-match')) {
    return `Niva Bupa's plan list does not offer ${NIVA_HEALTH_PLAN_NAMES[run.plan]} for these members${offered ? ` (it offers: ${offered})` : ''}.`;
  }
  if (label === 'Sum insured' && detail?.startsWith('no-match')) {
    return `Niva Bupa does not offer a sum insured of ${nivaRupees(run.sumInsured)} here${offered ? ` (it offers: ${offered})` : ''}.`;
  }
  if (label === 'Policy period' && detail?.startsWith('option-missing')) {
    return `Niva Bupa does not offer ${run.years} year${run.years > 1 ? 's' : ''} here${offered ? ` (it offers: ${offered})` : ''}.`;
  }
  if (label === 'Calculate Premium' && detail === 'not-found') {
    return "Niva Bupa's Calculate Premium did not show (it shows once Key Add-Ons is scrolled to). Press it yourself.";
  }
  return null;
}

const unexplained = (label: string, detail: string | undefined): string =>
  `Stopped at "${label}" (${detail ?? 'unknown'}). The calculator may have changed; fill the rest by hand.`;

export async function runNivaHealthQuote(deps: {
  /** Niva Bupa's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  client: ClientInput;
  run: NivaRun;
  today: Date;
  /** In tests: how far to fill (NIVA_FILL_UNTIL). */
  fillUntil?: NivaFillStage;
}): Promise<QuoteRunResult> {
  const name = NIVA_HEALTH_PLAN_NAMES[deps.run.plan];
  const plan = planNivaHealthQuote(deps.client, deps.run, { today: deps.today });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This client cannot be filled in automatically on Niva Bupa's calculator for ${name}.`,
      problems: plan.problems,
    };
  }
  const openFirst = {
    outcome: 'refused' as const,
    step: null,
    message: `Go to UNO's home page (or the premium calculator's first step, "${NIVA_FIRST_STEP_HEADING}"), then press Fill again.`,
    problems: [],
  };
  const routeOf = (w: PortalPage): string => {
    try {
      return new URL(w.webContents.getURL()).hash.replace(/\/$/, '');
    } catch {
      return '';
    }
  };
  const pages = deps.windows().filter((w) => !w.isDestroyed());
  const page =
    pages.find((w) => routeOf(w) === NIVA_CALCULATOR_ROUTE) ??
    pages.find((w) => routeOf(w) === NIVA_HOME_ROUTE);
  if (!page) return openFirst;
  const wc = page.webContents;
  if (routeOf(page) === NIVA_HOME_ROUTE) {
    const open = await exec(wc, { op: 'clickText', text: NIVA_CALCULATOR_TILE, timeoutMs: 8000 });
    if (!open.ok) {
      page.focus();
      return {
        outcome: 'failed',
        step: 'Open the premium calculator',
        message: `UNO's ${NIVA_CALCULATOR_TILE} tile could not be pressed (${open.detail}). Open the calculator yourself, then press Fill again.`,
        problems: [],
      };
    }
  }
  if (!(await exec(wc, { op: 'hasHeading', text: NIVA_FIRST_STEP_HEADING, timeoutMs: 15000 })).ok) {
    return openFirst;
  }
  const before = await exec(wc, { op: 'popup' });
  if (before.errors) {
    page.focus();
    return {
      outcome: 'refused',
      step: null,
      message: `Close Niva Bupa's message first, then try again. It says: ${before.errors}`,
      problems: [],
    };
  }

  const missed: string[] = [];
  const kept: Record<string, string> = {};
  const toDo = (failed: boolean) => [
    ...missed,
    ...plan.byHand,
    ...(failed ? ['Fill the rest, press Calculate Premium yourself and check the premium.'] : []),
  ];
  /** The result once Niva Bupa shows the premium (`kept.premium`). */
  const compose = (got: Record<string, string>): QuoteRunResult => {
    // "1 Year ₹15,073": the policy period and its premium, as Niva Bupa shows them.
    const shown = /^(.*?)\s*(₹\s?[\d,]+(?:\.\d+)?)\s*$/.exec(got.premium ?? '');
    const premium = shown
      ? {
          label: `${got.plan ?? name}, ${nivaRupees(deps.run.sumInsured)}, ${shown[1]}`,
          amount: shown[2]!,
        }
      : undefined;
    return {
      outcome: 'ready',
      step: null,
      message: premium
        ? `Niva Bupa worked the premium out: ${premium.amount} for ${premium.label}. The app did not press Continue (the summary asking the customer's details).`
        : `Niva Bupa: everything is filled, but the premium could not be read. Check it on Niva Bupa's page.`,
      problems: [],
      ...(premium ? { premium } : {}),
      toDo: toDo(false),
    };
  };
  // A box Niva Bupa does not take is left for the advisor, and the run goes on; anything else
  // that fails hands the form over (hand-over.ts).
  const progress = new FillProgress(plan.steps);
  const handOver = (stopped?: { label: string; why: string }): QuoteRunResult => {
    page.focus();
    return handedOver({
      insurer: 'Niva Bupa',
      page,
      progress,
      stopped,
      toDo: toDo(false),
      // Without add-ons there is no Calculate Premium to press: the premium shows once the sum
      // insured is chosen on Customize Your Plan.
      ...(progress.button()
        ? {}
        : { button: 'Continue, then choose the sum insured (the premium shows by the period)' }),
      compose: (read) => compose({ ...kept, premium: read.value ?? '' }),
    });
  };
  // Where the run stops (NIVA_FILL_UNTIL): right after "I Know My Plan" is pressed (the step that
  // presses it, not the one that sets back a tab left in "Plan Recommendation"), or once the plan
  // is picked (before the members, the first of the other boxes).
  const until = deps.fillUntil ?? NIVA_FILL_UNTIL;
  const stopAt =
    until === 'i-know-my-plan'
      ? plan.steps.findIndex(
          (s) => s.op.op === 'ensureShown' && s.op.open.text === 'I Know My Plan',
        ) + 1
      : until === 'plan'
        ? plan.steps.findIndex((s) => s.label === 'Adults')
        : until === 'details'
          ? plan.steps.findIndex((s) => s.label === 'Continue')
          : -1;
  for (const [index, step] of plan.steps.entries()) {
    if (index === stopAt) {
      const picked = kept.plan ? ` (${kept.plan})` : '';
      page.focus();
      return handedOver({
        insurer: 'Niva Bupa',
        page,
        progress,
        toDo: [...missed, ...nivaByHand(deps.client, deps.run, until), ...plan.byHand],
        done:
          until === 'details'
            ? `The app opened the premium calculator, pressed "I Know My Plan", picked the plan${picked} and filled the client's Basic Details (members, dates of birth, city, phone, questions). Check them, then go on (see below).`
            : until === 'plan'
              ? `The app opened the premium calculator, pressed "I Know My Plan" and picked the plan${picked}. Fill the rest from the client's details (see below).`
              : 'The app opened the premium calculator and pressed "I Know My Plan". Pick the plan and fill the rest from the client\'s details (see below).',
        button: 'Continue, then choose the sum insured (the premium shows by the period)',
        compose: (read) => compose({ ...kept, premium: read.value ?? '' }),
      });
    }
    if (progress.stopBefore(index)) return handOver();
    let result = await exec(wc, step.op);
    // Niva Bupa draws the members' rows again after the plan is chosen (the date box's caption
    // changes), which may empty a date just picked: pick it once more.
    if (step.op.op === 'matDate' && result.detail?.startsWith('date-not-set')) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await exec(wc, step.op);
    }
    if (result.ok && step.keep && result.value) kept[step.keep] = result.value;
    if (step.popupAfter) {
      const popup = await exec(wc, { op: 'popup' });
      if (popup.errors) {
        return handOver({ label: step.label, why: `Niva Bupa says: ${popup.errors}` });
      }
    }
    if (!result.ok && step.label === 'Customize Your Plan') {
      // Continue did not lead on: say what Basic Details marks, and what the app could not fill.
      const marked = (await exec(wc, { op: 'fieldErrors' })).value;
      const unfilled = [...missed, ...plan.byHand.filter((b) => b.startsWith('city'))];
      return handOver({
        label: step.label,
        why: `Niva Bupa did not move on from Basic Details${marked ? `. It says: ${marked}` : ''}${unfilled.length > 0 ? `. The app could not fill: ${unfilled.join('; ')}` : ''}. Fill what it marks there, press Continue, then fill the rest by hand.`,
      });
    }
    if (!result.ok) {
      // A family floater asks only the eldest member's date of birth.
      if (step.skipIfNoBox && result.detail?.startsWith('date-box-not-found')) continue;
      if (step.optional) {
        if (step.ifMissed && !missed.includes(step.ifMissed)) missed.push(step.ifMissed);
        continue;
      }
      const why = explain(step, deps.run, result.detail);
      // The plan and the members' count decide everything after them (Niva Bupa would work a
      // premium out for the wrong cover): the filling never goes on without them.
      const decisive = step.label === 'Plan' || step.op.op === 'stepper';
      if (!decisive && progress.skip(step, index, result, why ?? undefined)) continue;
      return handOver({ label: step.label, why: why ?? unexplained(step.label, result.detail) });
    }
  }
  page.focus();
  return compose(kept);
}
