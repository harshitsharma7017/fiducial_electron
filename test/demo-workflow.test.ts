// Development-only demo workflow (src/renderer/src/dev/workflow/): census validation, quote
// request validation, the simulated insurer adapters, the job state machine with timeouts,
// cancellation and retries, normalisation and comparison through the real M3 engine, activity
// events and report consistency. Every value is synthetic; fake timers make runs deterministic.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareQuotes } from '../src/shared/comparison/compare';
import { adapterMetadataSchema } from '../src/shared/contracts/adapter';
import { comparisonResultSchema } from '../src/shared/contracts/comparison';
import { progressEventSchema } from '../src/shared/contracts/status';
import {
  SUPPLIED_DEMO_CENSUS_CSV,
  loadCensusCsv,
  normaliseRelationship,
  rowStatus,
  summariseCensus,
  validateCensus,
} from '../src/renderer/src/dev/workflow/census';
import { AbortedError, type Timers } from '../src/renderer/src/dev/workflow/clock';
import { parseCsv } from '../src/renderer/src/dev/workflow/csv';
import {
  type DemoWorkflow,
  type QuoteRequestForm,
  createDemoWorkflow,
  latestAttempt,
  missingFields,
} from '../src/renderer/src/dev/workflow/engine';
import {
  attemptLabel,
  buildReportModel,
  buildResultRows,
  dashboardMetrics,
  filterAndSortRows,
  latestComparison,
  stepPosition,
} from '../src/renderer/src/dev/workflow/selectors';
import {
  DEMO_SIMULATORS,
  SIMULATOR_NOTICE,
  type SimulatorAdapter,
  syntheticBaseRupees,
} from '../src/renderer/src/dev/workflow/simulators';
import {
  SEEDED_CLIENT_ID,
  createInMemoryStore,
  seedState,
} from '../src/renderer/src/dev/workflow/store';
import type { DemoState } from '../src/renderer/src/dev/workflow/types';
import { rupees } from '../src/shared/money';

const START = '2026-10-28T09:00:00.000Z';
const timers: Timers = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
const clock = { now: () => new Date().toISOString() };

let workflow: DemoWorkflow;
const state = (): DemoState => workflow.store.read();

function makeWorkflow(
  adapters: readonly SimulatorAdapter[] = DEMO_SIMULATORS,
  config = {},
): DemoWorkflow {
  return createDemoWorkflow({
    store: createInMemoryStore(seedState(clock.now())),
    clock,
    timers,
    adapters,
    config,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START));
  workflow = makeWorkflow();
});
afterEach(() => {
  workflow.dispose();
  vi.useRealTimers();
});

/** Loads the supplied census and imports the rows that are ready. */
function importSupplied(): void {
  expect(workflow.loadSuppliedCensus(SEEDED_CLIENT_ID).ok).toBe(true);
  expect(workflow.importCensus(SEEDED_CLIENT_ID).ok).toBe(true);
}

function familyForm(
  employeeId: string,
  overrides: Partial<QuoteRequestForm> = {},
): QuoteRequestForm {
  const s = state();
  const employee = s.employees.find((e) => e.employeeId === employeeId)!;
  return {
    clientId: SEEDED_CLIENT_ID,
    employeeId,
    memberIds: s.members.filter((m) => m.employeeId === employeeId).map((m) => m.id),
    coverType: 'floater',
    sumInsuredRupees: '5,00,000',
    tenureYears: 1,
    pincode: employee.pincode,
    insurerIds: DEMO_SIMULATORS.map((a) => a.id),
    ...overrides,
  };
}

const jobFor = (requestId: string, letter: string) =>
  state().jobs.find((j) => j.quoteRequestId === requestId && j.insurerId === `demo-sim-${letter}`)!;

// ---------------------------------------------------------------------------------------------

