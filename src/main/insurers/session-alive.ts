// Keeps insurer portals signed in while the advisor is away from them (decision of 5 November
// 2026: a portal should not sign the advisor out for inactivity while its session runs). This
// replaces the earlier rule that sessions were not kept alive artificially.
//
// Portals end a session for inactivity in two ways, and the app answers both:
// - their server forgets a session it has not heard from (a request carrying its cookie) for a
//   while (often 15 to 30 minutes): when neither the advisor nor the portal itself has sent a
//   request for NUDGE_MS, the app fetches the portal's current page again in the background (the
//   page shown does not change). Only a page that was opened with GET is fetched (never one
//   reached by sending a form, which a second request could send again), and never an address
//   carrying a one-time code;
// - their page counts down from the advisor's last mouse or key event, then signs out or asks
//   "Your session is about to expire — Continue?": the app sends harmless activity (mouse
//   movement, Shift pressed and released) to every page of the insurer when the advisor has not
//   touched it for NUDGE_MS, and every CHECK_MS presses a visible session warning's "Continue" /
//   "Stay signed in" button (never one that signs out).
// What it cannot change: a portal that ends every session after a fixed time whatever happens,
// and the app's own 12-hour limit (session-clock.ts), which still ends the session. A portal
// that signs out anyway shows its login page, which the app fills as usual.
// Nothing is read from the pages: the agent only reports whether it answered a warning and
// whether its request was answered.
import type { WebContents } from 'electron';
import type { Logger } from '../logging/logger';
import type { PortalPage } from './portal-host';

/** How often the pages are checked (session warnings count down in a minute or two). */
export const CHECK_MS = 30_000;
/** Inactivity after which the app acts (below the shortest portal timeouts seen, 5 minutes). */
export const NUDGE_MS = 4 * 60_000;
/** The isolated world the agent runs in, apart from the portal's own scripts. */
const WORLD_ID = 1805;

export interface KeepAliveCommand {
  /** Send activity events (the advisor has been away). */
  activity: boolean;
  /** The address to fetch again (the portal's page), or null. */
  ping: string | null;
}

export interface KeepAliveResult {
  /** A session warning's "stay" button was pressed. */
  answered: boolean;
  /** The fetch was answered (any status), false if it failed, null if none was sent. */
  pinged: boolean | null;
}

/** The in-page agent: serialised with toString, so self-contained. */
export async function keepAliveAgent(command: KeepAliveCommand): Promise<KeepAliveResult> {
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const text = (el: Element): string =>
    ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
  // A session warning: a shown pop-up talking about the session running out.
  const ABOUT_SESSION =
    /\b(session|inactiv\w*|idle|time ?out|timed out|logged out|log out|signed out|expir\w*)\b/i;
  const STAY =
    /^(continue( session| working)?|stay( signed| logged)? in|keep (me )?(signed|logged) in|extend( session)?|i'?m (still )?here|yes|ok|okay|resume|refresh session)$/i;
  const LEAVE = /(log ?out|sign ?out|log ?off|end session|exit|\bno\b|cancel|close)/i;
  let answered = false;
  const dialogs = Array.from(
    document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], .modal-content, .modal, .swal2-popup, ion-alert, mat-dialog-container, .ui-dialog, .bootbox',
    ),
  ).filter((d) => visible(d) && ABOUT_SESSION.test(text(d)));
  // The innermost warning first (a modal-content inside a modal).
  dialogs.sort((a, b) => text(a).length - text(b).length);
  // A question whose Yes or OK would sign out ("Are you sure you want to log out?") is not a
  // warning to answer.
  const ASKS_TO_LEAVE = /(want|wish|sure)\b.{0,40}\b(log|sign) ?(out|off)/i;
  for (const dialog of dialogs.slice(0, 1)) {
    if (ASKS_TO_LEAVE.test(text(dialog))) continue;
    const stay = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, a, input[type="button"], input[type="submit"]'),
    ).find((b) => {
      const label = text(b) || (b as HTMLInputElement).value || '';
      return visible(b) && STAY.test(label.trim()) && !LEAVE.test(label);
    });
    if (stay) {
      stay.click();
      answered = true;
    }
  }
  if (command.activity) {
    const at = { bubbles: true, cancelable: true, view: window };
    const x = 5 + Math.floor(Math.random() * 20);
    const target = document.body ?? document.documentElement;
    target.dispatchEvent(new MouseEvent('mousemove', { ...at, clientX: x, clientY: x }));
    target.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: x, clientY: x }));
    target.dispatchEvent(new KeyboardEvent('keydown', { ...at, key: 'Shift', code: 'ShiftLeft' }));
    target.dispatchEvent(new KeyboardEvent('keyup', { ...at, key: 'Shift', code: 'ShiftLeft' }));
    window.dispatchEvent(new Event('scroll'));
  }
  let pinged: boolean | null = null;
  if (command.ping) {
    try {
      await fetch(command.ping, { credentials: 'same-origin', cache: 'no-store' });
      pinged = true;
    } catch {
      pinged = false;
    }
  }
  return { answered, pinged };
}

const AGENT_SOURCE = keepAliveAgent.toString();

