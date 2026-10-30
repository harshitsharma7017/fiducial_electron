// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// Which portal the demo talks to, and whether it may create a proposal there. Pure decisions,
// tested without Electron.
//
// Fill-only is the default everywhere. The full workflow (which creates a proposal) needs its own
// setting AND a portal whose profile allows creation. Creation on the live portal is a reviewed
// code change to LIVE_PROPOSAL_CREATION, never an environment variable. It is 'off': no setting
// creates a proposal on the live portal. The whole demo exists only in development builds.

/** Turns on the full workflow (proposal creation), where the portal's profile allows it. */
export const FULL_WORKFLOW_VARIABLE = 'PORTAL_AUTOMATION_FULL_WORKFLOW';

/** The live Fiducial portal. */
export const PRODUCTION_PORTAL_ORIGINS: readonly string[] = ['https://fiducial.spirezen.tech'];

/** The portal's session cookie: __Host-erp_session in production builds, erp_session otherwise. */
export const PRODUCTION_SESSION_COOKIE = '__Host-erp_session';
export const NON_PRODUCTION_SESSION_COOKIE = 'erp_session';

/**
 * Whether a portal allows proposal creation:
 * - `off`: fill-only, whatever the settings say;
 * - `verification`: the live verification procedure (README): synthetic data, one creation per
 *   app run;
 * - `on`: one creation per confirmed review (the local portal copy only).
 */
export type CreationPolicy = 'off' | 'verification' | 'on';

/**
 * Proposal creation on the live portal. A reviewed release setting, changed only in code:
 * 'verification' for the approved live verification run, 'off' otherwise. 'on' is not offered
 * for the live portal until that verification has passed and been reviewed.
 * 'verification' from 2026-10-29 at the team's request; back to 'off' on 2026-10-30 (release-risk
 * fix, docs/ACTUAL_PRODUCT_STATUS_AUDIT.md §9).
 */
export const LIVE_PROPOSAL_CREATION: Exclude<CreationPolicy, 'on'> = 'off';

export type EnvironmentKind = 'production' | 'test' | 'unrecognised';
export type WorkflowMode = 'fill-only' | 'full';

export interface PortalEnvironment {
  kind: EnvironmentKind;
  name: string;
  origin: string;
  creation: CreationPolicy;
  /** The session cookie this portal sets after sign-in (null: unrecognised portal). */
  sessionCookie: string | null;
}

interface PortalProfile {
  kind: Exclude<EnvironmentKind, 'unrecognised'>;
  name: string;
  matches(url: URL): boolean;
  creation: CreationPolicy;
  sessionCookie: string;
}

/**
 * The portals the demo knows. The live portal (https only, its exact origin), and a copy of the
 * portal running on this computer (plain http on localhost / 127.0.0.1) with synthetic data. The
 * portal has no hosted test environment; adding one here needs review.
 */
function portalProfiles(live: Exclude<CreationPolicy, 'on'>): readonly PortalProfile[] {
  return [
    {
      kind: 'production',
      name: 'Fiducial portal (live)',
      matches: (url) => url.protocol === 'https:' && PRODUCTION_PORTAL_ORIGINS.includes(url.origin),
      creation: live,
      sessionCookie: PRODUCTION_SESSION_COOKIE,
    },
    {
      kind: 'test',
      name: 'Local portal copy (this computer)',
      matches: (url) =>
        url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'),
      creation: 'on',
      sessionCookie: NON_PRODUCTION_SESSION_COOKIE,
    },
  ];
}

export interface ModeDecision {
  mode: WorkflowMode;
  environment: PortalEnvironment;
  /** Why the full workflow was asked for but refused (the demo then stays fill-only). */
  fullRefused: string | null;
}

function flagOn(value: string | undefined): boolean {
  const normalised = value?.trim().toLowerCase();
  return normalised === '1' || normalised === 'true';
}

export function describeEnvironment(
  origin: string,
  live: Exclude<CreationPolicy, 'on'> = LIVE_PROPOSAL_CREATION,
): PortalEnvironment {
  let url: URL | null = null;
  try {
    url = new URL(origin);
  } catch {
    url = null;
  }
  const profile = url ? portalProfiles(live).find((known) => known.matches(url)) : undefined;
  if (profile) {
    const { kind, name, creation, sessionCookie } = profile;
    return { kind, name, origin, creation, sessionCookie };
  }
  return {
    kind: 'unrecognised',
    name: `Unrecognised portal (${url?.host ?? origin})`,
    origin,
    creation: 'off',
    sessionCookie: null,
  };
}

/**
 * The mode for this portal. The origin is decided before this (flag.ts) and never changed here:
 * a refused full workflow falls back to fill-only on the same portal, never to another one.
 */
export function decideMode(
  env: Readonly<Record<string, string | undefined>>,
  origin: string,
  live: Exclude<CreationPolicy, 'on'> = LIVE_PROPOSAL_CREATION,
): ModeDecision {
  const environment = describeEnvironment(origin, live);
  if (!flagOn(env[FULL_WORKFLOW_VARIABLE])) {
    return { mode: 'fill-only', environment, fullRefused: null };
  }
  if (environment.creation === 'off') {
    return {
      mode: 'fill-only',
      environment,
      fullRefused:
        environment.kind === 'production'
          ? 'Creating proposals on the live portal is off in this release: it is switched on only for the reviewed live verification. Running fill-only.'
          : `${environment.name} is not an approved environment for creating proposals. Running fill-only.`,
    };
  }
  return { mode: 'full', environment, fullRefused: null };
}

/**
 * Checks, after sign-in, that the portal set the session cookie its profile expects
 * (Fiducial_frontend src/lib/session.ts: production builds use the Secure __Host- cookie). This
 * tells a production build from a local one at the same address. Takes cookie names only, never
 * values. Returns the problem, or null.
 */
export function sessionEnvironmentProblem(
  cookieNames: readonly string[],
  environment: PortalEnvironment,
): string | null {
  if (environment.sessionCookie === null) {
    return `${environment.name} is not a known portal.`;
  }
  const other =
    environment.sessionCookie === PRODUCTION_SESSION_COOKIE
      ? NON_PRODUCTION_SESSION_COOKIE
      : PRODUCTION_SESSION_COOKIE;
  if (cookieNames.includes(other)) {
    return other === PRODUCTION_SESSION_COOKIE
      ? 'The portal set a production session cookie: this is not a test environment.'
      : 'The portal set a non-production session cookie: this is not the live portal’s production build.';
  }
  if (!cookieNames.includes(environment.sessionCookie)) {
    return `No session for ${environment.name} was found: sign in to the portal first.`;
  }
  return null;
}

/** The one request that creates a proposal: POST /api/proxy/proposals, nothing else. */
export const CREATE_PROPOSAL_ENDPOINT = '/api/proxy/proposals';

export function isProposalCreation(method: string, url: string, origin: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  try {
    const parsed = new URL(url);
    return (
      `${parsed.protocol}//${parsed.host}` === origin &&
      parsed.pathname === CREATE_PROPOSAL_ENDPOINT &&
      parsed.search === '' &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
}