describe('CSV parsing', () => {
  it('handles quotes, escaped quotes, commas inside quotes and CRLF', () => {
    const parsed = parseCsv('a,b,c\r\n"x, y","say ""hi""",3\r\n\r\nz,,9\n');
    expect(parsed).toEqual({
      ok: true,
      records: [
        { line: 1, cells: ['a', 'b', 'c'] },
        { line: 2, cells: ['x, y', 'say "hi"', '3'] },
        { line: 4, cells: ['z', '', '9'] },
      ],
    });
  });

  it('reports an unclosed quote and rejects oversized input', () => {
    expect(parseCsv('a,b\n"open,1\n')).toEqual({
      ok: false,
      error: expect.stringContaining('line 2') as string,
    });
    expect(parseCsv('x'.repeat(200_001)).ok).toBe(false);
  });

  it('requires the census columns and at least one row', () => {
    expect(loadCensusCsv('employee_id,age\nEMP-001,3', 1)).toEqual({
      ok: false,
      error: 'Required column missing: relationship.',
    });
    expect(loadCensusCsv('employee_id,relationship,age\n', 1).ok).toBe(false);
    const reordered = loadCensusCsv('age,relationship,employee_id,extra\n34,Self,EMP-001,x', 1);
    expect(reordered.ok && reordered.rows[0]!.values).toEqual({
      employee_id: 'EMP-001',
      relationship: 'Self',
      age: '34',
      name: '',
      email: '',
      pincode: '',
    });
  });
});

describe('census validation (supplied synthetic census)', () => {
  const loaded = loadCensusCsv(SUPPLIED_DEMO_CENSUS_CSV, 1);
  if (!loaded.ok) throw new Error('supplied census did not load');
  const rows = loaded.rows;
  const issues = validateCensus(rows);
  const codesAt = (line: number) =>
    issues.get(rows.find((r) => r.line === line)!.id)!.map((i) => i.code);

  it('has about fifty synthetic people with example.com addresses only', () => {
    expect(rows).toHaveLength(52);
    const emails = rows.map((r) => r.values.email).filter(Boolean);
    expect(emails.length).toBeGreaterThan(10);
    for (const e of emails) expect(e).toMatch(/@example(\.com)?$/);
  });

  it('flags each deliberate error on its own line', () => {
    expect(codesAt(17)).toEqual(['INVALID_FORMAT']); // pincode 11001
    expect(codesAt(20)).toEqual(['REQUIRED']); // employee name missing
    expect(codesAt(22)).toEqual(['INVALID_FORMAT']); // e-mail without suffix
    expect(codesAt(27)).toEqual(['UNSUPPORTED_VALUE']); // sister
    expect(codesAt(32)).toEqual(['INVALID_FORMAT']); // age 1O
    expect(codesAt(39)).toEqual(['POSSIBLE_DUPLICATE']);
    expect(codesAt(40)).toEqual(['POSSIBLE_DUPLICATE']);
    expect(codesAt(52)).toEqual(['NO_EMPLOYEE_ROW']);
    expect(codesAt(14)).toEqual(['POSSIBLE_DUPLICATE']); // twins
    // Dependants of an employee whose own row has errors wait for it.
    expect(codesAt(18)).toEqual(['EMPLOYEE_ROW_INVALID']);
    expect(codesAt(21)).toEqual(['EMPLOYEE_ROW_INVALID']);
    // A dependant's name is accepted but not stored.
    expect(issues.get(rows.find((r) => r.line === 8)!.id)!).toEqual([
      expect.objectContaining({ code: 'NOT_STORED', blocking: false }),
    ]);
    // Age 82 is within the contract bounds; the quote validator applies the age rule.
    expect(codesAt(53)).toEqual([]);
  });

  it('summarises what is ready and what is blocked', () => {
    expect(
      summariseCensus({
        clientId: 'x',
        source: 'supplied-demo',
        loadedAt: START,
        rows,
        fileIssues: [],
      }),
    ).toEqual({
      total: 52,
      ready: 37,
      blocked: 15,
      imported: 0,
      excluded: 0,
      warnings: 1,
    });
  });

  it('normalises relationship spellings to the contract list', () => {
    expect(normaliseRelationship('Father-in-law')).toBe('father_in_law');
    expect(normaliseRelationship(' MOTHER IN LAW ')).toBe('mother_in_law');
    expect(normaliseRelationship('sister')).toBeNull();
  });
});

