// app:// protocol (ARCHITECTURE_REVIEW §3.3): serves the built renderer from the app bundle with
// a strict CSP header, replacing file:// loading. Requests are resolved strictly inside the
// renderer folder; anything else (other hosts, traversal, encoded separators, NUL) is a 404.
import { readFile } from 'node:fs/promises';
import { extname, posix, resolve, sep } from 'node:path';
import { protocol, type Session } from 'electron';
import type { Logger } from '../logging/logger';
import { PRODUCTION_CSP } from './csp';
import { APP_HOST, APP_SCHEME } from './origins';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export function mimeTypeFor(path: string): string | null {
  return MIME[extname(path).toLowerCase()] ?? null;
}

/** Must run before app `ready`. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/**
 * Maps an app:// URL to a file inside `rootDir`, or null if it is not a permitted request.
 * Pure function so the traversal rules can be tested without Electron.
 */
export function resolveAppAsset(rootDir: string, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null;
  // Encoded separators and dot segments are rejected outright rather than normalised.
  if (/%2f|%5c|%00|%2e/i.test(url.pathname)) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  const normalised = posix.normalize(pathname === '/' ? '/index.html' : pathname);
  if (!normalised.startsWith('/') || normalised.split('/').includes('..')) return null;
  const root = resolve(rootDir);
  const target = resolve(root, `.${normalised}`);
  return target.startsWith(root + sep) ? target : null;
}

export function installAppProtocol(ses: Session, rootDir: string, logger: Logger): void {
  ses.protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppAsset(rootDir, request.url);
    const type = file ? mimeTypeFor(file) : null;
    if (!file || !type) {
      logger.warn('protocol.request-rejected');
      return new Response('Not found', { status: 404 });
    }
    try {
      const body = await readFile(file);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': type,
          'content-security-policy': PRODUCTION_CSP,
          'x-content-type-options': 'nosniff',
          'cross-origin-opener-policy': 'same-origin',
        },
      });
    } catch {
      logger.warn('protocol.request-rejected');
      return new Response('Not found', { status: 404 });
    }
  });
}
