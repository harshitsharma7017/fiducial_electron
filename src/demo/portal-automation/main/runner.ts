// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// One demo run: open the portal's New proposal form, wait while the user signs in, choose the
// Property line if asked, fill the mapped fields, read them back and report. In fill-only mode
// (the default) it stops there: no step presses Create proposal or any other final action.
//
// In the full workflow (only where the portal's profile allows creation; shared/environment.ts) it
// then verifies the session and the environment, identifies the client, its risk locations and the
// assignee by their ids in the portal, looks for possible duplicates, records a creation attempt
// (main/attempt-store.ts) and shows a review. Only confirm() with that review's token goes on: it
// checks the form and the environment again, records the submission, arms the network guard for
// exactly the approved request, presses the reviewed button once, waits for the portal's real
// answer and reads the proposal back field by field. Success, refusal, an unverified field and an
// uncertain outcome are reported separately, and every step is in the audit log.
//
// An attempt whose outcome is unknown (in this app run, or found after a restart) blocks any new
// creation until the user resolves it: a fresh look-up in the portal finds the proposal, or the user
// marks it as not created after a look-up that found no single match. Nothing is ever resubmitted.
// The page is reached only through PortalPage, so the run is tested without Electron.
import { randomUUID } from 'node:crypto';
import {
  isUnresolved,
  type AttemptState,
  type AttemptSummary,
  type ReconciliationOutcome,
} from '../shared/attempt-state';
import {
  checkRecord,
  isObjectId,
  normalisePayload,
  recordMatches,
  type CreationField,
  type CreationPayload,
  type RecordCheck,
  type RecordFacts,
} from '../shared/creation-payload';
import type { DemoProposal } from '../shared/demo-data';
import {
  describeEnvironment,
  sessionEnvironmentProblem,
  type ModeDecision,
} from '../shared/environment';
import {
  FINAL_ACTION,
  FORBIDDEN_ACTION,
  FORM_READY_LABEL,
  NEW_PROPOSAL_PATH,
  PROPERTY_LINE,
} from '../shared/field-map';
import { planFill, targetProblem, verifyStep, type PlanStep } from '../shared/plan';
import {
  IDLE_REPORT,
  type AgentCommand,
  type AgentResult,
  type ClientMatch,
  type CreationReview,
  type DuplicateCandidate,
  type PageSnapshot,
  type ProgressKey,
  type ProposalReadback,
  type RunReport,
  type SkippedField,
  type StepStatus,
} from '../shared/protocol';
import {
  AttemptStore,
  summarise,
  type AttemptPatch,
  type CreationAttempt,
  type Verification,
} from './attempt-store';
import { NO_AUDIT, shortFingerprint, type AuditFields, type AuditTrail } from './audit-log';
import type { CreationOutcome } from './network-guard';

export interface PortalPage {
  load(url: string): Promise<void>;
  currentUrl(): string;
  run(command: AgentCommand): Promise<AgentResult>;
  isClosed(): boolean;
  blockedWrites(): number;
  // The full workflow only (the fill-only demo never uses them):
  /** Arms the network guard for exactly one creation request carrying exactly this payload. */
  armCreation?(approved: CreationPayload): boolean;
  /** Withdraws an unused permit; true when nothing had been sent with it. */
  revokeCreation?(): boolean;
  creationOutcome?(): CreationOutcome;
  /** Names (never values) of the portal's cookies in the demo window. */
  sessionCookieNames?(): Promise<string[]>;
}

export interface RunnerOptions {
  portalOrigin: string;
  openPage: () => PortalPage;
  /** Fill-only unless decided otherwise (shared/environment.ts decideMode). */
  mode?: ModeDecision;
  /** The durable record of creation attempts (in memory only when not given). */
  store?: AttemptStore;
  /** The durable audit trail (none when not given). */
  audit?: AuditTrail;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Wall-clock time, compared with the portal's createdAt when looking a proposal up. */
  wallClock?: () => number;
  token?: () => string;
  /** How long the user has to sign in. */
  signInTimeoutMs?: number;
  /** How long the form has, once signed in, to appear. */
  formTimeoutMs?: number;
  /** How long the portal has to answer the creation request. */
  creationTimeoutMs?: number;
}

const REASONS: Record<Exclude<AgentResult, { ok: true }>['reason'], string> = {
  'not-found': 'The field was no longer on the form.',
  ambiguous: 'More than one field matched; skipped rather than guess.',
  disabled: 'The field is disabled on the form.',
  'no-match': 'No exact match on the form.',
  timeout: 'The form did not respond in time.',
  failed: 'The portal did not answer as expected.',
};

/** Field names as the messages use them. */
const FIELD_NAMES: Record<CreationField, string> = {
  type: 'case type',
  clientId: 'client',
  locationIds: 'risk locations',
  ownerId: 'assigned to',
  policyStart: 'policy start',
  policyEnd: 'policy end',
  dueDate: 'quotes needed by',
};

const PROPOSAL_PATH = /^\/proposals\/([0-9a-f]{24})$/;
/** How far before the submission a proposal's createdAt may be (clock differences). */
const LOOKUP_TOLERANCE_MS = 2 * 60_000;
/** Finished attempts listed on the screen after the unresolved ones. */
const RECENT_ATTEMPTS = 5;

class Cancelled extends Error {}

/** What the read-back and the look-ups check a record against. */
interface CheckContext {
  attemptId: string;
  payload: CreationPayload;
  /** The approved assignee, or the signed-in user when the request names none. */
  expectedOwner: string | null;
}

interface PendingCreation extends CheckContext {
  data: DemoProposal;
  steps: PlanStep[];
  action: string;
  riskLocations: string[];
}

interface Identity {
  client: ClientMatch;
  payload: CreationPayload;
  expectedOwner: string | null;
  /** A caution for the review (the form's GSTIN could not be read), if any. */
  note: string | null;
}

/** The risk locations ticked on the form. */
function tickedLocations(snap: PageSnapshot): string[] {
  return (snap.riskLocations ?? []).filter((item) => item.checked).map((item) => item.name);
}

/** The assignee chosen on the form, by id; null when the form names none. */
function chosenOwner(snap: PageSnapshot): string | null {
  const owner = snap.controls.find(
    (control) => control.primary === 'Assigned to' && control.kind === 'select',
  );
  return owner && isObjectId(owner.value) ? owner.value.toLowerCase() : null;
}

