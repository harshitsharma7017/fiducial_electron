// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the full workflow against a scripted
// portal. Sign-in, review, explicit confirmation, one creation request, the portal's answer, the
// read-back, and the success, failure and uncertain outcomes.
import { describe, expect, it } from 'vitest';
import type { CreationOutcome } from '../../src/demo/portal-automation/main/network-guard';
import { PortalDemoRunner } from '../../src/demo/portal-automation/main/runner';
import { SYNTHETIC_DEMO_PROPOSAL } from '../../src/demo/portal-automation/shared/demo-data';
import { decideMode } from '../../src/demo/portal-automation/shared/environment';
import type {
  AgentCommand,
  AgentResult,
  PageSnapshot,
  ProposalReadback,
} from '../../src/demo/portal-automation/shared/protocol';
import { FakePortalPage, formSnapshot, signInSnapshot } from './fixtures';

const ORIGIN = 'http://localhost:3100';
const ID = 'a'.repeat(24);
const T0 = Date.parse('2026-10-29T10:00:00Z');

type Answer =
  | 'created'
  | 'refused'
  | 'server-error'
  | 'network-error'
  | 'no-answer'
  | 'no-request'
  | 'created-no-navigation';

function proposal(overrides: Partial<ProposalReadback> = {}): ProposalReadback {
  return {
    id: ID,
    reference: 'FIB/PROP/2026/0001',
    type: 'NEW',
    stage: 'DRAFT',
    clientName: SYNTHETIC_DEMO_PROPOSAL.insuredName,
    ownerName: 'Demo Admin',
    policyStart: SYNTHETIC_DEMO_PROPOSAL.policyStart,
    policyEnd: SYNTHETIC_DEMO_PROPOSAL.policyEnd,
    dueDate: SYNTHETIC_DEMO_PROPOSAL.quotesNeededBy,
    createdAt: new Date(T0 + 1000).toISOString(),
    ...overrides,
  };
}

/** The scripted portal plus what the full workflow needs: the guard's permit and cookies. */
class FullWorkflowPage extends FakePortalPage {
  answer: Answer = 'created';
  cookieNames = ['erp_session'];
  readBack: ProposalReadback | null = proposal();
  recent: ProposalReadback[] = [];
  /** The portal's alert after a refused save. */
  refusal = 'Choose a client';
  armed = 0;
  presses = 0;
  private outcome: CreationOutcome = { state: 'not-armed' };
  private navigatedTo: string | null = null;

  armCreation(): boolean {
    if (this.outcome.state === 'armed' || this.outcome.state === 'sent') return false;
    this.armed += 1;
    this.outcome = { state: 'armed' };
    return true;
  }

  creationOutcome(): CreationOutcome {
    return this.outcome;
  }

  sessionCookieNames(): Promise<string[]> {
    return Promise.resolve([...this.cookieNames]);
  }

