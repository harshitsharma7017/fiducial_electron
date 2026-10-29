// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The demo window may read the portal and sign in or out, nothing else: every other POST, PUT,
// PATCH or DELETE is cancelled before it leaves the computer. So no proposal, client or any other
// record can be created or changed from the demo window, by the demo or by a click.
//
// The one exception is the full workflow's creation step, where the portal's profile allows it:
// after the user confirms, the runner arms a single-use permit that lets exactly one
// POST /api/proxy/proposals through within a short window. Every other write stays blocked,
// including a second creation request.
import type { Session } from 'electron';
import { isProposalCreation } from '../shared/environment';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** The portal's sign-in and sign-out (Fiducial_frontend src/app/api/auth). */
const AUTH_PATHS = new Set(['/api/auth/login', '/api/auth/logout']);
/** How long an armed permit waits for the creation request. */
export const PERMIT_TTL_MS = 15_000;

/** Pure decision: may the demo window send this request? */
export function isRequestAllowed(method: string, url: string, portalOrigin: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return true;
  if (method.toUpperCase() !== 'POST') return false;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}` === portalOrigin && AUTH_PATHS.has(parsed.pathname);
  } catch {
    return false;
  }
}

/** What happened to the permitted creation request. */
export type CreationOutcome =
  | { state: 'not-armed' }
  | { state: 'armed' }
  | { state: 'expired' }
  | { state: 'sent' }
  | { state: 'completed'; status: number }
  | { state: 'network-error' };

/**
 * The request policy, without Electron: the default rule plus the single-use creation permit.
 * Once a permit has been used, armed again or expired, it never comes back by itself.
 */
export class RequestPolicy {
  private permitExpiresAt: number | null = null;
  private outcome: CreationOutcome = { state: 'not-armed' };
  private blockedCount = 0;

  constructor(
    private readonly portalOrigin: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Arms one creation request. A second arm while one is pending is refused. */
  armCreation(): boolean {
    if (this.outcome.state === 'armed' || this.outcome.state === 'sent') return false;
    this.permitExpiresAt = this.now() + PERMIT_TTL_MS;
    this.outcome = { state: 'armed' };
    return true;
  }

  /** Decides one request; consumes the permit when it lets the creation request through. */
  evaluate(method: string, url: string): { allow: boolean; creation: boolean } {
    if (this.outcome.state === 'armed' && this.permitExpiresAt !== null) {
      if (this.now() > this.permitExpiresAt) {
        this.permitExpiresAt = null;
        this.outcome = { state: 'expired' };
      } else if (isProposalCreation(method, url, this.portalOrigin)) {
        this.permitExpiresAt = null;
        this.outcome = { state: 'sent' };
        return { allow: true, creation: true };
      }
    }
    const allow = isRequestAllowed(method, url, this.portalOrigin);
    if (!allow) this.blockedCount += 1;
    return { allow, creation: false };
  }

  completed(status: number): void {
    if (this.outcome.state === 'sent') this.outcome = { state: 'completed', status };
  }

  failed(): void {
    if (this.outcome.state === 'sent') this.outcome = { state: 'network-error' };
  }

  creationOutcome(): CreationOutcome {
    if (
      this.outcome.state === 'armed' &&
      this.permitExpiresAt !== null &&
      this.now() > this.permitExpiresAt
    ) {
      this.permitExpiresAt = null;
      this.outcome = { state: 'expired' };
    }
    return this.outcome;
  }

  blocked(): number {
    return this.blockedCount;
  }
}

export interface NetworkGuard {
  blocked(): number;
  armCreation(): boolean;
  creationOutcome(): CreationOutcome;
}

/** Installs the guard on the demo's session. */
export function installNetworkGuard(ses: Session, portalOrigin: string): NetworkGuard {
  const policy = new RequestPolicy(portalOrigin);
  let creationRequestId: number | null = null;
  ses.webRequest.onBeforeRequest((details, callback) => {
    const decision = policy.evaluate(details.method, details.url);
    if (decision.creation) creationRequestId = details.id;
    callback({ cancel: !decision.allow });
  });
  ses.webRequest.onCompleted((details) => {
    if (details.id !== creationRequestId) return;
    creationRequestId = null;
    policy.completed(details.statusCode);
  });
  ses.webRequest.onErrorOccurred((details) => {
    if (details.id !== creationRequestId) return;
    creationRequestId = null;
    policy.failed();
  });
  return {
    blocked: () => policy.blocked(),
    armCreation: () => policy.armCreation(),
    creationOutcome: () => policy.creationOutcome(),
  };
}
