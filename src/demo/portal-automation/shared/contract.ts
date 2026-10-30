// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The demo's own IPC channels and the bridge it exposes as window.fqfPortalDemo. Kept apart from
// the application's IPC contract (src/shared/ipc) so removing the demo leaves that untouched.
import type { AppResult } from '../../../shared/ipc/result';
import type { DemoProposal } from './demo-data';
import type { RunReport } from './protocol';

export const PORTAL_DEMO_CHANNELS = {
  start: 'portal-demo:start',
  report: 'portal-demo:report',
  cancel: 'portal-demo:cancel',
  confirm: 'portal-demo:confirm',
  reconcile: 'portal-demo:reconcile',
  resolve: 'portal-demo:resolve',
} as const;

/** The user's resolution of an attempt with an unknown outcome, after a look-up. */
export type AttemptResolution =
  | { attemptId: string; resolution: 'not-created' }
  | { attemptId: string; resolution: 'created'; proposalId: string };

export interface PortalDemoApi {
  /** Opens the portal and fills the New proposal form from the demo data; stops before saving. */
  start(data: DemoProposal): Promise<AppResult<RunReport>>;
  report(): Promise<AppResult<RunReport>>;
  cancel(): Promise<AppResult<RunReport>>;
  /**
   * Full workflow only: the user's explicit confirmation of the review shown, by its token. Any
   * other token, a second confirmation or a confirmation in fill-only mode is refused. When the
   * review lists possible duplicates, acknowledgeDuplicates must be true.
   */
  confirm(token: string, acknowledgeDuplicates: boolean): Promise<AppResult<RunReport>>;
  /** Looks for an unresolved attempt's proposal in the portal (read-only). */
  reconcile(attemptId: string): Promise<AppResult<RunReport>>;
  /** Resolves an unresolved attempt after a look-up: not created, or one of the found proposals. */
  resolve(resolution: AttemptResolution): Promise<AppResult<RunReport>>;
}