  override run(command: AgentCommand): Promise<AgentResult> {
    if (command.op === 'snapshot' && this.navigatedTo !== null) {
      this.commands.push(command);
      return Promise.resolve({
        ok: true,
        snapshot: { ...formSnapshot(), path: this.navigatedTo, controls: [], submitButtons: [] },
      });
    }
    if (command.op === 'create') {
      this.commands.push(command);
      this.presses += 1;
      if (this.outcome.state !== 'armed') return Promise.resolve({ ok: true });
      switch (this.answer) {
        case 'created':
          this.outcome = { state: 'completed', status: 201 };
          this.navigatedTo = `/proposals/${ID}`;
          break;
        case 'created-no-navigation':
          this.outcome = { state: 'completed', status: 201 };
          break;
        case 'refused':
          this.outcome = { state: 'completed', status: 400 };
          break;
        case 'server-error':
          this.outcome = { state: 'completed', status: 500 };
          break;
        case 'network-error':
          this.outcome = { state: 'network-error' };
          break;
        case 'no-answer':
          this.outcome = { state: 'sent' };
          break;
        case 'no-request':
          this.outcome = { state: 'expired' };
          break;
      }
      return Promise.resolve({ ok: true });
    }
    if (
      command.op === 'snapshot' &&
      this.answer === 'refused' &&
      this.outcome.state === 'completed'
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
    if (command.op === 'recent-proposals') {
      this.commands.push(command);
      return Promise.resolve({ ok: true, proposals: this.recent });
    }
    return super.run(command);
  }
}

function runnerFor(page: FakePortalPage, env = { PORTAL_AUTOMATION_FULL_WORKFLOW: '1' }) {
  let clock = 0;
  const messages: string[] = [];
  let tokens = 0;
  const runner = new PortalDemoRunner({
    portalOrigin: ORIGIN,
    mode: decideMode(env, ORIGIN),
    openPage: () => page,
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

/** Lets the confirmed creation (which runs in the background) finish. */
async function settle(runner: PortalDemoRunner): Promise<void> {
  for (let i = 0; i < 1000 && runner.isRunning(); i += 1) await Promise.resolve();
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function reviewed(page = new FullWorkflowPage([formSnapshot()])) {
  const { runner, messages } = runnerFor(page);
  await runner.start(SYNTHETIC_DEMO_PROPOSAL);
  return { page, runner, messages };
}

describe('the full workflow: sign-in and session', () => {
  it('reports a failed sign-in with the portal’s own message, and keeps waiting', async () => {
    const failed = { ...signInSnapshot(), alerts: ['Email or password is incorrect.'] };
    const page = new FullWorkflowPage([signInSnapshot(), failed, formSnapshot()]);
    const { runner, messages } = runnerFor(page);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(messages).toContain(
      'Sign-in failed: Email or password is incorrect. Try again in the portal window.',
    );
    expect(runner.current().state).toBe('awaiting-confirmation');
  });

  it('notices a session that ended (redirected to sign-in) and continues after a new sign-in', async () => {
    const dashboard: PageSnapshot = {
      ...signInSnapshot(),
      path: '/dashboard',
      signInShown: false,
      controls: [],
      submitButtons: [],
    };
    const page = new FullWorkflowPage([dashboard, signInSnapshot(), formSnapshot()]);
    const { runner, messages } = runnerFor(page);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(messages.some((message) => message.startsWith('Your portal session ended.'))).toBe(true);
    expect(runner.current().state).toBe('awaiting-confirmation');
  });

  it('stops when the portal does not confirm the session', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.session = { signedIn: false, name: null, canCreateProperty: false };
    const { runner } = await reviewed(page);
    expect(runner.current()).toMatchObject({ state: 'failed', review: null });
    expect(page.commands.some((command) => command.op === 'create')).toBe(false);
  });

  it('shows who is signed in, never anything else about the account', async () => {
    const { runner } = await reviewed();
    expect(runner.current().signedInAs).toBe('Demo Admin');
  });
});

describe('the full workflow: review and confirmation', () => {
  it('fills, verifies and waits for confirmation with a full review; nothing is created yet', async () => {
    const { page, runner } = await reviewed();
    const report = runner.current();
    expect(report.state).toBe('awaiting-confirmation');
    expect(report.environment).toEqual({
      kind: 'test',
      name: 'Local portal copy (this computer)',
      verified: true,
    });
    expect(report.review).toMatchObject({
      token: 'review-1',
      environment: 'Local portal copy (this computer)',
      origin: ORIGIN,
      caseType: 'New business',
      insured: SYNTHETIC_DEMO_PROPOSAL.insuredName,
      policyStart: '2026-12-01',
      policyEnd: '2027-11-30',
      quotesNeededBy: '2026-11-20',
      assignedTo: 'Demo Admin',
      riskLocations: ['Peenya cold store', 'City office'],
      action: 'Create proposal',
    });
    expect(report.review!.warnings).toContain(
      'The proposal will cover 2 of the client’s 2 risk location(s), as ticked in the portal.',
    );
    expect(report.review!.skipped.map((field) => field.key)).toContain('contactEmail');
    expect(report.progress.map((step) => [step.key, step.status])).toEqual([
      ['authentication', 'done'],
      ['navigation', 'done'],
      ['filling', 'done'],
      ['verification', 'done'],
      ['confirmation', 'active'],
      ['creation', 'pending'],
      ['result', 'pending'],
    ]);
    expect(page.armed).toBe(0);
    expect(page.presses).toBe(0);
  });

  it('refuses a confirmation for another review, and creates nothing', async () => {
    const { page, runner } = await reviewed();
    expect(runner.confirm('review-0')).toEqual({
      ok: false,
      reason: 'This confirmation is for a different review.',
    });
    expect(page.presses).toBe(0);
  });

  it('accepts one confirmation only: a second click cannot create a duplicate', async () => {
    const { page, runner } = await reviewed();
    expect(runner.confirm('review-1')).toEqual({ ok: true });
    expect(runner.confirm('review-1').ok).toBe(false);
    await settle(runner);
    expect(runner.confirm('review-1').ok).toBe(false);
    expect(page.armed).toBe(1);
    expect(page.presses).toBe(1);
  });

  it('creates nothing if the form changed after the review', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    const { runner } = await reviewed(page);
    // Someone edits the form in the portal window after the review.
    await page.run({
      op: 'set',
      target: { primary: 'Policy period from', kind: 'date', name: 'policyStart' },
      value: '2027-01-01',
    });
    expect(runner.confirm('review-1').ok).toBe(true);
    await settle(runner);
    expect(runner.current().state).toBe('failed');
    expect(runner.current().message).toMatch(/form changed after your review.*Nothing was created/);
    expect(page.armed).toBe(0);
    expect(page.presses).toBe(0);
  });

  it('creates nothing if a risk location is ticked or unticked after the review', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    const { runner } = await reviewed(page);
    page.tickLocation('City office', false);
    expect(runner.confirm('review-1').ok).toBe(true);
    await settle(runner);
    expect(runner.current().state).toBe('failed');
    expect(runner.current().message).toMatch(/form changed after your review \(Risk locations\)/);
    expect(page.armed).toBe(0);
    expect(page.presses).toBe(0);
  });

  it('reviews only the ticked locations, and warns when none is ticked', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.clientLocations = [];
    const { runner } = await reviewed(page);
    expect(runner.current().review).toMatchObject({ riskLocations: [] });
    expect(runner.current().review!.warnings.join(' ')).toMatch(/No risk location is ticked/);
  });

  it('can be stopped at the review; nothing is created', async () => {
    const { page, runner } = await reviewed();
    runner.cancel();
    expect(runner.current()).toMatchObject({ state: 'cancelled', review: null });
    expect(runner.confirm('review-1').ok).toBe(false);
    expect(page.presses).toBe(0);
  });
});

describe('the full workflow: environment checks', () => {
  it('stops before the review on a production session cookie', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.cookieNames = ['__Host-erp_session'];
    const { runner } = await reviewed(page);
    expect(runner.current()).toMatchObject({
      state: 'failed',
      review: null,
      environment: { verified: false },
    });
    expect(runner.current().message).toMatch(/environment could not be verified/);
    expect(page.armed).toBe(0);
  });

  it('stops before the review when the user may not create Property proposals', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.session = { signedIn: true, name: 'Demo Viewer', canCreateProperty: false };
    const { runner } = await reviewed(page);
    expect(runner.current().state).toBe('failed');
    expect(runner.current().message).toMatch(/may not create and view Property proposals/);
  });