function factsOf(proposal: ProposalReadback): RecordFacts {
  return {
    type: proposal.type,
    clientId: proposal.clientId,
    ownerId: proposal.ownerId,
    locationIds: proposal.locationIds,
    policyStart: proposal.policyStart,
    policyEnd: proposal.policyEnd,
    dueDate: proposal.dueDate,
  };
}

const NOTHING_READ: RecordFacts = {
  type: '',
  clientId: '',
  ownerId: '',
  locationIds: null,
  policyStart: null,
  policyEnd: null,
  dueDate: '',
};

export type ConfirmResult = { ok: true } | { ok: false; reason: string };

export class PortalDemoRunner {
  private report: RunReport = { ...IDLE_REPORT };
  private cancelled = false;
  private running: Promise<void> | null = null;
  private page: PortalPage | null = null;
  private pending: PendingCreation | null = null;
  private confirmed = false;
  /** The attempt being submitted or verified in this app run, if any. */
  private activeAttemptId: string | null = null;
  /** The signed-in user's id, from the portal's session check. */
  private sessionUserId: string | null = null;
  /** Creation attempts on a portal in live verification: one per app run. */
  private verificationAttempts = 0;
  private readonly options: RunnerOptions;
  private readonly decision: ModeDecision;
  private readonly store: AttemptStore;
  private readonly audit: AuditTrail;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly wallClock: () => number;
  private readonly token: () => string;

  constructor(options: RunnerOptions) {
    this.options = options;
    this.decision = options.mode ?? {
      mode: 'fill-only',
      environment: describeEnvironment(options.portalOrigin),
      fullRefused: null,
    };
    this.store = options.store ?? new AttemptStore({ file: null });
    this.audit = options.audit ?? NO_AUDIT;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
    this.wallClock = options.wallClock ?? (() => Date.now());
    this.token = options.token ?? (() => randomUUID());
    // The screen shows the mode and the environment before any run.
    this.report = this.freshReport();
  }

  private freshReport(): RunReport {
    const { mode, environment, fullRefused } = this.decision;
    return {
      ...IDLE_REPORT,
      portal: this.options.portalOrigin,
      mode,
      environment: { kind: environment.kind, name: environment.name, verified: null },
      fullRefused,
      progress: IDLE_REPORT.progress.map((step) => ({ ...step })),
    };
  }

  current(): RunReport {
    return {
      ...this.report,
      blockedWrites: this.page?.blockedWrites() ?? this.report.blockedWrites,
      attempts: this.attemptList(),
      storeProblem: this.store.problem,
    };
  }

  /** Every unresolved attempt, then the latest finished ones (stopped reviews are left out). */
  private attemptList(): AttemptSummary[] {
    const all = this.store.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const unresolved = all.filter((attempt) => isUnresolved(attempt.state));
    const finished = all
      .filter((attempt) => ['CREATED', 'REFUSED', 'NOT_CREATED'].includes(attempt.state))
      .slice(0, RECENT_ATTEMPTS);
    return [...unresolved, ...finished].map(summarise);
  }

  isRunning(): boolean {
    return this.running !== null;
  }

  /** Starts a run unless one is in progress; resolves once the run has finished. */
  start(data: DemoProposal): Promise<void> {
    if (this.running) return this.running;
    if (this.pending) this.cancelAttempt(this.pending.attemptId, 'superseded');
    this.cancelled = false;
    this.pending = null;
    this.confirmed = false;
    this.report = this.freshReport();
    return this.track(this.execute(data));
  }

  /**
   * The user's explicit confirmation of the review. Accepted once, only for the review now shown,
   * and only while the run waits for it. When the review lists possible duplicates, the
   * confirmation must say the user has checked them.
   */
  confirm(token: string, acknowledgeDuplicates = false): ConfirmResult {
    if (this.running) return { ok: false, reason: 'The demo is busy.' };
    const review = this.report.review;
    if (this.report.state !== 'awaiting-confirmation' || !review || !this.pending) {
      return { ok: false, reason: 'Nothing is waiting for confirmation.' };
    }
    if (this.confirmed) return { ok: false, reason: 'This review was already confirmed.' };
    if (token !== review.token) {
      return { ok: false, reason: 'This confirmation is for a different review.' };
    }
    if (review.duplicates.length > 0 && !acknowledgeDuplicates) {
      return {
        ok: false,
        reason:
          'This proposal may duplicate one that already exists. Confirm that you have checked the proposals listed in the review.',
      };
    }
    const pending = this.pending;
    // The approval is on disk and in the audit log before anything else happens.
    if (!this.move(pending.attemptId, 'APPROVED', { approvedAt: this.stamp() })) {
      return {
        ok: false,
        reason: 'The approval could not be recorded on this computer. Nothing was sent.',
      };
    }
    if (!this.record('approval.granted', { attemptId: pending.attemptId })) {
      this.cancelAttempt(pending.attemptId, 'audit-unavailable');
      this.pending = null;
      this.report = { ...this.report, review: null };
      this.update(
        'failed',
        'The audit log could not be written, so nothing was sent. Nothing was created.',
      );
      return { ok: false, reason: 'The audit log could not be written. Nothing was sent.' };
    }
    this.confirmed = true;
    this.pending = null;
    this.activeAttemptId = pending.attemptId;
    void this.track(this.create(pending));
    return { ok: true };
  }

  cancel(): void {
    this.cancelled = true;
    if (!this.running && this.report.state === 'awaiting-confirmation') {
      if (this.pending) this.cancelAttempt(this.pending.attemptId, 'user-cancelled');
      this.pending = null;
      this.report = {
        ...this.report,
        state: 'cancelled',
        message: 'Stopped before creation. Nothing was created.',
        review: null,
      };
      this.step('confirmation', 'skipped');
    }
  }

  /**
   * Looks for an unresolved attempt's proposal in the portal (read-only), in the background. One
   * matching proposal resolves it as created; otherwise the outcome is recorded for the user.
   */
  reconcile(attemptId: string): ConfirmResult {
    const ready = this.resolvable(attemptId);
    if (!ready.ok) return ready;
    void this.track(this.runReconcile(attemptId, null));
    return { ok: true };
  }

  /** The user's choice among several matching proposals a look-up found. */
  adopt(attemptId: string, proposalId: string): ConfirmResult {
    const ready = this.resolvable(attemptId);
    if (!ready.ok) return ready;
    const attempt = this.store.get(attemptId)!;
    if (!attempt.reconciliation?.candidates.some((candidate) => candidate.id === proposalId)) {
      return { ok: false, reason: 'That proposal was not among those the last look-up found.' };
    }
    void this.track(this.runReconcile(attemptId, proposalId));
    return { ok: true };
  }

