// Runs a United India premium calculator in the signed-in United India page: from the home page it
// opens the calculator (a pop-up in the same session, shown as a tab of the app window), performs
// each step of the plan, and after every step checks for United India's ERRORS pop-up.
// - Health (plan: uiic-health.ts): stops at the "User Details" pop-up for the advisor.
// - Motor (plan: uiic-motor.ts): reads the premium from "Premium Details" and returns it.
// - Health e-proposals (Family Medicare, Individual Health, Arogya Sanjeevani, Super Top-up; plan:
//   uiic-health-proposal.ts): fill
//   sections I-II and stop; the advisor fills the rest and saves it. The app never saves or submits
//   a proposal.
// - Overseas Travel e-proposal (plan: uiic-travel-proposal.ts): fills the trip, proposer, insured
//   and intermediary, presses View Premium and reads the premium if shown, and stops.
// - Overseas Mediclaim e-proposals (B&H, SCHENGEN, Studies; plan: uiic-omp-proposal.ts): fill the
//   trip, choose the plan, fill the proposer and insured, read the premium, and stop.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { WebContents } from 'electron';
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import type { Vehicle } from '../../shared/contracts/vehicle';
import { quotePageAgent, type PageOp, type PageOpResult } from './page-ops';
import { FillProgress, handedOver, readAgain, type HandOver } from './hand-over';
import { planUiicHealthQuote, type PlanStep } from './uiic-health';
import {
  planUiicHealthProposal,
  UIIC_PROPOSAL_FORMS,
  type UiicProposalForm,
} from './uiic-health-proposal';
import { planUiicMotorQuote } from './uiic-motor';
import { planUiicTravelProposal } from './uiic-travel-proposal';
import { planUiicOmpProposal, UIIC_OMP_FORMS } from './uiic-omp-proposal';
import type { OmpTrip, TravelTrip } from '../../shared/contracts/travel';
import type { Traveller } from '../../shared/contracts/traveller';

const AGENT_SOURCE = quotePageAgent.toString();
const WORLD_ID = 1803;
const HOME_PATH = '/GCWebPortal/login/HomeAction.do';

export interface QuoteRunResult {
  /** 'handed-over': the run filled what it could; the advisor finishes the form (hand-over.ts). */
  outcome: 'ready' | 'refused' | 'failed' | 'cancelled' | 'handed-over';
  /** The step that stopped the run, if any. */
  step: string | null;
  message: string;
  /** Why the client cannot be quoted this way (refused before anything was touched). */
  problems: string[];
  /** The premium read from the insurer's page (motor), as shown there. */
  premium?: { label: string; amount: string };
  /** Every plan the insurer quoted for the same request, with its premium, as shown there. */
  plans?: { name: string; amount: string }[];
  /** Stop & make PDF found several plans: the advisor chooses which go in the PDF. */
  choose?: boolean;
  /** What the plans' amounts are ("Premium (excluding GST)"). */
  amountLabel?: string;
  /** How the insurer made the premium up (an API's answer: IDV, OD, TP, GST…), as shown. */
  breakdown?: { label: string; value: string }[];
  /** What the advisor still fills by hand (e-proposals), and the insurer's messages about it. */
  toDo?: string[];
  /** The quote saved as a PDF (the insurer's page, with the premium): the file's name. */
  pdf?: { name: string };
  /**
   * A form the advisor finishes: the button they press for the premium (as the form names it),
   * and whether the app reads the premium by the form's own recorded caption or by a guess.
   */
  finish?: { button: string | null; guessed: boolean };
  /** For the quote service only (never sent to the screens): how it finishes the form. */
  handOver?: HandOver;
}

/**
 * A quote run's own state (request of 25 November 2026: several insurers' quotes run at the same
 * time, each in its own tab): its cancel switch, the page its last step worked in, who follows its
 * work (bringing the tab to the front), and who is told of its steps (the progress shown). A run
 * started with runScoped carries its scope through every await (AsyncLocalStorage), so exec,
 * runPause and lastWorkedPage act on that run only. beginRun/endRun/stopRun keep a single
 * unscoped run, as before.
 */
interface RunScope {
  controller: AbortController;
  lastWorked: WebContents | null;
  follower: ((wc: WebContents) => void) | null;
  onStep: ((label: string) => void) | null;
}
const scopes = new AsyncLocalStorage<RunScope>();
const newScope = (onStep: ((label: string) => void) | null = null): RunScope => ({
  controller: new AbortController(),
  lastWorked: null,
  follower: null,
  onStep,
});
/** The single unscoped run (beginRun), if any. */
let single: RunScope | null = null;
/** Who follows an unscoped run's work. */
let workFollower: ((wc: WebContents) => void) | null = null;
/** The page the unscoped run's last step worked in (kept after it ends). */
let lastUnscoped: WebContents | null = null;
const currentScope = (): RunScope | null => scopes.getStore() ?? single;

