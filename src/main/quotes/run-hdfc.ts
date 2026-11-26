// Runs an HDFC ERGO PIE plan (hdfc-motor.ts, hdfc-mst.ts) in HDFC's own page. PIE is opened from
// the 1up portal, a Flutter page drawn on a canvas. When no tab is on PIE yet, the run opens it from
// 1up's dashboard as the advisor does (request of 24 November 2026): Issue Quotes & Policy, then
// Private Car, tapped by their labels (Flutter's semantics, page-ops.ts flutterTap), which signs
// the tab in to PIE. It then opens the form it needs by its PIE address in that tab. It never
// presses Generate Quote, Generate Proposal or anything after Calculate Premium.
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import type { Vehicle } from '../../shared/contracts/vehicle';
import type { Traveller } from '../../shared/contracts/traveller';
import {
  HDFC_MOTOR_NAMES,
  HDFC_MOTOR_PATHS,
  HDFC_MST_PATH,
  HDFC_RETAIL_NAMES,
  HDFC_RETAIL_PATHS,
  HDFC_TRAVEL_PATH,
  type HdfcMotorRun,
  type HdfcMstRun,
  type HdfcRetailRun,
  type HdfcTravelRun,
} from '../../shared/insurers/hdfc';
import { planHdfcMotorQuote, type HdfcPlan, type HdfcStep } from './hdfc-motor';
import { planHdfcMstQuote } from './hdfc-mst';
import { planHdfcRetailQuote } from './hdfc-retail';
import { planHdfcTravelQuote } from './hdfc-travel';
import { exec, type QuoteRunResult, reportStep } from './run-uiic-health';
import { FillProgress, handedOver, readAgain } from './hand-over';
import { addressOf, traced, type RunTrace } from './run-trace';

export const PIE_ORIGIN = 'https://pie.hdfcergo.com';
export const ONE_UP_ORIGIN = 'https://1up.hdfcergo.com';

/** Where HDFC's pages are served from: HDFC's own, or in tests the local copies. */
export interface HdfcOrigins {
  pie: string;
  oneUp: string;
}

/** 1up's tiles the run taps to reach PIE, as 1up labels them. */
const ISSUE_QUOTES = ['Issue Quotes & Policy', 'Issue Quotes and Policy', 'Issue Quote & Policy'];
/**
 * 1up's own link to PIE, under Issue Quotes & Policy (the live trace of 26 November 2026: 1up
 * lists "PIE Dashboard" among its links; its "Private Car" quick quote now opens 1up's own quote
 * screen, "What is the Registration Number ?", not PIE as it did on 5 November).
 */
const PIE_DASHBOARD = ['PIE Dashboard'];
/** Older 1up: its Private Car quick quote led to PIE (recordings of 5 November 2026). */
const A_PRODUCT = ['Private Car'];
const OPEN_FROM_1UP =
  "Open PIE from HDFC's 1up yourself (Issue Quotes & Policy, then PIE Dashboard), so the tab is signed in to PIE, then press again.";

