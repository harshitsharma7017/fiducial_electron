// Insurer portal windows: one window per insurer, opened on the advisor's request.
//
// Each window:
// - uses the app's locked-down web preferences, with no preload: the portal gets no bridge;
// - has a saved session of its own (partition "persist:insurer-<id>", never shared between
//   insurers), with permissions and downloads denied;
// - may navigate only within the insurer's own origins (sub-frames also to its CAPTCHA
//   provider); popups are denied;
// - on the insurer's login page, and only there, fills the saved user ID and password into the
//   portal's own form (login-agent.ts). The advisor completes any CAPTCHA and signs in: the app
//   never presses the sign-in button.
//
// Sessions (12 hours): the advisor signs in once and keeps working in the portal.
// - While the app runs, the session is kept however the window is closed: cookies belong to the
//   insurer's partition, not the window. Closing the window with its close button hides it, so
//   the signed-in page and the portal's own in-page state stay too.
// - The partition is saved on disk ("persist:"), so lasting cookies and site storage survive an
//   app restart (in packaged builds the cookie-encryption fuse encrypts cookie values with the OS
//   key; development builds have no fuses). Session cookies, which many portals use for sign-in
//   (Bajaj's Keycloak and United India do), are not written to disk by Electron: the session
//   keeper (session-keeper.ts) keeps them, encrypted with the OS key, while the session runs, and
//   puts them back at start-up, so a restart does not sign the advisor out (and OTP portals do
//   not need the client's OTP again). The window then reopens on the page it was on.
// - Each session ends SESSION_HOURS after it started (session-clock.ts), or when the advisor signs
//   out: the window is closed, the partition's cookies, storage and caches are wiped and the
//   kept session cookies deleted, so the next open starts at the login page. Sessions with no
//   clock are wiped at start-up.
// - The insurer's own server may end a session sooner (for example after inactivity). The app does
//   not keep sessions alive artificially: the portal then shows its login page, and the app fills
//   it again.
// Sign-in details are read from the vault just before a fill and are never logged or sent to
// the renderer.
import { app, BrowserWindow, session, type Session } from 'electron';
import type { FillOutcome } from '../../shared/insurers/fill-outcomes';
import {
  FILL_SHORTCUT_KEY,
  findPortal,
  INSURER_PORTALS,
  mayFillLogin,
  mayNavigate,
  type InsurerPortal,
} from '../../shared/insurers/portals';
import type { Logger } from '../logging/logger';
import type { SessionKeeper } from './session-keeper';
import { hardenSession, setNavigationRule, setSessionPolicy } from '../security/navigation-policy';
import { originOf, schemeOf } from '../security/origins';
import { LOCKED_DOWN } from '../security/web-preferences';
import type { InsurerCredentials } from './credentials';
import { fillOutcomeOf } from './fill-outcome';
import { keyboardFill } from './keyboard-fill';
import { keyboardTargetFor } from './keyboard-target';
import { insurerLoginAgent, type FillCommand, type FillResult } from './login-agent';
import type { SessionClock } from './session-clock';

/** The isolated world the agent runs in, apart from the portal's own scripts. */
const WORLD_ID = 1801;
const AGENT_SOURCE = insurerLoginAgent.toString();
/** How long the agent waits for a single-page app to draw its form. */
const FORM_WAIT_MS = 15_000;
/** How often running sessions are checked against the 12-hour limit. */
const EXPIRY_CHECK_MS = 60_000;
/** How soon after a cookie or page change the session is kept (changes come in bursts). */
const SAVE_DELAY_MS = 1500;

export type SessionEnd = 'expired' | 'signed-out';

export interface PortalWindowState {
  /** The insurer's window exists (shown or hidden). */
  open: boolean;
  /** The last fill attempt in this window, or null if none was made. */
  lastFill: FillOutcome | null;
  /** When the running session ends, or null if none is running. */
  sessionEndsAt: Date | null;
  /** Why the last session ended, if it ended while the app was running. */
  lastSessionEnd: SessionEnd | null;
  /** Origins the portal tried to open that are not allowed (newest last, at most 5). */
  blockedOrigins: string[];
}

export interface PortalWindows {
  open(id: string): Promise<void>;
  state(id: string): PortalWindowState;
  /** Ends the insurer's session now: closes its window and wipes its cookies and storage. */
  signOut(id: string): Promise<boolean>;
  /** Every open window of the insurer: the portal and its pop-ups (for the form recorder). */
  windowsOf(id: string): BrowserWindow[];
}

