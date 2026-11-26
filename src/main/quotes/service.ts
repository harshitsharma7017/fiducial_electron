// Quote runs behind the IPC channel. Off unless the automation features are switched on. United
// India: health and motor calculators, the health, Overseas Travel and Overseas Mediclaim
// e-proposals. New India: motor (the vehicle details of the Private Car and Two Wheeler forms;
// run-nia-motor.ts), the health quote forms of twelve policies (run-nia-health.ts) and three
// overseas travel quote forms (run-nia-travel.ts) and four rural quote forms for a rural client
// (run-nia-rural.ts), the Marine Specific Voyage form for a marine client (run-nia-marine.ts),
// three Personal Accident forms for a health client's proposer (run-nia-pa.ts), and nine fire
// forms for a property client (run-nia-fire.ts). Niva Bupa: the premium calculator for
// ReAssure 2.0, ReAssure 3.0 and Health Recharge, for a health client (run-niva-health.ts). HDFC
// ERGO: PIE's motor forms for a saved vehicle, its MST, Energy, Optima Secure and Optima Restore
// forms for a health client and its Retail Travel form for a travel client (run-hdfc.ts).
// Other
// insurers and products are refused with a reason. Motor quotes are for a saved vehicle, travel
// e-proposals for a travel client, the others for a saved client.
import type { WebContents } from 'electron';
import type { ClientService } from '../clients/service';
import type { PortalPage } from '../insurers/portal-host';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import type { QuoteRunRequest } from '../../shared/ipc/contract';
import { clientForInsurer } from '../../shared/contracts/client';
import { findPortal, mayFillLogin } from '../../shared/insurers/portals';
import { isInsurerPaused } from '../../shared/insurers/availability';
import { GUESSED_READING, type HandOver } from './hand-over';
import { formChanges, parseFormValues } from './form-changes';
import type { PageOp, PageOpResult } from './page-ops';
import {
  lastWorkedPage,
  runUiicHealthProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
  runUiicOmpProposal,
  runUiicTravelProposal,
  exec,
  followWork,
  QuoteRunStopped,
  runScoped,
  type QuoteRunResult,
  type ScopedRun,
} from './run-uiic-health';
import type { UiicProposalForm } from './uiic-health-proposal';
import type { QuotePdfs } from './quote-pdf';
import {
  healthFacts,
  quoteReference,
  travellerFacts,
  vehicleFacts,
  type QuoteDocument,
} from './quote-document';
import { runNiaHealthQuote } from './run-nia-health';
import { runNiaMotorQuote } from './run-nia-motor';
import { runIciciMotorQuote } from './run-icici-motor';
import { IciciApiError, type IciciApiClient } from '../icici-api/client';
import { runIciciHealthPremium } from '../icici-api/health';
import { runIciciMotorPremium } from '../icici-api/motor';
import { runNiaMarineQuote } from './run-nia-marine';
import { runNiaPaQuote } from './run-nia-pa';
import { runNiaFireQuote } from './run-nia-fire';
import { runNiaRuralQuote } from './run-nia-rural';
import { runNiaTravelQuote } from './run-nia-travel';
import { runNivaHealthQuote } from './run-niva-health';
import { runBajajPaQuote } from './run-bajaj-pa';
import {
  runIciciElevateQuote,
  runIciciIntlTravelQuote,
  runIciciStudentTravelQuote,
} from './run-icici-nysa';
import {
  runHdfcMotorQuote,
  runHdfcMstQuote,
  runHdfcRetailQuote,
  runHdfcTravelQuote,
} from './run-hdfc';

/** The e-proposal each product fills. */
const PROPOSAL_FORM = {
  'fm-proposal': 'family-medicare',
  'ihp-proposal': 'individual-health',
  'as-proposal': 'arogya-sanjeevani',
  'stu-proposal': 'super-top-up',
  'yhp-proposal': 'yuvaan',
} as const satisfies Record<string, UiicProposalForm>;

export interface QuoteService {
  run(request: QuoteRunRequest): Promise<QuoteRunResult>;
  /**
   * Stops the run in progress where it is, or the wait for a handed-over form's premium; false if
   * there is neither. Presses nothing.
   */
  cancel(insurerId?: string): boolean;
  /**
   * Finishes the form the last run left for the advisor (request of 20 November 2026): once the
   * advisor has filled the rest and pressed the insurer's premium button, reads the premium from
   * the insurer's page (waiting up to `waitMs`), or takes the `amount` the advisor typed, and
   * saves the quote as a PDF. Presses nothing.
   */
  finish(request: {
    waitMs: number;
    amount?: string;
    insurerId?: string;
    plans?: string[];
  }): Promise<QuoteRunResult>;
  /** Opens a quote PDF this app saved (by its name); false for any other. */
  openPdf(name: string): Promise<boolean>;
  /**
   * Each insurer's latest quote, as it goes (request of 25 November 2026: several insurers at
   * once): answers once something changed after `since` (or after 20 seconds anyway).
   */
  progress(since: number): Promise<{ version: number; items: QuoteProgress[] }>;
  /**
   * One PDF comparing the premiums the given insurers quoted for a health client (their latest
   * quotes with a premium), beside each insurer's own PDF.
   */
  compare(request: {
    clientId?: string;
    vehicleId?: string;
    travellerId?: string;
    insurerIds: string[];
  }): Promise<QuoteCompareResult>;
}

/** One insurer's latest quote, for the screens' progress. */
export interface QuoteProgress {
  insurerId: string;
  product: string;
  state: 'running' | 'handed-over' | 'ready' | 'refused' | 'failed' | 'cancelled';
  /** The step it is on (while running), or stopped at. */
  step: string | null;
  message: string | null;
  premium?: { label: string; amount: string };
  pdf?: { name: string };
  toDo?: string[];
  finish?: NonNullable<QuoteRunResult['finish']>;
  /** Set while the app watches a handed-over form for its premium. */
  watching?: boolean;
  /** A form the advisor changes before its PDF: they press Generate PDF (it is not watched). */
  adjust?: boolean;
  updatedAt: string;
}

export type QuoteCompareResult =
  { ok: true; pdf: { name: string }; insurers: number } | { ok: false; message: string };

/** Who and what a quote is for, in its document. */
type QuoteFacts = Pick<QuoteDocument, 'details' | 'members'> & { clientName: string | null };

