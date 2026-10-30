// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The durable record of proposal-creation attempts (<userData>/portal-automation/attempts.json).
// Every state change is written before the step it guards goes on: an attempt is SUBMITTING on disk
// before the network guard is armed, so a crash at any point leaves a record that says a request may
// have left. On the next start, attempts that were in flight become RECONCILIATION_REQUIRED (never
// submitted again) and earlier ones are cancelled.
//
// What is kept: identifiers (attempt, client, locations, assignee, proposal), the type, the dates,
// a fingerprint of the approved request, states with times, HTTP status codes and the proposal
// reference. The client's name is kept so the user can tell attempts apart on the screen; it never
// goes to the audit log. Never kept: passwords, cookies, the signed-in user's details, contacts,
// sums insured or anything else from the form.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { z } from 'zod';
import {
  ATTEMPT_STATES,
  canTransition,
  isTerminal,
  isUnresolved,
  stateAfterRestart,
  type AttemptState,
  type AttemptSummary,
  type ReconciliationOutcome,
} from '../shared/attempt-state';
import {
  canonicalPayload,
  isCreationPayload,
  type CreationPayload,
  type ProposalType,
} from '../shared/creation-payload';
import { NODE_FILE_OPS, removeStaleTemps, writeFileAtomic, type FileOps } from './atomic-file';

export const STORE_FILE = 'attempts.json';
/** Finished attempts kept for the record (unresolved ones are always kept). */
const MAX_FINISHED = 200;

export type Verification = 'complete' | 'partial' | 'mismatch' | 'unverified';

export interface AttemptResult {
  httpStatus: number | null;
  proposalId: string | null;
  reference: string | null;
  /** A short code, never free text from the portal. */
  reason: string | null;
  refusedBy: 'portal' | 'guard' | null;
  verification: Verification | null;
}

export interface Candidate {
  id: string;
  reference: string;
  createdAt: string;
}

export interface Reconciliation {
  outcome: ReconciliationOutcome;
  at: string;
  candidates: Candidate[];
}

export interface CreationAttempt {
  version: 1;
  id: string;
  createdAt: string;
  portalOrigin: string;
  type: ProposalType;
  clientId: string | null;
  clientName: string;
  payload: CreationPayload | null;
  /** SHA-256 of the approved request (canonical form). */
  fingerprint: string | null;
  state: AttemptState;
  history: { state: AttemptState; at: string; reason: string | null }[];
  approvedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  result: AttemptResult;
  lastReconciledAt: string | null;
  reconciliation: Reconciliation | null;
}

export interface NewAttempt {
  portalOrigin: string;
  type: ProposalType;
  clientId: string | null;
  clientName: string;
  payload: CreationPayload | null;
}

/** What may change with a transition (or a note) besides the state. */
export type AttemptPatch = Partial<
  Pick<
    CreationAttempt,
    'approvedAt' | 'submittedAt' | 'completedAt' | 'lastReconciledAt' | 'reconciliation'
  >
> & { result?: Partial<AttemptResult> };

/** A refused change: an invalid transition, or a record that could not be written. */
export class AttemptStoreError extends Error {}

export function fingerprintOf(payload: CreationPayload): string {
  return createHash('sha256').update(canonicalPayload(payload)).digest('hex');
}

const ISO = z.string().min(1).max(40);
const CandidateSchema = z.strictObject({
  id: z.string(),
  reference: z.string(),
  createdAt: z.string(),
});
const AttemptSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().min(1).max(64),
  createdAt: ISO,
  portalOrigin: z.string().max(200),
  type: z.enum(['NEW', 'EXISTING']),
  clientId: z.string().nullable(),
  clientName: z.string().max(200),
  payload: z.unknown().refine((value) => value === null || isCreationPayload(value)),
  fingerprint: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  state: z.enum(ATTEMPT_STATES),
  history: z.array(
    z.strictObject({ state: z.enum(ATTEMPT_STATES), at: ISO, reason: z.string().nullable() }),
  ),
  approvedAt: ISO.nullable(),
  submittedAt: ISO.nullable(),
  completedAt: ISO.nullable(),
  result: z.strictObject({
    httpStatus: z.number().int().nullable(),
    proposalId: z.string().nullable(),
    reference: z.string().nullable(),
    reason: z.string().nullable(),
    refusedBy: z.enum(['portal', 'guard']).nullable(),
    verification: z.enum(['complete', 'partial', 'mismatch', 'unverified']).nullable(),
  }),
  lastReconciledAt: ISO.nullable(),
  reconciliation: z
    .strictObject({
      outcome: z.enum(['found', 'none', 'several', 'failed']),
      at: ISO,
      candidates: z.array(CandidateSchema),
    })
    .nullable(),
});
const FileSchema = z.strictObject({ version: z.literal(1), attempts: z.array(AttemptSchema) });