describe('census correction and import', () => {
  const rowAt = (line: number) => state().census[0]!.rows.find((r) => r.line === line)!;

  it('imports ready rows, then corrected rows, without duplicating anyone', () => {
    importSupplied();
    expect(state().members).toHaveLength(37);
    expect(state().employees.map((e) => e.employeeId)).not.toContain('EMP-005');

    // Correct the five-digit pincode: the employee and both dependants become ready.
    expect(
      workflow.correctCensusRow(SEEDED_CLIENT_ID, rowAt(17).id, { pincode: '110011' }),
    ).toEqual({ ok: true, value: ['pincode'] });
    const result = workflow.importCensus(SEEDED_CLIENT_ID);
    expect(result).toEqual({ ok: true, value: { members: 3, employees: 1 } });
    expect(state().members).toHaveLength(40);
    expect(workflow.importCensus(SEEDED_CLIENT_ID)).toEqual({
      ok: false,
      error: 'No row is ready to import.',
    });
    // Imported rows are locked.
    expect(
      workflow.correctCensusRow(SEEDED_CLIENT_ID, rowAt(17).id, { pincode: '110012' }).ok,
    ).toBe(false);
  });

  it('resolves duplicates by exclusion or by confirming twins', () => {
    workflow.loadSuppliedCensus(SEEDED_CLIENT_ID);
    workflow.setCensusRowExcluded(SEEDED_CLIENT_ID, rowAt(40).id, true);
    workflow.confirmNotDuplicate(SEEDED_CLIENT_ID, rowAt(15).id);
    const issues = validateCensus(state().census[0]!.rows);
    for (const line of [14, 15, 39])
      expect(rowStatus(rowAt(line), issues.get(rowAt(line).id)!)).toBe('ready');
    expect(rowStatus(rowAt(40), issues.get(rowAt(40).id)!)).toBe('excluded');
  });

  it('never stores dependant names, and members carry relationship and age only', () => {
    importSupplied();
    const text = JSON.stringify(state().members);
    expect(text).not.toContain('Ramesh');
    expect(Object.keys(state().members[0]!).sort()).toEqual([
      'age',
      'clientId',
      'employeeId',
      'id',
      'importedAt',
      'relationship',
      'sourceLine',
    ]);
  });

  it('replacing the census replaces only that client’s imported members', () => {
    importSupplied();
    const other = workflow.createClient({
      name: 'Second Synthetic Client',
      email: 'office@example.com',
    });
    expect(other.ok).toBe(true);
    workflow.loadCensusText(
      other.ok ? other.value.id : '',
      'employee_id,relationship,age,name,email,pincode\nEMP-100,self,40,Test Person,,110001',
    );
    workflow.importCensus(other.ok ? other.value.id : '');
    workflow.loadSuppliedCensus(SEEDED_CLIENT_ID);
    expect(state().members.filter((m) => m.clientId === SEEDED_CLIENT_ID)).toHaveLength(0);
    expect(state().members.filter((m) => m.clientId !== SEEDED_CLIENT_ID)).toHaveLength(1);
  });

  it('validates new clients', () => {
    expect(workflow.createClient({ name: '   ' }).ok).toBe(false);
    expect(workflow.createClient({ name: 'Valid Name', email: 'not-an-email' }).ok).toBe(false);
  });
});

describe('quote request validation (existing validateQuoteDraft and preflight)', () => {
  beforeEach(importSupplied);

  it('accepts a valid family request and pre-flights every simulator', () => {
    const review = workflow.review(familyForm('EMP-001'));
    expect(review.ready).toBe(true);
    expect(review.draft?.ok && review.draft.value.request.members).toEqual([
      { relationship: 'self', age: 34 },
      { relationship: 'spouse', age: 31 },
      { relationship: 'son', age: 6 },
      { relationship: 'daughter', age: 3 },
    ]);
    expect(review.preflight.every((p) => p.ready)).toBe(true);
  });

  it('rejects a request the placeholder input rules do not allow', () => {
    const review = workflow.review(familyForm('EMP-016'));
    expect(review.ready).toBe(false);
    expect(review.draft?.ok === false && review.draft.issues).toEqual([
      { path: 'request.members.2.age', code: 'AGE_ABOVE_MAXIMUM' },
    ]);
    expect(workflow.createQuoteRequest(familyForm('EMP-016')).ok).toBe(false);
    expect(state().jobs).toHaveLength(0);
  });

  it('reports form problems, a bad sum insured and a single-member floater', () => {
    expect(
      workflow.review(familyForm('EMP-001', { memberIds: [], insurerIds: [] })).formIssues,
    ).toEqual(['Select at least one member.', 'Select at least one simulator.']);
    expect(
      workflow.review(familyForm('EMP-001', { sumInsuredRupees: 'five lakh' })).formIssues,
    ).toContain('Enter the sum insured in rupees, for example 5,00,000.');
    const single = workflow.review(familyForm('EMP-003'));
    expect(single.draft?.ok === false && single.draft.issues.map((i) => i.code)).toEqual([
      'FLOATER_TOO_FEW_MEMBERS',
    ]);
    expect(workflow.review(familyForm('EMP-003', { coverType: 'individual' })).ready).toBe(true);
  });

  it('blocks only the simulator whose required field is missing', () => {
    // EMP-009 has no e-mail; simulator C requires one.
    const review = workflow.review(familyForm('EMP-009'));
    expect(review.ready).toBe(true);
    expect(review.preflight.map((p) => [p.insurerId, p.ready])).toEqual([
      ['demo-sim-a', true],
      ['demo-sim-b', true],
      ['demo-sim-c', false],
      ['demo-sim-d', true],
    ]);
  });
});

