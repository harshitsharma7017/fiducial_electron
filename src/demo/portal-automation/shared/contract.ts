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
} as const;

export interface PortalDemoApi {
  /** Opens the portal and fills the New proposal form from the demo data; stops before saving. */
  start(data: DemoProposal): Promise<AppResult<RunReport>>;
  report(): Promise<AppResult<RunReport>>;
  cancel(): Promise<AppResult<RunReport>>;
  /**
   * Full workflow only: the user's explicit confirmation of the review shown, by its token. Any
   * other token, a second confirmation or a confirmation in fill-only mode is refused.
   */
  confirm(token: string): Promise<AppResult<RunReport>>;
}
