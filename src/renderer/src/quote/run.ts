// Starting a quote run from a quote drawer. While the app fills the insurer's form, the drawer
// steps aside and the main process brings forward the tab each step works in (the insurer's page,
// or a pop-up it opened, such as United India's calculator), so the advisor watches the form being
// filled. When the run ends the app's screens come back with the drawer and its result (premium,
// what is left to do), and the drawer can open the tab the run ended in. The drawer
// (QuoteWorkspace) listens to these runs.
import type { QuoteRunRequest, QuoteRunResultView } from '../../../shared/ipc/contract';
import { showAppScreens } from '../insurers/PortalTabs';
import { findPortal } from '../../../shared/insurers/portals';
import { askWhichPlans } from './PlanChoice';

export type QuoteRunEvent =
  | { phase: 'start'; insurerId: string }
  /**
   * `tabId`: the tab the run ended in (the form it filled), if it was one of the insurer's.
   * `pdf`: the quote saved as a PDF in the Downloads folder (its file name), if any.
   */
  | {
      phase: 'end';
      insurerId: string;
      tabId: string | null;
      pdf: string | null;
      /** A form the advisor finishes (see FinishState): its premium button, if known. */
      finish: QuoteRunResultView['finish'] | null;
    };
const listeners = new Set<(event: QuoteRunEvent) => void>();

