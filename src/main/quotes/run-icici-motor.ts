// Runs ICICI Lombard's NYSA motor quote in ICICI's own page, as the advisor recorded it
// (icici-lombard-2026-11-20T07-23-41-540Z; src/shared/insurers/icici.ts):
//   NYSA dashboard → Motor tile (ICICI's server hands out the address: /NysaMotor/quote) →
//   Vehicle Details: Rollover, the ownership change question, Registration Number →
//   Fetch Vehicle Data (ICICI looks the vehicle up in Vahan itself; a two-wheeler's number shows
//   "…belongs to Two Wheeler. Switching to the Two Wheeler buying flow", answered OK) →
//   /NysaMotor/premium: "Total Premium ₹2,533" and the IDV slider (its box and Update).
// Renewals of registered vehicles (Rollover) are automated through to the premium. ICICI's New
// Business flow was not recorded (the recording chose New and went back to Rollover): a new
// vehicle is taken to NYSA's quote form with New Business chosen, then handed to the advisor, who
// fills the vehicle there and presses Stop & make PDF once the premium shows (request of 26
// November 2026: "ICICI is still locked"). It never presses Buy Now (it saves the quote, GenericSaveQuote), Share Quote, or
// anything on the proposal.
//
// The Motor tile is on NYSA's own dashboard (nysa.icicilombard.com) only: after a health or travel
// quote the tab is on NYSA's health site (nysa-health.icicilombard.com, its own dashboard has no
// Motor tile), so NYSA's dashboard is opened first (26 November 2026: "why icici motor is not
// working"). Each run is traced (diagnostics/icici-lombard-…json) when it does not end ready.
import type { PortalPage } from '../insurers/portal-host';
import { findPortal } from '../../shared/insurers/portals';
import { traced, type RunTrace } from './run-trace';
import type { Vehicle } from '../../shared/contracts/vehicle';
import type { IciciMotorRun } from '../../shared/insurers/icici';
import { exec, runPause, type QuoteRunResult } from './run-uiic-health';
import { FillProgress, handedOver } from './hand-over';
import type { PageOp } from './page-ops';

export const ICICI_QUOTE_PATH = '/NysaMotor/quote';
export const ICICI_PREMIUM_PATH = '/NysaMotor/premium';
const MOTOR_PREFIX = '/NysaMotor/';

const REGISTRATION = 'input[formcontrolname="vehicleRegistrationNo"]';
/** NYSA's IDV box and its Update button (lib-idv-slider). */
const IDV_BOX = 'lib-idv-slider input[type="text"]';
const IDV_UPDATE = 'lib-idv-slider button';
/** ICICI's own message when the number is a two-wheeler's (or a car's) on the other flow. */
const SWITCHING = /switching to the .*flow/i;

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};
const rupees = (n: number): string => n.toLocaleString('en-IN');

/** Why this vehicle and run cannot be filled in (nothing is touched). */
export function iciciMotorProblems(vehicle: Vehicle, run: IciciMotorRun): string[] {
  const problems: string[] = [];
  // A new vehicle needs no number: its form is handed over (New Business).
  if (vehicle.condition !== 'new' && !run.registrationNumber) {
    problems.push('Add the registration number.');
  }
  return problems;
}

/** NYSA's own dashboard, where the Motor tile is. */
const NYSA_DASHBOARD =
  findPortal('icici-lombard')?.homeUrl ?? 'https://nysa.icicilombard.com/#/dashboard';

type MotorDeps = {
  /** ICICI Lombard's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  vehicle: Vehicle;
  run: IciciMotorRun;
  /** NYSA's dashboard (the harness serves its own copy). */
  dashboardUrl?: string;
  diagnose?: (name: string, data: unknown) => string | null;
};

export async function runIciciMotorQuote(deps: MotorDeps): Promise<QuoteRunResult> {
  return traced(
    deps.diagnose,
    'icici-lombard',
    'icici-motor',
    deps.windows,
    'How NYSA Motor was opened',
    (trace) => runMotor(deps, trace),
  );
}