  /**
   * The user's decision that an unresolved attempt created nothing. Allowed only after a look-up
   * that ran and found no single matching proposal.
   */
  markNotCreated(attemptId: string): ConfirmResult {
    const ready = this.resolvable(attemptId);
    if (!ready.ok) return ready;
    const attempt = this.store.get(attemptId)!;
    if (!summarise(attempt).canMarkNotCreated) {
      return {
        ok: false,
        reason:
          'Check the portal for this attempt first: it can be marked as not created only after a look-up.',
      };
    }
    const resolved = this.move(
      attemptId,
      'NOT_CREATED',
      { result: { reason: 'user-resolved' } },
      'user-resolved',
    );
    if (!resolved) {
      return { ok: false, reason: 'The decision could not be recorded on this computer.' };
    }
    this.record('recovery.resolved', {
      attemptId,
      state: 'NOT_CREATED',
      outcome: attempt.reconciliation!.outcome,
    });
    this.report = {
      ...this.freshReport(),
      message: 'The attempt is marked as not created. New proposals can be created again.',
    };
    return { ok: true };
  }

  private resolvable(attemptId: string): ConfirmResult {
    if (this.running) return { ok: false, reason: 'The demo is busy.' };
    if (this.report.state === 'awaiting-confirmation') {
      return { ok: false, reason: 'Finish or stop the review first.' };
    }
    const attempt = this.store.get(attemptId);
    if (
      !attempt ||
      (attempt.state !== 'UNCERTAIN' && attempt.state !== 'RECONCILIATION_REQUIRED')
    ) {
      return { ok: false, reason: 'This attempt does not need resolving.' };
    }
    if (!attempt.payload) {
      return { ok: false, reason: 'This attempt has no recorded request to look for.' };
    }
    return { ok: true };
  }

  private track(work: Promise<void>): Promise<void> {
    this.running = work
      .catch((error: unknown) => {
        const creating =
          this.report.state === 'creating' || this.report.state === 'verifying-result';
        this.interruptActiveAttempt();
        if (creating) {
          this.update(
            'uncertain',
            'The demo stopped while the proposal was being created, so the result is not certain. Check the Proposals list in the portal before creating it again.',
          );
        } else if (error instanceof Cancelled || this.cancelled) {
          this.update('cancelled', 'Stopped. Nothing was saved.');
        } else {
          this.update('failed', 'The demo stopped unexpectedly. Nothing was saved.');
        }
      })
      .finally(() => {
        this.running = null;
        this.activeAttemptId = null;
      });
    return this.running;
  }

  /** After an unexpected stop: an attempt in flight becomes uncertain; an approved one, cancelled. */
  private interruptActiveAttempt(): void {
    const id = this.activeAttemptId;
    const attempt = id ? this.store.get(id) : null;
    if (!attempt) return;
    if (attempt.state === 'APPROVED') this.cancelAttempt(attempt.id, 'interrupted');
    if (attempt.state === 'SUBMITTING' || attempt.state === 'VERIFYING') {
      const moved = this.move(
        attempt.id,
        'UNCERTAIN',
        { result: { reason: 'interrupted' } },
        'interrupted',
      );
      if (moved) this.record('result.uncertain', { attemptId: attempt.id, reason: 'interrupted' });
    }
  }

  private update(state: RunReport['state'], message: string): void {
    this.report = { ...this.report, state, message };
  }

  private step(key: ProgressKey, status: StepStatus): void {
    this.report = {
      ...this.report,
      progress: this.report.progress.map((step) => (step.key === key ? { ...step, status } : step)),
    };
  }

  private stamp(): string {
    return new Date(this.wallClock()).toISOString();
  }

  /** Records a state change; false if it could not be written (the caller then stops). */
  private move(
    id: string,
    to: AttemptState,
    patch: AttemptPatch = {},
    reason: string | null = null,
  ): boolean {
    try {
      this.store.transition(id, to, patch, reason);
      return true;
    } catch {
      return false;
    }
  }

  private record(event: Parameters<AuditTrail['record']>[0], fields: AuditFields): boolean {
    return this.audit.record(event, fields);
  }

  private cancelAttempt(id: string, reason: string): void {
    if (this.move(id, 'CANCELLED', { result: { reason } }, reason)) {
      this.record('attempt.cancelled', { attemptId: id, reason });
    }
  }

  private checkpoint(page: PortalPage): void {
    if (this.cancelled) throw new Cancelled();
    if (page.isClosed()) {
      this.cancelled = true;
      throw new Cancelled();
    }
  }

  private async snapshot(page: PortalPage): Promise<PageSnapshot | null> {
    try {
      const result = await page.run({ op: 'snapshot' });
      return result.ok && result.snapshot ? result.snapshot : null;
    } catch {
      // The page was navigating; the next poll reads it again.
      return null;
    }
  }

  /** Waits for the signed-in New proposal form, choosing the Property line when asked. */
  private async findForm(page: PortalPage): Promise<PageSnapshot | null> {
    const formUrl = `${this.options.portalOrigin}${NEW_PROPOSAL_PATH}`;
    const signInDeadline = this.now() + (this.options.signInTimeoutMs ?? 10 * 60_000);
    let formDeadline: number | null = null;
    let reloadedAt = 0;
    let signedInBefore = false;
    for (;;) {
      this.checkpoint(page);
      const snap = await this.snapshot(page);
      if (snap?.signInShown) {
        formDeadline = null;
        this.step('authentication', 'active');
        const alert = snap.alerts?.[0];
        this.update(
          'waiting-for-login',
          alert
            ? `Sign-in failed: ${sentence(alert)} Try again in the portal window.`
            : signedInBefore
              ? 'Your portal session ended. Sign in again in the demo window; the demo continues once you are signed in.'
              : 'Sign in to the portal in the demo window. The demo continues once you are signed in.',
        );
        if (this.now() > signInDeadline) {
          this.step('authentication', 'failed');
          this.update('failed', 'Timed out waiting for sign-in. Nothing was filled or saved.');
          return null;
        }
        await this.sleep(1000);
        continue;
      }
      if (snap) signedInBefore = true;
      this.step('navigation', 'active');
      this.update('finding-form', 'Opening the New proposal form…');
      formDeadline ??= this.now() + (this.options.formTimeoutMs ?? 30_000);
      if (snap && snap.path !== NEW_PROPOSAL_PATH && this.now() - reloadedAt > 5000) {
        reloadedAt = this.now();
        await page.load(formUrl);
        continue;
      }
      if (snap?.controls.some((control) => control.primary === FORM_READY_LABEL)) return snap;
      if (snap && targetProblem(snap, PROPERTY_LINE) === null) {
        const chosen = snap.controls.find(
          (control) => control.primary === PROPERTY_LINE.primary && control.kind === 'radio',
        );
        if (!chosen?.checked) await page.run({ op: 'check', target: PROPERTY_LINE });
      }
      if (this.now() > formDeadline) {
        this.step('navigation', 'failed');
        this.update(
          'failed',
          'The New proposal form did not appear. The signed-in user may not be allowed to create Property proposals. Nothing was filled or saved.',
        );
        return null;
      }
      await this.sleep(500);
    }
  }

