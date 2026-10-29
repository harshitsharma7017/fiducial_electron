// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The feature flag and the portal address. Off unless ENABLE_PORTAL_AUTOMATION_DEMO is set.

export const PORTAL_DEMO_FLAG = 'ENABLE_PORTAL_AUTOMATION_DEMO';
/** Optional override of the portal address, for a local copy of the portal. */
export const PORTAL_DEMO_URL_VARIABLE = 'PORTAL_AUTOMATION_DEMO_URL';
export const DEFAULT_PORTAL_ORIGIN = 'https://fiducial.spirezen.tech';

type Environment = Readonly<Record<string, string | undefined>>;

/** The demo is available only when its flag is exactly "1" or "true". */
export function isPortalDemoEnabled(env: Environment): boolean {
  const value = env[PORTAL_DEMO_FLAG]?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

/**
 * The portal origin: the internal portal, or an override that is https, or plain http on this
 * computer only (a local copy of the portal). Anything else falls back to the internal portal.
 */
export function portalOrigin(env: Environment): string {
  const override = env[PORTAL_DEMO_URL_VARIABLE]?.trim();
  if (!override) return DEFAULT_PORTAL_ORIGIN;
  try {
    const url = new URL(override);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) {
      return `${url.protocol}//${url.host}`;
    }
  } catch {
    // Not a URL: the internal portal is used.
  }
  return DEFAULT_PORTAL_ORIGIN;
}
