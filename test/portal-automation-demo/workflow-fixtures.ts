// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see src/demo/portal-automation/README.md).
// The scripted portal for the full workflow: the form of fixtures.ts plus the network guard's
// creation permit (the real RequestPolicy), the request body the portal's form would send (built
// from what the form shows, by id), the portal's answer, the read-back and the client's proposals.
// Nothing here talks to a real portal.
import type { AttemptStore } from '../../src/demo/portal-automation/main/attempt-store';
import type { AuditTrail } from '../../src/demo/portal-automation/main/audit-log';
import {
  PERMIT_TTL_MS,
  RequestPolicy,
  type CreationOutcome,
} from '../../src/demo/portal-automation/main/network-guard';
import { PortalDemoRunner } from '../../src/demo/portal-automation/main/runner';
import type { CreationPayload } from '../../src/demo/portal-automation/shared/creation-payload';
import { SYNTHETIC_DEMO_PROPOSAL } from '../../src/demo/portal-automation/shared/demo-data';
import { decideMode } from '../../src/demo/portal-automation/shared/environment';
import type {
  AgentCommand,
  AgentResult,
  ProposalReadback,
} from '../../src/demo/portal-automation/shared/protocol';
import {
  ADMIN_ID,
  CLIENT_ID,
  FakePortalPage,
  formSnapshot,
  LOCATION_IDS,
  TEST_GSTIN,
} from './fixtures';

export const ORIGIN = 'http://localhost:3100';
export const ID = 'a'.repeat(24);
export const T0 = Date.parse('2026-10-29T10:00:00Z');

export type Answer =
  | 'created'
  | 'refused'
  | 'server-error'
  | 'network-error'
  | 'no-answer'
  | 'no-request'
  | 'created-no-navigation';

/** A proposal as the portal returns it for the synthetic demo data. */
export function proposal(overrides: Partial<ProposalReadback> = {}): ProposalReadback {
  return {
    id: ID,
    reference: 'FIB/PROP/2026/0001',
    type: 'NEW',
    stage: 'DRAFT',
    clientName: SYNTHETIC_DEMO_PROPOSAL.insuredName,
    clientId: CLIENT_ID,
    clientGstin: TEST_GSTIN,
    ownerName: 'Demo Admin',
    ownerId: ADMIN_ID,
    locationIds: Object.values(LOCATION_IDS),
    policyStart: SYNTHETIC_DEMO_PROPOSAL.policyStart,
    policyEnd: SYNTHETIC_DEMO_PROPOSAL.policyEnd,
    dueDate: SYNTHETIC_DEMO_PROPOSAL.quotesNeededBy,
    createdAt: new Date(T0 + 1000).toISOString(),
    ...overrides,
  };
}

/** The scripted portal plus what the full workflow needs: the guard's permit and cookies. */
export class FullWorkflowPage extends FakePortalPage {
  answer: Answer = 'created';
  cookieNames = ['erp_session'];
  readBack: ProposalReadback | null = proposal();
  /** The client's proposals in the portal (the duplicate check and the look-ups read these). */
  recent: ProposalReadback[] = [];
  /** The client's proposals cannot be read. */
  proposalsUnavailable = false;
  /** The portal's alert after a refused save. */
  refusal = 'Choose a client';
  /** Fields the portal's form script sends differently from what the form shows. */
  tamper: Record<string, unknown> = {};
  contentType = 'application/json';
  /** Agent commands left unanswered for ever: the app stops (crashes) during that step. */
  hang = new Set<AgentCommand['op']>();
  armed = 0;
  presses = 0;
  /** Request bodies that left the computer (passed the guard). */
  readonly sent: Record<string, unknown>[] = [];
  /** The guard's own clock (the permit's lifetime). */
  guardClock = 0;
  readonly policy = new RequestPolicy(ORIGIN, () => this.guardClock);
  private navigatedTo: string | null = null;

  armCreation(approved: CreationPayload): boolean {
    const ok = this.policy.armCreation(approved);
    if (ok) this.armed += 1;
    return ok;
  }

  revokeCreation(): boolean {
    return this.policy.revoke();
  }

  creationOutcome(): CreationOutcome {
    return this.policy.creationOutcome();
  }

  sessionCookieNames(): Promise<string[]> {
    return Promise.resolve([...this.cookieNames]);
  }

  /** What the portal's form would send: the values it shows, by id (new-proposal-form.tsx). */
  requestBody(): Record<string, unknown> {
    const form = this.current();
    const value = (name: string) => form.controls.find((item) => item.name === name)?.value;
    const client = this.clientMaster.find((item) => item.name === form.chosenClient);
    const owner = value('ownerId');
    return {
      type: form.controls.find((item) => item.name === 'type' && item.checked)?.value ?? 'NEW',
      clientId: client?.id ?? '',
      locationIds: (form.riskLocations ?? [])
        .filter((item) => item.checked)
        .map((item) => LOCATION_IDS[item.name]),
      ...(owner ? { ownerId: owner } : {}),
      policyStart: value('policyStart'),
      policyEnd: value('policyEnd'),
      dueDate: value('dueDate'),
      ...this.tamper,
    };
  }