export interface StoreOptions {
  /** The store file; null keeps the attempts in memory only (tests, and the no-flag case). */
  file: string | null;
  now?: () => Date;
  ops?: FileOps;
}

export class AttemptStore {
  private attempts: CreationAttempt[] = [];
  private readonly file: string | null;
  private readonly now: () => Date;
  private readonly ops: FileOps;
  /** Why earlier attempts could not be read; creation is refused while it is set. */
  readonly problem: string | null = null;

  constructor(options: StoreOptions) {
    this.file = options.file;
    this.now = options.now ?? (() => new Date());
    this.ops = options.ops ?? NODE_FILE_OPS;
    if (!this.file) return;
    removeStaleTemps(this.file);
    if (!existsSync(this.file)) return;
    let parsed: z.infer<typeof FileSchema> | null;
    try {
      const result = FileSchema.safeParse(JSON.parse(readFileSync(this.file, 'utf8')));
      parsed = result.success ? result.data : null;
    } catch {
      parsed = null;
    }
    if (parsed) {
      this.attempts = parsed.attempts;
      return;
    }
    // Unreadable: kept aside for inspection, and no creation in this app run (a lost record of an
    // attempt in flight must not let a duplicate through).
    const aside = `${this.file}.unreadable-${this.now().toISOString().replace(/[:.]/g, '-')}`;
    try {
      renameSync(this.file, aside);
    } catch {
      // Left in place; still refused below.
    }
    this.problem =
      'The record of earlier creation attempts could not be read, so it is not known whether an earlier attempt created a proposal. Check the Proposals list in the portal for recent proposals, then restart the app.';
  }

  /**
   * Called once at start-up: attempts in flight when the app stopped need reconciliation, and
   * attempts not yet submitted are cancelled. Returns the attempts it changed.
   */
  restoreAfterRestart(): CreationAttempt[] {
    const changed: CreationAttempt[] = [];
    const at = this.now().toISOString();
    const next = this.attempts.map((attempt) => {
      const to = stateAfterRestart(attempt.state);
      if (to === attempt.state) return attempt;
      const updated: CreationAttempt = {
        ...attempt,
        state: to,
        history: [...attempt.history, { state: to, at, reason: 'app-restarted' }],
        completedAt: to === 'CANCELLED' ? at : attempt.completedAt,
        result:
          to === 'CANCELLED' ? { ...attempt.result, reason: 'app-restarted' } : attempt.result,
      };
      changed.push(updated);
      return updated;
    });
    if (changed.length > 0) this.persist(next);
    return changed.map((attempt) => structuredClone(attempt));
  }

  list(): CreationAttempt[] {
    return this.attempts.map((attempt) => structuredClone(attempt));
  }

  get(id: string): CreationAttempt | null {
    const found = this.attempts.find((attempt) => attempt.id === id);
    return found ? structuredClone(found) : null;
  }

  unresolved(): CreationAttempt[] {
    return this.list().filter((attempt) => isUnresolved(attempt.state));
  }

