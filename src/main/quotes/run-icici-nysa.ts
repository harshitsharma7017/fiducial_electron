// Runs ICICI Lombard's NYSA health-site forms (Elevate, International Travel, Student Medical
// Travel; ./icici-nysa.ts) in ICICI's own page:
//   a tab already on the health site (nysa-health.icicilombard.com) is sent to the form; else
//   NYSA's dashboard's Health tile, whose server hands the tab to the health site (its /swap page,
//   as recorded). The form's address is loaded; if it does not show, the health dashboard's tile.
// A box ICICI does not take is left for the advisor and the run goes on; anything else that fails
// hands the form over, and the app watches for the premium (hand-over.ts). Generate Quote and Get
// quote are pressed (allowed by the advisor, 26 November 2026); never Save & Proceed or anything
// after.
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import type { Traveller } from '../../shared/contracts/traveller';
import {
  ICICI_NYSA_PAGES,
  NYSA_HEALTH_DASHBOARD,
  NYSA_HEALTH_ORIGIN,
  type IciciElevateRun,
  type IciciIntlTravelRun,
  type IciciNysaProduct,
  type IciciStudentTravelRun,
} from '../../shared/insurers/icici-nysa';
import { FillProgress, handedOver, readAgain } from './hand-over';
import {
  planIciciElevate,
  planIciciIntlTravel,
  planIciciStudentTravel,
  type IciciNysaPlan,
} from './icici-nysa';
import type { PageOpResult } from './page-ops';
import { exec, reportStep, runPause, type QuoteRunResult } from './run-uiic-health';
import { addressOf, traced, type RunTrace } from './run-trace';
import type { PlanStep } from './uiic-health';

export const NYSA_ORIGIN = 'https://nysa.icicilombard.com';

/** Where ICICI's sites are served from: ICICI's own, or in tests the local copies. */
export interface NysaOrigins {
  nysa: string;
  health: string;
}
const ORIGINS: NysaOrigins = { nysa: NYSA_ORIGIN, health: NYSA_HEALTH_ORIGIN };