/** 1up's tiles' short labels now (flutterLabels: none with digits). */
async function labelsOn(wc: PortalPage['webContents']): Promise<string[]> {
  const shown = await exec(wc, { op: 'flutterLabels', timeoutMs: 2000 }).catch(() => null);
  try {
    const list = JSON.parse(shown?.value ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((l): l is string => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

const originOf = (w: PortalPage): string => {
  try {
    return new URL(w.webContents.getURL()).origin;
  } catch {
    return '';
  }
};

/**
 * 1up's own tile for each PIE health form, on older 1up screens: the recording of 5 November 2026
 * went from 1up straight to PIE's MST, Optima Restore, Energy and Optima Secure forms, each by its
 * own tile (their labels were not recorded: these are the products' names, matched as whole
 * words). Travel is not here: 1up's Travel tile opened HDFC's public travel site, not PIE.
 */
const PIE_TILES: Record<string, string[]> = {
  '/mst/createquote': ['Medisure Super Top Up', 'Medisure Super Top-up', 'Medisure', 'MST'],
  '/optimasecure/createquote': ['Optima Secure'],
  '/optimarestore/createquote': ['Optima Restore'],
  '/energy/createquote': ['Energy'],
};

/**
 * PIE, opened from 1up's home page, by the first way that leads there:
 *   1. Issue Quotes & Policy, then PIE Dashboard (1up's link to PIE: PIE's sign-in redirect, then
 *      its dashboard; the run then opens its own form there);
 *   2. on older 1up screens, the form's own tile (PIE's redirect then opens that form);
 *   3. on older 1up screens, Private Car (PIE then opens its car form).
 * A tile that is not shown is passed over at once; one that does not lead to PIE in time is given
 * up (1up's home page again, for the next). Each try is in the run's trace.
 */
async function openPieFrom1up(
  windows: () => PortalPage[],
  oneUp: PortalPage,
  origins: HdfcOrigins,
  path: string,
  trace: RunTrace,
): Promise<{ pie: PortalPage } | { why: string }> {
  const wc = oneUp.webContents;
  trace.note('1up home shows', { labels: await labelsOn(wc) });
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const findPie = () => windows().find((w) => !w.isDestroyed() && originOf(w) === origins.pie);
  const waitForPie = async (ms: number): Promise<PortalPage | null> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const found = findPie();
      if (found) return found;
      await sleep(500);
    }
    return null;
  };
  /** 1up's home page again (after a tile that led elsewhere, or nowhere in time). */
  const home = async () => {
    try {
      await wc.loadURL(`${origins.oneUp}/dashBoardScreen`);
    } catch {
      // A redirect after the load started reports as a failure; the next taps decide.
    }
    await sleep(2000);
  };
  /** Whether 1up's products are on screen now (so Issue Quotes & Policy need not be found). */
  let listed = false;
  const reasons: string[] = [];
  /**
   * One way to PIE: Issue Quotes & Policy (unless the list is shown), then the tile; PIE, or
   * null (with the reason kept) when it did not lead there.
   */
  const tryTile = async (
    name: string,
    labels: string[],
    within: boolean,
    waitMs: number,
  ): Promise<PortalPage | null> => {
    const issue = await exec(wc, {
      op: 'flutterTap',
      labels: ISSUE_QUOTES,
      timeoutMs: listed ? 3000 : 20000,
    });
    trace.note('tap Issue Quotes & Policy', { ok: issue.ok, detail: issue.detail ?? null });
    if (issue.ok) trace.note('1up shows', { labels: await labelsOn(wc) });
    if (!issue.ok && !listed) {
      reasons.push(
        `1up's "Issue Quotes & Policy" was not found (${issue.detail}). Is the tab on 1up's home page, with no message open?`,
      );
      return null;
    }
    const tile = await exec(wc, { op: 'flutterTap', labels, timeoutMs: 6000, within });
    trace.note(`tap ${name}`, { wanted: labels, ok: tile.ok, detail: tile.detail ?? null });
    if (!tile.ok) {
      // Not on this screen: its list is still shown, for the next way.
      listed = true;
      reasons.push(`1up shows no "${name}".`);
      return null;
    }
    const pie = await waitForPie(waitMs);
    trace.note(pie ? `${name} led to PIE` : `${name} did not lead to PIE in time`, {
      oneUpAt: oneUp.isDestroyed() ? 'closed' : addressOf(oneUp),
    });
    if (pie) return settledOnPie(pie, Date.now() + 45_000);
    reasons.push(`1up's "${name}" did not lead to PIE within ${waitMs / 1000} seconds.`);
    if (!oneUp.isDestroyed()) {
      listed = false;
      await home();
    }
    return null;
  };

  const tile = PIE_TILES[path.toLowerCase()];
  const ways: [string, string[], boolean, number][] = [
    ['PIE Dashboard', PIE_DASHBOARD, false, 30_000],
    ...(tile ? [[tile[0]!, tile, true, 15_000] as [string, string[], boolean, number]] : []),
    ['Private Car', A_PRODUCT, false, 20_000],
  ];
  for (const [name, labels, within, waitMs] of ways) {
    if (oneUp.isDestroyed()) return { why: "1up's tab was closed." };
    trace.note(`trying ${name}`, { form: path });
    const pie = await tryTile(name, labels, within, waitMs);
    if (pie) return { pie };
    // 1up could not be worked at all (Issue Quotes & Policy missing): no other way will do.
    if (reasons.at(-1)?.startsWith(`1up's "Issue Quotes & Policy" was not found`)) {
      return { why: reasons.at(-1)! };
    }
  }
  const labels = oneUp.isDestroyed() ? [] : await labelsOn(wc);
  trace.note('1up shows', { labels });
  return {
    why: `${reasons.join(' ')}${labels.length > 0 ? ` 1up shows: ${labels.join(', ')}.` : ''}`,
  };
}

const onRedirect = (w: PortalPage): boolean => {
  try {
    return /^\/WrapperApi\//i.test(new URL(w.webContents.getURL()).pathname);
  } catch {
    return false;
  }
};

/**
 * A PIE tab once it has settled: off PIE's sign-in redirect page (it moves on by itself, up to 30
 * seconds), then loaded, or 5 seconds on (PIE may keep something loading).
 */
async function settledOnPie(pie: PortalPage, deadline: number): Promise<PortalPage> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const redirectEnd = Math.min(deadline, Date.now() + 30_000);
  while (!pie.isDestroyed() && onRedirect(pie) && Date.now() < redirectEnd) await sleep(300);
  const loadEnd = Date.now() + 5000;
  while (!pie.isDestroyed() && pie.webContents.isLoading() && Date.now() < loadEnd)
    await sleep(300);
  return pie;
}

/** The page showing PIE's form at `path`: one already there, else a PIE page sent there. */
async function openPieForm(
  windows: () => PortalPage[],
  path: string,
  ready: string,
  origins: HdfcOrigins,
  trace: RunTrace,
): Promise<{ page: PortalPage } | QuoteRunResult> {
  const origin = origins.pie;
  const pages = windows().filter((w) => !w.isDestroyed());
  trace.note('start', { form: path, tabs: pages.map(addressOf) });
  const onPie = (w: PortalPage) => originOf(w) === origin;
  const pathOf = (w: PortalPage) =>
    new URL(w.webContents.getURL()).pathname.replace(/^\/en-US/i, '');
  let page = pages.find((w) => onPie(w) && pathOf(w).toLowerCase() === path.toLowerCase());
  if (page) trace.note('a tab already shows the form');
  if (!page) {
    let pie = pages.find(onPie);
    if (pie) trace.note('a tab is already on PIE: 1up not needed', { at: addressOf(pie) });
    if (!pie) {
      const oneUp = pages.find((w) => originOf(w) === origins.oneUp);
      if (!oneUp) {
        return {
          outcome: 'refused',
          step: null,
          message:
            "Sign in to HDFC ERGO's 1up first (Insurer portals, HDFC ERGO), then press again. The app opens PIE and the form from 1up's home page.",
          problems: [],
        };
      }
      reportStep('Opening PIE from 1up');
      const opened = await openPieFrom1up(windows, oneUp, origins, path, trace);
      if ('why' in opened) {
        trace.note('PIE not opened', { why: opened.why });
        oneUp.focus();
        return {
          outcome: 'refused',
          step: 'Open PIE from 1up',
          message: `The app could not open PIE from 1up: ${opened.why} ${OPEN_FROM_1UP}`,
          problems: [],
        };
      }
      pie = opened.pie;
    }
    // PIE's own redirect may still be under way (it sends the tab on to the product pressed in
    // 1up): let it finish, then open the form; once more if PIE moved the tab elsewhere meanwhile.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      pie = await settledOnPie(pie, Date.now() + 30_000);
      trace.note('PIE settled', { attempt: attempt + 1, at: addressOf(pie) });
      if (pie.isDestroyed() || pathOf(pie).toLowerCase() === path.toLowerCase()) break;
      trace.note('loading the form', { from: addressOf(pie), to: path });
      try {
        await pie.webContents.loadURL(`${origin}${path}`);
      } catch {
        // A redirect after the load started reports as a failure; the check below decides.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (pie.isDestroyed() || pathOf(pie).toLowerCase() === path.toLowerCase()) break;
    }
    if (pie.isDestroyed() || pathOf(pie).toLowerCase() !== path.toLowerCase()) {
      trace.note('the form did not open', { at: pie.isDestroyed() ? 'closed' : addressOf(pie) });
      return {
        outcome: 'failed',
        step: 'Open the form',
        message:
          "PIE did not open the form (its session may have ended). Open the product from HDFC's 1up again, then press again.",
        problems: [],
      };
    }
    page = pie;
  }
  const shown = await exec(page.webContents, { op: 'waitFor', selector: ready, timeoutMs: 25000 });
  trace.note(shown.ok ? 'the form is ready' : 'the form did not finish loading', {
    at: addressOf(page),
  });
  if (!shown.ok) {
    page.focus();
    return {
      outcome: 'failed',
      step: 'Open the form',
      message: "PIE's form did not finish loading. Check the HDFC tab, then press again.",
      problems: [],
    };
  }
  return { page };
}

/** What a step's failure means, in the advisor's words. */
function explain(step: HdfcStep, detail: string | undefined): string {
  if (detail?.startsWith('page-says: ')) return `PIE says: ${detail.slice(11)}`;
  if (detail?.startsWith('no-match')) {
    const offered = /\(offered: (.*)\)$/.exec(detail)?.[1];
    return `PIE does not list this at "${step.label}"${offered ? ` (it offers: ${offered})` : ''}. Choose it by hand, then press Calculate Premium.`;
  }
  if (detail?.startsWith('option-missing')) {
    return `PIE does not offer this value at "${step.label}". Choose it by hand, then press Calculate Premium.`;
  }
  const stuck = /^stuck at (\d+)$/.exec(detail ?? '');
  if (stuck) return `PIE stops at ${stuck[1]} at "${step.label}". Change the members by hand.`;
  if (step.label === 'Premium') {
    return 'PIE did not show a premium after Calculate Premium. Check what it marks on the form, then press Calculate Premium yourself.';
  }
  return `Stopped at "${step.label}" (${detail ?? 'unknown'}). The form may have changed; fill the rest by hand.`;
}

async function runPlan(
  page: PortalPage,
  plan: Extract<HdfcPlan, { ok: true }>,
  label: (kept: Record<string, string>) => string,
  trace: RunTrace,
): Promise<QuoteRunResult> {
  const wc = page.webContents;
  const missed: string[] = [];
  const kept: Record<string, string> = {};
  const toDo = (failed: boolean) => [
    ...missed,
    ...plan.byHand,
    ...(failed ? ['Fill the rest, press Calculate Premium yourself and check the premium.'] : []),
  ];
  const before = await exec(wc, { op: 'popup' });
  if (before.errors) {
    page.focus();
    return {
      outcome: 'refused',
      step: null,
      message: `Close PIE's message first, then try again. It says: ${before.errors}`,
      problems: [],
    };
  }
  /** The result once PIE shows the premium (`kept.premium`). */
  const compose = (premium: Record<string, string>): QuoteRunResult => {
    const amount = (premium.premium ?? '').replace(/[^\d.,]/g, '');
    return {
      outcome: 'ready',
      step: null,
      message: `PIE worked the premium out: ₹${amount} (Total Payable Premium) for ${label(premium)}. The app did not press Generate Quote.`,
      problems: [],
      premium: { label: label(premium), amount },
      toDo: toDo(false),
    };
  };
  // A box PIE does not take is left for the advisor, and the run goes on; anything else that
  // fails hands the form over (hand-over.ts).
  const progress = new FillProgress(plan.steps);
  const handOver = (stopped?: { label: string; why: string }): QuoteRunResult => {
    page.focus();
    return handedOver({
      insurer: 'HDFC ERGO',
      page,
      progress,
      stopped,
      toDo: toDo(false),
      compose: (read) => compose({ ...kept, premium: read.value ?? '' }),
    });
  };
  for (const [index, step] of plan.steps.entries()) {
    reportStep(step.label);
    if (progress.stopBefore(index)) return handOver();
    const result = await exec(wc, step.op);
    // In the trace: the step and how it went (never a box's typed value).
    trace.note('step', {
      label: step.label,
      op: step.op.op,
      ok: result.ok,
      detail: result.detail ?? null,
    });
    if (result.ok && step.keep && result.value) kept[step.keep] = result.value;
    if (step.popupAfter) {
      const popup = await exec(wc, { op: 'popup' });
      if (popup.errors) return handOver({ label: step.label, why: `PIE says: ${popup.errors}` });
    }
    if (!result.ok) {
      if (step.optional) {
        if (step.ifMissed && !missed.includes(step.ifMissed)) missed.push(step.ifMissed);
        continue;
      }
      if (progress.skip(step, index, result)) continue;
      return handOver({ label: step.label, why: explain(step, result.detail) });
    }
  }
  page.focus();
  return readAgain(compose(kept), {
    page,
    progress,
    compose: (read) => compose({ ...kept, premium: read.value ?? '' }),
  });
}

export async function runHdfcMotorQuote(deps: {
  windows: () => PortalPage[];
  vehicle: Vehicle;
  run: HdfcMotorRun;
  origin?: string;
  /** In tests: the origin 1up is served from. */
  oneUpOrigin?: string;
  /** Saves the run's trace for support (diagnostics); returns its name, or null. */
  diagnose?: (name: string, data: unknown) => string | null;
}): Promise<QuoteRunResult> {
  const name = HDFC_MOTOR_NAMES[deps.run.product];
  const plan = planHdfcMotorQuote(deps.vehicle, deps.run);
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This vehicle cannot be filled in automatically on PIE's ${name} form.`,
      problems: plan.problems,
    };
  }
  return traced(
    deps.diagnose,
    'hdfc-ergo',
    'motor',
    deps.windows,
    'How PIE was opened',
    async (trace) => {
      const opened = await openPieForm(
        deps.windows,
        HDFC_MOTOR_PATHS[deps.run.product],
        '#ManufacturerName',
        { pie: deps.origin ?? PIE_ORIGIN, oneUp: deps.oneUpOrigin ?? ONE_UP_ORIGIN },
        trace,
      );
      if ('outcome' in opened) return opened;
      return runPlan(
        opened.page,
        plan,
        (kept) =>
          [name, kept.model ?? deps.vehicle.model, deps.run.cover.replace('-', ' ')]
            .filter(Boolean)
            .join(', '),
        trace,
      );
    },
  );
}