  private async execute(data: DemoProposal): Promise<void> {
    const full = this.decision.mode === 'full';
    this.update('opening', 'Opening the Fiducial portal…');
    this.step('authentication', 'active');
    const page = this.options.openPage();
    this.page = page;
    await page.load(`${this.options.portalOrigin}${NEW_PROPOSAL_PATH}`);

    const form = await this.findForm(page);
    if (!form) return;
    this.step('navigation', 'done');

    if (full) {
      const session = await page.run({ op: 'session' });
      if (!session.ok || !session.session?.signedIn) {
        this.step('authentication', 'failed');
        this.update(
          'failed',
          'The portal did not confirm the sign-in (its session check failed). Nothing was filled or saved.',
        );
        return;
      }
      this.report = { ...this.report, signedInAs: session.session.name };
      this.sessionUserId = session.session.userId ?? null;
      this.step('authentication', 'done');
      await page.run({ op: 'guard', banner: this.banner() });
    } else {
      this.step('authentication', 'done');
      await page.run({ op: 'guard' });
    }

    this.update('filling', 'Filling the form with the demo data…');
    this.step('filling', 'active');
    const plan = planFill(form, data);
    const skipped: SkippedField[] = [...plan.skipped];
    const errors: SkippedField[] = [];
    const done: typeof plan.steps = [];
    for (const step of plan.steps) {
      this.checkpoint(page);
      const result = await page.run(step.command);
      if (result.ok) {
        done.push(step);
      } else if (step.command.op === 'pick-client' && result.reason !== 'ambiguous') {
        skipped.push({
          key: step.key,
          label: step.label,
          reason: `No client named exactly “${step.display}” in the portal’s client master. The demo never creates clients, so the insured is left to choose.`,
        });
      } else {
        errors.push({ key: step.key, label: step.label, reason: REASONS[result.reason] });
      }
    }
    this.step('filling', 'done');

    this.step('verification', 'active');
    const after = (await this.snapshot(page)) ?? form;
    const filled = done.map((step) => ({
      key: step.key,
      label: step.label,
      value: step.display,
      verified: verifyStep(step, after),
    }));
    for (const field of filled.filter((outcome) => !outcome.verified)) {
      errors.push({
        key: field.key,
        label: field.label,
        reason: 'Filled, but the form shows a different value.',
      });
    }
    this.step('verification', errors.length === 0 ? 'done' : 'failed');
    const finalAction =
      after.submitButtons.find((text) => text === FINAL_ACTION) ??
      after.submitButtons.find((text) => FORBIDDEN_ACTION.test(text)) ??
      null;
    const verified = filled.filter((outcome) => outcome.verified).length;

    if (!full) {
      for (const key of ['confirmation', 'creation', 'result'] as const) this.step(key, 'skipped');
      this.report = {
        ...this.report,
        state: 'done',
        message: `Filled and checked ${verified} of ${plan.steps.length} fields. Stopped before ${
          finalAction ? `“${finalAction}”` : 'any final action'
        }: review the form in the portal window. Nothing was saved or submitted.`,
        filled,
        skipped,
        errors,
        stoppedBefore: finalAction,
      };
      return;
    }

    this.report = { ...this.report, filled, skipped, errors, stoppedBefore: finalAction };
    const action = data.caseType === 'NEW' ? 'Create proposal' : 'Create renewal';
    const notOffered = (problems: string[]) => {
      for (const key of ['confirmation', 'creation', 'result'] as const) this.step(key, 'skipped');
      this.update(
        'failed',
        `Not created: ${problems.join(' ')} The form is left filled in the portal window for review.`,
      );
    };
    const problems = await this.creationProblems(page, data, after, done, errors, action);
    if (problems.length > 0) return notOffered(problems);

    // The exact request to approve: the client, its risk locations and the assignee by id.
    const identity = await this.identify(page, data, after);
    if (typeof identity === 'string') return notOffered([identity]);
    const duplicates = await this.findDuplicates(page, identity.payload);
    if (duplicates === null) {
      return notOffered([
        'The client’s existing proposals could not be read from the portal, so a duplicate cannot be ruled out.',
      ]);
    }

    let attempt: CreationAttempt;
    try {
      attempt = this.store.create({
        portalOrigin: this.options.portalOrigin,
        type: identity.payload.type,
        clientId: identity.client.id,
        clientName: identity.client.name,
        payload: identity.payload,
      });
    } catch {
      return notOffered(['The creation attempt could not be recorded on this computer.']);
    }
    const recorded = this.record('attempt.created', {
      attemptId: attempt.id,
      clientId: identity.client.id,
      fingerprint: shortFingerprint(attempt.fingerprint),
    });
    if (!recorded || !this.move(attempt.id, 'AWAITING_APPROVAL')) {
      this.cancelAttempt(attempt.id, 'audit-unavailable');
      return notOffered(['The creation attempt could not be recorded in the audit log.']);
    }
    const review = this.buildReview(data, after, filled, skipped, action, identity, attempt.id);
    const withDuplicates = { ...review, duplicates };
    if (duplicates.length > 0) {
      withDuplicates.warnings = [
        ...review.warnings,
        `${duplicates.length} proposal(s) for this client, case type and policy period already exist (listed below). Check them before creating another.`,
      ];
    }
    this.record('review.completed', { attemptId: attempt.id, count: duplicates.length });
    this.pending = {
      data,
      steps: done,
      action,
      riskLocations: review.riskLocations,
      attemptId: attempt.id,
      payload: identity.payload,
      expectedOwner: identity.expectedOwner,
    };
    this.step('confirmation', 'active');
    this.report = {
      ...this.report,
      state: 'awaiting-confirmation',
      message: `Review the details, then confirm to create the proposal in ${review.environment}. Nothing has been created yet.`,
      review: withDuplicates,
    };
  }