const originOf = (p: PortalPage): string => {
  try {
    return new URL(p.webContents.getURL()).origin;
  } catch {
    return '';
  }
};
const pathOf = (p: PortalPage): string => {
  try {
    return new URL(p.webContents.getURL()).pathname;
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

/** The product's form, open and ready, in the tab on ICICI's health site. */
async function openForm(
  windows: () => PortalPage[],
  product: IciciNysaProduct,
  origins: NysaOrigins,
  trace: RunTrace,
): Promise<{ page: PortalPage } | QuoteRunResult> {
  const want = ICICI_NYSA_PAGES[product];
  const pages = () => windows().filter((w) => !w.isDestroyed());
  const ready = async (p: PortalPage, ms: number) =>
    (await exec(p.webContents, { op: 'waitFor', selector: want.ready, timeoutMs: ms })).ok;
  /** A tab on the health site (past ICICI's /swap page), at `path` if given. */
  const onHealth = (path?: string) =>
    pages().find(
      (p) =>
        originOf(p) === origins.health &&
        pathOf(p) !== '/swap' &&
        (path === undefined || pathOf(p) === path),
    );

  trace.note('start', { form: want.path, tabs: pages().map(addressOf) });
  // Already open and drawn (ICICI's "page could not be found" has no form).
  const open = onHealth(want.path);
  if (open && (await ready(open, 3000))) {
    trace.note('the form is already open');
    return { page: open };
  }

  /**
   * NYSA's Health tile, from NYSA's dashboard (in its tab, else the health site's tab sent back
   * there): ICICI's server hands the tab to the health site, which shows its dashboard, then
   * Elevate by itself (as recorded). Resolves with the health site's tab once it shows `path`
   * (any page of it, without one).
   */
  const viaHealthTile = async (path?: string): Promise<PortalPage | QuoteRunResult> => {
    const tab =
      pages().find((p) => originOf(p) === origins.nysa) ??
      pages().find((p) => originOf(p) === origins.health);
    if (!tab) {
      return refused(
        "Sign in to ICICI Lombard's NYSA first (Insurer portals, ICICI Lombard), then press again. The app opens the health site from NYSA's dashboard.",
      );
    }
    reportStep("Opening ICICI's health site");
    const onDashboard =
      originOf(tab) === origins.nysa &&
      /^#\/dashboard/.test(new URL(tab.webContents.getURL()).hash);
    trace.note(onDashboard ? "on NYSA's dashboard" : "to NYSA's dashboard", {
      from: addressOf(tab),
    });
    if (!onDashboard) {
      try {
        await tab.webContents.loadURL(`${origins.nysa}/#/dashboard`);
      } catch {
        // The tile below decides.
      }
      await runPause(2000);
    }
    // NYSA's Health tile (recorded: its span "health" in the dashboard's insurance section).
    const tile = await exec(tab.webContents, {
      op: 'clickSelector',
      selector: '#insurance_section span.health, span.health',
      timeoutMs: 15000,
    });
    trace.note("press NYSA's Health tile", { ok: tile.ok, detail: tile.detail ?? null });
    if (!tile.ok && !tile.detail?.startsWith('page-changed')) {
      tab.focus();
      return refused(
        `NYSA's Health tile was not found (${tile.detail ?? 'unknown'}). Is the tab on NYSA's dashboard, signed in, with no message open?`,
      );
    }
    // On to `path`; for Elevate, the health site goes there by itself (as recorded) or stays
    // on its dashboard, whose Elevate tile is then pressed.
    let pressedTile = false;
    for (let waited = 0; waited < 45_000; waited += 500) {
      await runPause(500);
      const there = onHealth(path);
      if (there) {
        trace.note('reached', { at: addressOf(there) });
        return there;
      }
      const dashboard = path ? onHealth(NYSA_HEALTH_DASHBOARD) : undefined;
      if (dashboard && !pressedTile && waited >= 8000) {
        pressedTile = true;
        const pressed = await exec(dashboard.webContents, {
          op: 'clickTile',
          selector:
            '.productview_box, [class*="productview"], [class*="product-card"], mat-card, [mattooltip]',
          pattern: want.tile,
          timeoutMs: 10_000,
        });
        trace.note(`the health dashboard stayed: press its ${want.tile} tile`, {
          ok: pressed.ok,
          detail: pressed.detail ?? null,
          tile: pressed.value ?? null,
        });
        if (!pressed.ok) {
          dashboard.focus();
          return refused(
            `ICICI's health site stayed on its dashboard after NYSA's Health tile, and no ${want.tile} tile was found there (${pressed.detail ?? 'unknown'}). Open ${want.name} yourself, then press again.`,
          );
        }
      }
    }
    trace.note('not reached', { tabs: pages().map(addressOf) });
    tab.focus();
    return refused(
      path
        ? `ICICI's Health tile did not lead to ${want.name} within 45 seconds. Open Health on NYSA yourself, then press again.`
        : "ICICI did not open its health site within 45 seconds of NYSA's Health tile. Open Health on NYSA yourself, then press again.",
    );
  };

  if (want.viaHealthTile) {
    const page = await viaHealthTile(want.path);
    if ('outcome' in page) return page;
    if (await ready(page, 30_000)) return { page };
    page.focus();
    return {
      outcome: 'failed',
      step: `Open ${want.name}`,
      message: `ICICI's ${want.name} form did not show after NYSA's Health tile. Open Health on NYSA yourself, then press again.`,
      problems: [],
    };
  }

  // The travel forms: the health site (by the Health tile, if no tab is on it), then the address.
  let page = onHealth();
  if (!page) {
    const got = await viaHealthTile();
    if ('outcome' in got) return got;
    page = got;
  }
  if (pathOf(page) !== want.path) {
    reportStep(`Opening ${want.name}`);
    try {
      await page.webContents.loadURL(`${origins.health}${want.path}`);
    } catch {
      // A redirect after the load started reports as a failure; the check below decides.
    }
  }
  if (await ready(page, 30_000)) return { page };
  // The address alone did not show the form: the health dashboard's tile.
  try {
    await page.webContents.loadURL(`${origins.health}${NYSA_HEALTH_DASHBOARD}`);
  } catch {
    // As above.
  }
  await exec(page.webContents, { op: 'clickText', text: want.tile, timeoutMs: 20_000 });
  if (await ready(page, 30_000)) return { page };
  page.focus();
  return {
    outcome: 'failed',
    step: `Open ${want.name}`,
    message: `ICICI's ${want.name} form did not open. Open it from the health site's dashboard yourself, then press again.`,
    problems: [],
  };
}

/** Why a step did not go through, in the advisor's words. */
function explain(step: PlanStep, detail: string | undefined, says: string | null): string {
  if (says) return `ICICI says: ${says}`;
  const offered = /\(offered: (.*)\)$/.exec(detail ?? '')?.[1];
  if (detail?.startsWith('option-missing')) {
    return `ICICI does not offer this at "${step.label}"${offered ? ` (it offers: ${offered})` : ''}. Choose it by hand.`;
  }
  if (detail?.startsWith('refused: ')) return `ICICI says: ${detail.slice(9)}`;
  if (detail === 'date-disabled') {
    return `ICICI's calendar does not allow that date at "${step.label}".`;
  }
  if (step.op.op === 'readCards' || step.op.op === 'readAmount') {
    return `ICICI did not show a premium after ${step.op.op === 'readCards' ? 'Generate Quote' : 'Get quote'}. Check what it marks on the form.`;
  }
  return `Stopped at "${step.label}" (${detail ?? 'unknown'}). The form may have changed; fill the rest by hand.`;
}

/** Runs the plan on the form; `compose` makes the result from the premium's reading. */
async function runPlan(
  page: PortalPage,
  plan: Extract<IciciNysaPlan, { ok: true }>,
  compose: (read: PageOpResult, kept: Record<string, string>) => QuoteRunResult,
  trace: RunTrace,
): Promise<QuoteRunResult> {
  const wc = page.webContents;
  const before = await exec(wc, { op: 'popup' });
  if (before.errors) {
    page.focus();
    return refused(`Close ICICI's message first, then try again. It says: ${before.errors}`);
  }
  const missed: string[] = [];
  const kept: Record<string, string> = {};
  const progress = new FillProgress(plan.steps, plan.byHand);
  const handOver = (stopped?: { label: string; why: string }): QuoteRunResult => {
    page.focus();
    return handedOver({
      insurer: 'ICICI Lombard',
      page,
      progress,
      stopped,
      toDo: missed,
      compose: (read) => compose(read, kept),
    });
  };
  let last: PageOpResult | null = null;
  for (const [index, step] of plan.steps.entries()) {
    reportStep(step.label);
    if (progress.stopBefore(index)) return handOver();
    const result = await exec(wc, step.op);
    // In the trace: the step and how it went (a list's options when it lacked the value; the
    // option chosen; never a box's typed value).
    trace.note('step', {
      label: step.label,
      op: step.op.op,
      ok: result.ok,
      detail: result.detail ?? null,
      ...(step.op.op === 'matSelect' && result.value ? { chose: result.value } : {}),
    });
    if (result.ok && step.keep && result.value) kept[step.keep] = result.value;
    if (result.ok) {
      last = result;
      continue;
    }
    if (step.optional) {
      if (step.ifMissed && !missed.includes(step.ifMissed)) missed.push(step.ifMissed);
      continue;
    }
    // ICICI's own message (a pop-up), if it shows one: closed by the advisor.
    const popup = await exec(wc, { op: 'popup' });
    const says = popup.errors ? popup.errors.replace(/\s*OK$/, '') : null;
    if (!says && progress.skip(step, index, result, undefined)) continue;
    const marked = says ? null : (await exec(wc, { op: 'fieldErrors' })).value;
    const why = explain(step, result.detail, says);
    return handOver({
      label: step.label,
      why: marked ? `${why} The form marks: ${marked}` : why,
    });
  }
  page.focus();
  return readAgain(compose(last ?? { ok: false }, kept), {
    page,
    progress,
    compose: (read) => compose(read, kept),
  });
}

const amountOf = (v: string | undefined) => (v ?? '').replace(/[^\d.]/g, '');
const lakh = (n: number) => `₹${(n / 100000).toLocaleString('en-IN')} lakh`;

export async function runIciciElevateQuote(deps: {
  windows: () => PortalPage[];
  client: ClientInput;
  run: IciciElevateRun;
  origins?: NysaOrigins;
  /** Saves the run's trace for support (diagnostics); returns its name, or null. */
  diagnose?: (name: string, data: unknown) => string | null;
}): Promise<QuoteRunResult> {
  const plan = planIciciElevate(deps.client, deps.run);
  if (!plan.ok) return refused('This client cannot be filled in on ICICI Elevate.', plan.problems);
  return traced(
    deps.diagnose,
    'icici-lombard',
    'elevate',
    deps.windows,
    'How the form was opened',
    async (trace) => {
      const opened = await openForm(deps.windows, 'elevate', deps.origins ?? ORIGINS, trace);
      if ('outcome' in opened) return opened;
      const { run } = deps;
      const cover = `${lakh(run.sumInsured)}, ${run.tenure} year${run.tenure > 1 ? 's' : ''}`;
      return runPlan(
        opened.page,
        plan,
        (read) => {
          const plans = (read.plans ?? []).map((p) => ({
            name: `Elevate ${p.name}`,
            amount: amountOf(p.amount),
          }));
          const first = plans[0] ?? { name: 'Elevate', amount: amountOf(read.value) };
          return {
            outcome: 'ready',
            step: null,
            message: `ICICI Lombard Elevate (${cover}): ${plans.map((p) => `${p.name} ₹${p.amount}`).join('; ') || `₹${first.amount}`} a year, as ICICI showed them after Generate Quote. Nothing further was pressed.`,
            problems: [],
            premium: { label: `ICICI Lombard ${first.name}, ${cover}`, amount: first.amount },
            ...(plans.length > 0 ? { plans } : {}),
            amountLabel: 'Premium (yearly, as ICICI shows it)',
          };
        },
        trace,
      );
    },
  );
}

/** The travel result, once ICICI shows the Total premium (`kept.plan`: the plan chosen). */
const travelResult =
  (form: string, trip: string) =>
  (read: PageOpResult, kept: Record<string, string>): QuoteRunResult => {
    const amount = amountOf(read.value ?? kept.premium);
    const plan = kept.plan ? `, plan ${kept.plan}` : '';
    return {
      outcome: 'ready',
      step: null,
      message: `ICICI Lombard ${form}${plan}: Total premium ₹${amount} for ${trip}, as ICICI showed it after Get quote. Save & Proceed was not pressed.`,
      problems: [],
      premium: { label: `ICICI Lombard ${form}${plan}, ${trip}`, amount },
      amountLabel: 'Total premium',
    };
  };

export async function runIciciIntlTravelQuote(deps: {
  windows: () => PortalPage[];
  traveller: Traveller;
  run: IciciIntlTravelRun;
  origins?: NysaOrigins;
  /** Saves the run's trace for support (diagnostics); returns its name, or null. */
  diagnose?: (name: string, data: unknown) => string | null;
}): Promise<QuoteRunResult> {
  const plan = planIciciIntlTravel(deps.traveller, deps.run);
  if (!plan.ok) return refused('This traveller cannot be filled in on ICICI.', plan.problems);
  return traced(
    deps.diagnose,
    'icici-lombard',
    'international-travel',
    deps.windows,
    'How the form was opened',
    async (trace) => {
      const opened = await openForm(
        deps.windows,
        'international-travel',
        deps.origins ?? ORIGINS,
        trace,
      );
      if ('outcome' in opened) return opened;
      const trip = `${deps.run.departureDate} to ${deps.run.returnDate}`;
      return runPlan(opened.page, plan, travelResult('International Travel', trip), trace);
    },
  );
}

export async function runIciciStudentTravelQuote(deps: {
  windows: () => PortalPage[];
  traveller: Traveller;
  run: IciciStudentTravelRun;
  origins?: NysaOrigins;
  /** Saves the run's trace for support (diagnostics); returns its name, or null. */
  diagnose?: (name: string, data: unknown) => string | null;
}): Promise<QuoteRunResult> {
  const plan = planIciciStudentTravel(deps.traveller, deps.run);
  if (!plan.ok) return refused('This traveller cannot be filled in on ICICI.', plan.problems);
  return traced(
    deps.diagnose,
    'icici-lombard',
    'student-travel',
    deps.windows,
    'How the form was opened',
    async (trace) => {
      const opened = await openForm(deps.windows, 'student-travel', deps.origins ?? ORIGINS, trace);
      if ('outcome' in opened) return opened;
      const trip = `studies from ${deps.run.departureDate}`;
      return runPlan(opened.page, plan, travelResult('Student Medical Travel', trip), trace);
    },
  );
}
