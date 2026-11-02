// Runs the United India health calculator for a saved client (plan: uiic-health.ts) in the signed-in
// United India window: from the home page it opens the calculator (a pop-up in the same session),
// performs each step, and after every step checks for United India's ERRORS pop-up. It stops at
// the "User Details" pop-up and brings the calculator to the front for the advisor.
import type { BrowserWindow, WebContents } from 'electron';
import type { ClientInput } from '../../shared/contracts/client';
import { quotePageAgent, type PageOp, type PageOpResult } from './page-ops';
import { planUiicHealthQuote } from './uiic-health';

const AGENT_SOURCE = quotePageAgent.toString();
const WORLD_ID = 1803;
const HOME_PATH = '/GCWebPortal/login/HomeAction.do';
const CALCULATOR_PATH = '/CustomerAppLive/data/HealthPolicyNewQuote.html';
const TILE = 'Health Policy Premium Calculator';

export interface QuoteRunResult {
  outcome: 'ready' | 'refused' | 'failed';
  /** The step that stopped the run, if any. */
  step: string | null;
  message: string;
  /** Why the client cannot be quoted this way (refused before anything was touched). */
  problems: string[];
}

async function exec(wc: WebContents, op: PageOp): Promise<PageOpResult> {
  if (wc.isDestroyed()) return { ok: false, detail: 'window-closed' };
  try {
    return (await wc.executeJavaScriptInIsolatedWorld(WORLD_ID, [
      { code: `(${AGENT_SOURCE})(${JSON.stringify(op)})` },
    ])) as PageOpResult;
  } catch {
    return { ok: false, detail: 'page-changed' };
  }
}

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

export async function runUiicHealthQuote(deps: {
  /** The United India windows: the portal first, then its pop-ups. */
  windows: () => BrowserWindow[];
  client: ClientInput;
  goodHealth: boolean;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planUiicHealthQuote(deps.client, { goodHealth: deps.goodHealth, today: deps.today });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: 'This client cannot be quoted automatically yet.',
      problems: plan.problems,
    };
  }
  const main = deps.windows()[0];
  if (!main || main.isDestroyed()) {
    return {
      outcome: 'refused',
      step: null,
      message: 'Open United India and sign in first.',
      problems: [],
    };
  }
  if (pathOf(main.webContents.getURL()) !== HOME_PATH) {
    return {
      outcome: 'refused',
      step: null,
      message: "Go to United India's home page (after signing in), then try again.",
      problems: [],
    };
  }

  const before = new Set(deps.windows().map((w) => w.id));
  const opened = await exec(main.webContents, { op: 'clickLink', text: TILE });
  if (!opened.ok) {
    return {
      outcome: 'failed',
      step: 'Open the calculator',
      message: `The "${TILE}" tile was not found on the home page.`,
      problems: [],
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
          pathOf(w.webContents.getURL()) === CALCULATOR_PATH,
      );
  }
  if (!calculator) {
    return {
      outcome: 'failed',
      step: 'Open the calculator',
      message: 'The calculator window did not open.',
      problems: [],
    };
  }

  for (const step of plan.steps) {
    const result = await exec(calculator.webContents, step.op);
    const errors = await exec(calculator.webContents, { op: 'errors' });
    if (errors.errors) {
      calculator.focus();
      return {
        outcome: 'failed',
        step: step.label,
        message: `United India says: ${errors.errors}`,
        problems: [],
      };
    }
    if (!result.ok) {
      calculator.focus();
      return {
        outcome: 'failed',
        step: step.label,
        message: `Stopped at "${step.label}" (${result.detail ?? 'unknown'}). The calculator may have changed; finish this quote by hand.`,
        problems: [],
      };
    }
  }
  calculator.focus();
  return {
    outcome: 'ready',
    step: null,
    message:
      'United India calculator filled. Enter or check the email and mobile in the "User Details" pop-up, then press Check Premium.',
    problems: [],
  };
}