export async function runHdfcMstQuote(deps: {
  windows: () => PortalPage[];
  client: ClientInput;
  run: HdfcMstRun;
  origin?: string;
  /** In tests: the origin 1up is served from. */
  oneUpOrigin?: string;
  /** Saves the run's trace for support (diagnostics); returns its name, or null. */
  diagnose?: (name: string, data: unknown) => string | null;
}): Promise<QuoteRunResult> {
  const plan = planHdfcMstQuote(deps.client, deps.run);
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: "This client cannot be filled in automatically on PIE's MST form.",
      problems: plan.problems,
    };
  }
  return traced(
    deps.diagnose,
    'hdfc-ergo',
    'MST',
    deps.windows,
    'How PIE was opened',
    async (trace) => {
      const opened = await openPieForm(
        deps.windows,
        HDFC_MST_PATH,
        '#buttonPlusAdult, label[name="Risk101"]',
        { pie: deps.origin ?? PIE_ORIGIN, oneUp: deps.oneUpOrigin ?? ONE_UP_ORIGIN },
        trace,
      );
      if ('outcome' in opened) return opened;
      return runPlan(
        opened.page,
        plan,
        () =>
          `MST (Medisure Super Top-up), ${deps.run.cover === 'individual' ? 'Individual' : 'Family Floater'}, ${deps.run.years} year${deps.run.years > 1 ? 's' : ''}`,
        trace,
      );
    },
  );
}