/** While set, every page a step works in is reported, so the advisor sees the form being filled. */
export function followWork(follower: ((wc: WebContents) => void) | null): void {
  const scope = scopes.getStore();
  if (scope) scope.follower = follower;
  else workFollower = follower;
}

/** Thrown out of a run when the advisor cancels it (the quote service turns it into the result). */
export class QuoteRunStopped extends Error {}

export function beginRun(): void {
  single = newScope();
  lastUnscoped = null;
}

/** The page the current or last run's last step worked in, if still open. */
export function lastWorkedPage(): WebContents | null {
  const scope = scopes.getStore();
  const wc = scope ? scope.lastWorked : lastUnscoped;
  return wc && !wc.isDestroyed() ? wc : null;
}

export function endRun(): void {
  single = null;
}

/** Asks the unscoped run in progress to stop; false if there is none (or it is already stopping). */
export function stopRun(): boolean {
  if (!single || single.controller.signal.aborted) return false;
  single.controller.abort();
  return true;
}

/** A run in its own scope: its result, its cancel, and the page its last step worked in. */
export interface ScopedRun<T> {
  done: Promise<T>;
  /** Asks it to stop; false if it is already stopping. */
  stop: () => boolean;
  lastWorked: () => WebContents | null;
}

/** Runs `work` in a scope of its own (alongside other runs); `onStep` is told of its steps. */
export function runScoped<T>(
  work: () => Promise<T>,
  onStep: ((label: string) => void) | null = null,
): ScopedRun<T> {
  const scope = newScope(onStep);
  return {
    done: scopes.run(scope, work),
    stop: () => {
      if (scope.controller.signal.aborted) return false;
      scope.controller.abort();
      return true;
    },
    lastWorked: () =>
      scope.lastWorked && !scope.lastWorked.isDestroyed() ? scope.lastWorked : null,
  };
}

/** Tells the run's watcher which step it is on (the progress shown while it runs). */
export function reportStep(label: string): void {
  currentScope()?.onStep?.(label);
}

/** `work`, abandoned as soon as the run is cancelled. */
function orStopped<T>(work: Promise<T>, onStop?: () => void): Promise<T> {
  const signal = currentScope()?.controller.signal;
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const stop = () => {
      onStop?.();
      reject(new QuoteRunStopped());
    };
    if (signal.aborted) {
      stop();
      return;
    }
    signal.addEventListener('abort', stop, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** A wait in a run's own code (between page operations), which cancelling cuts short. */
export function runPause(ms: number): Promise<void> {
  return orStopped(new Promise((resolve) => setTimeout(resolve, ms)));
}

/**
 * Performs one operation in the page (isolated world); shared with the New India runner. Throws
 * QuoteRunStopped once the run is cancelled, whatever step it is on, optional steps included.
 */
export async function exec(wc: WebContents, op: PageOp): Promise<PageOpResult> {
  const scope = currentScope();
  if (scope?.controller.signal.aborted) throw new QuoteRunStopped();
  if (wc.isDestroyed()) return { ok: false, detail: 'window-closed' };
  const store = scopes.getStore();
  (store ? store.follower : workFollower)?.(wc);
  if (store) store.lastWorked = wc;
  else lastUnscoped = wc;
  try {
    const agent = wc.executeJavaScriptInIsolatedWorld(WORLD_ID, [
      { code: `(window.__fqfStop = false, (${AGENT_SOURCE})(${JSON.stringify(op)}))` },
    ]) as Promise<PageOpResult>;
    return await orStopped(agent, () => {
      // Ends the wait the operation is in, so that nothing changes on the page after the cancel.
      if (wc.isDestroyed()) return;
      void wc
        .executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: 'window.__fqfStop = true' }])
        .catch(() => undefined);
    });
  } catch (err) {
    if (err instanceof QuoteRunStopped) throw err;
    // The page went away (navigation) or the script failed: say which, for support.
    const reason = err instanceof Error ? err.message.slice(0, 120) : 'unknown';
    return { ok: false, detail: `page-changed: ${reason}` };
  }
}

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