describe('simulated insurer adapters', () => {
  it('satisfy the adapter metadata contract and never declare an origin', () => {
    expect(DEMO_SIMULATORS).toHaveLength(4);
    for (const a of DEMO_SIMULATORS) {
      const { id, displayName, version, mode, allowedOrigins, requiredFields } = a;
      expect(
        adapterMetadataSchema.parse({
          id,
          displayName,
          version,
          mode,
          allowedOrigins,
          requiredFields,
        }),
      ).toBeTruthy();
      expect(allowedOrigins).toEqual([]);
      expect(a.simulated).toBe(true);
      expect(displayName).toMatch(/^Demo Insurer [A-D] \(simulator\)$/);
    }
  });

  it('price deterministically with an invented formula', () => {
    const request = {
      members: [
        { relationship: 'self' as const, age: 34 },
        { relationship: 'spouse' as const, age: 31 },
      ],
      coverType: 'floater' as const,
      sumInsuredPaise: rupees(5_00_000),
      tenureYears: 1,
      pincode: '110001',
    };
    expect(syntheticBaseRupees(request, 100)).toBe(4_800 + 2_880);
    expect(syntheticBaseRupees(request, 100)).toBe(syntheticBaseRupees(request, 100));
    expect(syntheticBaseRupees({ ...request, tenureYears: 2 }, 100)).toBe(2 * (4_800 + 2_880));
  });

  it('label every response as simulated, and parse a malformed one as a parse failure', () => {
    const a = DEMO_SIMULATORS[0]!;
    expect(a.parseAt({ kind: 'json', content: '{not json' }, START)).toEqual({
      resultId: 'pending',
      insurerId: 'demo-sim-a',
      status: 'failed',
      source: 'automated',
      retrievedAt: START,
      errorCode: 'PARSE_FAILED',
    });
    expect(SIMULATOR_NOTICE).toMatch(/^DEMO SIMULATOR/);
  });
});

