// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): reliable proposal creation. The real
// runner, the real attempt store and audit log on disk, and the real network guard policy, against
// a scripted portal (no real portal, nothing is created anywhere). A restart is simulated by
// opening the same folder again, as the next app start does, with a new runner and a new window.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: vi.fn(),
  session: { fromPartition: vi.fn() },
}));

import {
  AttemptStore,
  type CreationAttempt,
} from '../../src/demo/portal-automation/main/attempt-store';
import { readAuditLog, type AuditTrail } from '../../src/demo/portal-automation/main/audit-log';
import { openRecords } from '../../src/demo/portal-automation/main/register';
import { SYNTHETIC_DEMO_PROPOSAL } from '../../src/demo/portal-automation/shared/demo-data';
import {
  CLIENT_ID,
  formSnapshot,
  LOCATION_IDS,
  MANAGER_ID,
  OTHER_CLIENT_ID,
  TEST_GSTIN,
} from './fixtures';
import {
  FullWorkflowPage,
  ID,
  proposal,
  reviewed,
  runnerFor,
  settle,
  T0,
} from './workflow-fixtures';

function dataDir(): string {
  return join(mkdtempSync(join(tmpdir(), 'fqf-reliable-')), 'portal-automation');
}

const newPage = () => new FullWorkflowPage([formSnapshot()]);
const events = (dir: string) =>
  readAuditLog(join(dir, 'audit.jsonl')).map((record) => record.event);
const only = (store: AttemptStore): CreationAttempt => {
  const all = store.list();
  expect(all).toHaveLength(1);
  return all[0]!;
};

/** Reviews, confirms and lets the run go until it finishes or reaches a step that hangs. */
async function confirmed(page: FullWorkflowPage, records: ReturnType<typeof openRecords>) {
  const { runner } = await reviewed(page, records);
  expect(runner.current().state).toBe('awaiting-confirmation');
  expect(runner.confirm('review-1')).toEqual({ ok: true });
  await settle(runner);
  return runner;
}

/** A new app run on the same folder, after the app stopped (or crashed). */
function restart(dir: string) {
  return openRecords(dir);
}

describe('restarts: the store says where each attempt was, and nothing is resubmitted', () => {
  it('restart before approval: the reviewed attempt is cancelled; a new review is offered', async () => {
    const dir = dataDir();
    const { runner } = await reviewed(newPage(), openRecords(dir));
    expect(runner.current().state).toBe('awaiting-confirmation');

    const records = restart(dir);
    expect(only(records.store)).toMatchObject({ state: 'CANCELLED', submittedAt: null });
    expect(only(records.store).history.at(-1)).toMatchObject({ reason: 'app-restarted' });
    expect(readAuditLog(join(dir, 'audit.jsonl')).at(-1)).toMatchObject({
      event: 'recovery.restored',
      from: 'AWAITING_APPROVAL',
      state: 'CANCELLED',
    });
    const page = newPage();
    const next = await reviewed(page, records);
    expect(next.runner.current().state).toBe('awaiting-confirmation');
    expect(page.armed).toBe(0);
  });

  it('restart after approval (before submission): cancelled, never sent', async () => {
    const dir = dataDir();
    const page = newPage();
    const records = openRecords(dir);
    const { runner } = await reviewed(page, records);
    page.hang.add('snapshot'); // the app stops during the last check before submission
    expect(runner.confirm('review-1').ok).toBe(true);
    await settle(runner);
    expect(only(records.store).state).toBe('APPROVED');

    const after = restart(dir);
    expect(only(after.store)).toMatchObject({ state: 'CANCELLED', submittedAt: null });
    expect(page.armed).toBe(0);
    expect(page.sent).toHaveLength(0);
  });

  it('restart during submission: reconciliation required, and new creation is blocked', async () => {
    const dir = dataDir();
    const page = newPage();
    page.hang.add('create'); // the app stops while the button is being pressed
    await confirmed(page, openRecords(dir));

    const after = restart(dir);
    const attempt = only(after.store);
    expect(attempt).toMatchObject({ state: 'RECONCILIATION_REQUIRED' });
    expect(attempt.submittedAt).not.toBeNull();
    expect(events(dir)).toEqual([
      'attempt.created',
      'review.completed',
      'approval.granted',
      'submission.started',
      'recovery.restored',
    ]);

    // The next app run never offers a new creation while the outcome is unknown.
    const second = newPage();
    const next = await reviewed(second, after);
    expect(next.runner.current()).toMatchObject({ state: 'failed', review: null });
    expect(next.runner.current().message).toMatch(
      /1 earlier creation attempt\(s\) have an unknown outcome/,
    );
    expect(next.runner.current().attempts).toMatchObject([
      {
        id: attempt.id,
        state: 'RECONCILIATION_REQUIRED',
        unresolved: true,
        canMarkNotCreated: false,
      },
    ]);
    expect(second.armed).toBe(0);
  });

  it('restart during verification: reconciliation required; the look-up finds and verifies it', async () => {
    const dir = dataDir();
    const page = newPage();
    page.hang.add('read-proposal'); // the app stops while reading the new proposal back
    await confirmed(page, openRecords(dir));
    expect(page.sent).toHaveLength(1);

    const after = restart(dir);
    expect(only(after.store)).toMatchObject({
      state: 'RECONCILIATION_REQUIRED',
      result: { httpStatus: 201, proposalId: ID },
    });

    const second = newPage();
    second.recent = [proposal()];
    const { runner } = runnerFor(second, after);
    expect(runner.reconcile(only(after.store).id)).toEqual({ ok: true });
    await settle(runner);
    expect(runner.current().state).toBe('created');
    expect(only(after.store)).toMatchObject({
      state: 'CREATED',
      result: { proposalId: ID, reference: 'FIB/PROP/2026/0001', verification: 'complete' },
      reconciliation: { outcome: 'found' },
    });
    expect(second.armed).toBe(0); // reconciliation only reads
    expect(second.presses).toBe(0);
  });
});