  private banner(): string {
    const { kind, name } = this.decision.environment;
    return kind === 'production'
      ? `LIVE PORTAL — ${name}. Live verification: one proposal, created only after you confirm in the Quote Fetcher.`
      : `TEST ENVIRONMENT — ${name}. A proposal is created only after you confirm in the Quote Fetcher.`;
  }

  /** Live verification allows one creation attempt per app run. */
  private verificationUsed(): string | null {
    return this.decision.environment.creation === 'verification' && this.verificationAttempts > 0
      ? 'Live verification allows one proposal per app run, and this run has already tried to create one. Check the Proposals list in the portal, then restart the app for another.'
      : null;
  }

  /** Everything that must hold before a creation may be offered; each failure is explained. */
  private async creationProblems(
    page: PortalPage,
    data: DemoProposal,
    after: PageSnapshot,
    done: PlanStep[],
    errors: SkippedField[],
    action: string,
  ): Promise<string[]> {
    const problems: string[] = [];
    if (this.store.problem) problems.push(this.store.problem);
    const unresolved = this.store.unresolved().length;
    if (unresolved > 0) {
      problems.push(
        `${unresolved} earlier creation attempt(s) have an unknown outcome. Resolve them under “Earlier creation attempts” first: no new proposal is created until then.`,
      );
    }
    if (errors.length > 0) {
      problems.push(`${errors.length} field(s) could not be filled or read back as expected.`);
    }
    const required = ['caseType', 'insuredName', 'policyStart', 'policyEnd', 'quotesNeededBy'];
    const missing = required.filter((key) => !done.some((step) => step.key === key));
    if (missing.length > 0) problems.push(`Not filled: ${missing.join(', ')}.`);
    if (after.chosenClient !== data.insuredName) {
      problems.push(`The insured “${data.insuredName}” is not chosen on the form.`);
    }
    if (after.submitButtons.filter((text) => text === action).length !== 1) {
      problems.push(`The form has no single “${action}” button.`);
    }
    const used = this.verificationUsed();
    if (used) problems.push(used);
    const environmentProblem = await this.environmentProblem(page);
    this.report = {
      ...this.report,
      environment: { ...this.report.environment, verified: environmentProblem === null },
    };
    if (environmentProblem) problems.push(environmentProblem);
    const session = await page.run({ op: 'session' });
    if (!session.ok || !session.session?.signedIn) {
      problems.push('The portal session could not be confirmed.');
    } else {
      this.sessionUserId = session.session.userId ?? this.sessionUserId;
      if (!session.session.canCreateProperty) {
        problems.push(
          'The signed-in user may not create and view Property proposals (property.create and property.view).',
        );
      }
    }
    return problems;
  }

  /** The environment check: a portal that allows creation, and the session cookie it should set. */
  private async environmentProblem(page: PortalPage): Promise<string | null> {
    if (this.decision.mode !== 'full' || this.decision.environment.creation === 'off') {
      return 'Creating proposals is not enabled for this portal.';
    }
    if (!page.sessionCookieNames || !page.armCreation || !page.creationOutcome) {
      return 'The demo window cannot check the environment.';
    }
    const names = await page.sessionCookieNames();
    const problem = sessionEnvironmentProblem(names, this.decision.environment);
    return problem ? `The environment could not be verified: ${problem}` : null;
  }

  /**
   * The client, its ticked risk locations and the assignee, by their ids in the portal. The client
   * must be the only one in the client master with exactly the insured's name, and agree with the
   * GSTIN the form shows. Returns the problem when any of them cannot be identified.
   */
  private async identify(
    page: PortalPage,
    data: DemoProposal,
    after: PageSnapshot,
  ): Promise<Identity | string> {
    const found = await page.run({ op: 'find-clients', name: data.insuredName });
    if (!found.ok || !found.clients) {
      return 'The insured could not be looked up in the portal’s client master.';
    }
    const exact = found.clients.filter(
      (client) => client.name === data.insuredName && isObjectId(client.id),
    );
    if (exact.length === 0) {
      return `No client named exactly “${data.insuredName}” was found in the portal’s client master.`;
    }
    if (exact.length > 1) {
      return `${exact.length} clients in the portal are named exactly “${data.insuredName}”, so the one chosen on the form cannot be identified.`;
    }
    const client = exact[0]!;
    let note: string | null = null;
    if (after.chosenClientGstin === undefined) {
      note =
        'The GSTIN on the form could not be read: the client is identified by its unique name, and its id is checked again when the request is sent.';
    } else if (
      (after.chosenClientGstin ?? '').toUpperCase() !== (client.gstin ?? '').toUpperCase()
    ) {
      return 'The GSTIN of the client chosen on the form differs from the client master’s, so the client cannot be confirmed.';
    }

    const ticked = tickedLocations(after);
    const locationIds: string[] = [];
    if (ticked.length > 0) {
      const listed = await page.run({ op: 'client-locations', clientId: client.id });
      if (!listed.ok || !listed.locations) {
        return 'The client’s risk locations could not be read from the portal.';
      }
      for (const name of ticked) {
        const matches = listed.locations.filter(
          (location) => location.name === name && isObjectId(location.id),
        );
        if (matches.length !== 1) {
          return `The risk location “${name}” cannot be identified (${
            matches.length === 0 ? 'not in the client’s list' : 'several have that name'
          }).`;
        }
        locationIds.push(matches[0]!.id);
      }
    }

    const ownerId = chosenOwner(after);
    const payload = normalisePayload({
      type: data.caseType === 'NEW' ? 'NEW' : 'EXISTING',
      clientId: client.id,
      locationIds,
      ownerId,
      policyStart: data.policyStart,
      policyEnd: data.policyEnd,
      dueDate: data.quotesNeededBy,
    });
    return { client, payload, expectedOwner: ownerId ?? this.sessionUserId, note };
  }

  /**
   * Proposals that may duplicate this one: the same client, type and policy period, in the portal
   * or created from this computer. Null when the portal's list could not be read.
   */
  private async findDuplicates(
    page: PortalPage,
    payload: CreationPayload,
  ): Promise<DuplicateCandidate[] | null> {
    const listed = await page.run({ op: 'client-proposals', clientId: payload.clientId });
    if (!listed.ok || !listed.proposals) return null;
    const same = (type: string, start: string | null, end: string | null) =>
      type === payload.type && start === payload.policyStart && end === payload.policyEnd;
    const portal: DuplicateCandidate[] = listed.proposals
      .filter((proposal) => same(proposal.type, proposal.policyStart, proposal.policyEnd))
      .map((proposal) => ({
        reference: proposal.reference,
        stage: proposal.stage,
        createdAt: proposal.createdAt,
        source: 'portal',
      }));
    const inPortal = new Set(listed.proposals.map((proposal) => proposal.id));
    const local: DuplicateCandidate[] = this.store
      .list()
      .filter(
        (attempt) =>
          attempt.state === 'CREATED' &&
          attempt.payload !== null &&
          attempt.payload.clientId === payload.clientId &&
          same(attempt.payload.type, attempt.payload.policyStart, attempt.payload.policyEnd) &&
          attempt.result.proposalId !== null &&
          !inPortal.has(attempt.result.proposalId),
      )
      .map((attempt) => ({
        reference: attempt.result.reference ?? attempt.result.proposalId ?? '',
        stage: 'not in the portal’s list (deleted, or not visible to this user)',
        createdAt: attempt.completedAt ?? attempt.createdAt,
        source: 'this computer',
      }));
    return [...portal, ...local];
  }