export async function runHdfcRetailQuote(deps: {
  windows: () => PortalPage[];
  client: ClientInput;
  run: HdfcRetailRun;
  today: Date;
  origin?: string;
  /** In tests: the origin 1up is served from. */
  oneUpOrigin?: string;
  /** Saves the run's trace for support (diagnostics); returns its name, or null. */
  diagnose?: (name: string, data: unknown) => string | null;
}): Promise<QuoteRunResult> {
  const name = HDFC_RETAIL_NAMES[deps.run.product];
  const plan = planHdfcRetailQuote(deps.client, deps.run, { today: deps.today });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This client cannot be filled in automatically on PIE's ${name} form.`,
      problems: plan.problems,
    };
  }
  return traced(
    deps.diagnose,
    'hdfc-ergo',
    'retail',
    deps.windows,
    'How PIE was opened',
    async (trace) => {
      const opened = await openPieForm(
        deps.windows,
        HDFC_RETAIL_PATHS[deps.run.product],
        '#BusinessType, #ProductType_Individual',
        { pie: deps.origin ?? PIE_ORIGIN, oneUp: deps.oneUpOrigin ?? ONE_UP_ORIGIN },
        trace,
      );
      if ('outcome' in opened) return opened;
      return runPlan(
        opened.page,
        plan,
        () =>
          [
            name,
            deps.run.plan,
            deps.run.cover === 'family' ? 'Family' : 'Individual',
            deps.run.sumInsuredLacs ? `${deps.run.sumInsuredLacs} lakh` : undefined,
            `${deps.run.years} year${deps.run.years > 1 ? 's' : ''}`,
          ]
            .filter(Boolean)
            .join(', '),
        trace,
      );
    },
  );
}