async function runMotor(deps: MotorDeps, trace: RunTrace): Promise<QuoteRunResult> {
  const { vehicle, run } = deps;
  /** What the quote is for, in its PDF: the registration number, or a new vehicle. */
  const named = run.registrationNumber ?? 'new vehicle';
  const problems = iciciMotorProblems(vehicle, run);
  if (problems.length > 0) {
    return {
      outcome: 'refused',
      step: null,
      message: 'This vehicle cannot be quoted on ICICI Lombard automatically.',
      problems,
    };
  }
  const failed = (step: string, message: string, page?: PortalPage): QuoteRunResult => {
    page?.focus();
    return { outcome: 'failed', step, message, problems: [] };
  };
  const pages = () => deps.windows().filter((w) => !w.isDestroyed());
  const path = (p: PortalPage) => pathOf(p.webContents.getURL());
  /** Waits (bounded) until a page of ICICI's shows an address that `wanted` accepts. */
  const waitForPath = async (wanted: (path: string) => boolean, ms: number) => {
    for (let waited = 0; waited <= ms; waited += 500) {
      const page = pages().find((p) => wanted(path(p)));
      if (page) return page;
      await runPause(500);
    }
    return undefined;
  };

  // 1. The quote form: already open, on another NYSA Motor screen (its Quote tab), or from the
  // dashboard's Motor tile.
  let page = pages().find((p) => path(p) === ICICI_QUOTE_PATH);
  if (!page) {
    const motor = pages().find((p) => path(p).startsWith(MOTOR_PREFIX));
    if (motor) {
      const tab = await exec(motor.webContents, {
        op: 'clickSelector',
        selector: 'app-menu-tabs button',
        text: 'Quote',
        timeoutMs: 5000,
      });
      // The tab may load a new page as it is pressed (the step then cannot answer): that is fine.
      if (!tab.ok && !tab.detail?.startsWith('page-changed')) {
        return failed(
          'Open the quote form',
          `NYSA's Quote tab was not found (${tab.detail}). Open Motor → Quote by hand, then press again.`,
          motor,
        );
      }
    } else {
      const home = deps.dashboardUrl ?? NYSA_DASHBOARD;
      const originOf = (url: string) => {
        try {
          return new URL(url).origin;
        } catch {
          return '';
        }
      };
      const nysa = originOf(home);
      let dashboard = pages().find((p) => originOf(p.webContents.getURL()) === nysa);
      if (!dashboard) {
        // On NYSA's health site (or elsewhere): NYSA's own dashboard is opened in the tab.
        dashboard = pages()[0];
        if (!dashboard) {
          return failed('Open the quote form', 'Open ICICI Lombard and sign in, then try again.');
        }
        trace.note("Opened NYSA's dashboard", { from: dashboard.webContents.getURL() });
        await Promise.race([
          Promise.resolve(dashboard.webContents.loadURL(home)).catch(() => undefined),
          runPause(20_000),
        ]);
      }
      trace.note('Pressing the Motor tile', { on: dashboard.webContents.getURL() });
      const tile = await exec(dashboard.webContents, {
        op: 'clickText',
        text: 'Motor',
        timeoutMs: 10_000,
      });
      if (!tile.ok && !tile.detail?.startsWith('page-changed')) {
        return failed(
          'Open the quote form',
          `The Motor tile was not found on NYSA's dashboard (${tile.detail}; the tab is on ${dashboard.webContents.getURL()}). Open Motor by hand, then press again.`,
          dashboard,
        );
      }
    }
    page = await waitForPath((p) => p === ICICI_QUOTE_PATH, 30_000);
    trace.note(page ? 'The quote form opened' : 'The quote form did not open');
    if (!page) {
      return failed(
        'Open the quote form',
        "ICICI did not open NYSA Motor's quote form. Open Motor by hand (its Quote tab), then press again.",
        pages()[0],
      );
    }
  }
  const wc = page.webContents;
  const onPage = page;
  // Once the form is open, a step that fails hands it over: the advisor finishes it in NYSA and
  // gets the premium, and the app reads it and saves the PDF (hand-over.ts).
  const TOTAL = { op: 'readAmount', label: 'Total Premium', timeoutMs: 60_000 } as const;
  const progress = new FillProgress([{ label: 'Read the premium', op: TOTAL }]);
  const handOver = (label: string, why: string): QuoteRunResult => {
    onPage.focus();
    return handedOver({
      insurer: 'ICICI Lombard',
      page: onPage,
      progress,
      stopped: { label, why },
      compose: (read) => ({
        outcome: 'ready',
        step: null,
        message: `ICICI Lombard: the Total Premium shown is ₹${read.value ?? ''}.`,
        problems: [],
        premium: {
          label: `ICICI Lombard motor, ${named}`,
          amount: (read.value ?? '').replace(/[^\d.]/g, ''),
        },
        amountLabel: 'Total premium',
      }),
    });
  };
  const step = async (label: string, op: PageOp): Promise<QuoteRunResult | null> => {
    const result = await exec(wc, op);
    if (result.ok) return null;
    return handOver(label, `NYSA did not take this step (${result.detail ?? 'unknown'}).`);
  };

  // A message left open from before (ICICI's pop-ups block the form).
  const before = await exec(wc, { op: 'popup' });
  if (before.errors) {
    page.focus();
    return {
      outcome: 'refused',
      step: null,
      message: `Close ICICI's message first, then try again. It says: ${before.errors}`,
      problems: [],
    };
  }

  // 2. Vehicle Details.
  const stop = await step('Vehicle details form', {
    op: 'waitFor',
    selector: REGISTRATION,
    timeoutMs: 20_000,
  });
  if (stop) return stop;
  // A new vehicle: New Business chosen, then the form is the advisor's (its fields not recorded).
  if (vehicle.condition === 'new') {
    const nb = 'input[name="policyType"][value^="New"]';
    for (const op of [
      { op: 'clickSelector', selector: `label:has(> ${nb})`, timeoutMs: 10_000 },
      { op: 'waitFor', selector: `${nb}:checked`, timeoutMs: 3000 },
    ] as const) {
      const s = await step('Policy type: New Business', op);
      if (s) return s;
    }
    return handOver(
      'Vehicle details (New Business)',
      "ICICI's New Business form has not been recorded, so the app chose New Business and stops here. Fill the vehicle's details on NYSA and get the premium",
    );
  }
  // A number fetched before is locked behind its Edit button.
  await exec(wc, { op: 'clickSelector', selector: 'button[aria-label="Edit"]', timeoutMs: 500 });
  const policyType = 'input[name="policyType"][value^="Roll"]';
  for (const [label, op] of [
    [
      'Policy type: Rollover',
      { op: 'clickSelector', selector: `label:has(> ${policyType})`, timeoutMs: 10_000 },
    ],
    [
      'Policy type: Rollover',
      { op: 'waitFor', selector: `${policyType}:checked`, timeoutMs: 3000 },
    ],
  ] as const) {
    const s = await step(label, op);
    if (s) return s;
  }
  // Asked on the car flow only (the two-wheeler flow has no such question).
  const owner = `input[name="ownershipChange"][value="${run.ownershipChanged ? 'yes' : 'no'}"]`;
  if ((await exec(wc, { op: 'waitFor', selector: owner, timeoutMs: 1500 })).ok) {
    for (const op of [
      { op: 'clickSelector', selector: `label:has(> ${owner})`, timeoutMs: 3000 },
      { op: 'waitFor', selector: `${owner}:checked`, timeoutMs: 3000 },
    ] as const) {
      const s = await step('Ownership changed', op);
      if (s) return s;
    }
  }
  for (const [label, op] of [
    [
      'Registration number',
      { op: 'setField', selector: REGISTRATION, value: run.registrationNumber ?? '' },
    ],
    [
      'Fetch Vehicle Data',
      {
        op: 'clickSelector',
        selector: 'button[type="submit"]',
        text: 'Fetch Vehicle Data',
        timeoutMs: 5000,
      },
    ],
  ] as const) {
    const s = await step(label, op);
    if (s) return s;
  }

  // 3. ICICI looks the vehicle up and opens the premium page; it may first say the number belongs
  // to the other flow (answered OK, as recorded) or that something is wrong (the run stops).
  let premiumShown = false;
  for (let waited = 0; waited < 90_000 && !premiumShown; waited += 1000) {
    if (path(page) === ICICI_PREMIUM_PATH) {
      premiumShown = true;
      break;
    }
    const popup = await exec(wc, { op: 'popup' });
    if (popup.errors) {
      if (!SWITCHING.test(popup.errors)) {
        return handOver('Fetch Vehicle Data', `ICICI says: ${popup.errors.replace(/\s*OK$/, '')}`);
      }
      const ok = await exec(wc, {
        op: 'clickSelector',
        selector: '.swal2-confirm, [role="dialog"] button',
        text: 'OK',
        timeoutMs: 3000,
      });
      if (!ok.ok) {
        return handOver('Fetch Vehicle Data', `ICICI says: ${popup.errors} Press OK there.`);
      }
    }
    await runPause(1000);
  }
  if (!premiumShown) {
    return handOver(
      'Fetch Vehicle Data',
      'ICICI did not show the premium page within 90 seconds (check for a message under the registration number).',
    );
  }

  // 4. The premium, at ICICI's IDV or the vehicle's.
  const total = TOTAL;
  const first = await exec(wc, total);
  if (!first.ok || !first.value) {
    return handOver(
      'Read the premium',
      `ICICI did not show the Total Premium (${first.detail ?? 'unknown'}).`,
    );
  }
  let amount = first.value;
  let note = '';
  if (run.idv === 'vehicle') {
    const want = String(vehicle.idvRupees);
    const set = await exec(wc, { op: 'setField', selector: IDV_BOX, value: want });
    const update = set.ok
      ? await exec(wc, {
          op: 'clickSelector',
          selector: IDV_UPDATE,
          text: 'Update',
          timeoutMs: 5000,
        })
      : set;
    if (!update.ok) {
      note = ` The vehicle's IDV (₹${rupees(vehicle.idvRupees)}) could not be set on NYSA (${update.detail ?? 'unknown'}), so this premium is at ICICI's own IDV.`;
    } else {
      const again = await exec(wc, { ...total, fresh: true });
      if (!again.ok || !again.value) {
        return handOver(
          'Read the premium',
          `ICICI did not show a new Total Premium after the IDV was updated (${again.detail ?? 'unknown'}).`,
        );
      }
      amount = again.value;
    }
  }
  const idv = await exec(wc, { op: 'readValue', selector: IDV_BOX, timeoutMs: 3000 });
  const idvShown = idv.ok && idv.value ? idv.value.replace(/[^\d]/g, '') : '';
  if (run.idv === 'vehicle' && !note && idvShown && idvShown !== String(vehicle.idvRupees)) {
    note = ` ICICI kept the IDV at ₹${rupees(Number(idvShown))} (the vehicle's ₹${rupees(vehicle.idvRupees)} is outside what it allows).`;
  }
  page.focus();
  const label = `ICICI Lombard motor, ${named}${idvShown ? `, IDV ₹${rupees(Number(idvShown))}` : ''}`;
  return {
    outcome: 'ready',
    step: null,
    message: `ICICI Lombard worked the premium out: ₹${amount} (Total Premium).${note} The app did not press Buy Now.`,
    problems: [],
    premium: { label, amount: amount.replace(/[^\d.]/g, '') },
    amountLabel: 'Total premium',
  };
}