  it('stops before the review when the insured is not chosen (no exact client)', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.clients = new Set(['Deccan Cold Chain Pvt Ltd']);
    const { runner } = await reviewed(page);
    expect(runner.current().state).toBe('failed');
    expect(runner.current().message).toMatch(/insured .* is not chosen/);
  });

  it('is not available in fill-only mode: no review, no confirmation, no creation', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    const { runner } = runnerFor(page, { PORTAL_AUTOMATION_FULL_WORKFLOW: '0' });
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current()).toMatchObject({ state: 'done', mode: 'fill-only', review: null });
    expect(runner.confirm('review-1').ok).toBe(false);
    expect(page.commands.map((command) => command.op)).not.toContain('create');
    expect(page.commands.map((command) => command.op)).not.toContain('session');
  });
});

describe('the full workflow: creation outcomes', () => {
  it('success: one request, the portal’s 201, the new page, and a matching read-back', async () => {
    const { page, runner } = await reviewed();
    runner.confirm('review-1');
    await settle(runner);
    const report = runner.current();
    expect(report.state).toBe('created');
    expect(report.proposal).toMatchObject({
      reference: 'FIB/PROP/2026/0001',
      stage: 'DRAFT',
      id: ID,
    });
    expect(report.message).toMatch(
      /Proposal FIB\/PROP\/2026\/0001 was created .* verified by reading it back/,
    );
    expect(report.progress.every((step) => step.status === 'done')).toBe(true);
    expect(page.commands).toContainEqual({ op: 'create', action: 'Create proposal' });
    expect(page.commands).toContainEqual({ op: 'read-proposal', id: ID });
  });

  it('failure: the portal refuses (4xx) — reported with its message as not created', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.answer = 'refused';
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('creation-failed');
    expect(runner.current().message).toBe(
      'The portal refused the proposal (HTTP 400): Choose a client. Nothing was created.',
    );
    expect(runner.current().proposal).toBeNull();
  });

  it('failure: pressing the button sent no request (the permit expired unused)', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.answer = 'no-request';
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('failed');
    expect(runner.current().message).toMatch(/sent no creation request.*Nothing was created/);
  });

  it.each([
    ['server-error', /the portal answered HTTP 500/],
    ['network-error', /the connection failed during the request/],
    ['no-answer', /the portal did not answer in time/],
  ] as const)('uncertain: %s, and no matching proposal can be found', async (answer, why) => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.answer = answer;
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('uncertain');
    expect(runner.current().message).toMatch(why);
    expect(runner.current().message).toMatch(
      /Check the Proposals list in the portal before creating it again/,
    );
    expect(page.presses).toBe(1); // never retried
  });

  it('an unclear answer is resolved when exactly one matching new proposal is found', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.answer = 'created-no-navigation';
    page.recent = [
      proposal(),
      proposal({ id: 'b'.repeat(24), createdAt: new Date(T0 - 60 * 60_000).toISOString() }),
    ];
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('created');
    expect(runner.current().message).toMatch(/Found by looking it up/);
  });

  it('stays uncertain when several matching proposals could be this attempt’s', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.answer = 'network-error';
    page.recent = [proposal(), proposal({ id: 'c'.repeat(24) })];
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('uncertain');
    expect(runner.current().message).toMatch(/2 matching proposals/);
  });

  it('uncertain when the proposal reads back differently from what was reviewed', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.readBack = proposal({ policyEnd: '2027-12-31' });
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('uncertain');
    expect(runner.current().message).toMatch(/reads back differently \(policy end\)/);
  });

  it('uncertain when the new proposal cannot be read back', async () => {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.readBack = null;
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('uncertain');
    expect(runner.current().message).toMatch(/reading it back failed/);
  });
});

