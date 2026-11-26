// Insurers paused in the app (request of 26 November 2026: "remove New India, Star Health and Tata
// AIG from the product, such that they can be brought back any time"). A paused insurer is hidden
// everywhere the advisor works (Insurer portals, every quote list and menu, Compare quotes, its
// tab in a client's Additional details) and its runs are refused; nothing of it is deleted: its
// automation, saved sign-ins, client details and tests all stay as they are.
//
// To bring one back, take its id out of PAUSED_INSURERS. That is all.
//
// Rural, Marine and Property clients are quoted with New India only: their pages are paused with
// it (NEW_INDIA_PAGES) and come back with it.
import { INSURER_PORTALS } from './portals';

export const PAUSED_INSURERS: readonly string[] = ['new-india', 'star-health', 'tata-aig'];

export function isInsurerPaused(insurerId: string): boolean {
  return PAUSED_INSURERS.includes(insurerId);
}

/** Other names the screens give an insurer ("New India" in headings). */
const ALSO_NAMED: Record<string, string[]> = { 'new-india': ['New India'] };

/** By the name a screen shows ("New India Assurance"), for lists that carry no id. */
export function isInsurerNamePaused(name: string): boolean {
  const n = name.trim().toLowerCase();
  return INSURER_PORTALS.some(
    (p) =>
      isInsurerPaused(p.id) &&
      [p.displayName, ...(ALSO_NAMED[p.id] ?? [])].some((x) => x.toLowerCase() === n),
  );
}

/** The client pages quoted with New India only: paused with it. */
export const NEW_INDIA_PAGES = ['rural', 'marine', 'properties'] as const;

export function isPagePaused(page: string): boolean {
  return (NEW_INDIA_PAGES as readonly string[]).includes(page) && isInsurerPaused('new-india');
}
