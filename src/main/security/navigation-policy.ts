// Default-deny policy for every webContents and session (06_SECURITY §2, TC-23), ported from the
// M1 spike: no popups, no navigation or redirects outside origins registered for that
// webContents, no <webview>, no permissions, no downloads. Blocked attempts are logged by
// scheme only, never by full URL.
import { app, type Session, type WebContents } from 'electron';
import type { Logger } from '../logging/logger';
import { originOf, schemeOf } from './origins';

/** Pure decision: may a renderer-initiated navigation go to `url`? */
export function isNavigationAllowed(allowedOrigins: ReadonlySet<string>, url: string): boolean {
  const origin = originOf(url);
  return origin !== null && allowedOrigins.has(origin);
}

/** Decides whether a frame of one webContents may navigate (or be redirected) to `url`. */
export type NavigationRule = (url: string, isMainFrame: boolean) => boolean;

const rulesByContents = new Map<number, NavigationRule>();
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

export function installNavigationPolicy(logger: Logger): void {
  app.on('web-contents-created', (_event, contents) => {
    const id = contents.id;
    const rule = (): NavigationRule => rulesByContents.get(id) ?? DENY_ALL;
    contents.setWindowOpenHandler(({ url }) => {
      logger.warn('security.popup-blocked', { targetScheme: schemeOf(url) });
      return { action: 'deny' };
    });
    contents.on('will-frame-navigate', (event) => {
      if (!rule()(event.url, event.isMainFrame)) {
        event.preventDefault();
        logger.warn('security.navigation-blocked', { targetScheme: schemeOf(event.url) });
      }
    });
    contents.on('will-redirect', (event) => {
      if (!rule()(event.url, event.isMainFrame)) {
        event.preventDefault();
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
