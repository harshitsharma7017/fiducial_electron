// Runs a United India premium calculator for a saved client in the signed-in United India window:
// from the home page it opens the calculator (a pop-up in the same session), performs each step
// of the plan, and after every step checks for United India's ERRORS pop-up.
// - Health (plan: uiic-health.ts): stops at the "User Details" pop-up for the advisor.
// - Motor (plan: uiic-motor.ts): reads the premium from "Premium Details" and returns it.
import type { BrowserWindow, WebContents } from 'electron';
import type { ClientInput } from '../../shared/contracts/client';
import { quotePageAgent, type PageOp, type PageOpResult } from './page-ops';
import { planUiicHealthQuote, type PlanStep } from './uiic-health';
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
  windows: () => BrowserWindow[];
  tile: string;
  calculatorPath: string;
  steps: PlanStep[];
}): Promise<{ result: QuoteRunResult | null; last: PageOpResult | null }> {
  const main = deps.windows()[0];
  if (!main || main.isDestroyed()) {
    return { result: refused('Open United India and sign in first.'), last: null };
  }
  if (pathOf(main.webContents.getURL()) !== HOME_PATH) {
    return {
      result: refused("Go to United India's home page (after signing in), then try again."),
      last: null,
    };
  }
  const failed = (step: string, message: string): QuoteRunResult => ({
    outcome: 'failed',
    step,
    message,
    problems: [],
  });

  const before = new Set(deps.windows().map((w) => w.id));
  const opened = await exec(main.webContents, { op: 'clickLink', text: deps.tile });
  if (!opened.ok) {
    return {
      result: failed(
        'Open the calculator',
        `The "${deps.tile}" tile was not found on the home page.`,
      ),
      last: null,
    };
  }
  let calculator: BrowserWindow | undefined;
  for (let waited = 0; waited < 20_000 && !calculator; waited += 300) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    calculator = deps
      .windows()
      .find(
        (w) =>
          !before.has(w.id) &&
          !w.isDestroyed() &&
          pathOf(w.webContents.getURL()) === deps.calculatorPath,
      );
  }
  if (!calculator) {
    return {
      result: failed('Open the calculator', 'The calculator window did not open.'),
      last: null,
    };
  }

  let last: PageOpResult | null = null;
  for (const step of deps.steps) {
    last = await exec(calculator.webContents, step.op);
    const errors = await exec(calculator.webContents, { op: 'errors' });
    if (errors.errors) {
      calculator.focus();
      return { result: failed(step.label, `United India says: ${errors.errors}`), last };
    }
    if (!last.ok) {
      calculator.focus();
      return {
        result: failed(
          step.label,
          `Stopped at "${step.label}" (${last.detail ?? 'unknown'}). The calculator may have changed; finish this quote by hand.`,
        ),
        last,
      };
    }
  }
  calculator.focus();
  return { result: null, last };
}

export async function runUiicHealthQuote(deps: {
  /** The United India windows: the portal first, then its pop-ups. */
  windows: () => BrowserWindow[];
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
  windows: () => BrowserWindow[];
  client: ClientInput;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planUiicMotorQuote(deps.client, { today: deps.today });
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
