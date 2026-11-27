// How a portal's connection is described, in one place (the Insurer portals page and the
// Overview): plain TypeScript, so it is tested without the screens.
import type { InsurerPortalView } from '../ipc/contract';

export type StatusTone = 'success' | 'info' | 'warning' | 'neutral';

export interface PortalStatus {
  tone: StatusTone;
  label: string;
}

/**
 * A portal's connection, from what the app knows (request of 27 November 2026: saved sign-in
 * details are not a signed-in session). The session's clock runs from the moment the portal opens,
 * so "Signed in" waits until its page has left the insurer's sign-in page.
 */
export function portalStatus(portal: InsurerPortalView): PortalStatus {
  if (portal.sessionEndsAt && portal.windowOpen && portal.signInPending)
    return { tone: 'warning', label: 'Waiting for sign-in' };
  if (portal.sessionEndsAt && portal.windowOpen) return { tone: 'success', label: 'Signed in' };
  // A session kept from before (the page not open in this window yet).
  if (portal.sessionEndsAt) return { tone: 'info', label: 'Session kept' };
  if (portal.windowOpen) return { tone: 'info', label: 'Portal open' };
  if (portal.lastSessionEnd === 'expired') return { tone: 'warning', label: 'Session expired' };
  if (portal.lastSessionEnd === 'signed-out') return { tone: 'neutral', label: 'Signed out' };
  return { tone: 'neutral', label: 'Not connected' };
}
