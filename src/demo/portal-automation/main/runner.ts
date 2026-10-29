// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// One demo run: open the portal's New proposal form, wait while the user signs in, choose the
// Property line if asked, fill the mapped fields, read them back and report. In fill-only mode
// (the default) it stops there: no step presses Create proposal or any other final action.
//
// In the full workflow (only where the portal's profile allows creation; shared/environment.ts) it then verifies
// the session and the environment, shows a review and waits. Only confirm() with that review's
// token goes on: it checks the form and the environment again, arms the network guard for one
// creation request, presses the reviewed button once, waits for the portal's real answer and
// reads the proposal back. Success, failure and an uncertain outcome are reported separately.
// The page is reached only through PortalPage, so the run is tested without Electron.
import { randomUUID } from 'node:crypto';
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
  type CreationReview,
  type PageSnapshot,
  type ProgressKey,
  type ProposalReadback,
  type RunReport,
  type SkippedField,
  type StepStatus,
} from '../shared/protocol';
import type { CreationOutcome } from './network-guard';

export interface PortalPage {
  load(url: string): Promise<void>;
  currentUrl(): string;
  run(command: AgentCommand): Promise<AgentResult>;
  isClosed(): boolean;
  blockedWrites(): number;
  // The full workflow only (the fill-only demo never uses them):
  /** Arms the network guard for exactly one proposal-creation request. */
  armCreation?(): boolean;
  creationOutcome?(): CreationOutcome;
  /** Names (never values) of the portal's cookies in the demo window. */
  sessionCookieNames?(): Promise<string[]>;
}

