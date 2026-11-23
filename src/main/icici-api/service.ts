// The ICICI Lombard partner API behind the IPC channels: its settings (environment, partner
// logins; src/main/icici-api/settings.ts), a sign-in check, and the client the quote service uses
// for ICICI premiums. Off with the other automation features. Errors carry codes only.
import type { IciciApiLogin, IciciApiMode, IciciApiStatus } from '../../shared/insurers/icici-api';
import { CredentialError } from '../insurers/credentials';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import { createIciciApiClient, IciciApiError, type IciciApiClient } from './client';
import type { IciciApiSettings } from './settings';

export interface IciciApiService {
  status(): Promise<IciciApiStatus>;
  save(request: {
    mode: IciciApiMode | null;
    loginFor?: IciciApiMode;
    login?: IciciApiLogin;
    forget?: IciciApiMode;
  }): Promise<IciciApiStatus>;
  /** Signs in to the chosen environment. */
  test(): Promise<{ ok: boolean; message: string }>;
  /** For the quote service: the client for the chosen environment, or null if not set up. */
  connect(): Promise<{ client: IciciApiClient; imidCode?: string } | null>;
}

const coded = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (err) {
    if (err instanceof CredentialError) throw new AppException(err.code);
    throw err;
  }
};

export function createIciciApiService(deps: {
  enabled: boolean;
  settings: IciciApiSettings;
  logger: Logger;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}): IciciApiService {
  /** One client per environment and login, so its token is reused between quotes. */
  let cached: { key: string; client: IciciApiClient } | null = null;
  const on = () => {
    if (!deps.enabled) throw new AppException('UNSUPPORTED_FLOW');
  };
  const connect = async () => {
    const active = await coded(() => deps.settings.active());
    if (!active) return null;
    const key = JSON.stringify(active);
    if (cached?.key !== key) {
      cached = {
        key,
        client: createIciciApiClient({
          mode: active.mode,
          login: active.login,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        }),
      };
    }
    return {
      client: cached.client,
      ...(active.login.imidCode ? { imidCode: active.login.imidCode } : {}),
    };
  };
  return {
    status: () => {
      on();
      return coded(() => deps.settings.status());
    },
    save: async (request) => {
      on();
      return coded(async () => {
        if (request.forget) await deps.settings.forgetLogin(request.forget);
        if (request.login && request.loginFor) {
          await deps.settings.saveLogin(request.loginFor, request.login);
        }
        await deps.settings.setMode(request.mode);
        cached = null;
        return deps.settings.status();
      });
    },
    test: async () => {
      on();
      const api = await connect();
      if (!api) {
        return {
          ok: false,
          message: 'Choose UAT or Production and save the partner login for it first.',
        };
      }
      try {
        await api.client.signIn();
        deps.logger.log('info', 'icici-api.signed-in', {});
        return {
          ok: true,
          message: `Signed in to ICICI Lombard ${api.client.mode === 'uat' ? 'UAT' : 'production'}.`,
        };
      } catch (err) {
        if (err instanceof IciciApiError) return { ok: false, message: err.message };
        throw err;
      }
    },
    connect: async () => (deps.enabled ? connect() : null),
  };
}