describe('the full workflow: required fields', () => {
  it('stops before the review when a required field is missing from the form', async () => {
    const form = formSnapshot();
    form.controls = form.controls.filter((control) => control.primary !== 'Quotes needed by');
    const page = new FullWorkflowPage([form]);
    const { runner } = await reviewed(page);
    expect(runner.current()).toMatchObject({ state: 'failed', review: null });
    expect(runner.current().message).toMatch(/Not filled: quotesNeededBy/);
    expect(page.armed).toBe(0);
    expect(page.presses).toBe(0);
  });
});

describe('the full workflow on the live portal (live verification)', () => {
  const LIVE = 'https://fiducial.spirezen.tech';

  function livePage(): FullWorkflowPage {
    const page = new FullWorkflowPage([formSnapshot()]);
    page.cookieNames = ['__Host-erp_session'];
    return page;
  }

  /** One app run (one runner) on the live portal, with the reviewed 'verification' setting. */
  function liveRunner(pages: FullWorkflowPage[]): PortalDemoRunner {
    let clock = 0;
    let tokens = 0;
    return new PortalDemoRunner({
      portalOrigin: LIVE,
      mode: decideMode({ PORTAL_AUTOMATION_FULL_WORKFLOW: '1' }, LIVE, 'verification'),
      openPage: () => pages.shift()!,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
      wallClock: () => T0,
      token: () => `review-${(tokens += 1)}`,
      creationTimeoutMs: 5000,
    });
  }

  it('names the live portal in the window and warns in the review that the record is real', async () => {
    const page = livePage();
    const runner = liveRunner([page]);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    const report = runner.current();
    expect(report.state).toBe('awaiting-confirmation');
    expect(report.environment).toMatchObject({
      kind: 'production',
      name: 'Fiducial portal (live)',
      verified: true,
    });
    expect(page.commands).toContainEqual({
      op: 'guard',
      banner: expect.stringMatching(/^LIVE PORTAL — Fiducial portal \(live\)/) as unknown,
    });
    expect(report.review?.warnings.join(' ')).toMatch(/real record on the live portal/);
    expect(page.armed).toBe(0);
  });

  it('creates and verifies one proposal, then refuses another in the same app run', async () => {
    const first = livePage();
    const second = livePage();
    const runner = liveRunner([first, second]);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('created');
    expect(first.armed).toBe(1);

    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current()).toMatchObject({ state: 'failed', review: null });
    expect(runner.current().message).toMatch(/one proposal per app run/);
    expect(second.armed).toBe(0);
    expect(second.presses).toBe(0);
  });

  it('counts a refused attempt too: no second try in the same app run', async () => {
    const first = livePage();
    first.answer = 'refused';
    const runner = liveRunner([first, livePage()]);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('creation-failed');
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current().message).toMatch(/one proposal per app run/);
  });

  it('stops before the review when the live address answers with a non-production session', async () => {
    const page = livePage();
    page.cookieNames = ['erp_session'];
    const runner = liveRunner([page]);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current()).toMatchObject({
      state: 'failed',
      review: null,
      environment: { verified: false },
    });
    expect(runner.current().message).toMatch(/non-production session cookie/);
    expect(page.armed).toBe(0);
  });

  it('with live creation off, never offers a review on the live portal', async () => {
    const page = livePage();
    const runner = new PortalDemoRunner({
      portalOrigin: LIVE,
      mode: decideMode({ PORTAL_AUTOMATION_FULL_WORKFLOW: '1' }, LIVE, 'off'),
      openPage: () => page,
      sleep: () => Promise.resolve(),
    });
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current()).toMatchObject({ mode: 'fill-only', state: 'done', review: null });
    expect(runner.confirm('review-1').ok).toBe(false);
    expect(page.armed).toBe(0);
    expect(page.presses).toBe(0);
  });
});
