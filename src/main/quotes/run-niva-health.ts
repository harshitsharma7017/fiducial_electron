// Runs a Niva Bupa premium calculator plan (niva-health.ts) in Niva Bupa's own page (UNO). The
// advisor opens the calculator's first step; the run fills it, presses the calculator's Continue,
// chooses the plan in the plan list and stops. It never presses Calculate Premium.
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import { NIVA_HEALTH_PLAN_NAMES, type NivaHealthPlan } from '../../shared/insurers/niva-health';
import {
  NIVA_CALCULATOR_ROUTE,
  NIVA_FIRST_STEP_HEADING,
  planNivaHealthQuote,
  type NivaHealthStep,
} from './niva-health';
import { exec, type QuoteRunResult } from './run-uiic-health';

/** What a step's failure means, in the advisor's words. */
function explain(step: NivaHealthStep, plan: NivaHealthPlan, detail: string | undefined): string {
  const { label } = step;
  const stuck = /^stuck at (\d+)$/.exec(detail ?? '');
  if (stuck) {
    return `Niva Bupa's calculator stops at ${stuck[1]} ${label.toLowerCase()}: it does not take this many members together. Change the members by hand.`;
  }
  if (detail === 'date-disabled') {
    return `Niva Bupa's calendar does not offer this date at "${label}" (outside the ages it covers). Check the member, or pick the date by hand.`;
  }
  if (step.op.op === 'ionPick' && detail?.startsWith('no-match')) {
    const offered = /\(offered: (.*)\)$/.exec(detail)?.[1];
    const name = NIVA_HEALTH_PLAN_NAMES[plan];
    const topUp =
      plan === 'health-recharge'
        ? ' For a top-up, choose the top-up product at the top of the calculator first (and fill its own boxes), then run again from the first step.'
        : '';
    return `Niva Bupa does not offer ${name} for these members${offered ? ` (it offers: ${offered})` : ''}.${topUp}`;
  }
  if (step.op.op === 'ionPick' && detail === 'no-dropdown') {
    return "Niva Bupa's plan list did not show. Choose the plan by hand.";
  }
  if (label === 'Plans') {
    return 'Niva Bupa did not move on from the first step. Check what it marks there, then fill the rest by hand.';
  }
  return `Stopped at "${label}" (${detail ?? 'unknown'}). The calculator may have changed; fill the rest by hand.`;
}

export async function runNivaHealthQuote(deps: {
  /** Niva Bupa's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  client: ClientInput;
  plan: NivaHealthPlan;
  today: Date;
}): Promise<QuoteRunResult> {
  const name = NIVA_HEALTH_PLAN_NAMES[deps.plan];
  const plan = planNivaHealthQuote(deps.client, { plan: deps.plan, today: deps.today });
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
    message: `Open Niva Bupa's premium calculator at its first step ("${NIVA_FIRST_STEP_HEADING}"), then press Fill again.`,
    problems: [],
  };
  const pages = deps.windows().filter((w) => !w.isDestroyed());
  const page = pages.find((w) => {
    const hash = new URL(w.webContents.getURL()).hash.replace(/\/$/, '');
    return hash === NIVA_CALCULATOR_ROUTE;
  });
  if (!page) return openFirst;
  const wc = page.webContents;
  if (!(await exec(wc, { op: 'hasHeading', text: NIVA_FIRST_STEP_HEADING, timeoutMs: 5000 })).ok) {
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
  const toDo = () => [
    ...missed,
    ...plan.byHand,
    'Press Calculate Premium yourself, and check the premium Niva Bupa shows.',
  ];
  for (const step of plan.steps) {
    const result = await exec(wc, step.op);
    if (result.ok && step.keep && result.value) kept[step.keep] = result.value;
    if (step.popupAfter) {
      const popup = await exec(wc, { op: 'popup' });
      if (popup.errors) {
        page.focus();
        return {
          outcome: 'failed',
          step: step.label,
          message: `Niva Bupa says: ${popup.errors}`,
          problems: [],
          toDo: toDo(),
        };
      }
    }
    if (!result.ok) {
      if (step.optional) {
        if (step.ifMissed && !missed.includes(step.ifMissed)) missed.push(step.ifMissed);
        continue;
      }
      page.focus();
      return {
        outcome: 'failed',
        step: step.label,
        message: explain(step, deps.plan, result.detail),
        problems: [],
        toDo: toDo(),
      };
    }
  }
  page.focus();
  return {
    outcome: 'ready',
    step: null,
    message: `Niva Bupa calculator: the members and their dates of birth are filled and "${kept.plan ?? name}" is chosen. Do what is listed below; the app does not press Calculate Premium.`,
    problems: [],
    toDo: toDo(),
  };
}