describe('uncertain outcomes and reconciliation', () => {
  async function uncertain(dir = dataDir()) {
    const page = newPage();
    page.answer = 'no-answer';
    const records = openRecords(dir);
    const runner = await confirmed(page, records);
    expect(runner.current().state).toBe('uncertain');
    return { page, records, runner, dir, attempt: only(records.store) };
  }

  it('late server completion: found by a later look-up, never by resubmitting', async () => {
    const { page, records, runner, attempt } = await uncertain();
    expect(attempt).toMatchObject({ state: 'UNCERTAIN', result: { reason: 'timeout' } });
    expect(runner.current().message).toMatch(/no new proposal can be created until it is resolved/);

    // The portal finishes the request after the demo stopped waiting.
    page.recent = [proposal({ createdAt: new Date(T0 + 45_000).toISOString() })];
    expect(runner.reconcile(attempt.id)).toEqual({ ok: true });
    await settle(runner);
    expect(runner.current().state).toBe('created');
    expect(runner.current().message).toMatch(/Found by checking the portal/);
    expect(only(records.store).state).toBe('CREATED');
    expect(page.presses).toBe(1);
    expect(page.sent).toHaveLength(1);
  });

  it('blocks a new creation while an attempt is uncertain', async () => {
    const { page, runner } = await uncertain();
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current()).toMatchObject({ state: 'failed', review: null });
    expect(runner.current().message).toMatch(/unknown outcome/);
    expect(page.armed).toBe(1);
  });

  it('failed reconciliation: the attempt stays unresolved and cannot be dismissed', async () => {
    const { page, records, runner, attempt, dir } = await uncertain();
    page.proposalsUnavailable = true;
    runner.reconcile(attempt.id);
    await settle(runner);
    expect(runner.current().message).toMatch(/could not be checked/);
    expect(only(records.store)).toMatchObject({
      state: 'UNCERTAIN',
      reconciliation: { outcome: 'failed' },
    });
    expect(only(records.store).lastReconciledAt).not.toBeNull();
    expect(runner.markNotCreated(attempt.id).ok).toBe(false);
    expect(readAuditLog(join(dir, 'audit.jsonl')).at(-1)).toMatchObject({
      event: 'recovery.reconciled',
      outcome: 'failed',
    });
  });

  it('nothing found: the user may then mark it not created, and creation is offered again', async () => {
    const { records, runner, attempt, dir } = await uncertain();
    expect(runner.markNotCreated(attempt.id).ok).toBe(false); // not before a look-up
    runner.reconcile(attempt.id);
    await settle(runner);
    expect(runner.current().message).toMatch(/No proposal from this attempt was found/);
    expect(runner.current().attempts[0]).toMatchObject({
      reconciliation: 'none',
      canMarkNotCreated: true,
    });
    expect(runner.markNotCreated(attempt.id)).toEqual({ ok: true });
    expect(only(records.store)).toMatchObject({
      state: 'NOT_CREATED',
      result: { reason: 'user-resolved' },
    });
    expect(events(dir).slice(-2)).toEqual(['recovery.reconciled', 'recovery.resolved']);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current().state).toBe('awaiting-confirmation');
  });

  it('several matches: the user chooses the one this attempt created', async () => {
    const { page, records, runner, attempt } = await uncertain();
    const second = 'b'.repeat(24);
    page.recent = [proposal(), proposal({ id: second, reference: 'FIB/PROP/2026/0002' })];
    runner.reconcile(attempt.id);
    await settle(runner);
    expect(runner.current().message).toMatch(/2 proposals match this attempt/);
    expect(runner.adopt(attempt.id, 'f'.repeat(24)).ok).toBe(false);
    page.readBack = proposal({ id: second, reference: 'FIB/PROP/2026/0002' });
    expect(runner.adopt(attempt.id, second)).toEqual({ ok: true });
    await settle(runner);
    expect(only(records.store)).toMatchObject({
      state: 'CREATED',
      result: { proposalId: second, reference: 'FIB/PROP/2026/0002' },
    });
  });

  it('never claims a proposal another attempt already created', async () => {
    const { page, records, runner, attempt } = await uncertain();
    // The only matching proposal belongs to an earlier, created attempt.
    const earlier = records.store.create({
      portalOrigin: 'http://localhost:3100',
      type: 'NEW',
      clientId: CLIENT_ID,
      clientName: 'Deccan Cold Chain LLP',
      payload: attempt.payload,
    });
    for (const to of ['AWAITING_APPROVAL', 'APPROVED', 'SUBMITTING', 'VERIFYING'] as const) {
      records.store.transition(earlier.id, to);
    }
    records.store.transition(earlier.id, 'CREATED', { result: { proposalId: ID } });
    page.recent = [proposal()];
    runner.reconcile(attempt.id);
    await settle(runner);
    expect(records.store.get(attempt.id)).toMatchObject({
      state: 'UNCERTAIN',
      reconciliation: { outcome: 'none' },
    });
  });
});