  private buildReview(
    data: DemoProposal,
    after: PageSnapshot,
    filled: RunReport['filled'],
    skipped: SkippedField[],
    action: string,
    identity: Identity,
    attemptId: string,
  ): CreationReview {
    const owner = after.controls.find(
      (control) => control.primary === 'Assigned to' && control.kind === 'select',
    );
    const assignedTo =
      owner?.options.find((option) => option.value === owner.value)?.text ??
      '(as the portal sets it)';
    const warnings = [
      `The proposal will be created in ${this.decision.environment.name} (${this.options.portalOrigin})${
        this.report.signedInAs ? ` as ${this.report.signedInAs}` : ''
      }.`,
    ];
    if (this.decision.environment.kind === 'production') {
      warnings.push(
        'This creates a real record on the live portal. Go on only under the approved live verification procedure, with the synthetic test client.',
      );
    }
    const riskLocations = tickedLocations(after);
    const listed = after.riskLocations?.length ?? 0;
    warnings.push(
      riskLocations.length === 0
        ? 'No risk location is ticked: the proposal will cover none (they can be added later in the Data Sheet).'
        : `The proposal will cover ${riskLocations.length} of the client’s ${listed} risk location(s), as ticked in the portal.`,
    );
    if (skipped.length > 0) {
      warnings.push(
        `${skipped.length} item(s) are not on this form and will not be part of the proposal (listed under Skipped).`,
      );
    }
    if (identity.note) warnings.push(identity.note);
    return {
      token: this.token(),
      attemptId,
      environment: this.decision.environment.name,
      origin: this.options.portalOrigin,
      caseType: data.caseType === 'NEW' ? 'New business' : 'Renewal',
      insured: after.chosenClient ?? '',
      clientId: identity.client.id,
      clientGstin: identity.client.gstin,
      policyStart: data.policyStart,
      policyEnd: data.policyEnd,
      quotesNeededBy: data.quotesNeededBy,
      assignedTo,
      riskLocations,
      action,
      fields: filled,
      skipped,
      warnings,
      duplicates: [],
    };
  }

  private async create(pending: PendingCreation): Promise<void> {
    const page = this.page;
    this.step('confirmation', 'done');
    this.step('creation', 'active');
    this.report = { ...this.report, review: null };
    this.update('creating', 'Checking the form once more before creating the proposal…');
    const notCreated = (message: string, reason: string) => {
      this.cancelAttempt(pending.attemptId, reason);
      this.step('creation', 'failed');
      this.step('result', 'skipped');
      this.update('failed', `${message} Nothing was created.`);
    };
    if (!page || page.isClosed()) {
      return notCreated('The portal window was closed.', 'window-closed');
    }

    const snap = await this.snapshot(page);
    if (!snap || snap.signInShown) {
      return notCreated(
        'Your portal session ended before creation; run the demo again.',
        'session-ended',
      );
    }
    if (snap.path !== NEW_PROPOSAL_PATH) {
      return notCreated('The portal is no longer on the New proposal form.', 'left-form');
    }
    const changed = pending.steps
      .filter((step) => !verifyStep(step, snap))
      .map((step) => step.label);
    if (tickedLocations(snap).join('\n') !== pending.riskLocations.join('\n')) {
      changed.push('Risk locations');
    }
    if (chosenOwner(snap) !== pending.payload.ownerId && !changed.includes('Assigned to')) {
      changed.push('Assigned to');
    }
    if (changed.length > 0) {
      return notCreated(
        `The form changed after your review (${changed.join(', ')}); run the demo again to review the new values.`,
        'changed-after-review',
      );
    }
    const environmentProblem = await this.environmentProblem(page);
    if (environmentProblem) return notCreated(environmentProblem, 'environment');
    const used = this.verificationUsed();
    if (used) return notCreated(used, 'verification-used');

    // From here a request may leave: the submission is on disk before the guard is armed.
    if (!this.move(pending.attemptId, 'SUBMITTING', { submittedAt: this.stamp() })) {
      return notCreated(
        'The submission could not be recorded on this computer.',
        'store-unavailable',
      );
    }
    const neverSent = (message: string, reason: string, audited: boolean) => {
      this.move(pending.attemptId, 'NOT_CREATED', { result: { reason } }, reason);
      if (audited) this.record('submission.not-sent', { attemptId: pending.attemptId, reason });
      this.step('creation', 'failed');
      this.step('result', 'skipped');
      this.update('failed', `${message} Nothing was created.`);
    };
    const started = this.record('submission.started', {
      attemptId: pending.attemptId,
      clientId: pending.payload.clientId,
      fingerprint: shortFingerprint(this.store.get(pending.attemptId)?.fingerprint ?? null),
    });
    if (!started) {
      return neverSent(
        'The audit log could not be written, so nothing was sent.',
        'audit-unavailable',
        false,
      );
    }
    if (!page.armCreation!(pending.payload)) {
      return neverSent('The network guard could not be armed.', 'guard-not-armed', true);
    }
    if (this.decision.environment.creation === 'verification') this.verificationAttempts += 1;

    const startedAt = this.wallClock();
    this.update('creating', `Creating the proposal in ${this.decision.environment.name}…`);
    const pressed = await page.run({ op: 'create', action: pending.action });
    // Not pressed: the permit is withdrawn. If it was still unused, nothing can have been sent.
    if (!pressed.ok && page.revokeCreation?.()) {
      return neverSent(
        `The portal’s “${pending.action}” button could not be pressed.`,
        'button-not-pressed',
        true,
      );
    }

    const deadline = this.now() + (this.options.creationTimeoutMs ?? 30_000);
    for (;;) {
      const outcome = page.creationOutcome!();
      const after = await this.snapshot(page);
      const id = after ? PROPOSAL_PATH.exec(after.path)?.[1] : undefined;
      if (outcome.state === 'completed' && outcome.status === 201 && id) {
        this.move(pending.attemptId, 'VERIFYING', { result: { httpStatus: 201, proposalId: id } });
        this.record('submission.accepted', {
          attemptId: pending.attemptId,
          httpStatus: 201,
          proposalId: id,
        });
        return this.verify(page, pending, id, null);
      }
      if (outcome.state === 'rejected') {
        this.move(
          pending.attemptId,
          'REFUSED',
          { result: { reason: outcome.reason, refusedBy: 'guard' } },
          outcome.reason,
        );
        this.record('submission.refused', {
          attemptId: pending.attemptId,
          reason: outcome.reason,
          fields: outcome.fields as AuditFields['fields'],
        });
        this.step('creation', 'failed');
        this.step('result', 'skipped');
        const fields = outcome.fields
          .map((field) => FIELD_NAMES[field as CreationField] ?? field)
          .join(', ');
        this.update(
          'creation-failed',
          `The request the portal’s form sent did not match the reviewed proposal (${fields}), so it was stopped before it reached the portal. Nothing was created.`,
        );
        return;
      }
      if (outcome.state === 'completed' && outcome.status >= 400 && outcome.status < 500) {
        const alert = after?.alerts?.find((text) => text !== '');
        this.move(
          pending.attemptId,
          'REFUSED',
          { result: { httpStatus: outcome.status, reason: 'portal-refused', refusedBy: 'portal' } },
          'portal-refused',
        );
        this.record('submission.refused', {
          attemptId: pending.attemptId,
          httpStatus: outcome.status,
          reason: 'portal-refused',
        });
        this.step('creation', 'failed');
        this.step('result', 'skipped');
        this.update(
          'creation-failed',
          `The portal refused the proposal (HTTP ${outcome.status})${alert ? `: ${sentence(alert)}` : '.'} Nothing was created.`,
        );
        return;
      }
      if (outcome.state === 'expired' || outcome.state === 'revoked') {
        const alert = after?.alerts?.find((text) => text !== '');
        return neverSent(
          `Pressing “${pending.action}” sent no creation request${alert ? ` (the form says: ${alert})` : ''}.`,
          'no-request-sent',
          true,
        );
      }
      if (this.now() > deadline && outcome.state === 'armed' && page.revokeCreation?.()) {
        return neverSent(
          `Pressing “${pending.action}” sent no creation request.`,
          'no-request-sent',
          true,
        );
      }
      if (
        outcome.state === 'network-error' ||
        (outcome.state === 'completed' && outcome.status >= 500) ||
        this.now() > deadline
      ) {
        return this.lookUp(page, pending, startedAt, outcome);
      }
      await this.sleep(500);
    }
  }

