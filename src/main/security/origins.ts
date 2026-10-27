// Origin helpers. WHATWG URL reports "null" as the origin of non-special schemes such as app://,
// so origins are compared as "<scheme>//<host>" instead.

export const APP_SCHEME = 'app';
export const APP_HOST = 'fqf';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.host ? `${parsed.protocol}//${parsed.host}` : null;
  } catch {
    return null;
  }
}

export function schemeOf(url: string): string {
  try {
    return new URL(url).protocol.replace(/:$/, '');
  } catch {
    return 'invalid';
  }
}

/** Accepts only a loopback http(s) dev-server URL, as set by electron-vite in development. */
export function devServerOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return loopback && (url.protocol === 'http:' || url.protocol === 'https:')
      ? `${url.protocol}//${url.host}`
      : null;
  } catch {
    return null;
  }
}
