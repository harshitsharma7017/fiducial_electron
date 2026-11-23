// Calls ICICI Lombard's partner API (src/shared/insurers/icici-api.ts): signs in for a bearer token
// (auth-api/access/token; kept until shortly before it expires, and asked again once if ICICI
// answers 401), then posts JSON to a premium endpoint. Every failure becomes an IciciApiError with
// a message for the advisor; nothing sent or received is logged.
import { randomUUID } from 'node:crypto';
import {
  ICICI_API_BASE,
  type IciciApiLogin,
  type IciciApiMode,
} from '../../shared/insurers/icici-api';

export type IciciApiErrorKind =
  'sign-in' | 'forbidden' | 'rate-limited' | 'insurer' | 'network' | 'timeout' | 'rejected';

export class IciciApiError extends Error {
  constructor(
    readonly kind: IciciApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'IciciApiError';
  }
}

export interface IciciApiClient {
  readonly mode: IciciApiMode;
  /** Posts `body` to `path` with the bearer token; returns ICICI's JSON answer. */
  post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Signs in (or reuses the token): checks the login works. */
  signIn(): Promise<void>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 45_000;
/** The token is asked again this long before ICICI says it expires. */
const EARLY_MS = 60_000;
/** When ICICI gives no expiry: its kits say 15 to 20 minutes. */
const DEFAULT_LIFE_MS = 14 * 60_000;

/** A unique request id, as the premium endpoints ask for. */
export const requestId = (): string => randomUUID();

const BY_STATUS: Record<number, [IciciApiErrorKind, string]> = {
  400: ['rejected', 'ICICI Lombard did not accept the request (400).'],
  401: ['sign-in', 'ICICI Lombard did not accept the partner login (401). Check it in Settings.'],
  403: [
    'forbidden',
    'ICICI Lombard accepted the login but this API is not enabled for it, or this computer’s IP address is not allow-listed (403).',
  ],
  404: ['rejected', 'ICICI Lombard does not know this endpoint (404).'],
  429: ['rate-limited', 'ICICI Lombard is limiting requests (429). Try again in a minute.'],
};

/** ICICI's own message in an answer, if it gave one. */
function insurerMessage(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  for (const key of ['ErrorMessage', 'errorMessage', 'DisplayMessage', 'message', 'Message']) {
    const v = json[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300);
  }
  return null;
}

export function createIciciApiClient(options: {
  mode: IciciApiMode;
  login: IciciApiLogin;
  fetch?: Fetch;
  now?: () => number;
  /** In tests: the address of a local copy of the API. */
  base?: string;
}): IciciApiClient {
  const base = (options.base ?? ICICI_API_BASE[options.mode]).replace(/\/+$/, '');
  const doFetch: Fetch = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  let token: { value: string; until: number } | null = null;

  const call = async (
    path: string,
    body: Record<string, unknown>,
    bearer: string | null,
  ): Promise<{ status: number; json: Record<string, unknown> | null }> => {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new IciciApiError('timeout', 'ICICI Lombard did not answer within 45 seconds.');
      }
      throw new IciciApiError(
        'network',
        `ICICI Lombard's ${options.mode === 'uat' ? 'UAT' : 'production'} server could not be reached. Check the internet connection${options.mode === 'production' ? ' and that this IP address is allow-listed by ICICI' : ''}.`,
      );
    }
    let json: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      json = null;
    }
    return { status: response.status, json };
  };

  const fail = (status: number, json: Record<string, unknown> | null): never => {
    const said = insurerMessage(json);
    const [kind, message] = BY_STATUS[status] ?? [
      status >= 500 ? 'insurer' : 'rejected',
      `ICICI Lombard answered with an error (${status}).`,
    ];
    throw new IciciApiError(kind, said ? `${message} ICICI says: ${said}` : message);
  };

  const signIn = async (): Promise<string> => {
    if (token && now() < token.until) return token.value;
    const { status, json } = await call(
      '/auth-api/access/token',
      {
        Login: options.login.login,
        Password: options.login.encryptedPassword,
        LoginType: 'App',
      },
      null,
    );
    const value = json?.token;
    if (status !== 200 || json?.success === false || typeof value !== 'string' || !value) {
      if (status === 200 || status === 400 || status === 401) {
        const said = insurerMessage(json);
        throw new IciciApiError(
          'sign-in',
          `ICICI Lombard did not accept the partner login. Check the login and encrypted password in Settings.${said ? ` ICICI says: ${said}` : ''}`,
        );
      }
      return fail(status, json);
    }
    const expiry = typeof json.expiry === 'string' ? Date.parse(json.expiry) : NaN;
    const until = Number.isFinite(expiry) ? expiry - EARLY_MS : now() + DEFAULT_LIFE_MS;
    token = { value, until: Math.max(until, now() + 30_000) };
    return value;
  };

  return {
    mode: options.mode,
    signIn: async () => {
      await signIn();
    },
    post: async (path, body) => {
      let answer = await call(path, body, await signIn());
      if (answer.status === 401) {
        // The token may have ended early: sign in again, once.
        token = null;
        answer = await call(path, body, await signIn());
      }
      if (answer.status !== 200 || !answer.json) return fail(answer.status, answer.json);
      return answer.json;
    },
  };
}