export function partitionFor(id: string): string {
  return `persist:insurer-${id}`;
}

/** Wipes everything the portal stored in its partition: cookies, storage, caches. */
async function wipe(ses: Session): Promise<void> {
  await ses.clearStorageData();
  await ses.clearCache();
  await ses.clearAuthCache();
}

export function createPortalWindows(deps: {
  logger: Logger;
  credentials: InsurerCredentials;
  clock: SessionClock;
  /** Keeps sign-ins across restarts (absent in tests: nothing is kept). */
  keeper?: SessionKeeper;
}): PortalWindows {
  const windows = new Map<string, BrowserWindow>();
  /** Fill again on demand (Show portal): the agent keeps anything already in the boxes. */
  const refill = new Map<string, () => Promise<void>>();
  const lastFill = new Map<string, FillOutcome>();
  const lastEnd = new Map<string, SessionEnd>();
  /** Pop-ups the portal opened (within its own origins), by insurer. */
  const children = new Map<string, Set<BrowserWindow>>();
  const blocked = new Map<string, string[]>();
  let quitting = false;
  app.on('before-quit', () => {
    quitting = true;
  });

  // Keeping sign-ins across restarts: a save shortly after the portal's cookies or page change,
  // only while the insurer's session runs.
  const pendingSave = new Map<string, NodeJS.Timeout>();
  /** Where each window reopens after a restart (the page it was on), until it is opened. */
  const reopenAt = new Map<string, string>();
  const watched = new WeakSet<Session>();
  const scheduleSave = (id: string): void => {
    const keeper = deps.keeper;
    if (!keeper || deps.clock.startedAt(id) === null) return;
    clearTimeout(pendingSave.get(id));
    const timer = setTimeout(() => {
      pendingSave.delete(id);
      if (deps.clock.startedAt(id) === null) return;
      const portal = findPortal(id);
      const win = windows.get(id);
      const url = win && !win.isDestroyed() ? win.webContents.getURL() : null;
      const lastUrl =
        url && portal && mayNavigate(portal, url, true) ? url : (reopenAt.get(id) ?? null);
      void keeper.save(id, session.fromPartition(partitionFor(id)).cookies, lastUrl);
    }, SAVE_DELAY_MS);
    timer.unref?.();
    pendingSave.set(id, timer);
  };
  const forgetKept = (id: string): void => {
    clearTimeout(pendingSave.get(id));
    pendingSave.delete(id);
    reopenAt.delete(id);
    deps.keeper?.forget(id);
  };

  const sessionOf = (id: string): Session => {
    const ses = session.fromPartition(partitionFor(id));
    hardenSession(ses, deps.logger);
    if (!watched.has(ses)) {
      watched.add(ses);
      ses.cookies.on('changed', () => scheduleSave(id));
    }
    const portal = findPortal(id);
    if (portal) {
      // Every window of this session (the portal and its pop-ups) follows the portal's origins;
      // pop-ups within them open in the same signed-in session, locked down like the portal.
      setSessionPolicy(ses, {
        navigate: (url, isMainFrame) => mayNavigate(portal, url, isMainFrame),
        popup: (url) =>
          mayNavigate(portal, url, true)
            ? {
                width: 1280,
                height: 900,
                title: `${portal.displayName} \u2014 Fiducial Quote Fetcher`,
                webPreferences: { ...LOCKED_DOWN, session: ses },
              }
            : null,
        onBlocked: (_kind, url) => {
          const origin = originOf(url) ?? schemeOf(url);
          const list = (blocked.get(id) ?? []).filter((o) => o !== origin);
          blocked.set(id, [...list, origin].slice(-5));
        },
      });
    }
    return ses;
  };

  /** A pop-up the portal opened: tracked so it can be recorded, and closed with the session. */
  function adopt(portal: InsurerPortal, child: BrowserWindow): void {
    const set = children.get(portal.id) ?? new Set<BrowserWindow>();
    children.set(portal.id, set);
    set.add(child);
    child.on('page-title-updated', (event) => event.preventDefault());
    child.webContents.on('did-create-window', (grandchild) => adopt(portal, grandchild));
    child.on('closed', () => set.delete(child));
  }

  const record = (portal: InsurerPortal, outcome: FillOutcome): void => {
    lastFill.set(portal.id, outcome);
    deps.logger.log(outcome === 'filled' ? 'info' : 'warn', 'insurer.login-fill', {
      insurer: portal.id,
      fillOutcome: outcome,
    });
  };

  async function endSession(id: string, reason: SessionEnd): Promise<boolean> {
    const hadSession = deps.clock.startedAt(id) !== null || windows.has(id);
    const win = windows.get(id);
    windows.delete(id);
    refill.delete(id);
    for (const child of children.get(id) ?? []) if (!child.isDestroyed()) child.destroy();
    children.delete(id);
    blocked.delete(id);
    if (win && !win.isDestroyed()) win.destroy();
    lastFill.delete(id);
    forgetKept(id);
    await wipe(sessionOf(id));
    deps.clock.stop(id);
    if (hadSession) {
      lastEnd.set(id, reason);
      deps.logger.info('insurer.session-ended', { insurer: id, sessionEnd: reason });
    }
    return hadSession;
  }

  // Start-up: no session outlives its clock. Expired sessions, and any saved session without a
  // clock (for example if the clock file was lost), are wiped. Running sessions get their kept
  // session cookies back, and their window reopens on the page it was on.
  const startup = (async () => {
    const expired = new Set(deps.clock.expired());
    for (const portal of INSURER_PORTALS) {
      if (expired.has(portal.id)) await endSession(portal.id, 'expired');
      else if (deps.clock.startedAt(portal.id) === null) {
        forgetKept(portal.id);
        await wipe(sessionOf(portal.id));
      } else if (deps.keeper) {
        const kept = await deps.keeper.restore(portal.id, sessionOf(portal.id).cookies);
        if (kept?.lastUrl && mayNavigate(portal, kept.lastUrl, true)) {
          reopenAt.set(portal.id, kept.lastUrl);
        }
        if (kept) deps.logger.info('insurer.session-restored', { insurer: portal.id });
      }
    }
  })().catch(() => undefined);

  const timer = setInterval(() => {
    for (const id of deps.clock.expired()) void endSession(id, 'expired').catch(() => undefined);
  }, EXPIRY_CHECK_MS);
  timer.unref?.();

  function create(portal: InsurerPortal): BrowserWindow {
    const partition = partitionFor(portal.id);
    sessionOf(portal.id);
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      title: `${portal.displayName} — Fiducial Quote Fetcher`,
      webPreferences: { ...LOCKED_DOWN, partition },
    });
    setNavigationRule(win.webContents, (url, isMainFrame) => mayNavigate(portal, url, isMainFrame));
    // Keep the insurer's name in the title bar, whatever the portal calls its page.
    win.on('page-title-updated', (event) => event.preventDefault());
    win.webContents.on('did-create-window', (child) => adopt(portal, child));
    // Closing hides the window: the session and the portal's page stay until the session ends.
    win.on('close', (event) => {
      if (quitting) return;
      event.preventDefault();
      win.hide();
      deps.logger.info('insurer.portal-closed', { insurer: portal.id });
    });
    win.on('closed', () => {
      if (windows.get(portal.id) === win) {
        windows.delete(portal.id);
        refill.delete(portal.id);
      }
    });

    // Shortcut portals: the advisor clicks into the user ID box and presses Cmd/Ctrl+Shift+L.
    if (portal.automation === 'shortcut') {
      // Typing starts once the advisor has let go of Cmd/Ctrl and Shift, so the page does not
      // read the typed letters as shortcuts (Cmd+A and so on); at the latest after 2 seconds.
      let state: 'idle' | 'waiting' | 'typing' = 'idle';
      let fallback: NodeJS.Timeout | undefined;
      const start = () => {
        if (state !== 'waiting') return;
        clearTimeout(fallback);
        state = 'typing';
        void typeLogin(win, portal).finally(() => {
          state = 'idle';
        });
      };
      win.webContents.on('before-input-event', (event, input) => {
        const isShortcut =
          input.type === 'keyDown' &&
          input.shift &&
          (process.platform === 'darwin' ? input.meta : input.control) &&
          input.key.toLowerCase() === FILL_SHORTCUT_KEY;
        if (isShortcut) {
          event.preventDefault();
          if (state !== 'idle') return;
          state = 'waiting';
          fallback = setTimeout(start, 2000);
          return;
        }
        if (
          state === 'waiting' &&
          input.type === 'keyUp' &&
          !input.meta &&
          !input.control &&
          !input.shift
        ) {
          start();
        }
      });
    }

    let filling = false;
    const tryFill = async (): Promise<void> => {
      if (filling || win.isDestroyed()) return;
      if (!mayFillLogin(portal, win.webContents.getURL())) return;
      filling = true;
      try {
        await fill(win, portal);
      } finally {
        filling = false;
      }
    };
    refill.set(portal.id, tryFill);
    win.webContents.on('did-finish-load', () => void tryFill());
    // The page it is on is kept with the session (to reopen there after a restart).
    win.webContents.on('did-navigate', () => scheduleSave(portal.id));
    win.webContents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
      if (isMainFrame) scheduleSave(portal.id);
    });
    // Single-page apps change the hash route without a new load (for example after sign-out).
    win.webContents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
      if (isMainFrame) void tryFill();
    });
    // After a restart, the page it was on (if the portal still allows it); else the start page.
    const resumeAt = reopenAt.get(portal.id);
    reopenAt.delete(portal.id);
    void win.loadURL(resumeAt ?? portal.startUrl).catch(() => undefined);
    return win;
  }

  async function typeLogin(win: BrowserWindow, portal: InsurerPortal): Promise<void> {
    let login;
    try {
      login = await deps.credentials.read(portal.id);
    } catch {
      record(portal, 'login-unreadable');
      return;
    }
    if (!login) {
      record(portal, 'no-login-saved');
      return;
    }
    try {
      const outcome = await keyboardFill(
        keyboardTargetFor(win.webContents, WORLD_ID),
        portal,
        login,
      );
      record(portal, outcome);
    } catch {
      record(portal, 'agent-failed');
    }
  }

  async function fill(win: BrowserWindow, portal: InsurerPortal): Promise<void> {
    const form = portal.form;
    if (!form) return;
    let login;
    try {
      login = await deps.credentials.read(portal.id);
    } catch {
      record(portal, 'login-unreadable');
      return;
    }
    if (!login) {
      record(portal, 'no-login-saved');
      return;
    }
    const command: FillCommand = {
      op: 'fill',
      expectedOrigin: portal.loginOrigin,
      selectors: {
        username: form.username,
        password: form.password,
        ...(form.captcha ? { captcha: form.captcha } : {}),
      },
      username: login.username,
      password: login.password,
      waitMs: FORM_WAIT_MS,
    };
    let result: FillResult;
    try {
      if (win.isDestroyed()) return;
      result = (await win.webContents.executeJavaScriptInIsolatedWorld(WORLD_ID, [
        { code: `(${AGENT_SOURCE})(${JSON.stringify(command)})` },
      ])) as FillResult;
    } catch {
      record(portal, 'agent-failed');
      return;
    }
    record(portal, fillOutcomeOf(result));
  }

  return {
    open: async (id) => {
      const portal = findPortal(id);
      if (!portal) return;
      await startup;
      // A session past its 12 hours is ended before anything is shown.
      if (deps.clock.expired().includes(id)) await endSession(id, 'expired');
      const existing = windows.get(id);
      if (existing && !existing.isDestroyed()) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
        // If the window is on its login page (an earlier fill failed, or the insurer signed the
        // advisor out), try again. Filled or typed boxes are left as they are.
        void refill.get(id)?.();
        return;
      }
      deps.clock.start(id);
      lastEnd.delete(id);
      windows.set(id, create(portal));
      deps.logger.info('insurer.portal-opened', { insurer: id });
    },
    state: (id) => {
      const win = windows.get(id);
      return {
        open: !!win && !win.isDestroyed(),
        lastFill: lastFill.get(id) ?? null,
        sessionEndsAt: deps.clock.endsAt(id),
        lastSessionEnd: lastEnd.get(id) ?? null,
        blockedOrigins: blocked.get(id) ?? [],
      };
    },
    windowsOf: (id) =>
      [windows.get(id), ...(children.get(id) ?? [])].filter(
        (w): w is BrowserWindow => !!w && !w.isDestroyed(),
      ),
    signOut: async (id) => {
      if (!findPortal(id)) return false;
      await startup;
      return endSession(id, 'signed-out');
    },
  };
}
