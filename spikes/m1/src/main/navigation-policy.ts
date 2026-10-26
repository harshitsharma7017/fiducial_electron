// Default-deny policy for every webContents and session: no popups, no navigation outside
// registered origins, no permissions, no downloads, no <webview>.
import { app, type Session, type WebContents } from 'electron';

export const policyLog = {
  blockedNavigations: [] as string[],
  blockedRedirects: [] as string[],
  deniedPopups: [] as string[],
  deniedPermissionRequests: [] as string[],
  deniedPermissionChecks: 0,
  cancelledDownloads: 0,
};

const allowedOrigins = new Map<number, ReadonlySet<string>>();
const hardenedSessions = new WeakSet<Session>();

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'invalid-url';
  }
}

/** Allows renderer-initiated navigation of `contents` to exactly these origins. */
export function allowOrigins(contents: WebContents, origins: readonly string[]): void {
  allowedOrigins.set(contents.id, new Set(origins));
}

function isAllowed(contentsId: number, url: string): boolean {
  return allowedOrigins.get(contentsId)?.has(originOf(url)) ?? false;
}

export function installNavigationPolicy(): void {
  app.on('web-contents-created', (_event, contents) => {
    const id = contents.id;
    contents.setWindowOpenHandler(({ url }) => {
      policyLog.deniedPopups.push(originOf(url));
      return { action: 'deny' };
    });
    contents.on('will-frame-navigate', (event) => {
      if (!isAllowed(id, event.url)) {
        event.preventDefault();
        policyLog.blockedNavigations.push(originOf(event.url));
      }
    });
    contents.on('will-redirect', (event) => {
      if (!isAllowed(id, event.url)) {
        event.preventDefault();
        policyLog.blockedRedirects.push(originOf(event.url));
      }
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.once('destroyed', () => allowedOrigins.delete(id));
  });
}

/** Denies every permission and download for a session. Safe to call more than once. */
export function hardenSession(ses: Session): void {
  if (hardenedSessions.has(ses)) return;
  hardenedSessions.add(ses);
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    policyLog.deniedPermissionRequests.push(permission);
    callback(false);
  });
  ses.setPermissionCheckHandler(() => {
    policyLog.deniedPermissionChecks += 1;
    return false;
  });
  ses.on('will-download', (event) => {
    event.preventDefault();
    policyLog.cancelledDownloads += 1;
  });
}
