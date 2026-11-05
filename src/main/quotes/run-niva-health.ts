// Runs a Niva Bupa premium calculator plan (niva-health.ts) in Niva Bupa's own page (UNO). From
// UNO's home page it opens the calculator (its Premium Calculator tile); on the calculator's first
// step it starts there. It goes "I Know My Plan", fills Basic Details and Customize Your Plan,
// presses Calculate Premium and reads the premium. It never presses the Continue after it (the
// summary that asks the customer's name and email).
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import { NIVA_HEALTH_PLAN_NAMES, type NivaRun } from '../../shared/insurers/niva-health';
import {
  NIVA_CALCULATOR_ROUTE,
  NIVA_CALCULATOR_TILE,
  NIVA_FIRST_STEP_HEADING,
  NIVA_HOME_ROUTE,
  nivaRupees,
  planNivaHealthQuote,
  type NivaHealthStep,
} from './niva-health';
import { exec, type QuoteRunResult } from './run-uiic-health';

/** What a step's failure means, in the advisor's words. */
function explain(step: NivaHealthStep, run: NivaRun, detail: string | undefined): string {
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
  if (label === 'Plan' && detail?.startsWith('no-match')) {
    return `Niva Bupa's plan list does not offer ${NIVA_HEALTH_PLAN_NAMES[run.plan]} for these members${offered ? ` (it offers: ${offered})` : ''}.`;
  }
  if (label === 'Sum insured' && detail?.startsWith('no-match')) {
    return `Niva Bupa does not offer a sum insured of ${nivaRupees(run.sumInsured)} here${offered ? ` (it offers: ${offered})` : ''}.`;
  }
  if (label === 'Policy period' && detail?.startsWith('option-missing')) {
    return `Niva Bupa does not offer ${run.years} year${run.years > 1 ? 's' : ''} here${offered ? ` (it offers: ${offered})` : ''}.`;
  }
  if (label === 'Customize Your Plan') {
    return 'Niva Bupa did not move on from Basic Details. Check what it marks there, then fill the rest by hand.';
  }
  if (label === 'Calculate Premium' && detail === 'not-found') {
    return "Niva Bupa's Calculate Premium did not show (it shows once Key Add-Ons is scrolled to). Press it yourself.";
  }
  return `Stopped at "${label}" (${detail ?? 'unknown'}). The calculator may have changed; fill the rest by hand.`;
}

export async function runNivaHealthQuote(deps: {
  /** Niva Bupa's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  client: ClientInput;
  run: NivaRun;
  today: Date;
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
          toDo: toDo(true),
        };
      }
    }
    if (!result.ok) {
      // A family floater asks only the eldest member's date of birth.
      if (step.skipIfNoBox && result.detail?.startsWith('date-box-not-found')) continue;
      if (step.optional) {
        if (step.ifMissed && !missed.includes(step.ifMissed)) missed.push(step.ifMissed);
        continue;
      }
      page.focus();
      return {
        outcome: 'failed',
        step: step.label,
        message: explain(step, deps.run, result.detail),
        problems: [],
        toDo: toDo(true),
      };
    }
  }
  page.focus();
  // "1 Year ₹15,073": the policy period and its premium, as Niva Bupa shows them.
  const shown = /^(.*?)\s*(₹\s?[\d,]+(?:\.\d+)?)\s*$/.exec(kept.premium ?? '');
  const premium = shown
    ? {
        label: `${kept.plan ?? name}, ${nivaRupees(deps.run.sumInsured)}, ${shown[1]}`,
        amount: shown[2]!,
      }
    : undefined;
  return {
    outcome: 'ready',
    step: null,
    message: premium
      ? `Niva Bupa worked the premium out: ${premium.amount} for ${premium.label}. The app did not press Continue (the summary asking the customer's details).`
      : `Niva Bupa: everything is filled and Calculate Premium was pressed, but the premium could not be read. Check it on Niva Bupa's page.`,
    problems: [],
    ...(premium ? { premium } : {}),
    toDo: toDo(false),
  };
}
