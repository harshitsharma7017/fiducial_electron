// Starting a quote run from a quote drawer. While the app fills the insurer's form, the drawer
// steps aside and the main process brings forward the tab each step works in (the insurer's page,
// or a pop-up it opened, such as United India's calculator), so the advisor watches the form being
// filled. When the run ends the app's screens come back with the drawer and its result (premium,
// what is left to do), and the drawer can open the tab the run ended in. The drawer
// (QuoteWorkspace) listens to these runs.
import type { QuoteRunRequest, QuoteRunResultView } from '../../../shared/ipc/contract';
import { showAppScreens } from '../insurers/PortalTabs';

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
    showAppScreens();
    for (const listener of listeners) listener({ phase: 'end', insurerId, tabId, pdf, finish });
    // A form left for the advisor: the app watches the insurer's page for the premium they get.
    if (finish) void watchForPremium(insurerId, finish);
  }
}

/**
 * A form the last run left for the advisor to finish (request of 20 November 2026): the advisor
 * fills the rest in the insurer's tab and presses its premium button; the app watches for the
 * premium and saves the quote as a PDF, or takes the premium the advisor types.
 */
export type FinishState =
  | { phase: 'idle' }
  | {
      phase: 'watching' | 'stopped' | 'saving';
      insurerId: string;
      finish: NonNullable<QuoteRunResultView['finish']>;
      /** Why the app is not watching any more (timed out, stopped), or a problem. */
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

/** How long the app watches a handed-over form for its premium. */
const WATCH_MS = 30 * 60_000;

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
    phase: 'stopped',
    insurerId,
    finish,
    note: result ? (result.ok ? result.data.message : result.error.message) : null,
  });
}

/** Watches the handed-over form for its premium (again, after a stop). */
export async function watchForPremium(
  insurerId: string,
  finish: NonNullable<QuoteRunResultView['finish']>,
): Promise<void> {
  setFinish({ phase: 'watching', insurerId, finish, note: null });
  const result = await window.fqf.quotes.finish({ waitMs: WATCH_MS }).catch(() => null);
  // A later run, or the premium typed meanwhile, has moved on.
  if (finishState.phase !== 'watching' || finishState.insurerId !== insurerId) return;
  finishedWith(insurerId, finish, result);
}

/** Saves the PDF with the premium the advisor read on the insurer's page. */
export async function finishWithAmount(amount: string): Promise<string | null> {
  const state = finishState;
  if (state.phase !== 'watching' && state.phase !== 'stopped') return 'No form is waiting.';
  setFinish({ ...state, phase: 'saving' });
  const result = await window.fqf.quotes.finish({ waitMs: 0, amount }).catch(() => null);
  if (result && !result.ok) {
    setFinish({ ...state, phase: 'stopped', note: null });
    return result.error.message;
  }
  finishedWith(state.insurerId, state.finish, result);
  return null;
}

/** Stops watching (the premium can still be typed). */
export async function stopWatching(): Promise<void> {
  await window.fqf.quotes.cancel().catch(() => null);
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