async function runAgent(wc: WebContents, command: KeepAliveCommand): Promise<KeepAliveResult> {
  if (wc.isDestroyed()) return { answered: false, pinged: null };
  try {
    return (await wc.executeJavaScriptInIsolatedWorld(WORLD_ID, [
      { code: `(${AGENT_SOURCE})(${JSON.stringify(command)})` },
    ])) as KeepAliveResult;
  } catch {
    return { answered: false, pinged: null };
  }
}

/** The last page load of the portal's own page: what a background fetch would repeat. */
export interface MainLoad {
  url: string;
  method: string;
  status: number;
}

/** Whether repeating a page load is harmless: a GET answered with a page, no one-time code. */
export function safeToRepeat(load: MainLoad | undefined): load is MainLoad {
  if (!load || load.method.toUpperCase() !== 'GET') return false;
  if (load.status < 200 || load.status >= 400) return false;
  let url: URL;
  try {
    url = new URL(load.url);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return !/(^|[?&])(code|token|ticket|otp|state|session_state|saml\w*|logout|signout)=/i.test(
    url.search.slice(1),
  );
}

/** What the session's requests tell: when it last talked to its server, its page's last load. */
export interface RequestSource {
  webRequest: {
    onCompleted(
      listener: (details: {
        webContentsId?: number;
        resourceType: string;
        method: string;
        statusCode: number;
        url: string;
      }) => void,
    ): void;
  };
}

export interface SessionAlive {
  /** Notes the insurer's requests (once per session). */
  watchSession(id: string, source: RequestSource): void;
  /** One round over every running session (run every CHECK_MS by start). */
  tick(): Promise<void>;
  start(): void;
  stop(): void;
  /** The session ended: forgets what was noted. */
  forget(id: string): void;
}

export function createSessionAlive(deps: {
  /** Insurers whose session is running. */
  running: () => string[];
  /** The insurer's pages: its own page first, then its pop-ups. */
  pagesOf: (id: string) => PortalPage[];
  /** Whether the page is past the insurer's login page (signed in). */
  signedIn: (id: string, url: string) => boolean;
  logger: Logger;
  now?: () => number;
  /** Runs the agent in a page (the real one by default). */
  run?: (wc: WebContents, command: KeepAliveCommand) => Promise<KeepAliveResult>;
  /** Told whether any session runs (to keep the app from being suspended meanwhile). */
  onRunning?: (any: boolean) => void;
}): SessionAlive {
  const now = deps.now ?? (() => Date.now());
  const run = deps.run ?? runAgent;
  const lastInput = new Map<string, number>();
  const lastRequest = new Map<string, number>();
  const lastNudge = new Map<string, number>();
  const mainLoad = new Map<string, MainLoad>();
  const watchedPages = new WeakSet<WebContents>();
  const watchedSessions = new WeakSet<object>();
  let timer: NodeJS.Timeout | undefined;
  let anyRunning = false;

  const watchPage = (id: string, wc: WebContents): void => {
    if (watchedPages.has(wc)) return;
    watchedPages.add(wc);
    // The advisor's own mouse and keys (synthetic events from the agent do not come through here).
    wc.on('input-event', () => lastInput.set(id, now()));
  };

  const alive: SessionAlive = {
    watchSession: (id, source) => {
      if (watchedSessions.has(source)) return;
      watchedSessions.add(source);
      source.webRequest.onCompleted((details) => {
        lastRequest.set(id, now());
        if (details.resourceType !== 'mainFrame') return;
        const portal = deps.pagesOf(id)[0];
        if (!portal || portal.isDestroyed() || details.webContentsId !== portal.webContents.id) {
          return;
        }
        mainLoad.set(id, { url: details.url, method: details.method, status: details.statusCode });
      });
    },
    tick: async () => {
      const ids = deps.running();
      const any = ids.length > 0;
      if (any !== anyRunning) {
        anyRunning = any;
        deps.onRunning?.(any);
      }
      for (const id of ids) {
        const pages = deps.pagesOf(id).filter((p) => !p.isDestroyed());
        const portal = pages[0];
        if (!portal) continue;
        for (const page of pages) watchPage(id, page.webContents);
        if (!deps.signedIn(id, portal.webContents.getURL())) continue;
        const t = now();
        // The clocks start when the session is first seen, so nothing happens right after opening.
        if (!lastInput.has(id)) lastInput.set(id, t);
        if (!lastNudge.has(id)) lastNudge.set(id, t);
        const away = t - (lastInput.get(id) ?? t) >= NUDGE_MS;
        const nudge = away && t - (lastNudge.get(id) ?? t) >= NUDGE_MS;
        const quiet = t - (lastRequest.get(id) ?? 0) >= NUDGE_MS;
        const load = mainLoad.get(id);
        const ping = nudge && quiet && safeToRepeat(load) ? load.url : null;
        if (nudge) lastNudge.set(id, t);
        for (const page of pages) {
          const result = await run(page.webContents, {
            activity: nudge,
            ping: page === portal ? ping : null,
          });
          if (result.answered) {
            deps.logger.info('insurer.session-kept-alive', { insurer: id });
          }
        }
      }
    },
    start: () => {
      if (timer) return;
      timer = setInterval(() => void alive.tick().catch(() => undefined), CHECK_MS);
      timer.unref?.();
    },
    stop: () => {
      clearInterval(timer);
      timer = undefined;
    },
    forget: (id) => {
      lastInput.delete(id);
      lastRequest.delete(id);
      lastNudge.delete(id);
      mainLoad.delete(id);
    },
  };
  return alive;
}
