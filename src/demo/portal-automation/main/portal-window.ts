// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The window the portal opens in: the app's locked-down web preferences, no preload (the portal
// gets no bridge), a session of its own kept in memory only (sign-in is forgotten on quit), no
// permissions or downloads, navigation limited to the portal's origin and writes blocked by the
// network guard (which lets one approved creation request through only in the full workflow, and
// only if it matches the review). The agent runs in an isolated world, apart from the portal's own
// scripts.
import { BrowserWindow, session } from 'electron';
import type { Logger } from '../../../main/logging/logger';
import { allowOrigins, hardenSession } from '../../../main/security/navigation-policy';
import { LOCKED_DOWN } from '../../../main/security/web-preferences';
import { portalPageAgent } from '../page/page-agent';
import type { CreationPayload } from '../shared/creation-payload';
import { describeEnvironment, type WorkflowMode } from '../shared/environment';
import type { AgentCommand, AgentResult } from '../shared/protocol';
import { installNetworkGuard, type NetworkGuard } from './network-guard';
import type { PortalPage } from './runner';

/** No "persist:" prefix: the session lives in memory and is gone when the app quits. */
const PARTITION = 'portal-automation-demo';
const WORLD_ID = 1777;
// The agent's source, sent to the page for each command.
const AGENT_SOURCE = portalPageAgent.toString();

/** The window title and, in the full workflow, the in-page banner: they name the environment. */
function labels(portalOrigin: string, mode: WorkflowMode): { title: string; banner?: string } {
  if (mode === 'fill-only') return { title: 'DEMO ONLY — Fiducial portal (nothing is saved)' };
  const live = describeEnvironment(portalOrigin).kind === 'production';
  const where = live ? 'LIVE PORTAL' : 'TEST ENVIRONMENT';
  return {
    title: `${where} — Fiducial portal (creates a proposal only after you confirm)`,
    banner: `${where} — a proposal is created only after you confirm in the Quote Fetcher.`,
  };
}

let guard: NetworkGuard | null = null;
let current: BrowserWindow | null = null;

export function openPortalPage(
  portalOrigin: string,
  logger: Logger,
  mode: WorkflowMode = 'fill-only',
): PortalPage {
  const ses = session.fromPartition(PARTITION);
  hardenSession(ses, logger);
  guard ??= installNetworkGuard(ses, portalOrigin);
  const installed = guard;

  if (!current || current.isDestroyed()) {
    const { title, banner } = labels(portalOrigin, mode);
    current = new BrowserWindow({
      width: 1280,
      height: 900,
      title,
      webPreferences: { ...LOCKED_DOWN, partition: PARTITION },
    });
    const win = current;
    allowOrigins(win.webContents, [portalOrigin]);
    win.on('page-title-updated', (event) => event.preventDefault());
    // Every page load gets the banner and the submit block again.
    win.webContents.on('did-finish-load', () => {
      const guardCommand: AgentCommand = banner ? { op: 'guard', banner } : { op: 'guard' };
      void run(win, guardCommand).catch(() => undefined);
    });
  }
  const win = current;
  win.show();
  win.focus();

  return {
    load: async (url) => {
      if (win.isDestroyed()) return;
      await win.loadURL(url).catch(() => undefined);
    },
    currentUrl: () => (win.isDestroyed() ? '' : win.webContents.getURL()),
    run: (command) => run(win, command),
    isClosed: () => win.isDestroyed(),
    blockedWrites: () => installed.blocked(),
    // The creation permit and the environment check are offered to the full workflow only.
    ...(mode === 'full'
      ? {
          armCreation: (approved: CreationPayload) => installed.armCreation(approved),
          revokeCreation: () => installed.revokeCreation(),
          creationOutcome: () => installed.creationOutcome(),
          sessionCookieNames: async () =>
            (await ses.cookies.get({ url: portalOrigin })).map((cookie) => cookie.name),
        }
      : {}),
  };
}

async function run(win: BrowserWindow, command: AgentCommand): Promise<AgentResult> {
  if (win.isDestroyed()) return { ok: false, reason: 'not-found' };
  const code = `(${AGENT_SOURCE})(${JSON.stringify(command)})`;
  return (await win.webContents.executeJavaScriptInIsolatedWorld(WORLD_ID, [
    { code },
  ])) as AgentResult;
}
