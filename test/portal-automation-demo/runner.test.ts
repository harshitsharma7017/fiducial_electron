// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): a whole run against a scripted page.
// Sign-in, the line-of-business choice, filling, verification, skipping and stopping before the
// final action.
import { describe, expect, it } from 'vitest';
import { PortalDemoRunner } from '../../src/demo/portal-automation/main/runner';
import { SYNTHETIC_DEMO_PROPOSAL } from '../../src/demo/portal-automation/shared/demo-data';
import type { PageSnapshot } from '../../src/demo/portal-automation/shared/protocol';
import { FakePortalPage, formSnapshot, lineChoiceSnapshot, signInSnapshot } from './fixtures';

const ORIGIN = 'https://portal.example.test';

function runnerFor(page: FakePortalPage, options: { formTimeoutMs?: number } = {}) {
  let clock = 0;
  const runner = new PortalDemoRunner({
    portalOrigin: ORIGIN,
    openPage: () => page,
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
    ...options,
  });
  return runner;
}

const ALLOWED_OPS = new Set(['snapshot', 'guard', 'set', 'check', 'select-option', 'pick-client']);

describe('PortalDemoRunner', () => {
  it('waits for sign-in, chooses Property, fills and checks every mapped field, and stops', async () => {
    const page = new FakePortalPage([signInSnapshot(), signInSnapshot(), lineChoiceSnapshot()]);
    const runner = runnerFor(page);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    const report = runner.current();

    expect(report.state).toBe('done');
    expect(page.loads[0]).toBe(`${ORIGIN}/proposals/new`);
    expect(report.filled.map((field) => [field.key, field.value, field.verified])).toEqual([
      ['caseType', 'New business', true],
      ['insuredName', 'Deccan Cold Chain LLP', true],
      ['policyStart', '2026-12-01', true],
      ['policyEnd', '2027-11-30', true],
      ['quotesNeededBy', '2026-11-20', true],
    ]);
    expect(report.errors).toEqual([]);
    expect(report.skipped.map((field) => field.key)).toEqual(
      expect.arrayContaining(['assignedTo', 'contactEmail', 'risk.buildingSumInsured']),
    );
    expect(report.stoppedBefore).toBe('Create proposal');
    expect(report.message).toMatch(/Stopped before “Create proposal”.*Nothing was saved/);
    // The Property card was chosen to reach the form; the submit block was installed.
    expect(page.commands).toContainEqual({
      op: 'check',
      target: { primary: 'Property', kind: 'radio', name: 'line-of-business', value: 'PROPERTY' },
    });
    expect(page.commands).toContainEqual({ op: 'guard' });
  });

  it('never sends anything but reads, field fills and the guard: no final action', async () => {
    const page = new FakePortalPage([formSnapshot()]);
    const runner = runnerFor(page);
    await runner.start({ ...SYNTHETIC_DEMO_PROPOSAL, assignedTo: 'Demo Manager' });
    for (const command of page.commands) {
      expect(ALLOWED_OPS.has(command.op)).toBe(true);
      expect(JSON.stringify(command)).not.toMatch(/Create proposal|submit/i);
    }
    expect(runner.current().filled.map((field) => field.key)).toContain('assignedTo');
  });

  it('reports the waiting state while the user signs in', async () => {
    const page = new FakePortalPage([signInSnapshot()]);
    const runner = runnerFor(page);
    const run = runner.start(SYNTHETIC_DEMO_PROPOSAL);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runner.current().state).toBe('waiting-for-login');
    runner.cancel();
    await run;
    expect(runner.current()).toMatchObject({ state: 'cancelled', filled: [] });
  });

  it('skips the insured when the portal has no client of that exact name', async () => {
    const page = new FakePortalPage([formSnapshot()]);
    page.clients.clear();
    const runner = runnerFor(page);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    const report = runner.current();
    expect(report.state).toBe('done');
    expect(report.filled.map((field) => field.key)).not.toContain('insuredName');
    expect(report.skipped.find((field) => field.key === 'insuredName')?.reason).toMatch(
      /never creates clients/,
    );
  });

  it('reports a value the form did not keep as an error', async () => {
    const page = new FakePortalPage([formSnapshot()]);
    page.rejects.add('Policy period to');
    const runner = runnerFor(page);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    const report = runner.current();
    expect(report.filled.find((field) => field.key === 'policyEnd')?.verified).toBe(false);
    expect(report.errors).toEqual([
      {
        key: 'policyEnd',
        label: 'Policy period to',
        reason: 'Filled, but the form shows a different value.',
      },
    ]);
  });

  it('fills what is still there when the form has changed, and skips the rest', async () => {
    const changed: PageSnapshot = formSnapshot();
    changed.controls = changed.controls.filter((item) => item.primary !== 'Policy period to');
    const page = new FakePortalPage([changed]);
    const runner = runnerFor(page);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    const report = runner.current();
    expect(report.state).toBe('done');
    expect(report.filled.map((field) => field.key)).not.toContain('policyEnd');
    expect(report.skipped.find((field) => field.key === 'policyEnd')?.reason).toMatch(
      /not on the form/,
    );
  });

  it('stops without filling when the form never appears', async () => {
    const elsewhere: PageSnapshot = { ...lineChoiceSnapshot(), controls: [] };
    const page = new FakePortalPage([elsewhere]);
    const runner = runnerFor(page, { formTimeoutMs: 3000 });
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current()).toMatchObject({ state: 'failed', filled: [] });
    expect(runner.current().message).toMatch(/did not appear.*Nothing was filled or saved/);
    expect(page.commands.every((command) => command.op === 'snapshot')).toBe(true);
  });

  it('stops when the portal window is closed', async () => {
    const page = new FakePortalPage([signInSnapshot()]);
    page.closed = true;
    const runner = runnerFor(page);
    await runner.start(SYNTHETIC_DEMO_PROPOSAL);
    expect(runner.current().state).toBe('cancelled');
  });
});