describe('job state machine, normalisation and comparison', () => {
  beforeEach(importSupplied);

  it('runs four simulators with bounded concurrency through every step', async () => {
    const created = workflow.createQuoteRequest(familyForm('EMP-001'));
    expect(created.ok).toBe(true);
    const id = created.ok ? created.value.id : '';
    // Three slots: A, B and C start; D waits in the queue.
    expect(state().jobs.map((j) => latestAttempt(j).status)).toEqual([
      'running',
      'running',
      'running',
      'pending',
    ]);
    expect(attemptLabel(latestAttempt(jobFor(id, 'd')))).toEqual({
      label: 'QUEUED',
      tone: 'neutral',
    });
    expect(stepPosition(latestAttempt(jobFor(id, 'a')))).toBe('Step 2 of 6');

    await vi.advanceTimersByTimeAsync(2_250);
    expect(latestAttempt(jobFor(id, 'a')).status).toBe('completed');
    expect(latestAttempt(jobFor(id, 'd')).status).toBe('running'); // took A's slot

    await vi.advanceTimersByTimeAsync(10_000);
    const a = latestAttempt(jobFor(id, 'a'));
    expect(a.events.map((e) => [e.status, e.progressStep ?? null])).toEqual([
      ['pending', 'queued'],
      ['running', 'validating'],
      ['running', 'preparing'],
      ['running', 'submitting-simulated'],
      ['running', 'awaiting-response'],
      ['running', 'normalizing'],
      ['completed', null],
    ]);
    for (const e of a.events) expect(progressEventSchema.safeParse(e).success).toBe(true);
    expect(a.simulatedPayload).toContain(SIMULATOR_NOTICE);
    expect(a.normalized?.premium).toEqual({
      totalPaise: rupees(11_810),
      basePaise: rupees(10_560),
      gstPaise: rupees(1_250),
      basis: 'incl_gst',
    });
    expect(a.validityFindings).toEqual([]);
    expect(a.missingFields).toEqual([]);

    const b = latestAttempt(jobFor(id, 'b'));
    expect(b).toMatchObject({
      status: 'timed_out',
      errorCode: 'NAVIGATION_TIMEOUT',
      simulatedPayload: null,
      resultInput: null,
    });

    const c = latestAttempt(jobFor(id, 'c'));
    expect(c.status).toBe('completed');
    expect(c.validityFindings.map((f) => f.code)).toEqual(['REVIEW_REQUIRED']);
    expect(c.missingFields).toEqual(['Room rent']);

    const d = latestAttempt(jobFor(id, 'd'));
    expect(d.status).toBe('completed');
    expect(d.validityFindings.map((f) => f.code)).toEqual(['PREMIUM_UNPARSEABLE']);
    expect(d.normalized?.premium.totalPaise).toBeNull(); // never zero
    expect(d.missingFields).toEqual(
      expect.arrayContaining([
        'Total premium',
        'Sum insured',
        'Policy tenure',
        'Covered members',
        'GST basis',
      ]),
    );

    // All four finished: the comparison was generated automatically by the real engine.
    const snapshot = latestComparison(state(), id)!;
    expect(comparisonResultSchema.parse(snapshot.result)).toBeTruthy();
    expect(snapshot.result).toEqual(
      (
        compareQuotes(
          state().quoteRequests[0]!.draft.request,
          snapshot.inputs.map((i) => i.result),
        ) as { value: unknown }
      ).value,
    );
    expect(snapshot.result.comparable.map((x) => x.insurerId)).toEqual(['demo-sim-a']);
    expect(snapshot.result.noHighlightReason).toBe('TOO_FEW_COMPARABLE');
    expect(
      snapshot.result.excluded.map((x) => [x.insurerId, x.findings.map((f) => f.code)]),
    ).toEqual([
      ['demo-sim-b', ['STATUS_NOT_COMPLETED']],
      ['demo-sim-c', ['REVIEW_REQUIRED']],
      ['demo-sim-d', ['PREMIUM_UNPARSEABLE']],
    ]);
  });

  it('retries a timed-out job as a new attempt, keeps the history, and re-compares', async () => {
    const created = workflow.createQuoteRequest(familyForm('EMP-001'));
    const id = created.ok ? created.value.id : '';
    await vi.advanceTimersByTimeAsync(10_000);
    const jobId = jobFor(id, 'b').id;
    expect(workflow.retryJob(jobFor(id, 'a').id)).toEqual({
      ok: false,
      error: 'Only a failed, timed-out or cancelled job can be retried.',
    });
    expect(workflow.retryJob(jobId)).toEqual({ ok: true, value: 2 });
    // A slot is free, so the new attempt is queued and started at once.
    expect(jobFor(id, 'b').attempts.map((x) => x.status)).toEqual(['timed_out', 'running']);
    expect(jobFor(id, 'b').attempts[1]!.events.map((e) => e.progressStep)).toEqual([
      'queued',
      'validating',
    ]);

    await vi.advanceTimersByTimeAsync(10_000);
    const job = jobFor(id, 'b');
    expect(job.attempts.map((x) => x.status)).toEqual(['timed_out', 'completed']);
    expect(job.attempts[0]!.events.at(-1)).toMatchObject({
      status: 'timed_out',
      errorCode: 'NAVIGATION_TIMEOUT',
      runId: `${jobId}-a1`,
    });
    expect(job.attempts[1]!.resultInput?.resultId).toBe(`${jobId}-a2`);

    // Two comparisons now: the new one uses attempt 2 and highlights B, the lower comparable premium.
    expect(state().comparisons).toHaveLength(2);
    const snapshot = latestComparison(state(), id)!;
    expect(snapshot.inputs.find((i) => i.jobId === jobId)?.attempt).toBe(2);
    expect(snapshot.result.cheapest).toMatchObject({
      resultIds: [`${jobId}-a2`],
      totalPremiumPaise: rupees(11_106),
      tie: false,
    });
    // C quoted less (₹9,504) but is flagged for review, so it is not the highlight.
    const c = latestAttempt(jobFor(id, 'c'));
    expect(c.normalized?.premium.totalPaise).toBe(rupees(9_504));
    expect(snapshot.result.excluded.map((x) => x.insurerId)).toEqual(['demo-sim-c', 'demo-sim-d']);
  });

  it('cancels running and queued jobs, ignores late responses, and allows a retry', async () => {
    const created = workflow.createQuoteRequest(familyForm('EMP-001'));
    const id = created.ok ? created.value.id : '';
    // D is still queued: cancel it first, before A's slot frees and D would start.
    expect(workflow.cancelJob(jobFor(id, 'd').id)).toEqual({ ok: true, value: null });
    expect(latestAttempt(jobFor(id, 'd'))).toMatchObject({ status: 'cancelled', startedAt: null });
    expect(workflow.cancelJob(jobFor(id, 'a').id)).toEqual({ ok: true, value: null });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(latestAttempt(jobFor(id, 'a'))).toMatchObject({
      status: 'cancelled',
      errorCode: 'CANCELLED',
      normalized: null,
    });
    expect(workflow.cancelJob(jobFor(id, 'a').id).ok).toBe(false);
    expect(workflow.retryJob(jobFor(id, 'a').id).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(jobFor(id, 'a').attempts.map((x) => x.status)).toEqual(['cancelled', 'completed']);
  });

  it('limits attempts per job', () => {
    workflow.dispose();
    workflow = makeWorkflow(DEMO_SIMULATORS, { maxAttemptsPerJob: 2 });
    importSupplied();
    const created = workflow.createQuoteRequest(
      familyForm('EMP-001', { insurerIds: ['demo-sim-a'] }),
    );
    const jobId = created.ok ? state().jobs[0]!.id : '';
    workflow.cancelJob(jobId);
    expect(workflow.retryJob(jobId).ok).toBe(true);
    workflow.cancelJob(jobId);
    expect(workflow.retryJob(jobId)).toEqual({
      ok: false,
      error: 'This demo allows at most 2 attempts per job.',
    });
  });

  it('keeps concurrent results apart', async () => {
    const first = workflow.createQuoteRequest(familyForm('EMP-001'));
    const second = workflow.createQuoteRequest(
      familyForm('EMP-002', { insurerIds: ['demo-sim-a', 'demo-sim-b'] }),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    for (const job of state().jobs) {
      for (const attempt of job.attempts) {
        if (!attempt.resultInput) continue;
        expect(attempt.resultInput.resultId).toBe(`${job.id}-a${attempt.number}`);
        expect(attempt.resultInput.insurerId).toBe(job.insurerId);
        for (const e of attempt.events) expect(e.runId).toBe(`${job.id}-a${attempt.number}`);
      }
    }
    const members = (requestId: string) => {
      const job = state().jobs.find(
        (j) => j.quoteRequestId === requestId && j.insurerId === 'demo-sim-a',
      )!;
      return latestAttempt(job).normalized?.members?.length;
    };
    expect(members(first.ok ? first.value.id : '')).toBe(4);
    expect(members(second.ok ? second.value.id : '')).toBe(5);
  });

  it('fails an attempt whose response does not match the result contract', async () => {
    workflow.dispose();
    const broken: SimulatorAdapter = {
      ...DEMO_SIMULATORS[0]!,
      id: 'demo-sim-x',
      displayName: 'Demo Insurer X (simulator)',
      fetchSnapshot: async (ctx) => {
        await ctx.delay(10);
        return {
          kind: 'json',
          content: JSON.stringify({
            status: 'QUOTED',
            currency: 'RUPEES',
            cover: { insured: [{ relation: 'SISTER', age: 30 }] },
          }),
        };
      },
    };
    workflow = makeWorkflow([broken, DEMO_SIMULATORS[0]!]);
    importSupplied();
    const created = workflow.createQuoteRequest(
      familyForm('EMP-001', { insurerIds: ['demo-sim-x', 'demo-sim-a'] }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const job = state().jobs.find((j) => j.insurerId === 'demo-sim-x')!;
    const attempt = latestAttempt(job);
    expect(attempt).toMatchObject({
      status: 'failed',
      errorCode: 'PARSE_FAILED',
      normalized: null,
    });
    expect(attempt.normalizationIssues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['currency', 'coverage.members.0.relationship']),
    );
    // The engine itself reports the record as malformed; nothing is fabricated for it.
    const snapshot = latestComparison(state(), created.ok ? created.value.id : '')!;
    expect(snapshot.result.excluded[0]!.findings.every((f) => f.code === 'MALFORMED_RESULT')).toBe(
      true,
    );
  });

  it('fails a simulator that throws, without affecting the others', async () => {
    workflow.dispose();
    const crashing: SimulatorAdapter = {
      ...DEMO_SIMULATORS[0]!,
      id: 'demo-sim-y',
      displayName: 'Demo Insurer Y (simulator)',
      fetchSnapshot: () => Promise.reject(new Error('boom')),
    };
    workflow = makeWorkflow([crashing, DEMO_SIMULATORS[0]!]);
    importSupplied();
    workflow.createQuoteRequest(
      familyForm('EMP-001', { insurerIds: ['demo-sim-y', 'demo-sim-a'] }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(
      state().jobs.map((j) => [j.insurerId, latestAttempt(j).status, latestAttempt(j).errorCode]),
    ).toEqual([
      ['demo-sim-y', 'failed', 'INTERNAL_ERROR'],
      ['demo-sim-a', 'completed', null],
    ]);
  });

  it('fails only the simulator whose required field is missing', async () => {
    const created = workflow.createQuoteRequest(familyForm('EMP-009'));
    await vi.advanceTimersByTimeAsync(10_000);
    const id = created.ok ? created.value.id : '';
    expect(latestAttempt(jobFor(id, 'c'))).toMatchObject({
      status: 'failed',
      errorCode: 'VALIDATION_FAILED',
    });
    expect(latestAttempt(jobFor(id, 'c')).message).toContain('customer e-mail');
    expect(latestAttempt(jobFor(id, 'a')).status).toBe('completed');
  });

  it('records multi-year quotes but does not rank them under the provisional rule', async () => {
    const created = workflow.createQuoteRequest(
      familyForm('EMP-001', { tenureYears: 2, insurerIds: ['demo-sim-a', 'demo-sim-d'] }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const snapshot = latestComparison(state(), created.ok ? created.value.id : '')!;
    expect(snapshot.result.comparable).toEqual([]);
    expect(snapshot.result.excluded[0]!.findings.map((f) => f.code)).toEqual(['TENURE_NOT_RANKED']);
  });
});

describe('activity, dashboard, report and reset', () => {
  beforeEach(importSupplied);

  it('records application events with application timestamps and no personal data', async () => {
    const created = workflow.createQuoteRequest(familyForm('EMP-001'));
    await vi.advanceTimersByTimeAsync(10_000);
    workflow.retryJob(jobFor(created.ok ? created.value.id : '', 'b').id);
    await vi.advanceTimersByTimeAsync(10_000);
    workflow.generateReport(created.ok ? created.value.id : '');
    const types = new Set(state().activity.map((e) => e.type));
    for (const t of [
      'demo.reset',
      'census.loaded',
      'census.imported',
      'quote-request.created',
      'job.queued',
      'job.started',
      'job.response-received',
      'job.normalized',
      'job.timed-out',
      'job.retried',
      'comparison.generated',
      'report.generated',
    ]) {
      expect(types.has(t as never), t).toBe(true);
    }
    const times = state().activity.map((e) => e.at);
    expect([...times].sort()).toEqual(times);
    expect(times.at(-1)! > START).toBe(true);
    const text = JSON.stringify(state().activity);
    for (const personal of ['Aarav', 'Sample', 'example.com', '110001'])
      expect(text).not.toContain(personal);
  });

  it('derives dashboard numbers from the records', async () => {
    expect(dashboardMetrics(state())).toEqual({
      clients: 1,
      quoteRequests: 0,
      activeJobs: 0,
      successfulResponses: 0,
      failedJobs: 0,
      completedComparisons: 0,
    });
    workflow.createQuoteRequest(familyForm('EMP-001'));
    expect(dashboardMetrics(state()).activeJobs).toBe(4);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(dashboardMetrics(state())).toEqual({
      clients: 1,
      quoteRequests: 1,
      activeJobs: 0,
      successfulResponses: 3,
      failedJobs: 1,
      completedComparisons: 1,
    });
  });

  it('builds the report from the same rows as the comparison screen', async () => {
    const created = workflow.createQuoteRequest(familyForm('EMP-001'));
    const id = created.ok ? created.value.id : '';
    expect(workflow.generateReport(id).ok).toBe(false); // no comparison yet
    await vi.advanceTimersByTimeAsync(10_000);
    workflow.retryJob(jobFor(id, 'b').id);
    await vi.advanceTimersByTimeAsync(10_000);
    const report = workflow.generateReport(id);
    expect(report.ok).toBe(true);
    const model = buildReportModel(state(), DEMO_SIMULATORS, report.ok ? report.value.id : '')!;
    const snapshot = latestComparison(state(), id)!;
    expect(model.comparison.id).toBe(snapshot.id);
    expect(model.rows).toEqual(buildResultRows(state(), DEMO_SIMULATORS, snapshot));
    expect(model.rows.map((r) => [r.insurerId, r.engine.outcome])).toEqual([
      ['demo-sim-a', 'comparable'],
      ['demo-sim-b', 'highlighted'],
      ['demo-sim-c', 'excluded'],
      ['demo-sim-d', 'excluded'],
    ]);
    expect(model.outcome.title).toBe('Lowest comparable premium identified');
    expect(model.missingResponses).toEqual([]);
  });

  it('sorts and filters without treating a missing premium as zero', async () => {
    const created = workflow.createQuoteRequest(familyForm('EMP-001'));
    await vi.advanceTimersByTimeAsync(10_000);
    const rows = buildResultRows(
      state(),
      DEMO_SIMULATORS,
      latestComparison(state(), created.ok ? created.value.id : '')!,
    );
    expect(filterAndSortRows(rows, 'all', 'premium-asc').map((r) => r.insurerId)).toEqual([
      'demo-sim-c',
      'demo-sim-a',
      'demo-sim-b',
      'demo-sim-d',
    ]);
    expect(filterAndSortRows(rows, 'all', 'premium-desc').map((r) => r.insurerId)).toEqual([
      'demo-sim-a',
      'demo-sim-c',
      'demo-sim-b',
      'demo-sim-d',
    ]);
    expect(filterAndSortRows(rows, 'comparable', 'received').map((r) => r.insurerId)).toEqual([
      'demo-sim-a',
    ]);
    expect(filterAndSortRows(rows, 'excluded', 'insurer')).toHaveLength(3);
  });

  it('resets the demo, stopping running jobs without letting them write afterwards', async () => {
    workflow.createQuoteRequest(familyForm('EMP-001'));
    await vi.advanceTimersByTimeAsync(500);
    workflow.resetDemo();
    expect(state().jobs).toHaveLength(0);
    importSupplied();
    workflow.createQuoteRequest(familyForm('EMP-001', { insurerIds: ['demo-sim-d'] }));
    await vi.advanceTimersByTimeAsync(10_000);
    // The abandoned run used the same job IDs; none of its updates landed.
    expect(state().jobs).toHaveLength(1);
    expect(state().jobs[0]!.insurerId).toBe('demo-sim-d');
    expect(state().jobs[0]!.attempts).toHaveLength(1);
  });

  it('computes missing fields from a normalised result', () => {
    const d = latestAttempt;
    expect(typeof d).toBe('function');
    expect(
      missingFields({
        resultId: 'r1',
        insurerId: 'demo-sim-a',
        status: 'completed',
        source: 'automated',
        retrievedAt: START,
        planLabel: null,
        currency: null,
        premium: { totalPaise: null, basePaise: null, gstPaise: null, basis: 'unknown' },
        sumInsuredPaise: null,
        coverType: null,
        tenureYears: null,
        members: null,
        terms: {
          coPay: { status: 'unknown' },
          deductible: { status: 'unknown' },
          roomRent: { status: 'unknown' },
          addOns: { status: 'unknown' },
        },
        reviewFlags: [],
        amountIssues: [],
        errorCode: null,
        evidenceRef: null,
      }),
    ).toHaveLength(12);
  });
});

describe('demo workflow sources have no I/O', () => {
  const dir = join(__dirname, '../src/renderer/src/dev/workflow');
  const sources = readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const);

  it.each(sources)('%s uses no network, storage, IPC or randomness', (_file, text) => {
    for (const pattern of [
      /window\.fqf/,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /EventSource/,
      /sendBeacon/,
      /localStorage|sessionStorage|indexedDB/,
      /from 'electron'/,
      /Math\.random/,
      /https?:\/\/(?!localhost)/,
    ]) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('reads the clock in clock.ts only', () => {
    for (const [file, text] of sources) {
      if (file !== 'clock.ts') expect(text, file).not.toMatch(/\bnew Date\(|Date\.now\(/);
    }
  });

  it('aborted waits reject with AbortedError', async () => {
    const { abortableDelay } = await import('../src/renderer/src/dev/workflow/clock');
    const controller = new AbortController();
    const wait = abortableDelay(timers, 1_000, controller.signal);
    controller.abort();
    await expect(wait).rejects.toBeInstanceOf(AbortedError);
  });
});