describe('duplicate warnings', () => {
  it('lists an existing proposal for the same client and period; confirming needs an acknowledgement', async () => {
    const page = newPage();
    page.recent = [
      proposal({
        id: 'd'.repeat(24),
        reference: 'FIB/PROP/2026/0007',
        createdAt: '2026-10-01T09:00:00.000Z',
      }),
      // Same client, another period: not a duplicate.
      proposal({ id: 'e'.repeat(24), policyStart: '2025-12-01', policyEnd: '2026-11-30' }),
    ];
    const { runner } = await reviewed(page);
    const review = runner.current().review!;
    expect(review.duplicates).toEqual([
      {
        reference: 'FIB/PROP/2026/0007',
        stage: 'DRAFT',
        createdAt: '2026-10-01T09:00:00.000Z',
        source: 'portal',
      },
    ]);
    expect(review.warnings.join(' ')).toMatch(
      /1 proposal\(s\) for this client, case type and policy period already exist/,
    );
    expect(runner.confirm('review-1')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/may duplicate/) as unknown,
    });
    expect(page.armed).toBe(0);
    expect(runner.confirm('review-1', true)).toEqual({ ok: true });
    await settle(runner);
    expect(runner.current().state).toBe('created');
  });

  it('also lists a proposal created from this computer that the portal no longer lists', async () => {
    const records = openRecords(dataDir());
    await confirmed(newPage(), records);
    expect(only(records.store).state).toBe('CREATED');
    const { runner } = await reviewed(newPage(), records);
    expect(runner.current().review!.duplicates).toMatchObject([
      { reference: 'FIB/PROP/2026/0001', source: 'this computer' },
    ]);
  });

  it('offers no creation when the client’s proposals cannot be read', async () => {
    const page = newPage();
    page.proposalsUnavailable = true;
    const { runner } = await reviewed(page);
    expect(runner.current()).toMatchObject({ state: 'failed', review: null });
    expect(runner.current().message).toMatch(/a duplicate cannot be ruled out/);
  });
});

