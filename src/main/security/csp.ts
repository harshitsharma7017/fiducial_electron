// Content-Security-Policy for app-owned UI (06_SECURITY §2, SEC-06). Delivered as a response
// header by the app:// protocol handler. Production allows only the app's own scripts, styles,
// images and fonts; no inline code, no eval, no network.

export const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

/**
 * Development only (`npm run dev`): the Vite dev server needs an inline React refresh preamble,
 * inline styles and a WebSocket for hot reload. Applied solely to responses from the loopback
 * dev-server origin; never used in builds served over app://.
 */
export function developmentCsp(devOrigin: string): string {
  const ws = devOrigin.replace(/^http/, 'ws');
  return [
    "default-src 'none'",
    `script-src ${devOrigin} 'unsafe-inline'`,
    `style-src ${devOrigin} 'unsafe-inline'`,
    `img-src ${devOrigin} data:`,
    `font-src ${devOrigin}`,
    `connect-src ${devOrigin} ${ws}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}
