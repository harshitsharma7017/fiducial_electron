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
  NIVA_SUMMARY_ROUTE,
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
 * - 'all': then Continue, the sum insured, period and add-ons, reads the premium, and goes on to
 *   Plan Summary (Continue), where it fills the customer's name, email and mobile. It never presses
 *   Generate Quote.
 * Where it stops, it hands the form over with what is left, and saves the PDF when the premium
 * shows.
 */
export type NivaFillStage = 'i-know-my-plan' | 'plan' | 'details' | 'all';
export const NIVA_FILL_UNTIL: NivaFillStage = 'all';

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
    return "Niva Bupa's Calculate Premium did not show, though the app scrolled its page to Key Add-Ons and through to the end (it shows once Key Add-Ons is scrolled to). Press it yourself.";
  }
  return null;
}

const unexplained = (label: string, detail: string | undefined): string =>
  `Stopped at "${label}" (${detail ?? 'unknown'}). The calculator may have changed; fill the rest by hand.`;

export interface NivaRunDeps {
  /** Niva Bupa's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  client: ClientInput;
  run: NivaRun;
  today: Date;
  /** In tests: how far to fill (NIVA_FILL_UNTIL). */
  fillUntil?: NivaFillStage;
  /**
   * Saves the run's trace for support (25 November 2026: why the plan dropdown fails live): each
   * step's result and, around the plan, how the page's boxes and lists are built. Returns the
   * file's name, or null.
   */
  diagnose?: (name: string, data: unknown) => string | null;
}

/** One entry of a run's trace: a step's result, or a look at the page. */
type TraceEntry =
  | { step: number; label: string; op: string; ok: boolean; detail?: string; ms: number }
  | { look: string; page: unknown };

export async function runNivaHealthQuote(deps: NivaRunDeps): Promise<QuoteRunResult> {
  const trace: TraceEntry[] = [];
  const started = Date.now();
  const result = await runNiva(deps, trace);
  const file = deps.diagnose?.('niva-bupa', {
    at: new Date(started).toISOString(),
    seconds: Math.round((Date.now() - started) / 1000),
    plan: deps.run.plan,
    outcome: result.outcome,
    step: result.step,
    message: result.message,
    trace,
  });
  return file && result.outcome !== 'ready'
    ? {
        ...result,
        toDo: [...(result.toDo ?? []), `For support: the run's trace is saved as ${file}.`],
      }
    : result;
}