  /** Proposals the store already links to another attempt: never claimed twice. */
  private claimedProposals(except: string): Set<string> {
    return new Set(
      this.store
        .list()
        .filter((attempt) => attempt.id !== except && attempt.result.proposalId !== null)
        .map((attempt) => attempt.result.proposalId!),
    );
  }

  /** The client's proposals that could be this attempt's: same request, created after it was sent. */
  private async candidates(
    page: PortalPage,
    context: CheckContext,
    since: number,
  ): Promise<ProposalReadback[] | null> {
    const listed = await page.run({ op: 'client-proposals', clientId: context.payload.clientId });
    if (!listed.ok || !listed.proposals) return null;
    const claimed = this.claimedProposals(context.attemptId);
    return listed.proposals.filter(
      (proposal) =>
        recordMatches(factsOf(proposal), context.payload, context.expectedOwner) &&
        Date.parse(proposal.createdAt) >= since - LOOKUP_TOLERANCE_MS &&
        !claimed.has(proposal.id),
    );
  }

  /** Reads the proposal back from the portal and checks every field against the approved request. */
  private async verify(
    page: PortalPage,
    context: CheckContext,
    id: string,
    note: string | null,
  ): Promise<void> {
    this.step('creation', 'done');
    this.step('result', 'active');
    this.update('verifying-result', 'Reading the new proposal back from the portal…');
    const read = await page.run({ op: 'read-proposal', id });
    const prefix = note ? `${note} ` : '';
    if (!read.ok || !read.proposal) {
      // It exists (the portal created it, or a look-up found it), but nothing could be checked.
      const checks = checkRecord(NOTHING_READ, context.payload, null);
      this.finishCreated(context, id, null, 'unverified', checks);
      this.step('result', 'uncertain');
      this.report = { ...this.report, verification: checks };
      this.update(
        'created-unverified',
        `${prefix}The portal created proposal ${id}, but reading it back failed, so none of its fields is verified. Check it in the portal; do not create it again.`,
      );
      return;
    }
    const proposal = read.proposal;
    const checks = checkRecord(factsOf(proposal), context.payload, context.expectedOwner);
    const mismatched = checks.filter((check) => check.status === 'mismatch');
    const unverified = checks.filter((check) => check.status === 'unverified');
    const verification: Verification =
      mismatched.length > 0 ? 'mismatch' : unverified.length > 0 ? 'partial' : 'complete';
    this.finishCreated(context, proposal.id || id, proposal.reference, verification, checks);
    this.report = { ...this.report, proposal, verification: checks };
    const names = (list: RecordCheck[]) => list.map((check) => FIELD_NAMES[check.field]).join(', ');
    if (mismatched.length > 0) {
      this.step('result', 'uncertain');
      this.update(
        'uncertain',
        `Proposal ${proposal.reference} exists, but it reads back differently (${names(mismatched)}). Check it in the portal.`,
      );
      return;
    }
    if (unverified.length > 0) {
      this.step('result', 'uncertain');
      this.update(
        'created-unverified',
        `${prefix}Proposal ${proposal.reference} was created in ${this.decision.environment.name} (status ${proposal.stage}). Not verified, because the portal’s record did not show them: ${names(unverified)}. Check those in the portal.`,
      );
      return;
    }
    this.step('result', 'done');
    this.update(
      'created',
      `${prefix}Proposal ${proposal.reference} was created in ${this.decision.environment.name} (status ${proposal.stage}) and verified by reading it back from the portal.`,
    );
  }

  private finishCreated(
    context: CheckContext,
    proposalId: string,
    reference: string | null,
    verification: Verification,
    checks: RecordCheck[],
  ): void {
    this.move(context.attemptId, 'CREATED', { result: { proposalId, reference, verification } });
    this.record('verification.completed', {
      attemptId: context.attemptId,
      proposalId,
      reference: reference ?? undefined,
      verification,
      fields: checks.filter((check) => check.status !== 'verified').map((check) => check.field),
    });
  }