export function onQuoteRun(listener: (event: QuoteRunEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows a tab if it is still open, else the insurer's own tab (else any of its tabs). */
export async function showInsurerTab(
  insurerId: string,
  tabId: string | null = null,
): Promise<boolean> {
  const state = await window.fqf.portals.tabs(0).catch(() => null);
  if (!state?.ok) return false;
  const tabs = state.data.tabs.filter((t) => t.insurerId === insurerId);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs.find((t) => t.kind === 'portal') ?? tabs[0];
  if (!tab) return false;
  await window.fqf.portals.show(tab.id).catch(() => undefined);
  return true;
}

/** The insurer's tab in front now, if any. */
async function activeTabOf(insurerId: string): Promise<string | null> {
  const state = await window.fqf.portals.tabs(0).catch(() => null);
  if (!state?.ok || !state.data.active) return null;
  const active = state.data.tabs.find((t) => t.id === state.data.active);
  return active?.insurerId === insurerId ? active.id : null;
}

/**
 * Reset (the sidebar's): every quote stopped, every kept form put away (no PDF), the insurers'
 * pop-up tabs closed and every open insurer sent home; the drawer's kept form is forgotten too.
 */
export async function resetEverything(): ReturnType<typeof window.fqf.quotes.resetAll> {
  const result = await window.fqf.quotes.resetAll();
  if (result.ok) setFinish({ phase: 'idle' });
  return result;
}

/** Stops the run in progress; false if there was none to stop. */
export async function cancelQuoteRun(): Promise<boolean> {
  const result = await window.fqf.quotes.cancel().catch(() => null);
  return result?.ok === true && result.data.cancelled;
}

export async function runQuote(request: QuoteRunRequest): ReturnType<typeof window.fqf.quotes.run> {
  const { insurerId } = request;
  for (const listener of listeners) listener({ phase: 'start', insurerId });
  let pdf: string | null = null;
  let finish: QuoteRunResultView['finish'] | null = null;
  setFinish({ phase: 'idle' });
  try {
    const result = await window.fqf.quotes.run(request);
    if (result.ok) {
      pdf = result.data.pdf?.name ?? null;
      finish = result.data.finish ?? null;
    }
    return result;
  } finally {
    const tabId = await activeTabOf(insurerId);
    // A form kept for the advisor (request of 26 November 2026: "the user does not see the
    // premium"): the insurer's tab stays in front, its premium on screen, with Stop & make PDF in
    // the top bar. Otherwise, back to the app's screens.
    if (!finish) showAppScreens();
    for (const listener of listeners) listener({ phase: 'end', insurerId, tabId, pdf, finish });
    // The form is kept for the advisor: no PDF until they press Stop & make PDF.
    if (finish) setFinish({ phase: 'pending', insurerId, finish, note: null });
  }
}

/**
 * The form the last run filled, kept for the advisor (request of 26 November 2026: "the pdf
 * generation should not be automatic"): they check it in the insurer's tab, change anything, and
 * press Stop & make PDF; the app then reads the premium the page shows and saves the PDF (or what
 * the run read, when the page cannot be read: ICICI's partner API). They may type the premium
 * instead.
 */
export type FinishState =
  | { phase: 'idle' }
  | {
      phase: 'pending' | 'saving';
      insurerId: string;
      finish: NonNullable<QuoteRunResultView['finish']>;
      /** Why the last Stop & make PDF did not save one (no premium on the page), or a problem. */
      note: string | null;
    }
  | { phase: 'done'; insurerId: string; result: QuoteRunResultView };

let finishState: FinishState = { phase: 'idle' };
const finishListeners = new Set<(state: FinishState) => void>();

function setFinish(state: FinishState): void {
  finishState = state;
  for (const listener of finishListeners) listener(state);
}

export function onFinishState(listener: (state: FinishState) => void): () => void {
  finishListeners.add(listener);
  listener(finishState);
  return () => {
    finishListeners.delete(listener);
  };
}

function finishedWith(
  insurerId: string,
  finish: NonNullable<QuoteRunResultView['finish']>,
  result: Awaited<ReturnType<typeof window.fqf.quotes.finish>> | null,
): void {
  if (result?.ok && result.data.outcome === 'ready') {
    setFinish({ phase: 'done', insurerId, result: result.data });
    // The PDF is saved: back to the app, where the drawer shows it.
    showAppScreens();
    return;
  }
  if (result?.ok && result.data.outcome === 'cancelled') {
    setFinish({ phase: 'idle' });
    return;
  }
  setFinish({
    phase: 'pending',
    insurerId,
    finish,
    note: result ? (result.ok ? result.data.message : result.error.message) : null,
  });
}

type FinishResult = Awaited<ReturnType<typeof window.fqf.quotes.finish>>;

/**
 * Stop & make PDF for an insurer's kept form, from wherever it is pressed: the premium its page
 * shows now saved as the PDF; when the page shows several plans, the advisor is asked which go in
 * it first (PlanChoice). Null when they cancel that question (the form stays kept) or the call
 * failed.
 */
export async function stopAndMakePdf(
  insurerId: string,
  amount?: string,
): Promise<FinishResult | null> {
  const first = await window.fqf.quotes
    .finish({ waitMs: 0, insurerId, ...(amount ? { amount } : {}) })
    .catch(() => null);
  if (!first?.ok || !first.data.choose || !first.data.plans?.length) return first;
  const insurer = findPortal(insurerId)?.displayName ?? 'The insurer';
  const names = await askWhichPlans(insurer, first.data.plans);
  if (!names) return null;
  return window.fqf.quotes.finish({ waitMs: 0, insurerId, plans: names }).catch(() => null);
}

/** Stop & make PDF: the premium the insurer's page shows now, saved as the quote's PDF. */
export async function makePdfNow(): Promise<void> {
  const state = finishState;
  if (state.phase !== 'pending') return;
  setFinish({ ...state, phase: 'saving', note: null });
  const result = await stopAndMakePdf(state.insurerId);
  // The plan question cancelled: the form stays as it was.
  if (!result) {
    setFinish({ ...state, phase: 'pending', note: null });
    return;
  }
  finishedWith(state.insurerId, state.finish, result);
}

/** Saves the PDF with the premium the advisor read on the insurer's page. */
export async function finishWithAmount(amount: string): Promise<string | null> {
  const state = finishState;
  if (state.phase !== 'pending') return 'No form is waiting.';
  setFinish({ ...state, phase: 'saving' });
  const result = await window.fqf.quotes
    .finish({ waitMs: 0, amount, insurerId: state.insurerId })
    .catch(() => null);
  if (result && !result.ok) {
    setFinish({ ...state, phase: 'pending', note: null });
    return result.error.message;
  }
  finishedWith(state.insurerId, state.finish, result);
  return null;
}

/** Puts the kept form away without a PDF (the insurer's tab goes back to its home page). */
export async function discardForm(): Promise<void> {
  const state = finishState;
  if (state.phase !== 'pending') return;
  await window.fqf.quotes.cancel(state.insurerId).catch(() => null);
  setFinish({ phase: 'idle' });
}

/** Puts the finish card away (after the PDF was shown). */
export function dismissFinish(): void {
  setFinish({ phase: 'idle' });
}

/** Opens a quote PDF the app saved; false if it could not. */
export async function openQuotePdf(name: string): Promise<boolean> {
  const result = await window.fqf.quotes.openPdf(name).catch(() => null);
  return result?.ok === true && result.data.opened;
}