export interface RunnerOptions {
  portalOrigin: string;
  openPage: () => PortalPage;
  /** Fill-only unless decided otherwise (shared/environment.ts decideMode). */
  mode?: ModeDecision;
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

const PROPOSAL_PATH = /^\/proposals\/([0-9a-f]{24})$/;
/** How far before the confirmation a proposal's createdAt may be (clock differences). */
const LOOKUP_TOLERANCE_MS = 2 * 60_000;

class Cancelled extends Error {}

interface PendingCreation {
  data: DemoProposal;
  steps: PlanStep[];
  action: string;
  riskLocations: string[];
}

/** The risk locations ticked on the form. */
function tickedLocations(snap: PageSnapshot): string[] {
  return (snap.riskLocations ?? []).filter((item) => item.checked).map((item) => item.name);
}

export type ConfirmResult = { ok: true } | { ok: false; reason: string };

export class PortalDemoRunner {
  private report: RunReport = { ...IDLE_REPORT };
  private cancelled = false;
  private running: Promise<void> | null = null;
  private page: PortalPage | null = null;
  private pending: PendingCreation | null = null;
  private confirmed = false;
  /** Creation attempts on a portal in live verification: one per app run. */
  private verificationAttempts = 0;
  private readonly options: RunnerOptions;
  private readonly decision: ModeDecision;
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
    };
  }

  isRunning(): boolean {
    return this.running !== null;
  }

  /** Starts a run unless one is in progress; resolves once the run has finished. */
  start(data: DemoProposal): Promise<void> {
    if (this.running) return this.running;
    this.cancelled = false;
    this.pending = null;
    this.confirmed = false;
    this.report = this.freshReport();
    return this.track(this.execute(data));
  }

  /**
   * The user's explicit confirmation of the review. Accepted once, only for the review now shown,
   * and only while the run waits for it.
   */
  confirm(token: string): ConfirmResult {
    if (this.running) return { ok: false, reason: 'The demo is busy.' };
    const review = this.report.review;
    if (this.report.state !== 'awaiting-confirmation' || !review || !this.pending) {
      return { ok: false, reason: 'Nothing is waiting for confirmation.' };
    }
    if (this.confirmed) return { ok: false, reason: 'This review was already confirmed.' };
    if (token !== review.token) {
      return { ok: false, reason: 'This confirmation is for a different review.' };
    }
    this.confirmed = true;
    const pending = this.pending;
    this.pending = null;
    void this.track(this.create(pending));
    return { ok: true };
  }

  cancel(): void {
    this.cancelled = true;
    if (!this.running && this.report.state === 'awaiting-confirmation') {
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

  private track(work: Promise<void>): Promise<void> {
    this.running = work
      .catch((error: unknown) => {
        const creating =
          this.report.state === 'creating' || this.report.state === 'verifying-result';
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
      });
    return this.running;
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
    const problems = await this.creationProblems(page, data, after, done, errors, action);
    if (problems.length > 0) {
      for (const key of ['confirmation', 'creation', 'result'] as const) this.step(key, 'skipped');
      this.update(
        'failed',
        `Not created: ${problems.join(' ')} The form is left filled in the portal window for review.`,
      );
      return;
    }

    const review = this.buildReview(data, after, filled, skipped, action);
    this.pending = { data, steps: done, action, riskLocations: review.riskLocations };
    this.step('confirmation', 'active');
    this.report = {
      ...this.report,
      state: 'awaiting-confirmation',
      message: `Review the details, then confirm to create the proposal in ${review.environment}. Nothing has been created yet.`,
      review,
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
    } else if (!session.session.canCreateProperty) {
      problems.push(
        'The signed-in user may not create and view Property proposals (property.create and property.view).',
      );
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

  private buildReview(
    data: DemoProposal,
    after: PageSnapshot,
    filled: RunReport['filled'],
    skipped: SkippedField[],
    action: string,
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
    return {
      token: this.token(),
      environment: this.decision.environment.name,
      origin: this.options.portalOrigin,
      caseType: data.caseType === 'NEW' ? 'New business' : 'Renewal',
      insured: after.chosenClient ?? '',
      policyStart: data.policyStart,
      policyEnd: data.policyEnd,
      quotesNeededBy: data.quotesNeededBy,
      assignedTo,
      riskLocations,
      action,
      fields: filled,
      skipped,
      warnings,
    };
  }

  private async create(pending: PendingCreation): Promise<void> {
    const page = this.page;
    this.step('confirmation', 'done');
    this.step('creation', 'active');
    this.report = { ...this.report, review: null };
    this.update('creating', 'Checking the form once more before creating the proposal…');
    const notCreated = (message: string) => {
      this.step('creation', 'failed');
      this.step('result', 'skipped');
      this.update('failed', `${message} Nothing was created.`);
    };
    if (!page || page.isClosed()) return notCreated('The portal window was closed.');

    const snap = await this.snapshot(page);
    if (!snap || snap.signInShown) {
      return notCreated('Your portal session ended before creation; run the demo again.');
    }
    if (snap.path !== NEW_PROPOSAL_PATH) {
      return notCreated('The portal is no longer on the New proposal form.');
    }
    const changed = pending.steps
      .filter((step) => !verifyStep(step, snap))
      .map((step) => step.label);
    if (tickedLocations(snap).join('\n') !== pending.riskLocations.join('\n')) {
      changed.push('Risk locations');
    }
    if (changed.length > 0) {
      return notCreated(
        `The form changed after your review (${changed.join(', ')}); run the demo again to review the new values.`,
      );
    }
    const environmentProblem = await this.environmentProblem(page);
    if (environmentProblem) return notCreated(environmentProblem);
    const used = this.verificationUsed();
    if (used) return notCreated(used);
    if (!page.armCreation!()) return notCreated('The network guard could not be armed.');
    if (this.decision.environment.creation === 'verification') this.verificationAttempts += 1;

    const startedAt = this.wallClock();
    this.update('creating', `Creating the proposal in ${this.decision.environment.name}…`);
    const pressed = await page.run({ op: 'create', action: pending.action });
    if (!pressed.ok) {
      return notCreated(`The portal’s “${pending.action}” button could not be pressed.`);
    }

    const deadline = this.now() + (this.options.creationTimeoutMs ?? 30_000);
    for (;;) {
      const outcome = page.creationOutcome!();
      const after = await this.snapshot(page);
      const id = after ? PROPOSAL_PATH.exec(after.path)?.[1] : undefined;
      if (outcome.state === 'completed' && outcome.status === 201 && id) {
        return this.verify(page, pending.data, id, null);
      }
      if (outcome.state === 'completed' && outcome.status >= 400 && outcome.status < 500) {
        const alert = after?.alerts?.find((text) => text !== '');
        this.step('creation', 'failed');
        this.step('result', 'skipped');
        this.update(
          'creation-failed',
          `The portal refused the proposal (HTTP ${outcome.status})${alert ? `: ${sentence(alert)}` : '.'} Nothing was created.`,
        );
        return;
      }
      if (outcome.state === 'expired') {
        const alert = after?.alerts?.find((text) => text !== '');
        return notCreated(
          `Pressing “${pending.action}” sent no creation request${alert ? ` (the form says: ${alert})` : ''}.`,
        );
      }
      if (
        outcome.state === 'network-error' ||
        (outcome.state === 'completed' && outcome.status >= 500) ||
        this.now() > deadline
      ) {
        return this.lookUp(page, pending.data, startedAt, describeOutcome(outcome));
      }
      await this.sleep(500);
    }
  }

  /** Reads the proposal back from the portal and compares it with what was reviewed. */
  private async verify(
    page: PortalPage,
    data: DemoProposal,
    id: string,
    note: string | null,
  ): Promise<void> {
    this.step('creation', 'done');
    this.step('result', 'active');
    this.update('verifying-result', 'Reading the new proposal back from the portal…');
    const read = await page.run({ op: 'read-proposal', id });
    if (!read.ok || !read.proposal) {
      this.step('result', 'uncertain');
      this.update(
        'uncertain',
        `The portal opened proposal ${id} after creating it, but reading it back failed, so it is not verified. Check it in the portal before creating it again.`,
      );
      return;
    }
    const proposal = read.proposal;
    const differences = compare(proposal, data);
    this.report = { ...this.report, proposal };
    if (differences.length > 0) {
      this.step('result', 'uncertain');
      this.update(
        'uncertain',
        `Proposal ${proposal.reference} exists, but it reads back differently (${differences.join(', ')}). Check it in the portal.`,
      );
      return;
    }
    this.step('result', 'done');
    this.update(
      'created',
      `${note ? `${note} ` : ''}Proposal ${proposal.reference} was created in ${this.decision.environment.name} (status ${proposal.stage}) and verified by reading it back from the portal.`,
    );
  }

  /** After an unclear outcome: looks for exactly one matching proposal created by this attempt. */
  private async lookUp(
    page: PortalPage,
    data: DemoProposal,
    startedAt: number,
    why: string,
  ): Promise<void> {
    this.update(
      'verifying-result',
      'The result is unclear; looking for the proposal in the portal…',
    );
    const recent = await page.run({ op: 'recent-proposals' });
    const matches =
      recent.ok && recent.proposals
        ? recent.proposals.filter(
            (proposal) =>
              compare(proposal, data).length === 0 &&
              Date.parse(proposal.createdAt) >= startedAt - LOOKUP_TOLERANCE_MS,
          )
        : null;
    if (matches && matches.length === 1) {
      return this.verify(page, data, matches[0]!.id, `(Found by looking it up after ${why}.)`);
    }
    this.step('creation', 'uncertain');
    this.step('result', 'uncertain');
    const found =
      matches === null
        ? 'The portal’s latest proposals could not be read.'
        : matches.length === 0
          ? 'No matching new proposal is among the portal’s latest proposals, but the request may still have been processed.'
          : `${matches.length} matching proposals were found, so the demo cannot tell which one is this attempt’s.`;
    this.update(
      'uncertain',
      `The result is not certain: ${why}. ${found} Check the Proposals list in the portal before creating it again.`,
    );
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

/** Fields that differ between a proposal read back from the portal and the demo data. */
function compare(proposal: ProposalReadback, data: DemoProposal): string[] {
  const differences: string[] = [];
  if (proposal.clientName !== data.insuredName) differences.push('insured');
  if (proposal.type !== (data.caseType === 'NEW' ? 'NEW' : 'EXISTING'))
    differences.push('case type');
  if (proposal.policyStart !== data.policyStart) differences.push('policy start');
  if (proposal.policyEnd !== data.policyEnd) differences.push('policy end');
  if (proposal.dueDate !== data.quotesNeededBy) differences.push('quotes needed by');
  return differences;
}