export async function runHdfcTravelQuote(deps: {
  windows: () => PortalPage[];
  traveller: Traveller;
  run: HdfcTravelRun;
  today: Date;
  origin?: string;
  /** In tests: the origin 1up is served from. */
  oneUpOrigin?: string;
  /** Saves the run's trace for support (diagnostics); returns its name, or null. */
  diagnose?: (name: string, data: unknown) => string | null;
}): Promise<QuoteRunResult> {
  const plan = planHdfcTravelQuote(deps.traveller, deps.run, { today: deps.today });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: "This trip cannot be filled in automatically on PIE's Retail Travel form.",
      problems: plan.problems,
    };
  }
  return traced(
    deps.diagnose,
    'hdfc-ergo',
    'travel',
    deps.windows,
    'How PIE was opened',
    async (trace) => {
      const opened = await openPieForm(
        deps.windows,
        HDFC_TRAVEL_PATH,
        '#PolicyEffectiveFromDate, #Risk103',
        { pie: deps.origin ?? PIE_ORIGIN, oneUp: deps.oneUpOrigin ?? ONE_UP_ORIGIN },
        trace,
      );
      if ('outcome' in opened) return opened;
      return runPlan(
        opened.page,
        plan,
        (kept) =>
          `Retail Travel, ${kept.plan ?? deps.run.plan}, ${deps.run.departureDate} to ${deps.run.returnDate}`,
        trace,
      );
    },
  );
}
