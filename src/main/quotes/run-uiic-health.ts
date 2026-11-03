// Runs a United India premium calculator in the signed-in United India page: from the home page it
// opens the calculator (a pop-up in the same session, shown as a tab of the app window), performs
// each step of the plan, and after every step checks for United India's ERRORS pop-up.
// - Health (plan: uiic-health.ts): stops at the "User Details" pop-up for the advisor.
// - Motor (plan: uiic-motor.ts): reads the premium from "Premium Details" and returns it.
// - Family Medicare and Individual Health e-proposals (plan: uiic-health-proposal.ts): fill
//   sections I-II and stop; the advisor fills the rest and saves it. The app never saves or submits
//   a proposal.
import type { WebContents } from 'electron';
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import type { Vehicle } from '../../shared/contracts/vehicle';
import { quotePageAgent, type PageOp, type PageOpResult } from './page-ops';
import { planUiicHealthQuote, type PlanStep } from './uiic-health';
import {
  planUiicHealthProposal,
  UIIC_PROPOSAL_FORMS,
  type UiicProposalForm,
} from './uiic-health-proposal';
import { planUiicMotorQuote } from './uiic-motor';

const AGENT_SOURCE = quotePageAgent.toString();
const WORLD_ID = 1803;
const HOME_PATH = '/GCWebPortal/login/HomeAction.do';

export interface QuoteRunResult {
  outcome: 'ready' | 'refused' | 'failed';
  /** The step that stopped the run, if any. */
  step: string | null;
  message: string;
  /** Why the client cannot be quoted this way (refused before anything was touched). */
  problems: string[];
  /** The premium read from the insurer's page (motor), as shown there. */
  premium?: { label: string; amount: string };
  /** What the advisor still fills by hand (e-proposals), and the insurer's messages about it. */
  toDo?: string[];
}

async function exec(wc: WebContents, op: PageOp): Promise<PageOpResult> {
  if (wc.isDestroyed()) return { ok: false, detail: 'window-closed' };
  try {
    return (await wc.executeJavaScriptInIsolatedWorld(WORLD_ID, [
      { code: `(${AGENT_SOURCE})(${JSON.stringify(op)})` },
    ])) as PageOpResult;
  } catch (err) {
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

/** Opens a calculator from the United India home page and runs the steps in it. */
async function runInCalculator(deps: {
  windows: () => PortalPage[];
  tile: string;
  calculatorPath: string;
  steps: PlanStep[];
}): Promise<{ result: QuoteRunResult | null; last: PageOpResult | null; notes: string[] }> {
  const main = deps.windows()[0];
  if (!main || main.isDestroyed()) {
    return { result: refused('Open United India and sign in first.'), last: null, notes: [] };
  }
  if (pathOf(main.webContents.getURL()) !== HOME_PATH) {
    return {
      result: refused("Go to United India's home page (after signing in), then try again."),
      last: null,
      notes: [],
    };
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
    return {
      result: failed(
        'Open the calculator',
        `The "${deps.tile}" tile was not found on the home page.`,
      ),
      last: null,
      notes: [],
    };
  }
  let calculator: PortalPage | undefined;
  for (let waited = 0; waited < 20_000 && !calculator; waited += 300) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    calculator = deps
      .windows()
      .find(
        (w) =>
          !before.has(w.webContents.id) &&
          !w.isDestroyed() &&
          pathOf(w.webContents.getURL()) === deps.calculatorPath,
      );
  }
  if (!calculator) {
    return {
      result: failed('Open the calculator', 'The calculator did not open.'),
      last: null,
      notes: [],
    };
  }

  let last: PageOpResult | null = null;
  /** United India's messages the run closed and went on (closeErrors steps). */
  const notes: string[] = [];
  for (const step of deps.steps) {
    const result = await exec(calculator.webContents, step.op);
    let errors = await exec(calculator.webContents, { op: 'errors' });
    if (errors.errors && step.closeErrors) {
      notes.push(
        `United India says: ${errors.errors.replace(/^\s*ERRORS\s*/i, '').replace(/\s*Close\s*$/, '')}`,
      );
      await exec(calculator.webContents, {
        op: 'clickButton',
        text: 'Close',
        within: 'ERRORS',
        timeoutMs: 3000,
      });
      // The pop-up fades out: wait until it is gone before looking again.
      await exec(calculator.webContents, {
        op: 'waitForDialogGone',
        text: 'ERRORS',
        timeoutMs: 3000,
      });
      errors = await exec(calculator.webContents, { op: 'errors' });
    }
    if (errors.errors) {
      calculator.focus();
      return { result: failed(step.label, `United India says: ${errors.errors}`), last, notes };
    }
    if (!result.ok && step.optional) {
      if (step.ifMissed) notes.push(step.ifMissed);
      continue;
    }
    last = result;
    if (!last.ok) {
      calculator.focus();
      return {
        result: failed(
          step.label,
          `Stopped at "${step.label}" (${last.detail ?? 'unknown'}). The calculator may have changed; finish this quote by hand.`,
        ),
        last,
        notes,
      };
    }
  }
  calculator.focus();
  // The same message may come from more than one step (each section opened lists it again).
  return { result: null, last, notes: [...new Set(notes)] };
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
  const { result } = await runInCalculator({
    windows: deps.windows,
    tile: 'Health Policy Premium Calculator',
    calculatorPath: '/CustomerAppLive/data/HealthPolicyNewQuote.html',
    steps: plan.steps,
  });
  return (
    result ?? {
      outcome: 'ready',
      step: null,
      message:
        'United India calculator filled. Enter or check the email and mobile in the "User Details" pop-up, then press Check Premium.',
      problems: [],
    }
  );
}

export async function runUiicMotorQuote(deps: {
  windows: () => PortalPage[];
  vehicle: Vehicle;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planUiicMotorQuote(deps.vehicle, { today: deps.today });
  if (!plan.ok) return refused('This vehicle cannot be quoted automatically yet.', plan.problems);
  const { result, last } = await runInCalculator({
    windows: deps.windows,
    tile: 'Motor Premium Calculator',
    calculatorPath: '/CustomerPortalWeb/PremiumCalculator/data/MotorQuote.html',
    steps: plan.steps,
  });
  if (result) return result;
  const amount = last?.value ?? '';
  const label = last?.label ?? 'Premium';
  return {
    outcome: 'ready',
    step: null,
    message: `United India motor premium (including GST): ${amount}. ${label}. United India calls this a provisional quote premium; the agent's discount may change it.`,
    problems: [],
    premium: { label, amount },
  };
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
  const { result, notes } = await runInCalculator({
    windows: deps.windows,
    tile: form.tile,
    calculatorPath: form.path,
    steps: plan.steps,
  });
  if (result) return result;
  return {
    outcome: 'ready',
    step: null,
    message: `${form.name} proposal: the proposer details and nominee relationship are filled. Fill in what is listed below, check every section, then press Save As Draft yourself. The app never saves or submits a proposal.`,
    problems: [],
    toDo: [...plan.byHand, ...notes],
  };
}
