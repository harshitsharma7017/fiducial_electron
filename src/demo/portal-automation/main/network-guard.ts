// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The demo window may read the portal and sign in or out, nothing else: every other POST, PUT,
// PATCH or DELETE is cancelled before it leaves the computer. So no proposal, client or any other
// record can be created or changed from the demo window, by the demo or by a click.
//
// The one exception is the full workflow's creation step, where the portal's profile allows it:
// after the user confirms, the runner arms a single-use permit for the exact request the user
// approved. Exactly one POST /api/proxy/proposals within a short window is considered, and it
// goes out only if its JSON body carries exactly the approved type, client, risk locations,
// assignee and dates, no other field, and its Content-Type is application/json. A request that
// differs is cancelled before it is sent and uses up the permit. Every other write stays blocked,
// including a second creation request.
import type { Session, UploadData } from 'electron';
import { requestBodyProblems, type CreationPayload } from '../shared/creation-payload';
import { isProposalCreation } from '../shared/environment';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** The portal's sign-in and sign-out (Fiducial_frontend src/app/api/auth). */
const AUTH_PATHS = new Set(['/api/auth/login', '/api/auth/logout']);
/** How long an armed permit waits for the creation request. */
export const PERMIT_TTL_MS = 15_000;
/** The approved request is a few hundred bytes; anything far larger is not it. */
const MAX_BODY_BYTES = 64 * 1024;

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

/** Why the guard cancelled the creation request (field names only, never values). */
export type RejectionReason = 'body-unreadable' | 'body-mismatch' | 'content-type';

/** What happened to the permitted creation request. */
export type CreationOutcome =
  | { state: 'not-armed' }
  | { state: 'armed' }
  | { state: 'expired' }
  /** The runner withdrew an unused permit. */
  | { state: 'revoked' }
  | { state: 'sent' }
  | { state: 'completed'; status: number }
  | { state: 'network-error' }
  /** The request differed from the approved one and was cancelled before it was sent. */
  | { state: 'rejected'; reason: RejectionReason; fields: string[] };

/** The request body as Electron reports it: only a single in-memory part can be checked. */
export type UploadPart = Partial<Pick<UploadData, 'bytes'>> & {
  file?: string;
  blobUUID?: string;
};

/** The JSON body of the request, or null when it is not a single readable JSON part. */
function readBody(upload: readonly UploadPart[] | undefined): unknown {
  if (!upload || upload.length !== 1) return null;
  const [part] = upload;
  if (!part?.bytes || part.file !== undefined || part.blobUUID !== undefined) return null;
  if (part.bytes.length === 0 || part.bytes.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(part.bytes)) as unknown;
  } catch {
    return null;
  }
}

/**
 * The request policy, without Electron: the default rule plus the single-use creation permit for
 * one approved request. Once a permit has been used, rejected, revoked or has expired, it never
 * comes back by itself.
 */
export class RequestPolicy {
  private permitExpiresAt: number | null = null;
  private approved: CreationPayload | null = null;
  private headersChecked = false;
  private outcome: CreationOutcome = { state: 'not-armed' };
  private blockedCount = 0;

  constructor(
    private readonly portalOrigin: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Arms one creation request for exactly this payload. Refused while one is pending. */
  armCreation(approved: CreationPayload): boolean {
    this.expireIfDue();
    if (this.outcome.state === 'armed' || this.outcome.state === 'sent') return false;
    this.permitExpiresAt = this.now() + PERMIT_TTL_MS;
    this.approved = approved;
    this.headersChecked = false;
    this.outcome = { state: 'armed' };
    return true;
  }

  /** Withdraws an unused permit. True when it was still unused (so nothing was sent). */
  revoke(): boolean {
    this.expireIfDue();
    if (this.outcome.state !== 'armed') return false;
    this.permitExpiresAt = null;
    this.approved = null;
    this.outcome = { state: 'revoked' };
    return true;
  }

  /** Decides one request; consumes the permit when it meets the creation request. */
  evaluate(
    method: string,
    url: string,
    upload?: readonly UploadPart[],
  ): { allow: boolean; creation: boolean } {
    this.expireIfDue();
    if (this.outcome.state === 'armed' && isProposalCreation(method, url, this.portalOrigin)) {
      const approved = this.approved!;
      this.permitExpiresAt = null;
      this.approved = null;
      const body = readBody(upload);
      const fields = body === null ? ['body'] : requestBodyProblems(body, approved);
      if (fields.length > 0) {
        this.outcome = {
          state: 'rejected',
          reason: body === null ? 'body-unreadable' : 'body-mismatch',
          fields,
        };
        this.blockedCount += 1;
        return { allow: false, creation: false };
      }
      this.outcome = { state: 'sent' };
      return { allow: true, creation: true };
    }
    const allow = isRequestAllowed(method, url, this.portalOrigin);
    if (!allow) this.blockedCount += 1;
    return { allow, creation: false };
  }

  /**
   * The permitted request's headers, just before it is sent: it must be JSON. False cancels it,
   * and nothing reaches the portal.
   */
  checkHeaders(headers: Readonly<Record<string, string | string[]>>): boolean {
    if (this.outcome.state !== 'sent' || this.headersChecked) return true;
    this.headersChecked = true;
    const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type');
    const value = Array.isArray(entry?.[1]) ? entry[1].join(',') : (entry?.[1] ?? '');
    const type = value.split(';')[0]!.trim().toLowerCase();
    if (type === 'application/json') return true;
    this.outcome = { state: 'rejected', reason: 'content-type', fields: ['content-type'] };
    this.blockedCount += 1;
    return false;
  }

  completed(status: number): void {
    if (this.outcome.state === 'sent') this.outcome = { state: 'completed', status };
  }

  failed(): void {
    if (this.outcome.state === 'sent') this.outcome = { state: 'network-error' };
  }

  creationOutcome(): CreationOutcome {
    this.expireIfDue();
    return this.outcome;
  }

  blocked(): number {
    return this.blockedCount;
  }

  private expireIfDue(): void {
    if (
      this.outcome.state === 'armed' &&
      this.permitExpiresAt !== null &&
      this.now() > this.permitExpiresAt
    ) {
      this.permitExpiresAt = null;
      this.approved = null;
      this.outcome = { state: 'expired' };
    }
  }
}

export interface NetworkGuard {
  blocked(): number;
  armCreation(approved: CreationPayload): boolean;
  revokeCreation(): boolean;
  creationOutcome(): CreationOutcome;
}

/** Installs the guard on the demo's session. */
export function installNetworkGuard(ses: Session, portalOrigin: string): NetworkGuard {
  const policy = new RequestPolicy(portalOrigin);
  let creationRequestId: number | null = null;
  ses.webRequest.onBeforeRequest((details, callback) => {
    const decision = policy.evaluate(details.method, details.url, details.uploadData);
    if (decision.creation) creationRequestId = details.id;
    callback({ cancel: !decision.allow });
  });
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.id !== creationRequestId) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }
    const ok = policy.checkHeaders(details.requestHeaders);
    if (!ok) creationRequestId = null;
    callback(ok ? { requestHeaders: details.requestHeaders } : { cancel: true });
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
    armCreation: (approved) => policy.armCreation(approved),
    revokeCreation: () => policy.revoke(),
    creationOutcome: () => policy.creationOutcome(),
  };
}
