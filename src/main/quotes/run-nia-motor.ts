// Runs the New India motor plan (nia-motor.ts) in New India's own page. If the Private Car or
// Two Wheeler quote form is not open yet, it opens it from the dashboard as the advisor showed
// (screenshots of 4 November 2026): Product Selection, MOTOR, then the product's tile; the form
// opens in the same page. After every step it looks for a New India pop-up (for example
// "presently our services are not available") and stops with its text. It never presses
// Calculate Premium or any save button.
import type { PortalPage } from '../insurers/portal-host';
import type { Vehicle } from '../../shared/contracts/vehicle';
import { NIA_BY_HAND, NIA_FORMS, planNiaMotorQuote } from './nia-motor';
import { exec, type QuoteRunResult } from './run-uiic-health';

export const FORM_PATH = '/NIABancsPortal/QuoteNonCustomer.html';
const DASHBOARD_PATH = '/NIABancsPortal/NonCustomerDashboard.html';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

/** What a step's failure means, in the advisor's words. */
function explain(label: string, detail: string | undefined): string {
  if (detail?.startsWith('option-missing')) {
    return `New India does not list this ${label.toLowerCase()} as saved. Change it on the vehicle to the name New India uses, or choose it by hand.`;
  }
  if (detail?.startsWith('no-match')) {
    return `New India suggests no ${label.toLowerCase()} with this name for the make. Change it on the vehicle to the name New India suggests, or choose it by hand.`;
  }
  if (detail === 'still-disabled') {
    return `New India did not enable the ${label} box (it waits for the make's models). Fill the rest by hand.`;
  }
  return `Stopped at "${label}" (${detail ?? 'unknown'}). The form may have changed; fill the rest by hand.`;
}

