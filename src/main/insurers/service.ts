// The insurer portals feature behind the IPC handlers. On, unless switched off with
// FQF_INSURER_PORTALS=0 (decision of 5 November 2026, for the first release: it was off unless
// FQF_INSURER_PORTALS=1 while the automations were being built). Switched off, list() reports it
// disabled and every other call is refused, so nothing is stored or opened.
import { findPortal, INSURER_PORTALS, usesSavedLogin } from '../../shared/insurers/portals';
import type { InsurerPortalList, SaveLoginRequest } from '../../shared/ipc/contract';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import { CredentialError, type InsurerCredentials } from './credentials';
import type { FormRecorder } from './form-recorder';
import type { PortalWindows } from './portal-windows';

export const INSURER_PORTALS_FLAG = 'FQF_INSURER_PORTALS';

export function insurerPortalsEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[INSURER_PORTALS_FLAG] !== '0';
}

export interface InsurerService {
  list(): Promise<InsurerPortalList>;
  saveLogin(request: SaveLoginRequest): Promise<void>;
  forgetLogin(id: string): Promise<boolean>;
  openPortal(id: string): Promise<void>;
  signOut(id: string): Promise<boolean>;
  record(
    id: string,
    action: 'start' | 'stop',
  ): Promise<{ recording: boolean; file: string | null }>;
}

function rethrow(err: unknown): never {
  throw new AppException(err instanceof CredentialError ? err.code : 'INTERNAL_ERROR');
}

export function createInsurerService(deps: {
  enabled: boolean;
  credentials: InsurerCredentials;
  windows: Pick<PortalWindows, 'open' | 'state' | 'signOut' | 'pagesOf'>;
  recorder?: FormRecorder;
  logger: Logger;
}): InsurerService {
  const requireEnabled = (): void => {
    if (!deps.enabled) throw new AppException('UNSUPPORTED_FLOW');
  };

  return {
    list: async () => {
      if (!deps.enabled) return { enabled: false, vaultError: null, portals: [] };
      let saved: ReadonlySet<string> = new Set();
      let vaultError: InsurerPortalList['vaultError'] = null;
      try {
        saved = await deps.credentials.saved();
      } catch (err) {
        vaultError =
          err instanceof CredentialError && err.code === 'SECRET_STORE_UNAVAILABLE'
            ? 'SECRET_STORE_UNAVAILABLE'
            : 'STORAGE_ERROR';
      }
      return {
        enabled: true,
        vaultError,
        portals: INSURER_PORTALS.map((portal) => {
          const window = deps.windows.state(portal.id);
          return {
            id: portal.id,
            displayName: portal.displayName,
            loginMethod: portal.loginMethod,
            automation: portal.automation,
            barrier: portal.barrier,
            advisorNote: portal.advisorNote,
            loginSaved: saved.has(portal.id),
            windowOpen: window.open,
            lastFill: window.lastFill,
            sessionEndsAt: window.sessionEndsAt?.toISOString() ?? null,
            lastSessionEnd: window.lastSessionEnd,
            blockedOrigins: window.blockedOrigins,
            recording: deps.recorder?.status(portal.id) ?? null,
          };
        }),
      };
    },

    saveLogin: async (request) => {
      requireEnabled();
      const portal = findPortal(request.id);
      // Only portals the app fills keep sign-in details: nothing is stored that is never used.
      if (!portal || !usesSavedLogin(portal)) throw new AppException('VALIDATION_FAILED');
      try {
        await deps.credentials.save(portal.id, {
          username: request.username,
          password: request.password,
        });
      } catch (err) {
        rethrow(err);
      }
      deps.logger.info('insurer.login-saved', { insurer: portal.id });
    },

    forgetLogin: async (id) => {
      requireEnabled();
      const portal = findPortal(id);
      if (!portal) throw new AppException('VALIDATION_FAILED');
      let forgotten: boolean;
      try {
        forgotten = await deps.credentials.forget(portal.id);
      } catch (err) {
        rethrow(err);
      }
      if (forgotten) deps.logger.info('insurer.login-forgotten', { insurer: portal.id });
      return forgotten;
    },

    openPortal: async (id) => {
      requireEnabled();
      if (!findPortal(id)) throw new AppException('VALIDATION_FAILED');
      await deps.windows.open(id);
    },

    signOut: async (id) => {
      requireEnabled();
      if (!findPortal(id)) throw new AppException('VALIDATION_FAILED');
      if (deps.recorder?.status(id)?.active) await deps.recorder.stop(id);
      return deps.windows.signOut(id);
    },

    record: async (id, action) => {
      requireEnabled();
      if (!findPortal(id) || !deps.recorder) throw new AppException('VALIDATION_FAILED');
      if (action === 'stop') {
        const file = await deps.recorder.stop(id);
        return { recording: false, file };
      }
      // Recording needs the insurer's window open (signed in). It follows every window of the
      // insurer, including pop-ups that open while recording (such as a premium calculator).
      if (deps.windows.pagesOf(id).length === 0) throw new AppException('MANUAL_ACTION_REQUIRED');
      deps.recorder.start(id, () => deps.windows.pagesOf(id));
      return { recording: true, file: null };
    },
  };
}