  /** The press of the form's button: the portal's script sends its request through the guard. */
  private press(): void {
    this.presses += 1;
    if (this.answer === 'no-request') {
      this.guardClock += PERMIT_TTL_MS + 1;
      return;
    }
    const body = this.requestBody();
    const decision = this.policy.evaluate('POST', `${ORIGIN}/api/proxy/proposals`, [
      { bytes: Buffer.from(JSON.stringify(body)) },
    ]);
    if (!decision.allow) return;
    if (!this.policy.checkHeaders({ 'Content-Type': this.contentType })) return;
    this.sent.push(body);
    switch (this.answer) {
      case 'created':
        this.policy.completed(201);
        this.navigatedTo = `/proposals/${ID}`;
        break;
      case 'created-no-navigation':
        this.policy.completed(201);
        break;
      case 'refused':
        this.policy.completed(400);
        break;
      case 'server-error':
        this.policy.completed(500);
        break;
      case 'network-error':
        this.policy.failed();
        break;
      case 'no-answer':
        break;
    }
  }

  override run(command: AgentCommand): Promise<AgentResult> {
    if (this.hang.has(command.op)) {
      this.commands.push(command);
      return new Promise<AgentResult>(() => undefined);
    }
    if (command.op === 'snapshot' && this.navigatedTo !== null) {
      this.commands.push(command);
      return Promise.resolve({
        ok: true,
        snapshot: { ...formSnapshot(), path: this.navigatedTo, controls: [], submitButtons: [] },
      });
    }
    if (command.op === 'create') {
      this.commands.push(command);
      this.press();
      return Promise.resolve({ ok: true });
    }
    if (
      command.op === 'snapshot' &&
      this.answer === 'refused' &&
      this.policy.creationOutcome().state === 'completed'
    ) {
      return super
        .run(command)
        .then((result) =>
          result.ok && result.snapshot
            ? { ok: true, snapshot: { ...result.snapshot, alerts: [this.refusal] } }
            : result,
        );
    }
    if (command.op === 'read-proposal') {
      this.commands.push(command);
      return Promise.resolve(
        this.readBack && command.id === this.readBack.id
          ? { ok: true, proposal: this.readBack }
          : { ok: false, reason: 'not-found' },
      );
    }
    if (command.op === 'recent-proposals' || command.op === 'client-proposals') {
      this.commands.push(command);
      if (this.proposalsUnavailable) return Promise.resolve({ ok: false, reason: 'failed' });
      const clientId = command.op === 'client-proposals' ? command.clientId : null;
      return Promise.resolve({
        ok: true,
        proposals: this.recent.filter((item) => clientId === null || item.clientId === clientId),
      });
    }
    return super.run(command);
  }
}

export interface RunnerSetup {
  env?: Record<string, string>;
  store?: AttemptStore;
  audit?: AuditTrail;
  /** Where each new window comes from (a restarted app opens a new one). */
  pages?: FullWorkflowPage[];
}

export function runnerFor(page: FakePortalPage, setup: RunnerSetup = {}) {
  let clock = 0;
  const messages: string[] = [];
  let tokens = 0;
  const env = setup.env ?? { PORTAL_AUTOMATION_FULL_WORKFLOW: '1' };
  const pages = setup.pages;
  const runner = new PortalDemoRunner({
    portalOrigin: ORIGIN,
    mode: decideMode(env, ORIGIN),
    openPage: () => (pages && pages.length > 0 ? pages.shift()! : page),
    store: setup.store,
    audit: setup.audit,
    sleep: (ms) => {
      clock += ms;
      messages.push(runner.current().message);
      return Promise.resolve();
    },
    now: () => clock,
    wallClock: () => T0,
    token: () => `review-${(tokens += 1)}`,
    creationTimeoutMs: 5000,
  });
  return { runner, messages };
}

/** Lets background work (a confirmed creation, a look-up) finish, or reach a step that hangs. */
export async function settle(runner: PortalDemoRunner): Promise<void> {
  for (let i = 0; i < 1000 && runner.isRunning(); i += 1) await Promise.resolve();
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function reviewed(
  page = new FullWorkflowPage([formSnapshot()]),
  setup: RunnerSetup = {},
) {
  const { runner, messages } = runnerFor(page, setup);
  await runner.start(SYNTHETIC_DEMO_PROPOSAL);
  return { page, runner, messages };
}
