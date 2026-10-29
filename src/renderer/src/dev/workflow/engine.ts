// DEVELOPMENT-ONLY demo workflow engine. Every user action and job transition is a state change
// in the store; the UI only renders the store. Validation, normalisation and comparison are the
// existing M3 functions (validateQuoteDraft, preflight, normalizeResult, checkValidity,
// compareQuotes with its default provisional rule). No insurer, portal or network is contacted.
import { compareQuotes } from '../../../../shared/comparison/compare';
import { normalizeResult } from '../../../../shared/comparison/normalize';
import { checkValidity } from '../../../../shared/comparison/validity';
import type { RequiredField } from '../../../../shared/contracts/adapter';
import { customerSchema } from '../../../../shared/contracts/customer';
import type { CoverType } from '../../../../shared/contracts/coverage';
import type { Validated } from '../../../../shared/contracts/issues';
import type {
  InsurerResultInput,
  NormalizedResult,
  QuoteDraft,
  QuoteDraftInput,
} from '../../../../shared/contracts/quote';
import { progressEventSchema } from '../../../../shared/contracts/status';
import type { AppErrorCode } from '../../../../shared/ipc/errors';
import { parseInrAmount } from '../../../../shared/money';
import { PLACEHOLDER_QUOTE_INPUT_RULES } from '../../../../shared/rules/quote-input-rules';
import { type PreflightOutcome, preflight } from '../../../../shared/validation/preflight';
import { validateQuoteDraft } from '../../../../shared/validation/quote-request';
import {
  SUPPLIED_DEMO_CENSUS_CSV,
  loadCensusCsv,
  normaliseRelationship,
  parseAge,
  rowStatus,
  validateCensus,
} from './census';
import { AbortedError, type Clock, type Timers, abortableDelay } from './clock';
import type { SimulatorAdapter, SimulatorRunContext } from './simulators';
import { type DemoStateStore, seedState } from './store';
import {
  type ActivityEvent,
  type CensusField,
  type Client,
  type ComparisonSnapshot,
  type DemoState,
  type JobAttempt,
  type JobRecord,
  type JobStatus,
  type JobStep,
  type QuoteRequestRecord,
  type ReportRecord,
  TERMINAL_JOB_STATUSES,
} from './types';

export interface WorkflowConfig {
  /** Jobs running at the same time; the rest wait in the queue (FR-07, bounded). */
  maxConcurrentJobs: number;
  /** How long a simulator may take to respond before the attempt times out. */
  responseTimeoutMs: number;
  /** Attempts per job, the first included. A demo safeguard, not a product rule. */
  maxAttemptsPerJob: number;
}

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  maxConcurrentJobs: 3,
  responseTimeoutMs: 3_000,
  maxAttemptsPerJob: 3,
};

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export interface QuoteRequestForm {
  clientId: string;
  employeeId: string;
  memberIds: string[];
  coverType: CoverType;
  /** As typed, for example `5,00,000`. */
  sumInsuredRupees: string;
  tenureYears: number;
  pincode: string;
  insurerIds: string[];
}

export interface RequestReview {
  /** Problems with the form itself, before contract validation can run. */
  formIssues: string[];
  /** The existing validator's result: schema, then the placeholder input rules. */
  draft: Validated<QuoteDraft> | null;
  /** Required-field pre-flight per selected simulator (FR-04): blocks that simulator only. */
  preflight: PreflightOutcome[];
  ready: boolean;
}

const ACTIVE_STATUSES: readonly JobStatus[] = ['pending', 'running'];
export const RETRYABLE_STATUSES: readonly JobStatus[] = ['failed', 'timed_out', 'cancelled'];

export const REQUIRED_FIELD_LABEL: Record<RequiredField, string> = {
  'customer.phone': 'customer phone',
  'customer.email': 'customer e-mail',
  'request.pincode': 'pincode',
  'members.dateOfBirth': 'member dates of birth',
};

/** Fixed messages for job events: never portal text, never personal data (16 §4). */
const STEP_MESSAGE: Record<JobStep, string> = {
  queued: 'Queued; waiting for a free simulator slot',
  validating: 'Validating the quote request and the required fields',
  preparing: 'Preparing the simulated submission',
  'submitting-simulated': 'Submitting to the DEMO SIMULATOR (no insurer is contacted)',
  'awaiting-response': 'Waiting for the simulated response',
  normalizing: 'Normalising the simulated response',
};
const TERMINAL_MESSAGE: Record<Exclude<JobStatus, 'pending' | 'running'>, string> = {
  completed: 'Simulated response received and normalised',
  failed: 'Attempt failed',
  timed_out: 'No simulated response before the timeout',
  cancelled: 'Cancelled by the user',
};