/** A form the last run left for the advisor to finish, and how the app finishes it. */
interface Pending {
  insurerId: string;
  request: QuoteRunRequest;
  facts: QuoteFacts;
  /** How to read the premium, and the result it makes; null: the advisor types it. */
  handOver: HandOver | null;
  finish: NonNullable<QuoteRunResult['finish']>;
  /** What the reading found on the form when it was handed over (not the premium asked for). */
  baseline: string | null;
  /** Set by cancel: the wait stops (the advisor can still type the premium). */
  stopWatching: boolean;
  /** The finished result, once one wait or the typed amount finished it. */
  done: QuoteRunResult | null;
  /**
   * The advisor changes the form before its PDF ("let me change it first"): the PDF is saved when
   * they press Generate PDF, naming what they changed (`shown`: the form's values when handed over).
   */
  adjust: boolean;
  shown: [string, string][] | null;
  /**
   * The result the run read (its premium), for Stop & make PDF when the page cannot be read
   * again (ICICI's partner API has no page; a form whose reading was not recorded).
   */
  stored: QuoteRunResult | null;
  /** The reading that showed several plans, kept while the advisor chooses among them. */
  choosing: QuoteRunResult | null;
}

/** A premium reading, short, as a poll: never "only after this step" (fresh). */
function pollOp(read: PageOp): PageOp {
  if (read.op === 'readAmount') return { ...read, fresh: false, timeoutMs: 2500 };
  return 'timeoutMs' in read ? { ...read, timeoutMs: Math.min(read.timeoutMs, 2500) } : read;
}
const readingKey = (r: PageOpResult): string =>
  r.plans?.length ? JSON.stringify(r.plans) : (r.value ?? '');
const pauseMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A result with only the plans the advisor chose (in the page's order), the first of them as its
 * premium; the label names that plan instead of the one first shown.
 */
function onlyPlans(result: QuoteRunResult, names: string[]): QuoteRunResult {
  const chosen = (result.plans ?? []).filter((plan) => names.includes(plan.name));
  const first = chosen[0];
  if (!first) return result;
  const shownFirst = result.plans?.[0]?.name;
  const label =
    result.premium && shownFirst && result.premium.label.includes(shownFirst)
      ? result.premium.label.replace(shownFirst, first.name)
      : first.name;
  return {
    ...result,
    plans: chosen,
    premium: { label, amount: first.amount },
    message:
      chosen.length === 1
        ? `${first.name}: ₹${first.amount} (the plan chosen for the PDF).`
        : `${chosen.map((c) => `${c.name} ₹${c.amount}`).join('; ')} (the plans chosen for the PDF).`,
  };
}

/** The kind of insurance, for the document's title. */
const KIND: Partial<Record<QuoteRunRequest['product'], string>> = {
  health: 'Health',
  'fm-proposal': 'Health',
  'ihp-proposal': 'Health',
  'as-proposal': 'Health',
  'stu-proposal': 'Health',
  'yhp-proposal': 'Health',
  'niva-health': 'Health',
  'nia-health': 'Health',
  'hdfc-mst': 'Health',
  'icici-elevate': 'Health',
  'icici-intl-travel': 'Travel',
  'icici-student-travel': 'Travel',
  'hdfc-retail': 'Health',
  'bajaj-pa': 'Personal Accident',
  motor: 'Motor',
  'hdfc-motor': 'Motor',
  'icici-motor': 'Motor',
  'icici-api-motor': 'Motor',
  'icici-api-health': 'Health',
  'travel-proposal': 'Travel',
  'omp-proposal': 'Travel',
  'nia-travel': 'Travel',
  'hdfc-travel': 'Travel',
};

/** How a product is named in its PDF's file name. */
const PRODUCT_TITLE: Partial<Record<QuoteRunRequest['product'], string>> = {
  motor: 'motor',
  health: 'health',
  'fm-proposal': 'Family Medicare',
  'ihp-proposal': 'Individual Health',
  'as-proposal': 'Arogya Sanjeevani',
  'stu-proposal': 'Super Top-up',
  'yhp-proposal': 'Yuvaan Health',
  'travel-proposal': 'Overseas Travel',
  'omp-proposal': 'Overseas Mediclaim',
  'hdfc-motor': 'motor',
  'icici-motor': 'motor',
  'icici-api-motor': 'motor',
  'hdfc-mst': 'MST',
  'icici-elevate': 'Elevate',
  'icici-intl-travel': 'International Travel',
  'icici-student-travel': 'Student Medical Travel',
  'bajaj-pa': 'personal accident',
  'hdfc-retail': 'health',
  'hdfc-travel': 'travel',
  'niva-health': 'health',
};

export function createQuoteService(deps: {
  enabled: boolean;
  clients: Pick<
    ClientService,
    | 'get'
    | 'aadhaarFor'
    | 'getVehicle'
    | 'getTraveller'
    | 'passportFor'
    | 'getRural'
    | 'getMarine'
    | 'getProperty'
  >;
  /** The insurer's open pages: its portal first, then its pop-ups. */
  windowsOf: (insurerId: string) => PortalPage[];
  logger: Logger;
  now?: () => Date;
  /** Where fetched quotes are saved as PDFs; absent, none are saved. */
  pdfs?: QuotePdfs;
  /**
   * The insurer tabs' host: told which insurers are being filled, so their tabs keep drawing
   * (a hidden tab draws nothing: combined runs, 26 November 2026).
   */
  portals?: { setWorking: (insurerIds: string[]) => void };
  /** Saves a run's trace for support (a file of the app's own); returns its name, or null. */
  diagnose?: (name: string, data: unknown) => string | null;
  /**
   * ICICI Lombard's partner API, in the environment chosen in Settings: its client, with the IMID
   * code for health premiums; null when it is not set up.
   */
  iciciApi?: () => Promise<{ client: IciciApiClient; imidCode?: string } | null>;
}): QuoteService {
  /** The runs in progress, by insurer: several insurers' quotes run at once, one per insurer. */
  const active = new Map<string, ScopedRun<QuoteRunResult>>();
  /** The forms left for the advisor to finish, by insurer; `latestPending` the last one left. */
  const pendings = new Map<string, Pending>();
  let latestPending: string | null = null;
  /** Each insurer's latest quote, for the screens (progress); `version` counts its changes. */
  const progressOf = new Map<string, QuoteProgress>();
  let version = 0;
  let waiters: (() => void)[] = [];
  const setProgress = (
    insurerId: string,
    change: Partial<QuoteProgress> & Pick<QuoteProgress, 'state'>,
  ): void => {
    const before = progressOf.get(insurerId);
    progressOf.set(insurerId, {
      insurerId,
      product: change.product ?? before?.product ?? '',
      step: null,
      message: null,
      // The same state goes on (a run's next step, a handed-over form now watched): what it had.
      ...(change.state === before?.state ? before : {}),
      ...change,
      updatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    });
    version += 1;
    const told = waiters;
    waiters = [];
    for (const wake of told) wake();
  };
  /** A run's result, as its insurer's progress. */
  const progressFrom = (insurerId: string, result: QuoteRunResult): void => {
    setProgress(insurerId, {
      state: result.outcome,
      step: result.step,
      message: result.message,
      ...(result.premium ? { premium: result.premium } : {}),
      ...(result.pdf ? { pdf: result.pdf } : {}),
      ...(result.toDo?.length ? { toDo: result.toDo } : {}),
      ...(result.finish ? { finish: result.finish } : {}),
      watching: false,
      adjust: result.outcome === 'handed-over' && pendings.get(insurerId)?.adjust === true,
    });
  };
  /**
   * While a run works, the tab it fills is brought to the front (once per change of tab), so the
   * advisor watches the insurer's form, including a pop-up such as United India's calculator.
   */
  /**
   * Whether the insurer's portal can be worked in: its tab is open and past the sign-in page.
   * The sign-in page is told by its address and, for portals with a sign-in form, by the password
   * box on screen (a portal may keep the sign-in address after signing in). Nothing is filled or
   * pressed. Returns the refusal to show, or null when the portal is ready.
   */
  const portalNotReady = async (insurerId: string): Promise<QuoteRunResult | null> => {
    const portal = findPortal(insurerId);
    const name = portal?.displayName ?? 'the insurer';
    const page = deps.windowsOf(insurerId).find((p) => !p.isDestroyed());
    if (!page) {
      return {
        outcome: 'refused',
        step: null,
        message: `Please log in to ${name}'s portal and keep it open: open it from the Insurers screen, sign in, and leave its tab open. Then press again.`,
        problems: [],
      };
    }
    if (!portal || !mayFillLogin(portal, page.webContents.getURL())) return null;
    const onSignIn = portal.form
      ? (
          await exec(page.webContents, {
            op: 'waitFor',
            selector: portal.form.password,
            timeoutMs: 1500,
          })
        ).ok
      : true;
    return onSignIn
      ? {
          outcome: 'refused',
          step: null,
          message: `Please log in to ${name}'s portal and keep it open: its tab is on the sign-in page. Sign in, leave the tab open, then press again.`,
          problems: [],
        }
      : null;
  };
  /** The result of a run the advisor cancelled; any other error goes on. */
  const whenCancelled = (err: unknown, insurerId: string): QuoteRunResult => {
    if (!(err instanceof QuoteRunStopped)) throw err;
    deps.logger.log('info', 'quote.run', { insurer: insurerId, quoteOutcome: 'cancelled' });
    return {
      outcome: 'cancelled',
      step: null,
      message: "Cancelled: nothing was submitted. The insurer's tab goes back to its home page.",
      problems: [],
    };
  };
  /**
   * A run that fetched a premium, saved as a PDF: the app's quote document (the client, every plan
   * and its premium, the notes). A PDF that cannot be saved does not undo the quote: the advisor is
   * told.
   */
  const withPdf = async (
    result: QuoteRunResult,
    request: QuoteRunRequest,
    facts: QuoteFacts,
    /** What the advisor changed on the insurer's form before this premium, if they did. */
    changed?: { changes: string[] },
  ): Promise<QuoteRunResult> => {
    if (result.outcome !== 'ready' || !result.premium || !deps.pdfs) return result;
    const insurer = findPortal(request.insurerId)?.displayName ?? request.insurerId;
    const product = PRODUCT_TITLE[request.product] ?? request.product;
    const kind = KIND[request.product];
    const issuedAt = (deps.now ?? (() => new Date()))();
    const plans = result.plans?.length
      ? result.plans
      : [{ name: result.premium.label, amount: result.premium.amount }];
    const doc: QuoteDocument = {
      title: kind ? `${kind} insurance quote` : 'Insurance quote',
      insurer,
      // "Health insurance" for a calculator; the form's own name (Family Medicare…) otherwise.
      product:
        kind && product.toLowerCase() === kind.toLowerCase()
          ? `${kind} insurance`
          : product.charAt(0).toUpperCase() + product.slice(1),
      issuedAt,
      reference: quoteReference(issuedAt),
      clientName: facts.clientName ?? 'Client',
      details: [
        ...facts.details,
        ...(result.breakdown ?? []).map((b): [string, string] => [b.label, b.value]),
      ],
      ...(facts.members ? { members: facts.members } : {}),
      plans,
      amountLabel: result.amountLabel ?? 'Premium',
      notes: [
        ...(result.amountLabel?.toLowerCase().includes('excluding gst')
          ? ['Premiums exclude GST: the insurer adds any tax due when the policy is issued.']
          : []),
        ...(request.product === 'health' && request.insurerId === 'united-india'
          ? [
              'The quote assumes every insured person is in good health, without any pre-existing disease, as declared to the insurer.',
              `${insurer}: persons with a pre-existing medical disease, deformity or disability are not offered cover online and should visit the insurer's nearest office.`,
            ]
          : []),
        ...(changed
          ? [
              changed.changes.length > 0
                ? `Changed by the advisor on ${insurer}'s page before this premium: ${changed.changes.join('; ')}. The other details are as saved with the client.`
                : `Checked by the advisor on ${insurer}'s page before this premium (no change to the form was found).`,
            ]
          : []),
        'Premiums are as the insurer showed them for the details above; they can change if any detail changes.',
      ],
    };
    try {
      const name = await deps.pdfs.save(
        doc,
        `${insurer} ${product} quote${facts.clientName ? ` - ${facts.clientName}` : ''}`,
      );
      return { ...result, pdf: { name } };
    } catch (err) {
      deps.logger.log('warn', 'quote.pdf-failed', {
        insurer: request.insurerId,
        errorName: err instanceof Error ? err.name : 'unknown',
      });
      return { ...result, message: `${result.message} The quote could not be saved as a PDF.` };
    }
  };
  /**
   * A run's result for the screens: a handed-over form (or one filled without a premium) is kept
   * to be finished later; a premium is saved as a PDF.
   */
  const conclude = async (
    result: QuoteRunResult,
    request: QuoteRunRequest,
    facts: QuoteFacts,
  ): Promise<QuoteRunResult> => {
    const { handOver, ...view } = result;
    const insurerId = request.insurerId;
    pendings.delete(insurerId);
    // A form filled (or partly) without a premium: the page the run ended in, read by the usual
    // captions once the advisor has the premium.
    const fallback = (): HandOver | null => {
      const wc = lastWorkedPage();
      const page = wc ? deps.windowsOf(insurerId).find((p) => p.webContents === wc) : undefined;
      if (!page) return null;
      const insurer = findPortal(insurerId)?.displayName ?? insurerId;
      return {
        page,
        read: GUESSED_READING,
        known: false,
        compose: (read) => ({
          outcome: 'ready',
          step: null,
          message: `${insurer}: the premium shown is ₹${read.value ?? ''}.`,
          problems: [],
          premium: {
            label: `${insurer} premium`,
            amount: (read.value ?? '').replace(/[^\d.]/g, ''),
          },
        }),
      };
    };
    // No PDF by itself (request of 26 November 2026: "the pdf generation should not be
    // automatic", everywhere): a premium read is kept with the form; the advisor checks the
    // insurer's tab, changes anything, and presses Stop & make PDF, when the premium shown then is
    // read and saved. A run that read a premium is kept the same way.
    const adjust = true;
    const keepForAdvisor = view.outcome === 'ready' && !!view.premium;
    const finishable =
      keepForAdvisor ||
      view.outcome === 'handed-over' ||
      (!view.premium && (view.outcome === 'ready' || view.outcome === 'failed'));
    if (!finishable) return view;
    // The form's own reading; a run that read its premium without one is not read by a guess
    // (Stop & make PDF then saves what the run read).
    const how = handOver ?? (keepForAdvisor ? null : fallback());
    const finish = view.finish ?? { button: null, guessed: how ? !how.known : true };
    let baseline: string | null = null;
    let shown: [string, string][] | null = null;
    if (how && !how.page.isDestroyed()) {
      const wc = how.page.webContents;
      // Changed or not, the premium shown when the advisor presses Generate PDF is the quote.
      if (!adjust) {
        const r = await exec(wc, pollOp(how.read)).catch(() => null);
        baseline = r?.ok ? readingKey(r) : null;
      } else {
        const r = await exec(wc, { op: 'formValues' }).catch(() => null);
        shown = r?.ok ? parseFormValues(r.value) : null;
      }
    }
    pendings.set(insurerId, {
      insurerId,
      request,
      facts,
      handOver: how,
      finish,
      baseline,
      stopWatching: false,
      done: null,
      adjust,
      shown,
      stored: keepForAdvisor ? view : null,
      choosing: null,
    });
    latestPending = insurerId;
    if (keepForAdvisor) {
      const insurer = findPortal(insurerId)?.displayName ?? insurerId;
      const now = view.premium ? ` ${insurer} shows ₹${view.premium.amount}.` : '';
      return {
        ...view,
        outcome: 'handed-over',
        message: `The app filled ${insurer}'s form.${now} Check it in ${insurer}'s tab (change anything you need), then press Stop & make PDF: the premium shown then is saved as the PDF.`,
        finish,
      };
    }
    return { ...view, finish };
  };
  /** The premium on the handed-over form, once the insurer shows one it did not show before. */
  const readPremium = async (p: Pending): Promise<PageOpResult | null> => {
    const how = p.handOver;
    if (!how) return null;
    const polled = pollOp(how.read);
    // A form the advisor changes: the sum insured and period they chose, not the client's (only
    // never Niva Bupa's recommended premium, shown before any sum insured is chosen).
    const op: PageOp =
      p.adjust && polled.op === 'ionRadioRead' && polled.requires
        ? {
            ...polled,
            requires: polled.requires.chosen ? { chosen: polled.requires.chosen } : {},
          }
        : polled;
    const own = how.page.isDestroyed() ? null : how.page;
    // The form's own page first; if it was closed, any of the insurer's pages (a new tab).
    const pages = own ? [own] : deps.windowsOf(p.insurerId).filter((w) => !w.isDestroyed());
    for (const page of pages) {
      const r = await exec(page.webContents, op).catch(() => null);
      if (!r?.ok || !readingKey(r)) continue;
      if (page === own && readingKey(r) === p.baseline) continue;
      return r;
    }
    return null;
  };
  /**
   * The insurer's tab back to its home page (requests of 25 November 2026): before every quote,
   * and after it is cancelled or ends (unless a form is left for the advisor to finish), so no quote
   * ever starts from a form left half-way. The tab the run worked in, else the insurer's first; the
   * advisor stays signed in. Resolves once the home page has loaded (or 20 seconds on); a tab that
   * cannot be sent home is left as it is.
   */
  const resetPortal = async (
    insurerId: string,
    worked: WebContents | null = lastWorkedPage(),
  ): Promise<void> => {
    const portal = findPortal(insurerId);
    if (!portal?.homeUrl) return;
    const pages = deps.windowsOf(insurerId).filter((w) => !w.isDestroyed());
    const page = pages.find((w) => w.webContents === worked) ?? pages[0];
    if (!page) return;
    const wc = page.webContents;
    // A tab on one of the insurer's other sites goes to that site's home (HDFC ERGO's PIE).
    const siteOf = (url: string): string | null => {
      try {
        return new URL(url).origin;
      } catch {
        return null;
      }
    };
    const on = siteOf(wc.getURL());
    const home =
      (portal.siteHomeUrls ?? []).find((u) => on !== null && siteOf(u) === on) ?? portal.homeUrl;
    try {
      // A home address differing only after "#" (Niva Bupa's, ICICI's) does not load the page
      // again: the single-page app keeps its old screens (Ionic keeps a calculator left half-way,
      // its loading overlay, the run's marks: the traces of 25 November 2026). It is reloaded then.
      const sameDocument = (() => {
        try {
          const now = new URL(wc.getURL());
          const to = new URL(home);
          return (
            now.origin === to.origin && now.pathname === to.pathname && now.search === to.search
          );
        } catch {
          return false;
        }
      })();
      await Promise.race([
        Promise.resolve(wc.loadURL(home)).catch(() => undefined),
        pauseMs(20_000),
      ]);
      if (sameDocument && !page.isDestroyed()) {
        wc.reload();
        await pauseMs(500);
      }
      // Settled: loaded, or 3 seconds on (a page may keep something loading).
      const settle = Date.now() + 3000;
      while (!page.isDestroyed() && wc.isLoading?.() && Date.now() < settle) await pauseMs(300);
    } catch {
      // Left as it is.
    }
  };
  const finished = async (p: Pending, result: QuoteRunResult): Promise<QuoteRunResult> => {
    deps.logger.log('info', 'quote.finished', {
      insurer: p.insurerId,
      quoteOutcome: result.outcome,
    });
    let changed: { changes: string[] } | undefined;
    if (p.adjust && result.outcome === 'ready') {
      const page = p.handOver?.page;
      const r =
        page && !page.isDestroyed()
          ? await exec(page.webContents, { op: 'formValues' }).catch(() => null)
          : null;
      const now = r?.ok ? parseFormValues(r.value) : null;
      changed = { changes: p.shown && now ? formChanges(p.shown, now) : [] };
    }
    const saved = await withPdf(result, p.request, p.facts, changed);
    p.done = saved;
    if (pendings.get(p.insurerId) === p) pendings.delete(p.insurerId);
    progressFrom(p.insurerId, saved);
    // The handed-over form is finished: the tab goes back to its home page.
    void resetPortal(p.insurerId, p.handOver?.page.webContents ?? null);
    return saved;
  };
  /** ICICI Lombard by its partner API: no portal, no form; a premium or ICICI's reason. */
  const runByIciciApi = async (
    request: Extract<QuoteRunRequest, { product: 'icici-api-motor' | 'icici-api-health' }>,
  ): Promise<QuoteRunResult> => {
    const api = deps.iciciApi ? await deps.iciciApi() : null;
    if (!api) {
      return {
        outcome: 'refused',
        step: null,
        message:
          "ICICI Lombard's API is not set up: on the Insurer portals screen, press Partner API on ICICI Lombard, choose UAT or Production and save its partner login.",
        problems: [],
      };
    }
    const today = (deps.now ?? (() => new Date()))();
    // Read before anything is sent: an unknown vehicle or client is refused at once.
    const subject =
      request.product === 'icici-api-motor'
        ? {
            kind: 'vehicle' as const,
            vehicle: (await deps.clients.getVehicle(request.vehicleId)).saved.vehicle,
          }
        : { kind: 'client' as const, record: await deps.clients.get(request.clientId) };
    try {
      const result =
        subject.kind === 'vehicle' && request.product === 'icici-api-motor'
          ? await runIciciMotorPremium({
              api: api.client,
              vehicle: subject.vehicle,
              run: request.run,
            })
          : subject.kind === 'client' && request.product === 'icici-api-health'
            ? await runIciciHealthPremium({
                api: api.client,
                client: subject.record.client,
                run: request.run,
                today,
                ...(api.imidCode ? { imidCode: api.imidCode } : {}),
              })
            : (() => {
                throw new AppException('VALIDATION_FAILED');
              })();
      deps.logger.log(result.outcome === 'failed' ? 'warn' : 'info', 'quote.run', {
        insurer: request.insurerId,
        quoteOutcome: result.outcome,
      });
      const facts: QuoteFacts =
        subject.kind === 'vehicle'
          ? {
              clientName: null,
              details: [
                ...(request.product === 'icici-api-motor' && request.run.registrationNumber
                  ? ([['Registration number', request.run.registrationNumber]] as [
                      string,
                      string,
                    ][])
                  : []),
                // ICICI's own IDV is in the breakdown.
                ...vehicleFacts(subject.vehicle).details.filter(
                  ([k]) => k !== 'Insured declared value',
                ),
              ],
            }
          : {
              clientName: subject.record.client.customer.name,
              ...healthFacts(subject.record.client, today),
            };
      if (result.outcome !== 'ready' || !result.premium) return result;
      // No PDF by itself: kept until the advisor presses Stop & make PDF.
      pendings.set(request.insurerId, {
        insurerId: request.insurerId,
        request,
        facts,
        handOver: null,
        finish: { button: null, guessed: false },
        baseline: null,
        stopWatching: false,
        done: null,
        adjust: true,
        shown: null,
        stored: result,
        choosing: null,
      });
      latestPending = request.insurerId;
      return {
        ...result,
        outcome: 'handed-over',
        message: `${result.message} Press Stop & make PDF to save it as a PDF.`,
        finish: { button: null, guessed: false },
      };
    } catch (err) {
      if (err instanceof IciciApiError) {
        deps.logger.log('warn', 'quote.run', {
          insurer: request.insurerId,
          quoteOutcome: 'failed',
        });
        return { outcome: 'failed', step: 'ICICI Lombard API', message: err.message, problems: [] };
      }
      throw err;
    }
  };
  const follow = (insurerId: string): void => {
    let shown: unknown = null;
    followWork((wc) => {
      // Several insurers at once: no tab is brought to the front (they would take turns).
      if (active.size > 1) return;
      if (wc === shown) return;
      const page = deps.windowsOf(insurerId).find((p) => !p.isDestroyed() && p.webContents === wc);
      if (!page) return;
      shown = wc;
      page.focus();
    });
  };
  return {
    cancel: (insurerId) => {
      // One insurer's run (or its handed-over form's wait), or, without one, every one.
      const ids = insurerId ? [insurerId] : [...new Set([...active.keys(), ...pendings.keys()])];
      let stopped = false;
      for (const id of ids) {
        const run = active.get(id);
        if (run) {
          stopped = run.stop() || stopped;
          continue;
        }
        const p = pendings.get(id);
        if (p?.adjust) {
          // A form the advisor was changing: put away, no PDF (the tab goes back home).
          pendings.delete(id);
          setProgress(id, {
            state: 'cancelled',
            message: "Discarded: no PDF was saved. The insurer's tab goes back to its home page.",
            watching: false,
            adjust: false,
          });
          void resetPortal(id, p.handOver?.page.webContents ?? null);
          stopped = true;
          continue;
        }
        if (!p || p.stopWatching) continue;
        p.stopWatching = true;
        setProgress(id, { state: 'handed-over', watching: false });
        // Cancelled: the tab goes back to its home page (the premium can still be typed in).
        void resetPortal(id, p.handOver?.page.webContents ?? null);
        stopped = true;
      }
      return stopped;
    },
    finish: async ({ waitMs, amount, insurerId, plans }) => {
      const p = pendings.get(insurerId ?? latestPending ?? '');
      if (!p) {
        return {
          outcome: 'refused',
          step: null,
          message: 'No form is waiting to be finished: run a quote first.',
          problems: [],
        };
      }
      if (amount) {
        const insurer = findPortal(p.insurerId)?.displayName ?? p.insurerId;
        return finished(p, {
          outcome: 'ready',
          step: null,
          message: `Premium as you read it on ${insurer}'s page: ₹${amount}.`,
          problems: [],
          premium: { label: `${insurer} premium`, amount },
          amountLabel: 'Premium (as read by the advisor)',
        });
      }
      // The plans the advisor chose, among those the page showed when they pressed Stop.
      if (plans && p.choosing) return finished(p, onlyPlans(p.choosing, plans));
      /**
       * A reading with several plans: saved only once the advisor says which (request of 26
       * November 2026); with their choice given already, those.
       */
      const settle = (result: QuoteRunResult): Promise<QuoteRunResult> | QuoteRunResult => {
        if ((result.plans?.length ?? 0) < 2) return finished(p, result);
        if (plans) return finished(p, onlyPlans(result, plans));
        p.choosing = result;
        return {
          ...result,
          outcome: 'handed-over',
          choose: true,
          message: 'Choose which plan(s) to put in the PDF.',
          finish: p.finish,
        };
      };
      p.stopWatching = false;
      setProgress(p.insurerId, { state: 'handed-over', watching: true });
      const until = Date.now() + waitMs;
      for (;;) {
        if (p.done) return p.done;
        if (pendings.get(p.insurerId) !== p) {
          return {
            outcome: 'cancelled',
            step: null,
            message: 'Stopped waiting: another quote was started.',
            problems: [],
          };
        }
        const read = await readPremium(p);
        if (p.done) return p.done;
        if (read && p.handOver) return settle(p.handOver.compose(read));
        if (p.stopWatching || Date.now() >= until) break;
        await pauseMs(2000);
      }
      // Stop & make PDF on a form whose premium cannot be read now: what the run read.
      if (waitMs === 0 && p.stored && pendings.get(p.insurerId) === p) {
        setProgress(p.insurerId, { state: 'handed-over', watching: false });
        return settle(p.stored);
      }
      if (pendings.get(p.insurerId) === p) {
        setProgress(p.insurerId, { state: 'handed-over', watching: false });
      }
      return {
        outcome: 'handed-over',
        step: null,
        message: p.adjust
          ? "The app could not read a premium on the insurer's page. Get the premium shown there (on the page the app filled) and press Stop & make PDF again, or type the premium in to save the PDF."
          : p.stopWatching
            ? 'Stopped watching for the premium. Type it in to save the PDF, or watch again.'
            : 'The premium has not shown yet. Finish the form, or type the premium in to save the PDF.',
        problems: [],
        finish: p.finish,
      };
    },
    openPdf: (name) => deps.pdfs?.open(name) ?? Promise.resolve(false),
    run: async (request) => {
      const insurerId = request.insurerId;
      // A paused insurer (shared/insurers/availability.ts): refused before its tab is touched.
      if (isInsurerPaused(insurerId)) {
        return {
          outcome: 'refused',
          step: null,
          message: `${findPortal(insurerId)?.displayName ?? 'This insurer'} is paused in this version of the app.`,
          problems: [],
        };
      }
      // One quote per insurer at a time (several insurers' quotes run at once, each in its tab).
      if (active.has(insurerId)) {
        return {
          outcome: 'refused',
          step: null,
          message: 'A quote is already being filled for this insurer.',
          problems: [],
        };
      }
      const api = request.product === 'icici-api-motor' || request.product === 'icici-api-health';
      const resets = !api && deps.enabled;
      const run = runScoped(
        async () => {
          // Every quote starts from the insurer's home page.
          if (resets) await resetPortal(insurerId, null);
          const result = await runOnce(request);
          // Every quote ends back there too, whatever its outcome, unless a form is left for the
          // advisor to finish (it stays until they do, or stop watching).
          // A refused run filled nothing: its tab is left as it is.
          if (resets && !result.finish && result.outcome !== 'refused') void resetPortal(insurerId);
          return result;
        },
        (step) => setProgress(insurerId, { state: 'running', step }),
      );
      active.set(insurerId, run);
      deps.portals?.setWorking([...active.keys()]);
      setProgress(insurerId, { state: 'running', product: request.product, step: 'Starting' });
      try {
        const result = await run.done;
        progressFrom(insurerId, result);
        return result;
      } catch (err) {
        setProgress(insurerId, {
          state: 'failed',
          message: 'The quote could not be run (the request was not valid).',
        });
        throw err;
      } finally {
        active.delete(insurerId);
        deps.portals?.setWorking([...active.keys()]);
      }
    },
    progress: async (since) => {
      if (version <= since) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 20_000);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      return { version, items: [...progressOf.values()] };
    },
    compare: async ({ clientId, vehicleId, travellerId, insurerIds }) => {
      const quoted = insurerIds
        .map((id) => progressOf.get(id))
        .filter((p): p is QuoteProgress => !!p && p.state === 'ready' && !!p.premium);
      if (quoted.length === 0) {
        return { ok: false, message: 'No insurer has a premium yet: nothing to compare.' };
      }
      if (!deps.pdfs) return { ok: false, message: 'Quotes are not saved as PDFs here.' };
      const issuedAt = (deps.now ?? (() => new Date()))();
      // Whose quotes: a health client's (members and cover), a vehicle's or a traveller's.
      const subject = travellerId
        ? await (async () => {
            const record = await deps.clients.getTraveller(travellerId);
            return {
              kind: 'Travel',
              name: record.traveller.customer.name,
              facts: travellerFacts(record.traveller, issuedAt) as
                QuoteFacts | Pick<QuoteFacts, 'details'>,
            };
          })()
        : vehicleId
          ? await (async () => {
              const saved = (await deps.clients.getVehicle(vehicleId)).saved;
              return {
                kind: 'Motor',
                name: saved.name,
                facts: vehicleFacts(saved.vehicle) as QuoteFacts | Pick<QuoteFacts, 'details'>,
              };
            })()
          : await (async () => {
              const record = await deps.clients.get(clientId ?? '');
              return {
                kind: 'Health',
                name: record.client.customer.name,
                facts: healthFacts(record.client, issuedAt) as Pick<
                  QuoteFacts,
                  'details' | 'members'
                >,
              };
            })();
      const facts: Pick<QuoteFacts, 'details' | 'members'> = subject.facts;
      const name = (id: string) => findPortal(id)?.displayName ?? id;
      const missing = insurerIds.filter((id) => !quoted.some((q) => q.insurerId === id));
      const doc: QuoteDocument = {
        title: `${subject.kind} insurance quotes compared`,
        insurer: quoted.map((q) => name(q.insurerId)).join(', '),
        product: 'Comparison',
        issuedAt,
        reference: quoteReference(issuedAt),
        clientName: subject.name,
        details: facts.details,
        ...(facts.members ? { members: facts.members } : {}),
        // Cheapest first.
        plans: [...quoted]
          .sort(
            (a, b) =>
              Number(a.premium!.amount.replace(/[^\d.]/g, '')) -
              Number(b.premium!.amount.replace(/[^\d.]/g, '')),
          )
          .map((q) => ({
            name: `${name(q.insurerId)}: ${q.premium!.label}`,
            amount: q.premium!.amount,
          })),
        amountLabel: 'Premium, as each insurer showed it',
        notes: [
          `Each premium as the insurer worked it out on its own page, for the details saved with the ${vehicleId ? 'vehicle' : travellerId ? 'travel client' : 'client'}; covers and terms differ between insurers.`,
          ...quoted
            .filter((q) => q.pdf)
            .map((q) => `${name(q.insurerId)}'s own quote: ${q.pdf!.name}.`),
          ...(missing.length > 0
            ? [`Not compared (no premium yet): ${missing.map(name).join(', ')}.`]
            : []),
        ],
      };
      try {
        const file = await deps.pdfs.save(doc, `${subject.kind} quotes compared - ${subject.name}`);
        return { ok: true, pdf: { name: file }, insurers: quoted.length };
      } catch {
        return { ok: false, message: 'The comparison could not be saved as a PDF.' };
      }
    },
  };
  async function runOnce(request: QuoteRunRequest): Promise<QuoteRunResult> {
    if (!deps.enabled) throw new AppException('UNSUPPORTED_FLOW');
    const { insurerId } = request;
    // A new run replaces any form left to finish for this insurer.
    pendings.delete(insurerId);
    if (request.product === 'icici-api-motor' || request.product === 'icici-api-health') {
      return runByIciciApi(request);
    }
    const newIndiaMotor = insurerId === 'new-india' && request.product === 'motor';
    const newIndiaOnly =
      request.product === 'nia-health' ||
      request.product === 'nia-travel' ||
      request.product === 'nia-rural' ||
      request.product === 'nia-marine' ||
      request.product === 'nia-pa' ||
      request.product === 'nia-fire';
    const wrongInsurer =
      request.product === 'hdfc-motor' ||
      request.product === 'hdfc-mst' ||
      request.product === 'hdfc-retail' ||
      request.product === 'hdfc-travel'
        ? insurerId !== 'hdfc-ergo'
        : request.product === 'niva-health'
          ? insurerId !== 'niva-bupa'
          : request.product === 'bajaj-pa'
            ? insurerId !== 'bajaj-allianz'
            : request.product === 'icici-motor' ||
                request.product === 'icici-elevate' ||
                request.product === 'icici-intl-travel' ||
                request.product === 'icici-student-travel'
              ? insurerId !== 'icici-lombard'
              : newIndiaOnly
                ? insurerId !== 'new-india'
                : insurerId !== 'united-india' && !newIndiaMotor;
    if (wrongInsurer) {
      return {
        outcome: 'refused',
        step: null,
        message: 'Quote automation is not built for this insurer yet.',
        problems: [],
      };
    }
    const notReady = await portalNotReady(insurerId);
    if (notReady) return notReady;
    // Read before the run starts: an unknown client, travel client, rural client or vehicle is
    // refused at once.
    if (
      request.product === 'nia-rural' ||
      request.product === 'nia-marine' ||
      request.product === 'nia-fire'
    ) {
      const today = (deps.now ?? (() => new Date()))();
      const windows = () => deps.windowsOf(insurerId);
      const start =
        request.product === 'nia-rural'
          ? {
              kind: 'rural' as const,
              rural: (await deps.clients.getRural(request.ruralId)).rural,
              run: request.run,
            }
          : request.product === 'nia-fire'
            ? {
                kind: 'fire' as const,
                client: (await deps.clients.getProperty(request.propertyId)).property,
                run: request.run,
              }
            : {
                kind: 'marine' as const,
                holder: (await deps.clients.getMarine(request.marineId)).marine,
                shipment: request.shipment,
              };
      follow(insurerId);
      try {
        const result =
          start.kind === 'rural'
            ? await runNiaRuralQuote({ windows, rural: start.rural, run: start.run, today })
            : start.kind === 'fire'
              ? await runNiaFireQuote({ windows, client: start.client, run: start.run, today })
              : await runNiaMarineQuote({
                  windows,
                  holder: start.holder,
                  shipment: start.shipment,
                  today,
                });
        deps.logger.log(result.outcome === 'failed' ? 'warn' : 'info', 'quote.run', {
          insurer: insurerId,
          quoteOutcome: result.outcome,
        });
        return await conclude(result, request, { clientName: null, details: [] });
      } catch (err) {
        return whenCancelled(err, insurerId);
      } finally {
        followWork(null);
      }
    }
    const subject =
      request.product === 'motor' ||
      request.product === 'hdfc-motor' ||
      request.product === 'icici-motor'
        ? {
            kind: 'vehicle' as const,
            vehicle: (await deps.clients.getVehicle(request.vehicleId)).saved.vehicle,
          }
        : request.product === 'travel-proposal' ||
            request.product === 'omp-proposal' ||
            request.product === 'nia-travel' ||
            request.product === 'hdfc-travel' ||
            request.product === 'icici-intl-travel' ||
            request.product === 'icici-student-travel'
          ? {
              kind: 'traveller' as const,
              record: await deps.clients.getTraveller(request.travellerId),
            }
          : await (async () => {
              const record = await deps.clients.get(request.clientId);
              // Each insurer's run reads only its own additional details (as `proposal`).
              return {
                kind: 'client' as const,
                record: { ...record, client: clientForInsurer(record.client, insurerId) },
              };
            })();
    follow(insurerId);
    try {
      const today = (deps.now ?? (() => new Date()))();
      const windows = () => deps.windowsOf(insurerId);
      let result: QuoteRunResult;
      if (subject.kind === 'vehicle') {
        result =
          request.product === 'hdfc-motor'
            ? await runHdfcMotorQuote({
                windows,
                vehicle: subject.vehicle,
                run: request.run,
                ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
              })
            : request.product === 'icici-motor'
              ? await runIciciMotorQuote({
                  windows,
                  vehicle: subject.vehicle,
                  run: request.run,
                  ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
                })
              : newIndiaMotor
                ? await runNiaMotorQuote({ windows, vehicle: subject.vehicle, today })
                : await runUiicMotorQuote({ windows, vehicle: subject.vehicle, today });
      } else if (subject.kind === 'traveller') {
        const travel = {
          windows,
          traveller: subject.record.traveller,
          aadhaar: await deps.clients.aadhaarFor(subject.record.id),
          passportNumber: await deps.clients.passportFor(subject.record.id),
          today,
        };
        result =
          request.product === 'icici-intl-travel'
            ? await runIciciIntlTravelQuote({
                windows,
                traveller: subject.record.traveller,
                run: request.run,
                ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
              })
            : request.product === 'icici-student-travel'
              ? await runIciciStudentTravelQuote({
                  windows,
                  traveller: subject.record.traveller,
                  run: request.run,
                  ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
                })
              : request.product === 'hdfc-travel'
                ? await runHdfcTravelQuote({
                    windows,
                    traveller: subject.record.traveller,
                    run: request.run,
                    today,
                    ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
                  })
                : request.product === 'nia-travel'
                  ? await runNiaTravelQuote({
                      windows,
                      traveller: subject.record.traveller,
                      trip: request.trip,
                      passportNumber: travel.passportNumber,
                      noPreExisting: request.noPreExistingConfirmed,
                      today,
                    })
                  : request.product === 'omp-proposal'
                    ? await runUiicOmpProposal({ ...travel, trip: request.trip })
                    : request.product === 'travel-proposal'
                      ? await runUiicTravelProposal({ ...travel, trip: request.trip })
                      : (() => {
                          throw new AppException('VALIDATION_FAILED');
                        })();
      } else if (request.product === 'nia-pa') {
        result = await runNiaPaQuote({
          windows,
          client: subject.record.client,
          run: request.run,
          noClaims: request.noClaimsConfirmed,
          noDisabilities: request.noDisabilitiesConfirmed,
        });
      } else if (request.product === 'hdfc-retail') {
        result = await runHdfcRetailQuote({
          windows,
          client: subject.record.client,
          run: request.run,
          today,
          ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
        });
      } else if (request.product === 'bajaj-pa') {
        result = await runBajajPaQuote({
          windows,
          client: subject.record.client,
          run: request.run,
        });
      } else if (request.product === 'icici-elevate') {
        result = await runIciciElevateQuote({
          windows,
          client: subject.record.client,
          run: request.run,
          ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
        });
      } else if (request.product === 'hdfc-mst') {
        result = await runHdfcMstQuote({
          windows,
          client: subject.record.client,
          run: request.run,
          ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
        });
      } else if (request.product === 'niva-health') {
        result = await runNivaHealthQuote({
          windows,
          client: subject.record.client,
          run: request.run,
          today,
          ...(request.adjust ? { adjust: true } : {}),
          ...(deps.diagnose ? { diagnose: deps.diagnose } : {}),
        });
      } else if (request.product === 'nia-health') {
        result = await runNiaHealthQuote({
          windows,
          client: subject.record.client,
          policy: request.policy,
          goodHealth: request.goodHealthConfirmed,
          today,
        });
      } else if (
        request.product !== 'health' &&
        request.product !== 'motor' &&
        request.product !== 'hdfc-motor' &&
        request.product !== 'icici-motor' &&
        request.product !== 'travel-proposal' &&
        request.product !== 'omp-proposal' &&
        request.product !== 'nia-travel' &&
        request.product !== 'hdfc-travel' &&
        request.product !== 'icici-intl-travel' &&
        request.product !== 'icici-student-travel'
      ) {
        result = await runUiicHealthProposal({
          windows,
          form: PROPOSAL_FORM[request.product],
          client: subject.record.client,
          aadhaar: await deps.clients.aadhaarFor(subject.record.id),
        });
      } else {
        result = await runUiicHealthQuote({
          windows,
          client: subject.record.client,
          goodHealth: request.product === 'health' && request.goodHealthConfirmed,
          today,
        });
      }
      deps.logger.log(result.outcome === 'failed' ? 'warn' : 'info', 'quote.run', {
        insurer: insurerId,
        quoteOutcome: result.outcome,
      });
      return await conclude(
        result,
        request,
        subject.kind === 'traveller'
          ? {
              clientName: subject.record.traveller.customer.name,
              ...travellerFacts(subject.record.traveller, today),
            }
          : subject.kind === 'client'
            ? {
                clientName: subject.record.client.customer.name,
                ...healthFacts(subject.record.client, today),
              }
            : request.product === 'icici-motor'
              ? {
                  clientName: null,
                  // ICICI works its own IDV out (shown with the premium), so the vehicle's is
                  // not repeated; the registration number it was quoted for is.
                  details: [
                    ['Registration number', request.run.registrationNumber ?? 'New vehicle'],
                    ...vehicleFacts(subject.vehicle).details.filter(
                      ([k]) => k !== 'Insured declared value',
                    ),
                  ],
                }
              : { clientName: null, ...vehicleFacts(subject.vehicle) },
      );
    } catch (err) {
      return whenCancelled(err, insurerId);
    } finally {
      followWork(null);
    }
  }
}