const refused = (message: string, problems: string[] = []): QuoteRunResult => ({
  outcome: 'refused',
  step: null,
  message,
  problems,
});

/** United India's ERRORS pop-up's message, without its title and Close button. */
const errorsText = (text: string): string =>
  text
    .replace(/^\s*ERRORS\s*/i, '')
    .replace(/\s*Close\s*$/, '')
    .trim();

/** What a failed step of a United India form means, in the advisor's words. */
function explainUiic(step: PlanStep, detail: string | undefined): string {
  if (/^only-\d+$/.test(detail ?? '')) {
    return `United India offers ${detail!.slice(5)} choices here for this trip: pick one yourself.`;
  }
  if (detail?.startsWith('option-missing')) {
    const offered = /\(offered: (.*)\)$/.exec(detail)?.[1];
    return `United India's list did not offer this choice${offered ? ` (it showed: ${offered})` : ''}. If it showed only "Select", United India had not loaded the list yet.`;
  }
  if (detail?.startsWith('page-says: ')) return `United India says: ${detail.slice(11)}`;
  return step.ifStuck ?? `the form did not take this step (${detail ?? 'unknown'}).`;
}

/**
 * Opens a calculator (or e-proposal) from the United India home page and runs the steps in it.
 * A box it cannot fill is left for the advisor and the run goes on; a step that moves the form
 * along and fails, or United India's ERRORS pop-up, ends the filling: the form is handed over
 * (hand-over.ts). Otherwise `compose` makes the result from the last step's reading.
 */
async function runInCalculator(deps: {
  windows: () => PortalPage[];
  tile: string;
  /** The calculator's page: its path, or a pattern for a page whose path was not recorded. */
  calculatorPath: string | RegExp;
  steps: PlanStep[];
  /** What the plan already knows it cannot fill (the client's record lacks it). */
  left?: string[];
  /** What the advisor always does by hand on this form. */
  toDo?: string[];
  /**
   * The result once every step ran: from the last step's reading, the values kept by steps
   * marked `keep`, and United India's messages the run closed and went on. Also used once the
   * advisor has finished a handed-over form: `last` is then the premium reading.
   */
  compose: (
    last: PageOpResult | null,
    kept: Record<string, string>,
    notes: string[],
  ) => QuoteRunResult;
}): Promise<QuoteRunResult> {
  const main = deps.windows()[0];
  if (!main || main.isDestroyed()) return refused('Open United India and sign in first.');
  if (pathOf(main.webContents.getURL()) !== HOME_PATH) {
    return refused("Go to United India's home page (after signing in), then try again.");
  }
  const failed = (step: string, message: string): QuoteRunResult => ({
    outcome: 'failed',
    step,
    message,
    problems: [],
  });

  const before = new Set(deps.windows().map((w) => w.webContents.id));
  const opened = await exec(main.webContents, { op: 'clickLink', text: deps.tile });
  if (!opened.ok) {
    return failed('Open the calculator', `The "${deps.tile}" tile was not found on the home page.`);
  }
  const wanted = deps.calculatorPath;
  const isCalculator = (path: string): boolean =>
    typeof wanted === 'string' ? path === wanted : wanted.test(path);
  const newPages = (): PortalPage[] =>
    deps.windows().filter((w) => !before.has(w.webContents.id) && !w.isDestroyed());
  let calculator: PortalPage | undefined;
  for (let waited = 0; waited < 20_000 && !calculator; waited += 300) {
    await runPause(300);
    calculator = newPages().find((w) => isCalculator(pathOf(w.webContents.getURL())));
  }
  if (!calculator) {
    // Say where the tile went instead, if it opened a page: the form may have moved.
    const elsewhere = newPages()
      .map((w) => pathOf(w.webContents.getURL()))
      .find((path) => path && path !== 'blank');
    return failed(
      'Open the calculator',
      elsewhere
        ? `The calculator did not open: the tile opened ${elsewhere}, which the app does not know.`
        : 'The calculator did not open.',
    );
  }
  const page = calculator;

  let last: PageOpResult | null = null;
  /** United India's messages the run closed and went on (closeErrors steps). */
  const notes: string[] = [];
  const kept: Record<string, string> = {};
  const progress = new FillProgress(deps.steps, deps.left);
  const handOver = (stopped?: { label: string; why: string }): QuoteRunResult => {
    page.focus();
    return handedOver({
      insurer: 'United India',
      page,
      progress,
      stopped,
      toDo: [...(deps.toDo ?? []), ...notes],
      compose: (read) =>
        deps.compose(read, read.value ? { ...kept, premium: read.value } : kept, [
          ...new Set(notes),
        ]),
    });
  };
  for (const [index, step] of deps.steps.entries()) {
    reportStep(step.label);
    if (progress.stopBefore(index)) return handOver();
    const result = await exec(page.webContents, step.op);
    let errors = await exec(page.webContents, { op: 'errors' });
    if (errors.errors && step.closeErrors) {
      notes.push(`United India says: ${errorsText(errors.errors)}`);
      await exec(page.webContents, {
        op: 'clickButton',
        text: 'Close',
        within: 'ERRORS',
        timeoutMs: 3000,
      });
      // The pop-up fades out: wait until it is gone before looking again.
      await exec(page.webContents, { op: 'waitForDialogGone', text: 'ERRORS', timeoutMs: 3000 });
      errors = await exec(page.webContents, { op: 'errors' });
    }
    if (errors.errors) {
      return handOver({
        label: step.label,
        why: `United India says: ${errorsText(errors.errors)}`,
      });
    }
    if (!result.ok && step.optional) {
      if (step.ifMissed) notes.push(step.ifMissed);
      continue;
    }
    if (!result.ok && progress.skip(step, index, result)) continue;
    last = result;
    if (last.ok && step.keep && last.value) kept[step.keep] = last.value;
    if (!last.ok) return handOver({ label: step.label, why: explainUiic(step, last.detail) });
  }
  // Every step ran, but some boxes were left (a form without a premium step of its own).
  if (progress.left.length > 0) return handOver();
  page.focus();
  // The same message may come from more than one step (each section opened lists it again).
  return readAgain(deps.compose(last, kept, [...new Set(notes)]), {
    page,
    progress,
    compose: (read) =>
      deps.compose(read, read.value ? { ...kept, premium: read.value } : kept, [...new Set(notes)]),
  });
}