/** Fields a normalised result does not have. Shown as missing; never filled in. */
export function missingFields(result: NormalizedResult): string[] {
  const missing: string[] = [];
  if (result.planLabel === null) missing.push('Plan name');
  if (result.currency === null) missing.push('Currency');
  if (result.premium.totalPaise === null) missing.push('Total premium');
  if (result.premium.basis === 'unknown') missing.push('GST basis');
  if (result.sumInsuredPaise === null) missing.push('Sum insured');
  if (result.coverType === null) missing.push('Cover type');
  if (result.tenureYears === null) missing.push('Policy tenure');
  if (result.members === null) missing.push('Covered members');
  const terms: [keyof NormalizedResult['terms'], string][] = [
    ['coPay', 'Co-pay'],
    ['deductible', 'Deductible'],
    ['roomRent', 'Room rent'],
    ['addOns', 'Add-ons'],
  ];
  for (const [key, label] of terms) if (result.terms[key].status === 'unknown') missing.push(label);
  return missing;
}

export function latestAttempt(job: JobRecord): JobAttempt {
  return job.attempts[job.attempts.length - 1]!;
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

/** Builds the draft and runs the existing validators. Pure: reads the state only. */
export function reviewQuoteRequest(
  state: DemoState,
  adapters: readonly SimulatorAdapter[],
  form: QuoteRequestForm,
): RequestReview {
  const formIssues: string[] = [];
  const employee = state.employees.find(
    (e) => e.clientId === form.clientId && e.employeeId === form.employeeId,
  );
  if (!state.clients.some((c) => c.id === form.clientId)) formIssues.push('Select a client.');
  if (!employee) formIssues.push('Select an employee whose census record has been imported.');
  const members = form.memberIds
    .map((id) => state.members.find((m) => m.id === id))
    .filter(
      (m) => m !== undefined && m.clientId === form.clientId && m.employeeId === form.employeeId,
    );
  if (members.length === 0) formIssues.push('Select at least one member.');
  const sumInsured = parseInrAmount(form.sumInsuredRupees);
  if (!sumInsured.ok) formIssues.push('Enter the sum insured in rupees, for example 5,00,000.');
  const selected = adapters.filter((a) => form.insurerIds.includes(a.id));
  if (selected.length === 0) formIssues.push('Select at least one simulator.');
  if (!employee || members.length === 0 || !sumInsured.ok) {
    return { formIssues, draft: null, preflight: [], ready: false };
  }

  const input: QuoteDraftInput = {
    customer: { name: employee.name, ...(employee.email ? { email: employee.email } : {}) },
    request: {
      members: members.map((m) => ({ relationship: m!.relationship, age: m!.age })),
      coverType: form.coverType,
      sumInsuredPaise: sumInsured.paise,
      tenureYears: form.tenureYears,
      pincode: form.pincode,
    },
  };
  const draft = validateQuoteDraft(input, PLACEHOLDER_QUOTE_INPUT_RULES);
  const checks = draft.ok ? preflight(selected, draft.value) : [];
  return { formIssues, draft, preflight: checks, ready: formIssues.length === 0 && draft.ok };
}

export interface DemoWorkflow {
  readonly store: DemoStateStore;
  readonly adapters: readonly SimulatorAdapter[];
  readonly config: WorkflowConfig;
  resetDemo(): void;
  createClient(input: { name: string; email?: string }): Outcome<Client>;
  loadSuppliedCensus(clientId: string): Outcome<{ rows: number }>;
  loadCensusText(clientId: string, text: string): Outcome<{ rows: number }>;
  correctCensusRow(
    clientId: string,
    rowId: string,
    values: Partial<Record<CensusField, string>>,
  ): Outcome<CensusField[]>;
  setCensusRowExcluded(clientId: string, rowId: string, excluded: boolean): Outcome<null>;
  confirmNotDuplicate(clientId: string, rowId: string): Outcome<null>;
  importCensus(clientId: string): Outcome<{ members: number; employees: number }>;
  review(form: QuoteRequestForm): RequestReview;
  createQuoteRequest(form: QuoteRequestForm): Outcome<QuoteRequestRecord>;
  cancelJob(jobId: string): Outcome<null>;
  retryJob(jobId: string): Outcome<number>;
  generateComparison(quoteRequestId: string): Outcome<ComparisonSnapshot>;
  generateReport(quoteRequestId: string): Outcome<ReportRecord>;
  /** Stops all simulated work (used when the demo is closed and in tests). */
  dispose(): void;
}

export interface WorkflowDeps {
  store: DemoStateStore;
  clock: Clock;
  timers: Timers;
  adapters: readonly SimulatorAdapter[];
  config?: Partial<WorkflowConfig>;
}

interface LiveRun {
  controller: AbortController;
  reason: 'cancel' | 'timeout' | null;
}

export function createDemoWorkflow(deps: WorkflowDeps): DemoWorkflow {
  const { store, clock, timers, adapters } = deps;
  const config: WorkflowConfig = { ...DEFAULT_WORKFLOW_CONFIG, ...deps.config };
  const live = new Map<string, LiveRun>();
  // Incremented by reset and dispose, so late callbacks from abandoned runs change nothing.
  let epoch = 0;

  const key = (jobId: string, n: number) => `${jobId}#${n}`;
  const runIdOf = (jobId: string, n: number) => `${jobId}-a${n}`;

  function update(mutate: (s: DemoState) => void): void {
    const next = structuredClone(store.read());
    mutate(next);
    store.write(next);
  }

  function nextId(s: DemoState, prefix: string, width = 3): string {
    const n = (s.counters[prefix] ?? 0) + 1;
    s.counters[prefix] = n;
    return `${prefix}-${String(n).padStart(width, '0')}`;
  }

  function log(
    s: DemoState,
    type: ActivityEvent['type'],
    message: string,
    refs: ActivityEvent['refs'] = {},
  ): void {
    s.activity.push({ id: nextId(s, 'ACT', 4), at: clock.now(), type, message, refs });
  }

  function event(
    job: JobRecord,
    attempt: JobAttempt,
    step: JobStep | null,
    errorCode?: AppErrorCode,
  ) {
    const status = attempt.status;
    return progressEventSchema.parse({
      runId: runIdOf(job.id, attempt.number),
      insurerId: job.insurerId,
      status,
      ...(step ? { progressStep: step } : {}),
      safeMessage: step
        ? STEP_MESSAGE[step]
        : TERMINAL_MESSAGE[status as keyof typeof TERMINAL_MESSAGE],
      ...(errorCode ? { errorCode } : {}),
      occurredAt: clock.now(),
    });
  }

  const adapterOf = (id: string) => adapters.find((a) => a.id === id);
  const labelOf = (id: string) => adapterOf(id)?.displayName ?? id;

  // ---- Clients and census -------------------------------------------------------------------

  function createClient(input: { name: string; email?: string }): Outcome<Client> {
    const name = customerSchema.shape.name.safeParse(input.name);
    if (!name.success)
      return { ok: false, error: 'Enter a client name of one line, at most 100 characters.' };
    const emailText = input.email?.trim() ?? '';
    const email = emailText === '' ? null : customerSchema.shape.email.safeParse(emailText);
    if (email && !email.success) return { ok: false, error: 'The e-mail address is not valid.' };
    let client: Client | undefined;
    update((s) => {
      client = {
        id: nextId(s, 'CL'),
        name: name.data,
        email: email?.success ? (email.data ?? null) : null,
        notes: null,
        seeded: false,
        createdAt: clock.now(),
      };
      s.clients.push(client);
      log(s, 'client.created', `Client ${client.id} created.`, { clientId: client.id });
    });
    return { ok: true, value: client! };
  }

  function loadCensusText(
    clientId: string,
    text: string,
    source: 'supplied-demo' | 'pasted' = 'pasted',
  ): Outcome<{ rows: number }> {
    if (!store.read().clients.some((c) => c.id === clientId))
      return { ok: false, error: 'Unknown client.' };
    const loaded = loadCensusCsv(text, (store.read().counters['ROW'] ?? 0) + 1);
    if (!loaded.ok) return loaded;
    update((s) => {
      s.counters['ROW'] = (s.counters['ROW'] ?? 0) + loaded.rows.length;
      // A new census replaces the staged rows and this client's imported members. Quote
      // requests keep their own copy of the members they were created with.
      s.census = s.census.filter((b) => b.clientId !== clientId);
      s.employees = s.employees.filter((e) => e.clientId !== clientId);
      s.members = s.members.filter((m) => m.clientId !== clientId);
      s.census.push({ clientId, source, loadedAt: clock.now(), rows: loaded.rows, fileIssues: [] });
      const issues = validateCensus(loaded.rows);
      const blocked = loaded.rows.filter(
        (r) => rowStatus(r, issues.get(r.id) ?? []) === 'blocked',
      ).length;
      log(
        s,
        'census.loaded',
        `Census loaded for ${clientId} (${source === 'supplied-demo' ? 'supplied synthetic census' : 'CSV file'}): ${loaded.rows.length} rows, ${blocked} need correction.`,
        { clientId },
      );
    });
    return { ok: true, value: { rows: loaded.rows.length } };
  }

  function withRow(
    clientId: string,
    rowId: string,
    mutate: (row: DemoState['census'][number]['rows'][number], s: DemoState) => string | null,
  ): Outcome<null> {
    const batch = store.read().census.find((b) => b.clientId === clientId);
    const row = batch?.rows.find((r) => r.id === rowId);
    if (!row) return { ok: false, error: 'Unknown census row.' };
    if (row.imported) return { ok: false, error: 'This row is already imported.' };
    let error: string | null = null;
    update((s) => {
      const target = s.census
        .find((b) => b.clientId === clientId)!
        .rows.find((r) => r.id === rowId)!;
      error = mutate(target, s);
    });
    return error ? { ok: false, error } : { ok: true, value: null };
  }

  function correctCensusRow(
    clientId: string,
    rowId: string,
    values: Partial<Record<CensusField, string>>,
  ): Outcome<CensusField[]> {
    const current = store
      .read()
      .census.find((b) => b.clientId === clientId)
      ?.rows.find((r) => r.id === rowId);
    const changes = (Object.entries(values) as [CensusField, string][])
      .map(([field, value]) => [field, value.trim().slice(0, 200)] as const)
      .filter(([field, value]) => current !== undefined && current.values[field] !== value);
    if (current && changes.length === 0) return { ok: true, value: [] };
    const result = withRow(clientId, rowId, (row, s) => {
      for (const [field, value] of changes) row.values[field] = value;
      // Field names only: the corrected values are personal data and stay out of the log.
      log(
        s,
        'census.corrected',
        `Census row ${rowId} (line ${row.line}) corrected: ${changes.map(([f]) => f).join(', ')}.`,
        { clientId },
      );
      return null;
    });
    return result.ok ? { ok: true, value: changes.map(([f]) => f) } : result;
  }

  function setCensusRowExcluded(clientId: string, rowId: string, excluded: boolean): Outcome<null> {
    return withRow(clientId, rowId, (row, s) => {
      row.excluded = excluded;
      log(
        s,
        'census.corrected',
        `Census row ${rowId} (line ${row.line}) ${excluded ? 'excluded from' : 'included in'} the import.`,
        { clientId },
      );
      return null;
    });
  }

  function confirmNotDuplicate(clientId: string, rowId: string): Outcome<null> {
    return withRow(clientId, rowId, (row, s) => {
      row.notDuplicate = true;
      log(
        s,
        'census.corrected',
        `Census row ${rowId} (line ${row.line}) confirmed as a different person.`,
        { clientId },
      );
      return null;
    });
  }

  function importCensus(clientId: string): Outcome<{ members: number; employees: number }> {
    const batch = store.read().census.find((b) => b.clientId === clientId);
    if (!batch) return { ok: false, error: 'Load a census first.' };
    const issues = validateCensus(batch.rows);
    const ready = batch.rows.filter((r) => rowStatus(r, issues.get(r.id) ?? []) === 'ready');
    if (ready.length === 0) return { ok: false, error: 'No row is ready to import.' };
    const counts = { members: 0, employees: 0 };
    update((s) => {
      const now = clock.now();
      const rows = s.census.find((b) => b.clientId === clientId)!.rows;
      // Own rows first, so each family's employee record exists before its dependants.
      const order = [...ready].sort(
        (a, b) =>
          Number(normaliseRelationship(b.values.relationship) === 'self') -
          Number(normaliseRelationship(a.values.relationship) === 'self'),
      );
      for (const r of order) {
        const row = rows.find((x) => x.id === r.id)!;
        const relationship = normaliseRelationship(row.values.relationship)!;
        if (relationship === 'self') {
          s.employees.push({
            clientId,
            employeeId: row.values.employee_id,
            name: customerSchema.shape.name.parse(row.values.name),
            email: row.values.email === '' ? null : row.values.email,
            pincode: row.values.pincode.replace(/\s/g, ''),
            importedAt: now,
          });
          counts.employees += 1;
        }
        s.members.push({
          id: nextId(s, 'MEM'),
          clientId,
          employeeId: row.values.employee_id,
          relationship,
          age: parseAge(row.values.age)!,
          sourceLine: row.line,
          importedAt: now,
        });
        counts.members += 1;
        row.imported = true;
      }
      log(
        s,
        'census.imported',
        `Census import for ${clientId}: ${counts.members} members in ${counts.employees} new employee records.`,
        { clientId },
      );
    });
    return { ok: true, value: counts };
  }

  // ---- Quote requests and jobs --------------------------------------------------------------

  function createQuoteRequest(form: QuoteRequestForm): Outcome<QuoteRequestRecord> {
    const check = reviewQuoteRequest(store.read(), adapters, form);
    if (!check.ready || !check.draft?.ok) {
      return {
        ok: false,
        error: 'The quote request does not pass validation. Review the issues listed.',
      };
    }
    const draft = check.draft.value;
    let record: QuoteRequestRecord | undefined;
    update((s) => {
      const now = clock.now();
      record = {
        id: nextId(s, 'QR'),
        clientId: form.clientId,
        employeeId: form.employeeId,
        memberIds: [...form.memberIds],
        draft,
        insurerIds: adapters.filter((a) => form.insurerIds.includes(a.id)).map((a) => a.id),
        createdAt: now,
      };
      s.quoteRequests.push(record);
      log(
        s,
        'quote-request.created',
        `Quote request ${record.id} created for ${form.clientId}, employee ${form.employeeId}: ${draft.request.members.length} members, ${record.insurerIds.length} simulators.`,
        { clientId: form.clientId, quoteRequestId: record.id },
      );
      for (const insurerId of record.insurerIds) {
        const job: JobRecord = {
          id: nextId(s, 'JOB'),
          quoteRequestId: record.id,
          clientId: form.clientId,
          insurerId,
          createdAt: now,
          attempts: [],
        };
        job.attempts.push(newAttempt(job, 1));
        s.jobs.push(job);
        log(s, 'job.queued', `Job ${job.id} queued: ${labelOf(insurerId)}, attempt 1.`, {
          clientId: job.clientId,
          quoteRequestId: record.id,
          jobId: job.id,
          attempt: 1,
        });
      }
    });
    pump();
    return { ok: true, value: record! };
  }

  function newAttempt(job: JobRecord, number: number): JobAttempt {
    const attempt: JobAttempt = {
      number,
      status: 'pending',
      step: 'queued',
      queuedAt: clock.now(),
      startedAt: null,
      completedAt: null,
      events: [],
      simulatedPayload: null,
      resultInput: null,
      normalized: null,
      missingFields: [],
      validityFindings: [],
      normalizationIssues: [],
      errorCode: null,
      message: null,
    };
    attempt.events.push(event(job, attempt, 'queued'));
    return attempt;
  }

  /** Starts queued attempts while slots are free, oldest first. */
  function pump(): void {
    const s = store.read();
    let running = s.jobs.filter((j) => latestAttempt(j).status === 'running').length;
    const order = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    const waiting = s.jobs
      .filter((j) => latestAttempt(j).status === 'pending')
      .sort(
        (a, b) => order(latestAttempt(a).queuedAt, latestAttempt(b).queuedAt) || order(a.id, b.id),
      );
    for (const job of waiting) {
      if (running >= config.maxConcurrentJobs) break;
      const n = latestAttempt(job).number;
      let started = false;
      update((next) => {
        const j = next.jobs.find((x) => x.id === job.id)!;
        const a = latestAttempt(j);
        if (a.number !== n || a.status !== 'pending') return;
        a.status = 'running';
        a.step = 'validating';
        a.startedAt = clock.now();
        a.events.push(event(j, a, 'validating'));
        log(next, 'job.started', `Job ${j.id} started: ${labelOf(j.insurerId)}, attempt ${n}.`, {
          clientId: j.clientId,
          quoteRequestId: j.quoteRequestId,
          jobId: j.id,
          attempt: n,
        });
        started = true;
      });
      if (started) {
        running += 1;
        void runAttempt(job.id, n, epoch);
      }
    }
  }

  function readAttempt(jobId: string, n: number): { job: JobRecord; attempt: JobAttempt } | null {
    const job = store.read().jobs.find((j) => j.id === jobId);
    const attempt = job?.attempts.find((a) => a.number === n);
    return job && attempt ? { job, attempt } : null;
  }

  /** Applies a change to a running attempt; ignored once it is finished or the demo was reset. */
  function onRunning(
    jobId: string,
    n: number,
    runEpoch: number,
    mutate: (job: JobRecord, a: JobAttempt, s: DemoState) => void,
  ): boolean {
    if (runEpoch !== epoch || readAttempt(jobId, n)?.attempt.status !== 'running') return false;
    update((s) => {
      const job = s.jobs.find((j) => j.id === jobId)!;
      mutate(
        job,
        job.attempts.find((a) => a.number === n)!,
        s,
      );
    });
    return true;
  }

  function setStep(jobId: string, n: number, runEpoch: number, step: JobStep): void {
    const applied = onRunning(jobId, n, runEpoch, (job, a) => {
      a.step = step;
      a.events.push(event(job, a, step));
    });
    if (!applied) throw new AbortedError();
  }

  interface Finish {
    errorCode?: AppErrorCode;
    message?: string;
    resultInput?: InsurerResultInput;
    normalized?: NormalizedResult;
    normalizationIssues?: JobAttempt['normalizationIssues'];
  }

  function finish(
    jobId: string,
    n: number,
    runEpoch: number,
    status: Exclude<JobStatus, 'pending' | 'running'>,
    details: Finish = {},
  ): void {
    if (runEpoch !== epoch) return;
    const current = readAttempt(jobId, n);
    if (!current || isTerminal(current.attempt.status)) return;
    update((s) => {
      const job = s.jobs.find((j) => j.id === jobId)!;
      const a = job.attempts.find((x) => x.number === n)!;
      a.status = status;
      a.step = null;
      a.completedAt = clock.now();
      a.errorCode = details.errorCode ?? null;
      a.message = details.message ?? null;
      if (details.resultInput) a.resultInput = details.resultInput;
      if (details.normalized) {
        a.normalized = details.normalized;
        a.missingFields = missingFields(details.normalized);
        a.validityFindings = checkValidity(details.normalized);
      }
      if (details.normalizationIssues) a.normalizationIssues = details.normalizationIssues;
      a.events.push(event(job, a, null, details.errorCode));
      const refs = {
        clientId: job.clientId,
        quoteRequestId: job.quoteRequestId,
        jobId,
        attempt: n,
      };
      const who = `Job ${jobId} (${labelOf(job.insurerId)}, attempt ${n})`;
      if (status === 'completed') {
        const notes =
          a.validityFindings.length > 0
            ? `; ${a.validityFindings.length} result check(s) failed`
            : '';
        log(s, 'job.normalized', `${who}: simulated response normalised${notes}.`, refs);
      } else if (status === 'timed_out')
        log(s, 'job.timed-out', `${who} timed out: no simulated response.`, refs);
      else if (status === 'cancelled') log(s, 'job.cancelled', `${who} cancelled.`, refs);
      else
        log(
          s,
          'job.failed',
          `${who} failed${details.errorCode ? ` (${details.errorCode})` : ''}.`,
          refs,
        );
    });
    pump();
    const requestId = readAttempt(jobId, n)?.job.quoteRequestId;
    if (requestId && allTerminal(requestId)) generateComparison(requestId);
  }

  function raceTimeout<T>(work: Promise<T>, run: LiveRun): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const handle = timers.setTimeout(() => {
        if (settled) return;
        settled = true;
        run.reason = 'timeout';
        run.controller.abort();
        reject(new AbortedError());
      }, config.responseTimeoutMs);
      void work.then(
        (value) => {
          if (settled) return;
          settled = true;
          timers.clearTimeout(handle);
          resolve(value);
        },
        (err: unknown) => {
          if (settled) return;
          settled = true;
          timers.clearTimeout(handle);
          reject(err instanceof Error ? err : new Error('simulator failed'));
        },
      );
    });
  }

  async function runAttempt(jobId: string, n: number, runEpoch: number): Promise<void> {
    const current = readAttempt(jobId, n);
    const adapter = current ? adapterOf(current.job.insurerId) : undefined;
    const request = current
      ? store.read().quoteRequests.find((r) => r.id === current.job.quoteRequestId)
      : undefined;
    if (!current || !adapter || !request) {
      finish(jobId, n, runEpoch, 'failed', {
        errorCode: 'INTERNAL_ERROR',
        message: 'The job could not be started.',
      });
      return;
    }
    const run: LiveRun = { controller: new AbortController(), reason: null };
    live.set(key(jobId, n), run);
    const signal = run.controller.signal;
    const wait = (ms: number) => abortableDelay(timers, ms, signal);
    try {
      await wait(adapter.stepDelayMs);
      const recheck = validateQuoteDraft(request.draft, PLACEHOLDER_QUOTE_INPUT_RULES);
      if (!recheck.ok) {
        finish(jobId, n, runEpoch, 'failed', {
          errorCode: 'VALIDATION_FAILED',
          message: 'The quote request no longer passes validation.',
        });
        return;
      }
      const [check] = preflight([adapter], recheck.value);
      if (check && !check.ready) {
        finish(jobId, n, runEpoch, 'failed', {
          errorCode: 'VALIDATION_FAILED',
          message: `Required by this simulator but missing: ${check.missing.map((f) => REQUIRED_FIELD_LABEL[f]).join(', ')}. Other simulators are not affected.`,
        });
        return;
      }
      setStep(jobId, n, runEpoch, 'preparing');
      await wait(adapter.stepDelayMs);
      setStep(jobId, n, runEpoch, 'submitting-simulated');
      await wait(adapter.stepDelayMs);
      setStep(jobId, n, runEpoch, 'awaiting-response');
      const context: SimulatorRunContext = {
        runId: runIdOf(jobId, n),
        request: recheck.value.request,
        contact: {
          ...(adapter.requiredFields.includes('customer.email') && recheck.value.customer.email
            ? { email: recheck.value.customer.email }
            : {}),
        },
        signal,
        reportProgress: () => undefined,
        attempt: n,
        now: () => clock.now(),
        delay: wait,
      };
      const snapshot = await raceTimeout(adapter.fetchSnapshot(context), run);
      onRunning(jobId, n, runEpoch, (job, a, s) => {
        a.simulatedPayload = snapshot.content.slice(0, 20_000);
        log(
          s,
          'job.response-received',
          `Job ${jobId} (${labelOf(job.insurerId)}, attempt ${n}): simulated response received.`,
          { clientId: job.clientId, quoteRequestId: job.quoteRequestId, jobId, attempt: n },
        );
      });
      setStep(jobId, n, runEpoch, 'normalizing');
      await wait(adapter.stepDelayMs);
      // The orchestrator owns the result ID (unique per attempt) and the insurer ID.
      const parsed: InsurerResultInput = {
        ...adapter.parseAt(snapshot, clock.now()),
        resultId: runIdOf(jobId, n),
        insurerId: adapter.id,
      };
      const normalized = normalizeResult(parsed);
      if (!normalized.ok) {
        finish(jobId, n, runEpoch, 'failed', {
          errorCode: 'PARSE_FAILED',
          message: 'The simulated response does not match the result contract.',
          resultInput: parsed,
          normalizationIssues: normalized.issues,
        });
      } else if (normalized.value.status !== 'completed') {
        finish(jobId, n, runEpoch, 'failed', {
          errorCode: normalized.value.errorCode ?? 'QUOTE_NOT_AVAILABLE',
          message: 'The simulated response reports that no quote is available.',
          resultInput: parsed,
          normalized: normalized.value,
        });
      } else {
        finish(jobId, n, runEpoch, 'completed', {
          resultInput: parsed,
          normalized: normalized.value,
        });
      }
    } catch (err) {
      if (run.reason === 'timeout') {
        finish(jobId, n, runEpoch, 'timed_out', {
          errorCode: 'NAVIGATION_TIMEOUT',
          message: `No simulated response within ${config.responseTimeoutMs / 1000} seconds.`,
        });
      } else if (run.reason === 'cancel' || err instanceof AbortedError) {
        finish(jobId, n, runEpoch, 'cancelled', {
          errorCode: 'CANCELLED',
          message: 'Cancelled by the user.',
        });
      } else {
        finish(jobId, n, runEpoch, 'failed', {
          errorCode: 'INTERNAL_ERROR',
          message: 'The simulator failed unexpectedly.',
        });
      }
    } finally {
      live.delete(key(jobId, n));
    }
  }

  function cancelJob(jobId: string): Outcome<null> {
    const job = store.read().jobs.find((j) => j.id === jobId);
    if (!job) return { ok: false, error: 'Unknown job.' };
    const a = latestAttempt(job);
    if (!ACTIVE_STATUSES.includes(a.status))
      return { ok: false, error: 'Only a queued or running job can be cancelled.' };
    const run = live.get(key(jobId, a.number));
    if (run) {
      run.reason = 'cancel';
      run.controller.abort();
    }
    // Finish now: a simulator that ignored the signal cannot overwrite a cancelled attempt.
    finish(jobId, a.number, epoch, 'cancelled', {
      errorCode: 'CANCELLED',
      message: 'Cancelled by the user.',
    });
    return { ok: true, value: null };
  }

  function retryJob(jobId: string): Outcome<number> {
    const job = store.read().jobs.find((j) => j.id === jobId);
    if (!job) return { ok: false, error: 'Unknown job.' };
    const a = latestAttempt(job);
    if (!RETRYABLE_STATUSES.includes(a.status))
      return { ok: false, error: 'Only a failed, timed-out or cancelled job can be retried.' };
    if (job.attempts.length >= config.maxAttemptsPerJob) {
      return {
        ok: false,
        error: `This demo allows at most ${config.maxAttemptsPerJob} attempts per job.`,
      };
    }
    const n = a.number + 1;
    update((s) => {
      const j = s.jobs.find((x) => x.id === jobId)!;
      j.attempts.push(newAttempt(j, n));
      log(
        s,
        'job.retried',
        `Job ${jobId} (${labelOf(j.insurerId)}) retried: attempt ${n} queued; attempt ${a.number} kept in the history.`,
        { clientId: j.clientId, quoteRequestId: j.quoteRequestId, jobId, attempt: n },
      );
    });
    pump();
    return { ok: true, value: n };
  }

  // ---- Comparison and report ----------------------------------------------------------------

  function allTerminal(quoteRequestId: string): boolean {
    const jobs = store.read().jobs.filter((j) => j.quoteRequestId === quoteRequestId);
    return jobs.length > 0 && jobs.every((j) => isTerminal(latestAttempt(j).status));
  }

  /** The record of an attempt that produced no result, as the orchestrator records it. */
  function notCompletedResult(job: JobRecord, a: JobAttempt): InsurerResultInput {
    return {
      resultId: runIdOf(job.id, a.number),
      insurerId: job.insurerId,
      status: a.status === 'pending' || a.status === 'running' ? 'failed' : a.status,
      source: 'automated',
      retrievedAt: a.completedAt ?? clock.now(),
      ...(a.errorCode ? { errorCode: a.errorCode } : {}),
    };
  }

  function generateComparison(quoteRequestId: string): Outcome<ComparisonSnapshot> {
    const s0 = store.read();
    const request = s0.quoteRequests.find((r) => r.id === quoteRequestId);
    if (!request) return { ok: false, error: 'Unknown quote request.' };
    if (!allTerminal(quoteRequestId))
      return { ok: false, error: 'Wait until every job has finished.' };
    const jobs = s0.jobs.filter((j) => j.quoteRequestId === quoteRequestId);
    const inputs = jobs.map((job) => {
      const a = latestAttempt(job);
      return {
        jobId: job.id,
        attempt: a.number,
        result: a.resultInput ?? notCompletedResult(job, a),
      };
    });
    const compared = compareQuotes(
      request.draft.request,
      inputs.map((i) => i.result),
    );
    if (!compared.ok) return { ok: false, error: 'The comparison engine rejected its input.' };
    let snapshot: ComparisonSnapshot | undefined;
    update((s) => {
      snapshot = {
        id: nextId(s, 'CMP'),
        quoteRequestId,
        generatedAt: clock.now(),
        inputs,
        result: compared.value,
      };
      s.comparisons.push(snapshot);
      const outcome = compared.value.cheapest
        ? compared.value.cheapest.tie
          ? 'tied lowest comparable premium highlighted'
          : 'lowest comparable premium highlighted'
        : `no highlight (${compared.value.noHighlightReason})`;
      log(
        s,
        'comparison.generated',
        `Comparison ${snapshot.id} for ${quoteRequestId}: ${compared.value.comparable.length} comparable, ${compared.value.excluded.length} excluded; ${outcome}.`,
        { clientId: request.clientId, quoteRequestId, comparisonId: snapshot.id },
      );
    });
    return { ok: true, value: snapshot! };
  }

  function generateReport(quoteRequestId: string): Outcome<ReportRecord> {
    const s0 = store.read();
    const comparison = [...s0.comparisons]
      .reverse()
      .find((c) => c.quoteRequestId === quoteRequestId);
    const request = s0.quoteRequests.find((r) => r.id === quoteRequestId);
    if (!request || !comparison) return { ok: false, error: 'Generate a comparison first.' };
    let report: ReportRecord | undefined;
    update((s) => {
      report = {
        id: nextId(s, 'RPT'),
        quoteRequestId,
        comparisonId: comparison.id,
        generatedAt: clock.now(),
      };
      s.reports.push(report);
      log(
        s,
        'report.generated',
        `Report ${report.id} generated from comparison ${comparison.id} (preview only; no file written).`,
        {
          clientId: request.clientId,
          quoteRequestId,
          comparisonId: comparison.id,
          reportId: report.id,
        },
      );
    });
    return { ok: true, value: report! };
  }

  function stopAll(): void {
    epoch += 1;
    for (const run of live.values()) {
      run.reason = 'cancel';
      run.controller.abort();
    }
    live.clear();
  }

  return {
    store,
    adapters,
    config,
    resetDemo: () => {
      stopAll();
      store.write(seedState(clock.now()));
    },
    createClient,
    loadSuppliedCensus: (clientId) =>
      loadCensusText(clientId, SUPPLIED_DEMO_CENSUS_CSV, 'supplied-demo'),
    loadCensusText: (clientId, text) => loadCensusText(clientId, text, 'pasted'),
    correctCensusRow,
    setCensusRowExcluded,
    confirmNotDuplicate,
    importCensus,
    review: (form) => reviewQuoteRequest(store.read(), adapters, form),
    createQuoteRequest,
    cancelJob,
    retryJob,
    generateComparison,
    generateReport,
    dispose: stopAll,
  };
}
