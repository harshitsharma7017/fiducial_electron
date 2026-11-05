// Runs an HDFC ERGO PIE plan (hdfc-motor.ts, hdfc-mst.ts) in HDFC's own page. PIE is opened from
// the 1up portal, whose tiles are drawn on a canvas (the app cannot press them): once the advisor
// has opened any PIE product from 1up (signing the tab in to PIE), the run opens the form it needs
// by its PIE address in that tab. It never presses Generate Quote, Generate Proposal or anything
// after Calculate Premium.
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
import { exec, type QuoteRunResult } from './run-uiic-health';

export const PIE_ORIGIN = 'https://pie.hdfcergo.com';

/** The page showing PIE's form at `path`: one already there, else a PIE page sent there. */
async function openPieForm(
  windows: () => PortalPage[],
  path: string,
  ready: string,
  /** In tests: the origin the PIE pages are served from. */
  origin: string,
): Promise<{ page: PortalPage } | QuoteRunResult> {
  const pages = windows().filter((w) => !w.isDestroyed());
  const onPie = (w: PortalPage) => {
    try {
      return new URL(w.webContents.getURL()).origin === origin;
    } catch {
      return false;
    }
  };
  const pathOf = (w: PortalPage) =>
    new URL(w.webContents.getURL()).pathname.replace(/^\/en-US/i, '');
  let page = pages.find((w) => onPie(w) && pathOf(w).toLowerCase() === path.toLowerCase());
  if (!page) {
    const pie = pages.find(onPie);
    if (!pie) {
      return {
        outcome: 'refused',
        step: null,
        message:
          "Open any product from HDFC's 1up (Issue Quotes & Policy, for example Private Car), so the tab is signed in to PIE, then press again. The app opens the form it needs from there.",
        problems: [],
      };
    }
    try {
      await pie.webContents.loadURL(`${origin}${path}`);
    } catch {
      // A redirect after the load started reports as a failure; the check below decides.
    }
    if (pie.isDestroyed() || pathOf(pie).toLowerCase() !== path.toLowerCase()) {
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
  if (detail === 'option-missing') {
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
          message: `PIE says: ${popup.errors}`,
          problems: [],
          toDo: toDo(true),
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
        message: explain(step, result.detail),
        problems: [],
        toDo: toDo(true),
      };
    }
  }
  page.focus();
  const amount = (kept.premium ?? '').replace(/[^\d.,]/g, '');
  return {
    outcome: 'ready',
    step: null,
    message: `PIE worked the premium out: ₹${amount} (Total Payable Premium) for ${label(kept)}. The app did not press Generate Quote.`,
    problems: [],
    premium: { label: label(kept), amount },
    toDo: toDo(false),
  };
}

export async function runHdfcMotorQuote(deps: {
  windows: () => PortalPage[];
  vehicle: Vehicle;
  run: HdfcMotorRun;
  origin?: string;
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
  const opened = await openPieForm(
    deps.windows,
    HDFC_MOTOR_PATHS[deps.run.product],
    '#ManufacturerName',
    deps.origin ?? PIE_ORIGIN,
  );
  if ('outcome' in opened) return opened;
  return runPlan(opened.page, plan, (kept) =>
    [name, kept.model ?? deps.vehicle.model, deps.run.cover.replace('-', ' ')]
      .filter(Boolean)
      .join(', '),
  );
}

export async function runHdfcMstQuote(deps: {
  windows: () => PortalPage[];
  client: ClientInput;
  run: HdfcMstRun;
  origin?: string;
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
  const opened = await openPieForm(
    deps.windows,
    HDFC_MST_PATH,
    '#buttonPlusAdult, label[name="Risk101"]',
    deps.origin ?? PIE_ORIGIN,
  );
  if ('outcome' in opened) return opened;
  return runPlan(
    opened.page,
    plan,
    () =>
      `MST (Medisure Super Top-up), ${deps.run.cover === 'individual' ? 'Individual' : 'Family Floater'}, ${deps.run.years} year${deps.run.years > 1 ? 's' : ''}`,
  );
}

export async function runHdfcRetailQuote(deps: {
  windows: () => PortalPage[];
  client: ClientInput;
  run: HdfcRetailRun;
  today: Date;
  origin?: string;
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
  const opened = await openPieForm(
    deps.windows,
    HDFC_RETAIL_PATHS[deps.run.product],
    '#BusinessType, #ProductType_Individual',
    deps.origin ?? PIE_ORIGIN,
  );
  if ('outcome' in opened) return opened;
  return runPlan(opened.page, plan, () =>
    [
      name,
      deps.run.plan,
      deps.run.cover === 'family' ? 'Family' : 'Individual',
      deps.run.sumInsuredLacs ? `${deps.run.sumInsuredLacs} lakh` : undefined,
      `${deps.run.years} year${deps.run.years > 1 ? 's' : ''}`,
    ]
      .filter(Boolean)
      .join(', '),
  );
}

export async function runHdfcTravelQuote(deps: {
  windows: () => PortalPage[];
  traveller: Traveller;
  run: HdfcTravelRun;
  today: Date;
  origin?: string;
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
  const opened = await openPieForm(
    deps.windows,
    HDFC_TRAVEL_PATH,
    '#PolicyEffectiveFromDate, #Risk103',
    deps.origin ?? PIE_ORIGIN,
  );
  if ('outcome' in opened) return opened;
  return runPlan(
    opened.page,
    plan,
    (kept) =>
      `Retail Travel, ${kept.plan ?? deps.run.plan}, ${deps.run.departureDate} to ${deps.run.returnDate}`,
  );
}
