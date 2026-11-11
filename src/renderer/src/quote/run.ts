// Starting a quote run from a quote drawer. While the app fills the insurer's form, the drawer
// steps aside and the main process brings forward the tab each step works in (the insurer's page,
// or a pop-up it opened, such as United India's calculator), so the advisor watches the form being
// filled. When the run ends the app's screens come back with the drawer and its result (premium,
// what is left to do), and the drawer can open the tab the run ended in. The drawer
// (QuoteWorkspace) listens to these runs.
import type { QuoteRunRequest } from '../../../shared/ipc/contract';
import { showAppScreens } from '../insurers/PortalTabs';

export type QuoteRunEvent =
  | { phase: 'start'; insurerId: string }
  /**
   * `tabId`: the tab the run ended in (the form it filled), if it was one of the insurer's.
   * `pdf`: the quote saved as a PDF in the Downloads folder (its file name), if any.
   */
  | { phase: 'end'; insurerId: string; tabId: string | null; pdf: string | null };
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
  try {
    const result = await window.fqf.quotes.run(request);
    if (result.ok) pdf = result.data.pdf?.name ?? null;
    return result;
  } finally {
    const tabId = await activeTabOf(insurerId);
    showAppScreens();
    for (const listener of listeners) listener({ phase: 'end', insurerId, tabId, pdf });
  }
}

/** Opens a quote PDF the app saved; false if it could not. */
export async function openQuotePdf(name: string): Promise<boolean> {
  const result = await window.fqf.quotes.openPdf(name).catch(() => null);
  return result?.ok === true && result.data.opened;
}
