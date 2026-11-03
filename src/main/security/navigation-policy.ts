// Default-deny policy for every webContents and session (06_SECURITY §2, TC-23), ported from the
// M1 spike: no popups, no navigation or redirects outside origins registered for that
// webContents, no <webview>, no permissions, no downloads. Blocked attempts are logged by
// scheme only, never by full URL.
//
// A session may carry its own policy (insurer portals, setSessionPolicy): its navigation rule
// applies to every webContents of that session without a rule of its own (such as a pop-up), and
// it may allow pop-ups it approves, which then open in the same session (in a window of their own,
// or adopted where the policy says, such as a tab of the app window). Anything it blocks is
// reported to its onBlocked callback (the portal shows the blocked origin to the advisor).
import {
  app,
  type BrowserWindowConstructorOptions,
  type Session,
  type WebContents,
} from 'electron';
import type { Logger } from '../logging/logger';
import { originOf, schemeOf } from './origins';

/** Pure decision: may a renderer-initiated navigation go to `url`? */
export function isNavigationAllowed(allowedOrigins: ReadonlySet<string>, url: string): boolean {
  const origin = originOf(url);
  return origin !== null && allowedOrigins.has(origin);
}

/** Decides whether a frame of one webContents may navigate (or be redirected) to `url`. */
export type NavigationRule = (url: string, isMainFrame: boolean) => boolean;

export interface SessionPolicy {
  navigate: NavigationRule;
  /** Whether a pop-up to `url` may open (in this session, with the options returned). */
  popup(url: string): BrowserWindowConstructorOptions | null;
  /**
   * Where an allowed pop-up goes instead of a window of its own (insurer portals: a tab of the app
   * window). Gets Electron's options for the pop-up, which carry its contents, and returns them.
   */
  adopt?(options: BrowserWindowConstructorOptions): WebContents;
  onBlocked?(kind: 'navigation' | 'redirect' | 'popup', url: string): void;
}

const rulesByContents = new Map<number, NavigationRule>();
const sessionPolicies = new WeakMap<Session, SessionPolicy>();
const hardenedSessions = new WeakSet<Session>();
const DENY_ALL: NavigationRule = () => false;

/** Allows renderer-initiated navigation of `contents` (every frame) to exactly these origins. */
export function allowOrigins(contents: WebContents, origins: readonly string[]): void {
  const allowed = new Set(origins);
  rulesByContents.set(contents.id, (url) => isNavigationAllowed(allowed, url));
}

/**
 * Sets a custom rule for `contents`, for windows whose sub-frames need different origins from
 * the main frame (insurer portals with a CAPTCHA provider frame). Still default-deny.
 */
export function setNavigationRule(contents: WebContents, rule: NavigationRule): void {
  rulesByContents.set(contents.id, rule);
}

/** Sets the policy for every webContents of `ses` (see the header). Still default-deny. */
export function setSessionPolicy(ses: Session, policy: SessionPolicy): void {
  sessionPolicies.set(ses, policy);
}

export function installNavigationPolicy(logger: Logger): void {
  app.on('web-contents-created', (_event, contents) => {
    const id = contents.id;
    const policy = (): SessionPolicy | undefined => sessionPolicies.get(contents.session);
    const rule = (): NavigationRule => rulesByContents.get(id) ?? policy()?.navigate ?? DENY_ALL;
    contents.setWindowOpenHandler(({ url }) => {
      const current = policy();
      const options = current?.popup(url) ?? null;
      if (options) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: options,
          ...(current?.adopt
            ? { createWindow: (o: BrowserWindowConstructorOptions) => current.adopt!(o) }
            : {}),
        };
      }
      policy()?.onBlocked?.('popup', url);
      logger.warn('security.popup-blocked', { targetScheme: schemeOf(url) });
      return { action: 'deny' };
    });
    contents.on('will-frame-navigate', (event) => {
      if (!rule()(event.url, event.isMainFrame)) {
        event.preventDefault();
        if (event.isMainFrame) policy()?.onBlocked?.('navigation', event.url);
        logger.warn('security.navigation-blocked', { targetScheme: schemeOf(event.url) });
      }
    });
    contents.on('will-redirect', (event) => {
      if (!rule()(event.url, event.isMainFrame)) {
        event.preventDefault();
        if (event.isMainFrame) policy()?.onBlocked?.('redirect', event.url);
        logger.warn('security.redirect-blocked', { targetScheme: schemeOf(event.url) });
      }
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
      logger.warn('security.webview-blocked');
    });
    contents.once('destroyed', () => rulesByContents.delete(id));
  });
}

/** Denies every permission and download for a session. Safe to call more than once. */
export function hardenSession(ses: Session, logger: Logger): void {
  if (hardenedSessions.has(ses)) return;
  hardenedSessions.add(ses);
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    logger.warn('security.permission-denied', { permission });
    callback(false);
  });
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (event) => {
    event.preventDefault();
    logger.warn('security.download-blocked');
  });
}