  create(init: NewAttempt): CreationAttempt {
    const at = this.now().toISOString();
    const attempt: CreationAttempt = {
      version: 1,
      id: randomUUID(),
      createdAt: at,
      portalOrigin: init.portalOrigin,
      type: init.type,
      clientId: init.clientId,
      clientName: init.clientName,
      payload: init.payload,
      fingerprint: init.payload ? fingerprintOf(init.payload) : null,
      state: 'PREPARED',
      history: [{ state: 'PREPARED', at, reason: null }],
      approvedAt: null,
      submittedAt: null,
      completedAt: null,
      result: {
        httpStatus: null,
        proposalId: null,
        reference: null,
        reason: null,
        refusedBy: null,
        verification: null,
      },
      lastReconciledAt: null,
      reconciliation: null,
    };
    this.persist([...this.attempts, attempt]);
    return structuredClone(attempt);
  }

  /** Moves an attempt to `to`, written to disk before it returns. Refuses an invalid move. */
  transition(id: string, to: AttemptState, patch: AttemptPatch = {}, reason: string | null = null) {
    const current = this.attempts.find((attempt) => attempt.id === id);
    if (!current) throw new AttemptStoreError(`No attempt ${id}.`);
    if (!canTransition(current.state, to)) {
      throw new AttemptStoreError(`An attempt cannot go from ${current.state} to ${to}.`);
    }
    const at = this.now().toISOString();
    const updated: CreationAttempt = {
      ...this.apply(current, patch),
      state: to,
      history: [...current.history, { state: to, at, reason }],
    };
    if (isTerminal(to)) updated.completedAt ??= at;
    this.replace(updated);
    return structuredClone(updated);
  }

  /** Records facts (a look-up's outcome, say) without changing the state. */
  note(id: string, patch: AttemptPatch): CreationAttempt {
    const current = this.attempts.find((attempt) => attempt.id === id);
    if (!current) throw new AttemptStoreError(`No attempt ${id}.`);
    const updated = this.apply(current, patch);
    this.replace(updated);
    return structuredClone(updated);
  }

  private apply(attempt: CreationAttempt, patch: AttemptPatch): CreationAttempt {
    const { result, ...rest } = patch;
    return { ...attempt, ...rest, result: { ...attempt.result, ...result } };
  }

  private replace(updated: CreationAttempt): void {
    this.persist(this.attempts.map((attempt) => (attempt.id === updated.id ? updated : attempt)));
  }

  /** Writes the new list first; memory changes only once it is on disk. */
  private persist(next: CreationAttempt[]): void {
    const kept = prune(next);
    if (this.file) {
      try {
        writeFileAtomic(this.file, `${JSON.stringify({ version: 1, attempts: kept })}\n`, this.ops);
      } catch {
        throw new AttemptStoreError('The creation attempt could not be recorded on disk.');
      }
    }
    this.attempts = kept;
  }
}

/** Keeps every unfinished attempt and the newest finished ones. */
function prune(attempts: CreationAttempt[]): CreationAttempt[] {
  const finished = attempts.filter((attempt) => isTerminal(attempt.state));
  if (finished.length <= MAX_FINISHED) return attempts;
  const dropped = new Set(
    [...finished]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, finished.length - MAX_FINISHED)
      .map((attempt) => attempt.id),
  );
  return attempts.filter((attempt) => !dropped.has(attempt.id));
}

export function summarise(attempt: CreationAttempt): AttemptSummary {
  const outcome = attempt.reconciliation?.outcome ?? null;
  const unresolved = isUnresolved(attempt.state);
  return {
    id: attempt.id,
    state: attempt.state,
    createdAt: attempt.createdAt,
    submittedAt: attempt.submittedAt,
    caseType: attempt.type === 'NEW' ? 'New business' : 'Renewal',
    clientName: attempt.clientName,
    policyStart: attempt.payload?.policyStart ?? null,
    policyEnd: attempt.payload?.policyEnd ?? null,
    proposalReference: attempt.result.reference,
    lastReconciledAt: attempt.lastReconciledAt,
    reconciliation: outcome,
    candidates: attempt.reconciliation?.candidates ?? [],
    unresolved,
    canMarkNotCreated:
      (attempt.state === 'UNCERTAIN' || attempt.state === 'RECONCILIATION_REQUIRED') &&
      (outcome === 'none' || outcome === 'several'),
  };
}
