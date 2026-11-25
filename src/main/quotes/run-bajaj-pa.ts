// Runs Bajaj Allianz's Personal Accident plan (bajaj-pa.ts) in Bajaj's own page: a tab signed in
// to the partner portal (partner.bajajgeneral.com) opens the form by its address, the run fills it,
// presses Calculate Premium (Bajaj's quick quote; nothing is saved) and reads the premium. What it
// cannot fill is left for the advisor (hand-over.ts); Bajaj's own message is reported in its words.
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import { BAJAJ_PA_PATH, BAJAJ_PA_PLANS, type BajajPaRun } from '../../shared/insurers/bajaj';
import { planBajajPaQuote, type BajajStep } from './bajaj-pa';
import { exec, type QuoteRunResult } from './run-uiic-health';
import { FillProgress, handedOver, leftItem } from './hand-over';

export const BAJAJ_ORIGINS = [
  'https://partner.bajajgeneral.com',
  'https://partner.bajajallianz.com',
];

/** What a step's failure means, in the advisor's words. */
function explain(step: BajajStep, run: BajajPaRun, detail: string | undefined): string {
  if (detail?.startsWith('page-says: ')) return `Bajaj says: ${detail.slice(11)}`;
  if (step.label === 'Policy Plan' && detail?.startsWith('option-missing')) {
    const offered = /\(offered: (.*)\)$/.exec(detail)?.[1];
    return `Bajaj's Policy Plan list did not offer ${BAJAJ_PA_PLANS[run.plan]} (${run.plan}) within 25 seconds${offered ? ` (it offers: ${offered})` : ''}.`;
  }
  if (step.label === 'Policy Plan' && detail?.startsWith('not-found')) {
    return "Bajaj's Personal Accident form did not open (its Policy Plan list was not found). Check the Bajaj tab is signed in, then press again.";
  }
  if (step.label === 'Premium') {
    const shows = /^not-shown \(page shows: (.*)\)$/.exec(detail ?? '')?.[1];
    return `Bajaj did not show a premium after Calculate Premium${shows ? ` (the page shows: ${shows})` : ''}. Check what it marks, then press Calculate Premium yourself.`;
  }
  return `Stopped at "${step.label}" (${detail ?? 'unknown'}). The form may have changed; fill the rest by hand.`;
}

export async function runBajajPaQuote(deps: {
  /** Bajaj Allianz's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  client: ClientInput;
  run: BajajPaRun;
  /** In tests: the origins the partner pages are served from. */
  origins?: string[];
}): Promise<QuoteRunResult> {
  const name = BAJAJ_PA_PLANS[deps.run.plan];
  const plan = planBajajPaQuote(deps.client, deps.run);
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This client cannot be filled in automatically on Bajaj's ${name} form.`,
      problems: plan.problems,
    };
  }
  const origins = deps.origins ?? BAJAJ_ORIGINS;
  const originOf = (w: PortalPage): string => {
    try {
      return new URL(w.webContents.getURL()).origin;
    } catch {
      return '';
    }
  };
  const pages = deps.windows().filter((w) => !w.isDestroyed());
  const onForm = (w: PortalPage) =>
    origins.includes(originOf(w)) &&
    new URL(w.webContents.getURL()).pathname.toLowerCase() === BAJAJ_PA_PATH.toLowerCase();
  const page = pages.find(onForm) ?? pages.find((w) => origins.includes(originOf(w)));
  if (!page) {
    return {
      outcome: 'refused',
      step: null,
      message:
        'Sign in to Bajaj Allianz first (Insurer portals, Bajaj Allianz), then press again. The app opens the Personal Accident form from the partner portal.',
      problems: [],
    };
  }
  // The form afresh, by its address (as the portal's Issue Policy menu opens it).
  try {
    await page.webContents.loadURL(`${originOf(page)}${BAJAJ_PA_PATH}`);
  } catch {
    // A redirect (Bajaj's sign-in round trip) reports as a failure: the first step decides.
  }
  const wc = page.webContents;
  const missed: string[] = [];
  const kept: Record<string, string> = {};
  const label = () =>
    `Bajaj Allianz ${name}, ${deps.run.tenureYears} year${deps.run.tenureYears > 1 ? 's' : ''}`;
  const compose = (got: Record<string, string>): QuoteRunResult => {
    const amount = (got.premium ?? '').replace(/[^\d.,]/g, '');
    return {
      outcome: 'ready',
      step: null,
      message: `Bajaj worked the premium out: ₹${amount} for ${label()}. Nothing was saved or sent (Calculate Premium is Bajaj's quick quote).`,
      problems: [],
      premium: { label: label(), amount: `₹${amount}` },
      toDo: [...missed, ...plan.byHand],
    };
  };
  const progress = new FillProgress(plan.steps);
  const handOver = (stopped?: { label: string; why: string }): QuoteRunResult => {
    page.focus();
    return handedOver({
      insurer: 'Bajaj Allianz',
      page,
      progress,
      stopped,
      toDo: [...missed, ...plan.byHand],
      compose: (read) => compose({ ...kept, premium: read.value ?? '' }),
    });
  };
  for (const [index, step] of plan.steps.entries()) {
    if (progress.stopBefore(index)) return handOver();
    const result = await exec(wc, step.op);
    if (result.ok && step.keep && result.value) kept[step.keep] = result.value;
    if (!result.ok) {
      if (step.optional) {
        if (step.ifMissed && !missed.includes(step.ifMissed)) missed.push(step.ifMissed);
        continue;
      }
      // A date box that takes no typing (a calendar only) is left for the advisor.
      if (step.op.op === 'typeDate') {
        const item = leftItem(step, result.detail);
        if (!progress.left.includes(item)) progress.left.push(item);
        continue;
      }
      // The plan decides the rest of the form: never go on without it.
      if (step.label !== 'Policy Plan' && progress.skip(step, index, result)) continue;
      return handOver({ label: step.label, why: explain(step, deps.run, result.detail) });
    }
  }
  page.focus();
  return compose(kept);
}