  /** After an unclear outcome: looks for exactly one matching proposal created by this attempt. */
  private async lookUp(
    page: PortalPage,
    pending: PendingCreation,
    startedAt: number,
    outcome: CreationOutcome,
  ): Promise<void> {
    const why = describeOutcome(outcome);
    const httpStatus = outcome.state === 'completed' ? outcome.status : null;
    this.update(
      'verifying-result',
      'The result is unclear; looking for the proposal in the portal…',
    );
    const matches = await this.candidates(page, pending, startedAt);
    if (matches && matches.length === 1) {
      const found = matches[0]!;
      this.move(pending.attemptId, 'VERIFYING', { result: { httpStatus, proposalId: found.id } });
      this.record('submission.accepted', {
        attemptId: pending.attemptId,
        proposalId: found.id,
        reason: 'found-by-lookup',
      });
      return this.verify(page, pending, found.id, `(Found by looking it up after ${why}.)`);
    }
    const code = outcomeCode(outcome);
    this.move(pending.attemptId, 'UNCERTAIN', { result: { httpStatus, reason: code } }, code);
    this.record('result.uncertain', { attemptId: pending.attemptId, reason: code });
    this.step('creation', 'uncertain');
    this.step('result', 'uncertain');
    const found =
      matches === null
        ? 'The client’s proposals could not be read from the portal.'
        : matches.length === 0
          ? 'No matching new proposal is among the client’s proposals in the portal, but the request may still have been processed.'
          : `${matches.length} matching proposals were found, so the demo cannot tell which one is this attempt’s.`;
    this.update(
      'uncertain',
      `The result is not certain: ${why}. ${found} Check the Proposals list in the portal before creating it again. The attempt is listed under “Earlier creation attempts”; no new proposal can be created until it is resolved there.`,
    );
  }

  /** Opens (or reuses) the portal window and waits until the user is signed in. */
  private async signedInPage(): Promise<PortalPage | null> {
    const reuse = this.page !== null && !this.page.isClosed();
    const page = reuse ? this.page! : this.options.openPage();
    this.page = page;
    if (!reuse) await page.load(`${this.options.portalOrigin}/proposals`);
    const signInDeadline = this.now() + (this.options.signInTimeoutMs ?? 10 * 60_000);
    const pageDeadline = this.now() + (this.options.formTimeoutMs ?? 30_000);
    for (;;) {
      if (page.isClosed()) return null;
      const snap = await this.snapshot(page);
      if (snap && !snap.signInShown) return page;
      if (snap?.signInShown) {
        this.update(
          'waiting-for-login',
          'Sign in to the portal in the demo window to look for the proposal.',
        );
        if (this.now() > signInDeadline) return null;
        await this.sleep(1000);
        continue;
      }
      if (this.now() > pageDeadline) return null;
      await this.sleep(500);
    }
  }

  /** A look-up for an unresolved attempt, or the user's choice of one of the proposals it found. */
  private async runReconcile(attemptId: string, chosen: string | null): Promise<void> {
    const attempt = this.store.get(attemptId)!;
    const payload = attempt.payload!;
    this.report = {
      ...this.freshReport(),
      state: 'verifying-result',
      message: 'Looking for this attempt’s proposal in the portal (read-only)…',
    };
    this.step('result', 'active');
    const at = this.stamp();
    const page = await this.signedInPage();
    const session = page ? await page.run({ op: 'session' }) : null;
    const signedIn = session?.ok === true && session.session?.signedIn === true;
    const context: CheckContext = {
      attemptId,
      payload,
      expectedOwner: payload.ownerId ?? (signedIn ? (session.session?.userId ?? null) : null),
    };
    const since = Date.parse(attempt.submittedAt ?? attempt.createdAt);
    const matches = page && signedIn ? await this.candidates(page, context, since) : null;
    const settle = (outcome: ReconciliationOutcome, candidates: ProposalReadback[]) => {
      this.store.note(attemptId, {
        lastReconciledAt: at,
        reconciliation: {
          outcome,
          at,
          candidates: candidates.map((proposal) => ({
            id: proposal.id,
            reference: proposal.reference,
            createdAt: proposal.createdAt,
          })),
        },
      });
      this.record('recovery.reconciled', {
        attemptId,
        outcome,
        count: candidates.length,
        proposalId: outcome === 'found' ? candidates[0]?.id : undefined,
      });
    };
    if (!page || matches === null) {
      settle('failed', []);
      this.step('result', 'uncertain');
      this.update(
        'uncertain',
        'The portal could not be checked (not signed in, or the client’s proposals could not be read). The attempt stays unresolved; try again.',
      );
      return;
    }
    const pick = chosen
      ? matches.find((proposal) => proposal.id === chosen)
      : matches.length === 1
        ? matches[0]
        : undefined;
    if (!pick) {
      settle(matches.length === 0 ? 'none' : 'several', matches);
      this.step('result', 'uncertain');
      this.update(
        'uncertain',
        chosen
          ? 'That proposal no longer matches this attempt; look at the list again.'
          : matches.length === 0
            ? 'No proposal from this attempt was found in the portal. If you are satisfied it was not created, mark it as not created; until then no new proposal can be created.'
            : `${matches.length} proposals match this attempt. Choose the one it created, or mark it as not created if none is.`,
      );
      return;
    }
    settle('found', [pick]);
    if (!this.move(attemptId, 'VERIFYING', { result: { proposalId: pick.id } }, 'reconciled')) {
      this.update('failed', 'The result could not be recorded on this computer; try again.');
      return;
    }
    this.activeAttemptId = attemptId;
    return this.verify(page, context, pick.id, '(Found by checking the portal.)');
  }
}

/** A portal message as a sentence, so the demo's own text can follow it. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function describeOutcome(outcome: CreationOutcome): string {
  switch (outcome.state) {
    case 'completed':
      return `the portal answered HTTP ${outcome.status}`;
    case 'network-error':
      return 'the connection failed during the request';
    case 'sent':
      return 'the portal did not answer in time';
    default:
      return 'no answer was recorded';
  }
}

/** The same, as a short code for the store and the audit log. */
function outcomeCode(outcome: CreationOutcome): string {
  switch (outcome.state) {
    case 'completed':
      return `http-${outcome.status}`;
    case 'network-error':
      return 'network-error';
    case 'sent':
      return 'timeout';
    default:
      return 'no-answer';
  }
}