export async function runNiaMotorQuote(deps: {
  /** New India's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  vehicle: Vehicle;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planNiaMotorQuote(deps.vehicle, { today: deps.today });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: 'This vehicle cannot be filled in automatically yet.',
      problems: plan.problems,
    };
  }
  const form = NIA_FORMS[plan.form];
  const pages = () => deps.windows().filter((w) => !w.isDestroyed());
  const formPage = () => pages().find((w) => pathOf(w.webContents.getURL()) === FORM_PATH);

  let page = formPage();
  // A form already open for the other product (or still loading another) is not used.
  if (
    page &&
    !(await exec(page.webContents, { op: 'hasHeading', text: form.heading, timeoutMs: 3000 })).ok
  ) {
    page = undefined;
  }
  if (!page) {
    const opened = await openNiaForm(pages, {
      ...form,
      group: 'MOTOR',
      groupName: 'Motor Products',
      tiles: [form.name],
    });
    if ('message' in opened) return opened;
    page = opened.page;
  }
  const wc = page.webContents;
  const before = await exec(wc, { op: 'popup' });
  if (before.errors) {
    page.focus();
    return {
      outcome: 'refused',
      step: null,
      message: `Close New India's message first, then try again. It says: ${before.errors}`,
      problems: [],
    };
  }

  for (const step of plan.steps) {
    const result = await exec(wc, step.op);
    const popup = await exec(wc, { op: 'popup' });
    if (popup.errors) {
      page.focus();
      return {
        outcome: 'failed',
        step: step.label,
        message: `New India says: ${popup.errors}`,
        problems: [],
      };
    }
    if (!result.ok) {
      page.focus();
      return {
        outcome: 'failed',
        step: step.label,
        message: explain(step.label, result.detail),
        problems: [],
        toDo: NIA_BY_HAND,
      };
    }
  }
  page.focus();
  return {
    outcome: 'ready',
    step: null,
    message: `New India ${form.name} form: the vehicle details are filled. Do what is listed below; the app does not press Calculate Premium.`,
    problems: [],
    toDo: NIA_BY_HAND,
  };
}

/** A quote form to open from New India's dashboard. */
export interface NiaFormToOpen {
  /** The product, as the advisor knows it. */
  name: string;
  /** The form's heading once open (null: a form without one, known by `marker`). */
  heading: string | null;
  /** A button's text that only this form has (for a form without a heading). */
  marker?: string;
  /** The product group's tile (MOTOR, HEALTH) and the group's name, for messages. */
  group: string;
  groupName: string;
  /** The product's tile text: the first one shown is clicked. */
  tiles: string[];
}

/**
 * Opens the product's quote form from New India's dashboard: the group (unless its tiles are
 * already shown), then the product's tile, and waits for the form and its heading. A pop-up New
 * India shows on the dashboard meanwhile is handed to `onPopup` (it answers it and the wait goes
 * on, or stops the run); without `onPopup` it stops the run with its text.
 */
export async function openNiaForm(
  pages: () => PortalPage[],
  form: NiaFormToOpen,
  onPopup?: (dashboard: PortalPage, text: string) => Promise<QuoteRunResult | null>,
): Promise<{ page: PortalPage } | QuoteRunResult> {
  const failed = (step: string, message: string): QuoteRunResult => ({
    outcome: 'failed',
    step,
    message,
    problems: [],
  });
  if (form.tiles.length === 0) {
    return {
      outcome: 'refused',
      step: null,
      message: `Open New India's ${form.name} quote form yourself (its tile was not recorded), then press Fill again.`,
      problems: [],
    };
  }
  const dashboard = pages().find((w) => pathOf(w.webContents.getURL()) === DASHBOARD_PATH);
  if (!dashboard) {
    return {
      outcome: 'refused',
      step: null,
      message: 'Open New India and sign in, then go to its dashboard (My Dashboard) and try again.',
      problems: [],
    };
  }
  const wc = dashboard.webContents;
  const clickTile = async (timeoutMs: number) => {
    let last = await exec(wc, { op: 'clickText', text: form.tiles[0]!, timeoutMs });
    for (const tile of form.tiles.slice(1)) {
      if (last.detail !== 'not-found') break;
      last = await exec(wc, { op: 'clickText', text: tile, timeoutMs: 1500 });
    }
    return last;
  };
  let clicked = await clickTile(1500);
  if (clicked.detail === 'not-found') {
    const group = await exec(wc, { op: 'clickText', text: form.group, timeoutMs: 10_000 });
    if (!group.ok) {
      dashboard.focus();
      return failed(
        'Open the quote form',
        `The ${form.group} product was not found on New India's dashboard (${group.detail}). Open the ${form.name} quote form by hand, then try again.`,
      );
    }
    clicked = await clickTile(10_000);
  }
  if (!clicked.ok) {
    dashboard.focus();
    return failed(
      'Open the quote form',
      `The ${form.name} tile was not found under ${form.groupName} (${clicked.detail}). Open the form by hand, then try again.`,
    );
  }
  // The form opens in the same page (recorded): wait for it, then for its heading (the form
  // loads its lists first).
  for (let waited = 0; waited < 30_000; waited += 500) {
    await sleep(500);
    const page = pages().find((w) => pathOf(w.webContents.getURL()) === FORM_PATH);
    if (!page) {
      const popup = onPopup && !dashboard.isDestroyed() ? await exec(wc, { op: 'popup' }) : null;
      if (onPopup && popup?.errors) {
        const stop = await onPopup(dashboard, popup.errors);
        if (stop) {
          dashboard.focus();
          return stop;
        }
      }
      continue;
    }
    const heading = await exec(
      page.webContents,
      form.heading !== null
        ? { op: 'hasHeading', text: form.heading, timeoutMs: 20_000 }
        : { op: 'hasText', text: form.marker ?? '', timeoutMs: 20_000 },
    );
    if (heading.ok) return { page };
    page.focus();
    return failed(
      'Open the quote form',
      `New India opened a quote form, but not the ${form.name} form. Open it by hand, then try again.`,
    );
  }
  dashboard.focus();
  return failed(
    'Open the quote form',
    `New India did not open the ${form.name} quote form. Open it by hand, then try again.`,
  );
}