describe('the outgoing request is checked against the review', () => {
  it.each([
    ['policy end', { policyEnd: '2027-12-31' }, ['policyEnd']],
    ['an extra field', { existingPolicy: null }, ['unexpected field']],
    ['another assignee', { ownerId: MANAGER_ID }, ['ownerId']],
    ['fewer risk locations', { locationIds: [LOCATION_IDS['City office']] }, ['locationIds']],
  ])(
    'a request with %s is stopped before it leaves; nothing is created',
    async (_name, tamper, fields) => {
      const dir = dataDir();
      const records = openRecords(dir);
      const page = newPage();
      const { runner } = await reviewed(page, records);
      page.tamper = tamper;
      runner.confirm('review-1');
      await settle(runner);
      expect(runner.current().state).toBe('creation-failed');
      expect(runner.current().message).toMatch(
        /did not match the reviewed proposal .* stopped before it reached the portal/,
      );
      expect(page.sent).toHaveLength(0);
      expect(only(records.store)).toMatchObject({
        state: 'REFUSED',
        result: { refusedBy: 'guard', reason: 'body-mismatch' },
      });
      expect(readAuditLog(join(dir, 'audit.jsonl')).at(-1)).toMatchObject({
        event: 'submission.refused',
        fields,
      });
    },
  );

  it('a request that is not JSON is stopped before it leaves', async () => {
    const page = newPage();
    const { runner } = await reviewed(page);
    page.contentType = 'text/plain';
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('creation-failed');
    expect(page.sent).toHaveLength(0);
  });
});

describe('the client is identified by its id', () => {
  it('an incorrect client id in the outgoing request is stopped', async () => {
    const records = openRecords(dataDir());
    const page = newPage();
    const { runner } = await reviewed(page, records);
    expect(runner.current().review).toMatchObject({ clientId: CLIENT_ID, clientGstin: TEST_GSTIN });
    page.tamper = { clientId: OTHER_CLIENT_ID };
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().message).toMatch(/did not match the reviewed proposal \(client\)/);
    expect(page.sent).toHaveLength(0);
  });

  it('two clients with exactly the insured’s name: no review', async () => {
    const page = newPage();
    page.clientMaster.push({ id: OTHER_CLIENT_ID, name: 'Deccan Cold Chain LLP', gstin: null });
    const { runner } = await reviewed(page);
    expect(runner.current()).toMatchObject({ state: 'failed', review: null });
    expect(runner.current().message).toMatch(/2 clients in the portal are named exactly/);
  });

  it('a GSTIN on the form that differs from the client master: no review', async () => {
    const page = newPage();
    page.formGstin = '27AAAAA0000A1Z5';
    const { runner } = await reviewed(page);
    expect(runner.current().message).toMatch(/GSTIN .* differs from the client master/);
    expect(page.armed).toBe(0);
  });

  it('a GSTIN the form does not show readably is a warning in the review, not a match', async () => {
    const page = newPage();
    page.formGstin = undefined;
    const { runner } = await reviewed(page);
    expect(runner.current().review!.warnings.join(' ')).toMatch(
      /GSTIN on the form could not be read/,
    );
  });

  it('a created proposal for another client id reads back as a mismatch', async () => {
    const page = newPage();
    page.readBack = proposal({ clientId: OTHER_CLIENT_ID });
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('uncertain');
    expect(runner.current().message).toMatch(/reads back differently \(client\)/);
  });
});