async function runNiva(deps: NivaRunDeps, trace: TraceEntry[]): Promise<QuoteRunResult> {
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
  const inCalculator = (w: PortalPage) => routeOf(w).startsWith(NIVA_CALCULATOR_ROUTE);
  const page = pages.find(inCalculator) ?? pages.find((w) => routeOf(w) === NIVA_HOME_ROUTE);
  if (!page) return openFirst;
  const wc = page.webContents;
  // A calculator already open (an earlier run leaves it filled, in "Plan Recommendation", or on
  // Customize Your Plan or Plan Summary) is never reused: the run goes back to UNO's home page and
  // opens a fresh one, so the plan dropdown loads anew (24 November 2026). Nothing is saved by
  // leaving it.
  if (inCalculator(page)) {
    // Home, and the page loaded again: UNO (Ionic) keeps a calculator left half-way, its overlays
    // and the run's marks otherwise.
    await wc.executeJavaScript(`location.hash = '${NIVA_HOME_ROUTE}'`).catch(() => undefined);
    wc.reload();
    const deadline = Date.now() + 10_000;
    while (routeOf(page) !== NIVA_HOME_ROUTE && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    // Only Basic Details can be filled if the home page did not come.
    if (routeOf(page) !== NIVA_HOME_ROUTE && routeOf(page) !== NIVA_CALCULATOR_ROUTE) {
      return openFirst;
    }
    // The home page drawn (and loaded, should UNO load the page again).
    while (wc.isLoading() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  if (routeOf(page) === NIVA_HOME_ROUTE) {
    let open = await exec(wc, { op: 'clickText', text: NIVA_CALCULATOR_TILE, timeoutMs: 8000 });
    // The page was drawn again under the click: once more, when it has settled.
    if (!open.ok && open.detail?.startsWith('page-changed')) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      open = await exec(wc, { op: 'clickText', text: NIVA_CALCULATOR_TILE, timeoutMs: 8000 });
    }
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
  const compose = (
    got: Record<string, string>,
    /** Plan Summary, when the run went on to it: reached, and what is left there. */
    summary?: { reached: boolean; left: string[] },
  ): QuoteRunResult => {
    // "1 Year ₹15,073": the policy period and its premium, as Niva Bupa shows them.
    const shown = /^(.*?)\s*(₹\s?[\d,]+(?:\.\d+)?)\s*$/.exec(got.premium ?? '');
    const premium = shown
      ? {
          // The sum insured the page shows (chosen there), else the client's.
          label: `${got.plan ?? name}, ${got.sumInsured ?? nivaRupees(deps.run.sumInsured)}, ${shown[1]}`,
          amount: shown[2]!,
        }
      : undefined;
    return {
      outcome: 'ready',
      step: null,
      message: premium
        ? `Niva Bupa worked the premium out: ${premium.amount} for ${premium.label}. ${
            summary?.reached
              ? "The app pressed Continue to Plan Summary and filled the customer's details there; it did not press Generate Quote."
              : summary
                ? 'Plan Summary did not open (see below).'
                : "The app did not press Continue (the summary asking the customer's details)."
          }`
        : `Niva Bupa: everything is filled, but the premium could not be read. Check it on Niva Bupa's page.`,
      problems: [],
      ...(premium ? { premium } : {}),
      toDo: [...toDo(false), ...(summary?.left ?? [])],
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
      compose: (read) =>
        compose({
          ...kept,
          premium: read.value ?? '',
          ...(read.label ? { sumInsured: read.label } : {}),
        }),
    });
  };
  /** A look at how the page is built, for the trace (never a box's value). */
  const look = async (when: string): Promise<void> => {
    const seen = await exec(wc, { op: 'inspect' }).catch(() => null);
    let page: unknown = seen?.detail ?? 'not read';
    try {
      if (seen?.ok && seen.value) page = JSON.parse(seen.value) as unknown;
    } catch {
      // Kept as read.
    }
    trace.push({ look: when, page });
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
        compose: (read) =>
          compose({
            ...kept,
            premium: read.value ?? '',
            ...(read.label ? { sumInsured: read.label } : {}),
          }),
      });
    }
    if (progress.stopBefore(index)) return handOver();
    if (index === 0) await look('before the first step');
    const at = Date.now();
    let result = await exec(wc, step.op);
    // Niva Bupa draws the members' rows again after the plan is chosen (the date box's caption
    // changes), which may empty a date just picked: pick it once more.
    if (step.op.op === 'matDate' && result.detail?.startsWith('date-not-set')) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await exec(wc, step.op);
    }
    trace.push({
      step: index,
      label: step.label,
      op: step.op.op,
      ok: result.ok,
      ...(result.detail ? { detail: result.detail.slice(0, 300) } : {}),
      ms: Date.now() - at,
    });
    // How the page is built around the plan (its box, the City box, the lists open).
    // And after any step that failed (its buttons too: a footer's Calculate Premium, "+ Add").
    if (
      !result.ok ||
      ((step.label === 'Plan' || step.label === 'I Know My Plan') &&
        step.op.op !== 'pause' &&
        step.op.op !== 'markPresent')
    ) {
      await look(`after ${step.label}: ${step.op.op}${result.ok ? '' : ' (failed)'}`);
    }
    if (result.ok && step.keep && result.value) kept[step.keep] = result.value;
    // The premium's reading also gives the sum insured shown with it.
    if (result.ok && step.keep === 'premium' && result.label) kept.sumInsured = result.label;
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
  // Then on to Plan Summary (request of 24 November 2026): Continue, and the customer's name, email
  // and mobile there. The premium is read and kept already: nothing here can lose it. Generate
  // Quote is never pressed.
  const summary = kept.premium ? await toPlanSummary(page) : undefined;
  page.focus();
  return compose(kept, summary);

  async function toPlanSummary(at: PortalPage): Promise<{ reached: boolean; left: string[] }> {
    // The footer reads Continue at the top of Customize Your Plan (Calculate Premium while Key
    // Add-Ons is in view): the page's panel is scrolled up there until it does.
    const pressed = await exec(wc, {
      op: 'revealButton',
      text: 'Continue',
      near: 'Customize Your Plan',
      timeoutMs: 15000,
    });
    if (!pressed.ok) {
      return { reached: false, left: ['Press Continue on Customize Your Plan (it did not show).'] };
    }
    const deadline = Date.now() + 20_000;
    while (routeOf(at) !== NIVA_SUMMARY_ROUTE && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (routeOf(at) !== NIVA_SUMMARY_ROUTE) {
      return {
        reached: false,
        left: ['Plan Summary did not open after Continue: check the page.'],
      };
    }
    const { customer } = deps.client;
    const left: string[] = [];
    const fields: [string, string, string | undefined][] = [
      ["customer's name", 'input[name="name"]', customer.name],
      ["customer's email", 'input[name="emailId"]', customer.email],
      ["customer's mobile", 'input[name="mobileno"]', customer.phone],
    ];
    for (const [what, selector, value] of fields) {
      if (!value) {
        left.push(`Plan Summary: the ${what} (the client's details have none)`);
        continue;
      }
      const r = await exec(wc, { op: 'setField', selector, value });
      if (!r.ok) left.push(`Plan Summary: the ${what} (${r.detail ?? 'not filled'})`);
    }
    return { reached: true, left };
  }
}