export async function runUiicHealthQuote(deps: {
  /** The United India pages (tabs): the portal first, then its pop-ups. */
  windows: () => PortalPage[];
  client: ClientInput;
  goodHealth: boolean;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planUiicHealthQuote(deps.client, { goodHealth: deps.goodHealth, today: deps.today });
  if (!plan.ok) return refused('This client cannot be quoted automatically yet.', plan.problems);
  return runInCalculator({
    windows: deps.windows,
    tile: 'Health Policy Premium Calculator',
    calculatorPath: '/CustomerAppLive/data/HealthPolicyNewQuote.html',
    steps: plan.steps,
    left: plan.left,
    compose: (last) => {
      const plans = last?.plans ?? [];
      const first = plans[0] ?? { name: 'Premium', amount: '' };
      return {
        outcome: 'ready',
        step: null,
        message: `United India health premiums (excluding GST): ${plans.map((p) => `${p.name} ₹${p.amount}`).join('; ')}.`,
        problems: [],
        premium: { label: first.name, amount: first.amount },
        plans,
        amountLabel: 'Premium (excluding GST)',
      };
    },
  });
}

export async function runUiicMotorQuote(deps: {
  windows: () => PortalPage[];
  vehicle: Vehicle;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planUiicMotorQuote(deps.vehicle, { today: deps.today });
  if (!plan.ok) return refused('This vehicle cannot be quoted automatically yet.', plan.problems);
  return runInCalculator({
    windows: deps.windows,
    tile: 'Motor Premium Calculator',
    calculatorPath: '/CustomerPortalWeb/PremiumCalculator/data/MotorQuote.html',
    steps: plan.steps,
    left: plan.left,
    compose: (last) => {
      const amount = last?.value ?? '';
      const label = last?.label ?? 'Premium';
      return {
        outcome: 'ready',
        step: null,
        message: `United India motor premium (including GST): ${amount}. ${label}. United India calls this a provisional quote premium; the agent's discount may change it.`,
        problems: [],
        premium: { label, amount },
      };
    },
  });
}

export async function runUiicHealthProposal(deps: {
  windows: () => PortalPage[];
  form: UiicProposalForm;
  client: ClientInput;
  /** The client's Aadhaar number, read from the vault just now; never returned or logged. */
  aadhaar: string | null;
}): Promise<QuoteRunResult> {
  const form = UIIC_PROPOSAL_FORMS[deps.form];
  const plan = planUiicHealthProposal(deps.client, { form: deps.form, aadhaar: deps.aadhaar });
  if (!plan.ok) return refused('This client cannot be filled in automatically yet.', plan.problems);
  return runInCalculator({
    windows: deps.windows,
    tile: form.tile,
    calculatorPath: form.path,
    steps: plan.steps,
    toDo: plan.byHand,
    compose: (last, _kept, notes) =>
      // Read after the advisor finished the form: the premium they had United India work out.
      last?.ok && last.value
        ? {
            outcome: 'ready',
            step: null,
            message: `${form.name} proposal: United India's premium ₹${last.value}. Check every section, then press Save As Draft yourself. The app never saves or submits a proposal.`,
            problems: [],
            premium: { label: `${form.name} proposal premium`, amount: last.value },
          }
        : {
            outcome: 'ready',
            step: null,
            message: `${form.name} proposal: the proposer details and nominee relationship are filled. Fill in what is listed below, check every section, then press Save As Draft yourself. The app never saves or submits a proposal.`,
            problems: [],
            toDo: [...plan.byHand, ...notes],
          },
  });
}

export async function runUiicTravelProposal(deps: {
  windows: () => PortalPage[];
  /** The travel client: proposer and insured. */
  traveller: Traveller;
  /** Entered for this run. */
  trip: TravelTrip;
  /** The traveller's Aadhaar and passport numbers, read from the vault just now; never returned
   * or logged. */
  aadhaar: string | null;
  passportNumber: string | null;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planUiicTravelProposal(deps.traveller, deps.trip, {
    aadhaar: deps.aadhaar,
    passportNumber: deps.passportNumber,
    today: deps.today,
  });
  if (!plan.ok) return refused('This trip cannot be filled in automatically.', plan.problems);
  return runInCalculator({
    windows: deps.windows,
    tile: 'Overseas Travel Insurance E-Proposal Form',
    calculatorPath: '/CustomerAppLive/data/ProposalOTIhome.html',
    steps: plan.steps,
    toDo: plan.byHand,
    compose: (last, _kept, notes) => {
      // The premium box may hold a placeholder (0) until View Premium works it out.
      const amount = last?.value && Number(last.value.replace(/,/g, '')) > 0 ? last.value : null;
      const label = 'Total Premium (including GST)';
      return {
        outcome: 'ready',
        step: null,
        message: amount
          ? `Overseas Travel proposal filled. United India's total premium (including GST): ${amount}. Fill in what is listed below, check every section, then press Save As Draft yourself. The app never saves or submits a proposal.`
          : 'Overseas Travel proposal filled; United India did not show the premium yet (see its messages below). Fill in what is listed below, press View Premium, check every section, then press Save As Draft yourself. The app never saves or submits a proposal.',
        problems: [],
        ...(amount ? { premium: { label, amount } } : {}),
        toDo: [...plan.byHand, ...notes],
      };
    },
  });
}

export async function runUiicOmpProposal(deps: {
  windows: () => PortalPage[];
  /** The travel client: proposer and insured. */
  traveller: Traveller;
  /** Entered for this run. */
  trip: OmpTrip;
  /** The traveller's Aadhaar and passport numbers, read from the vault just now; never returned
   * or logged. */
  aadhaar: string | null;
  passportNumber: string | null;
  today: Date;
}): Promise<QuoteRunResult> {
  const form = UIIC_OMP_FORMS[deps.trip.form];
  const plan = planUiicOmpProposal(deps.traveller, deps.trip, {
    aadhaar: deps.aadhaar,
    passportNumber: deps.passportNumber,
    today: deps.today,
  });
  if (!plan.ok) return refused('This trip cannot be filled in automatically.', plan.problems);
  return runInCalculator({
    windows: deps.windows,
    tile: form.tile,
    calculatorPath: form.path,
    steps: plan.steps,
    toDo: plan.byHand,
    compose: (_last, kept, notes) => {
      const amount =
        kept.premium && Number(kept.premium.replace(/,/g, '')) > 0 ? kept.premium : null;
      const chosen = kept.plan ? `plan ${kept.plan}` : 'the plan';
      return {
        outcome: 'ready',
        step: null,
        message: amount
          ? `${form.name} proposal filled with ${chosen}. United India's total premium: ${amount}. Fill in what is listed below, check every section, then press Save As Draft yourself. The app never saves or submits a proposal.`
          : `${form.name} proposal filled with ${chosen}; United India did not show the premium (see its messages below). Fill in what is listed below, check every section, then press Save As Draft yourself. The app never saves or submits a proposal.`,
        problems: [],
        ...(amount ? { premium: { label: `Total premium, ${chosen}`, amount } } : {}),
        toDo: [...plan.byHand, ...notes],
      };
    },
  });
}