describe('complete read-back', () => {
  it('verifies the client id, type, dates, assignee and risk locations', async () => {
    const page = newPage();
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('created');
    expect(runner.current().verification?.map((check) => [check.field, check.status])).toEqual([
      ['type', 'verified'],
      ['clientId', 'verified'],
      ['locationIds', 'verified'],
      ['ownerId', 'verified'],
      ['policyStart', 'verified'],
      ['policyEnd', 'verified'],
      ['dueDate', 'verified'],
    ]);
  });

  it('a different assignee or set of locations is a mismatch', async () => {
    const page = newPage();
    page.readBack = proposal({ ownerId: MANAGER_ID, locationIds: [LOCATION_IDS['City office']!] });
    const { runner } = await reviewed(page);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().message).toMatch(
      /reads back differently \(risk locations, assigned to\)/,
    );
  });

  it('a field the record does not show is reported as unverified, not as a full success', async () => {
    const records = openRecords(dataDir());
    const page = newPage();
    page.readBack = proposal({ locationIds: null });
    const { runner } = await reviewed(page, records);
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().state).toBe('created-unverified');
    expect(runner.current().message).toMatch(
      /Not verified, because the portal’s record did not show them: risk locations/,
    );
    expect(only(records.store).result.verification).toBe('partial');
  });
});

describe('the persistent audit trail', () => {
  it('records each step of a creation, with identifiers and codes only', async () => {
    const dir = dataDir();
    const runner = await confirmed(newPage(), openRecords(dir));
    expect(runner.current().state).toBe('created');
    const records = readAuditLog(join(dir, 'audit.jsonl'));
    expect(records.map((record) => record.event)).toEqual([
      'attempt.created',
      'review.completed',
      'approval.granted',
      'submission.started',
      'submission.accepted',
      'verification.completed',
    ]);
    const attemptId = records[0]!['attemptId'];
    expect(records.every((record) => record['attemptId'] === attemptId && record.v === 1)).toBe(
      true,
    );
    expect(records.at(-1)).toMatchObject({
      proposalId: ID,
      reference: 'FIB/PROP/2026/0001',
      verification: 'complete',
      fields: [],
    });
    const text = readFileSync(join(dir, 'audit.jsonl'), 'utf8');
    for (const forbidden of [
      'Deccan',
      'Demo Admin',
      'erp_session',
      SYNTHETIC_DEMO_PROPOSAL.policyStart,
      SYNTHETIC_DEMO_PROPOSAL.contactEmail,
      'droppedFields',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('records a cancelled review and a portal refusal', async () => {
    const dir = dataDir();
    const first = await reviewed(newPage(), openRecords(dir));
    first.runner.cancel();
    const page = newPage();
    page.answer = 'refused';
    await confirmed(page, openRecords(dir));
    expect(events(dir)).toEqual([
      'attempt.created',
      'review.completed',
      'attempt.cancelled',
      'attempt.created',
      'review.completed',
      'approval.granted',
      'submission.started',
      'submission.refused',
    ]);
    expect(readAuditLog(join(dir, 'audit.jsonl')).at(-1)).toMatchObject({
      httpStatus: 400,
      reason: 'portal-refused',
    });
  });

  it('sends nothing when the audit log cannot record the submission', async () => {
    const store = new AttemptStore({ file: null });
    const audit: AuditTrail = { record: (event) => event !== 'submission.started' };
    const page = newPage();
    const { runner } = await reviewed(page, { store, audit });
    runner.confirm('review-1');
    await settle(runner);
    expect(runner.current().message).toMatch(/audit log could not be written, so nothing was sent/);
    expect(only(store)).toMatchObject({
      state: 'NOT_CREATED',
      result: { reason: 'audit-unavailable' },
    });
    expect(page.armed).toBe(0);
  });

  it('sends nothing when the approval cannot be recorded on disk', async () => {
    const store = new AttemptStore({ file: null });
    const page = newPage();
    const { runner } = await reviewed(page, { store });
    vi.spyOn(store, 'transition').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    expect(runner.confirm('review-1')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/approval could not be recorded/) as unknown,
    });
    expect(page.armed).toBe(0);
    expect(only(store).state).toBe('AWAITING_APPROVAL');
  });
});
