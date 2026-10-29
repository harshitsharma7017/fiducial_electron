// DEVELOPMENT-ONLY read models for the demo workflow screens. Pure functions of the state:
// every number and row on screen is derived here from recorded data, never stored separately.
// The comparison screen and the report both use `buildResultRows`, so they cannot disagree.
import { type DemoRow, buildRows, describeOutcome } from '../demo-model';
import type { DemoScenario } from '../demo-scenarios';
import { isTerminal, latestAttempt } from './engine';
import type { SimulatorAdapter } from './simulators';
import {
  type ComparisonSnapshot,
  type DemoState,
  type JobAttempt,
  type JobRecord,
  type JobStatus,
  type JobStep,
  JOB_STEPS,
  type QuoteRequestRecord,
} from './types';

export type Tone = 'positive' | 'info' | 'neutral' | 'warning' | 'danger';

const STEP_LABEL: Record<JobStep, string> = {
  queued: 'QUEUED',
  validating: 'VALIDATING',
  preparing: 'PREPARING',
  'submitting-simulated': 'SUBMITTING (SIMULATED)',
  'awaiting-response': 'AWAITING RESPONSE',
  normalizing: 'NORMALIZING',
};

const STATUS_LABEL: Record<Exclude<JobStatus, 'pending' | 'running'>, [string, Tone]> = {
  completed: ['COMPLETED', 'positive'],
  failed: ['FAILED', 'danger'],
  timed_out: ['TIMED OUT', 'danger'],
  cancelled: ['CANCELLED', 'neutral'],
};

/** The state-machine label for an attempt: the contract status, or the running step. */
export function attemptLabel(a: Pick<JobAttempt, 'status' | 'step'>): {
  label: string;
  tone: Tone;
} {
  if (a.status === 'pending') return { label: 'QUEUED', tone: 'neutral' };
  if (a.status === 'running')
    return { label: a.step ? STEP_LABEL[a.step] : 'RUNNING', tone: 'info' };
  const [label, tone] = STATUS_LABEL[a.status];
  return { label, tone };
}

/** "Step 3 of 6": the position of the running step among the real workflow steps. */
export function stepPosition(a: Pick<JobAttempt, 'status' | 'step'>): string | null {
  if (a.status !== 'running' || !a.step) return null;
  return `Step ${JOB_STEPS.indexOf(a.step) + 1} of ${JOB_STEPS.length}`;
}

export function jobsForRequest(state: DemoState, quoteRequestId: string): JobRecord[] {
  return state.jobs.filter((j) => j.quoteRequestId === quoteRequestId);
}

export function latestComparison(
  state: DemoState,
  quoteRequestId: string,
): ComparisonSnapshot | undefined {
  return [...state.comparisons].reverse().find((c) => c.quoteRequestId === quoteRequestId);
}

export function clientName(state: DemoState, clientId: string): string {
  return state.clients.find((c) => c.id === clientId)?.name ?? clientId;
}

export interface DashboardMetrics {
  clients: number;
  quoteRequests: number;
  activeJobs: number;
  successfulResponses: number;
  failedJobs: number;
  completedComparisons: number;
}

/** Counts derived from the records. "Failed jobs" counts jobs whose latest attempt failed,
 * timed out or was cancelled; "successful responses" counts completed attempts. */
export function dashboardMetrics(state: DemoState): DashboardMetrics {
  const latest = state.jobs.map(latestAttempt);
  return {
    clients: state.clients.length,
    quoteRequests: state.quoteRequests.length,
    activeJobs: latest.filter((a) => !isTerminal(a.status)).length,
    successfulResponses: state.jobs
      .flatMap((j) => j.attempts)
      .filter((a) => a.status === 'completed').length,
    failedJobs: latest.filter(
      (a) => a.status === 'failed' || a.status === 'timed_out' || a.status === 'cancelled',
    ).length,
    completedComparisons: new Set(state.comparisons.map((c) => c.quoteRequestId)).size,
  };
}

export interface ResultRow {
  jobId: string;
  attempt: number;
  insurerId: string;
  insurerLabel: string;
  attemptStatus: JobStatus;
  /** When the simulated response was received and normalised (application time). */
  receivedAt: string | null;
  /** The engine's view of this quote: outcome, findings and the normalised values. */
  engine: DemoRow;
  missingFields: string[];
  message: string | null;
}

/**
 * One row per job in the comparison: what the engine compared and decided. Rows come from the
 * snapshot's own inputs and result, through the same `buildRows` the comparison demo uses.
 */
export function buildResultRows(
  state: DemoState,
  adapters: readonly SimulatorAdapter[],
  snapshot: ComparisonSnapshot,
): ResultRow[] {
  const request = state.quoteRequests.find((r) => r.id === snapshot.quoteRequestId);
  if (!request) return [];
  const scenario: DemoScenario = {
    id: snapshot.id,
    title: snapshot.quoteRequestId,
    focus: '',
    description: '',
    customer: request.draft.customer,
    request: request.draft.request,
    insurers: adapters.map((a) => ({ id: a.id, displayName: a.displayName })),
    quotes: snapshot.inputs.map((i) => i.result),
  };
  const engineRows = buildRows(scenario, snapshot.result);
  return snapshot.inputs.map((input, index) => {
    const job = state.jobs.find((j) => j.id === input.jobId);
    const attempt = job?.attempts.find((a) => a.number === input.attempt);
    return {
      jobId: input.jobId,
      attempt: input.attempt,
      insurerId: input.result.insurerId,
      insurerLabel: engineRows[index]!.insurerLabel,
      attemptStatus: attempt?.status ?? 'failed',
      receivedAt: attempt?.status === 'completed' ? attempt.completedAt : null,
      engine: engineRows[index]!,
      missingFields: attempt?.missingFields ?? [],
      message: attempt?.message ?? null,
    };
  });
}

export type ResultFilter = 'all' | 'comparable' | 'excluded';
export type ResultSort = 'received' | 'premium-asc' | 'premium-desc' | 'insurer';

export function filterAndSortRows(
  rows: readonly ResultRow[],
  filter: ResultFilter,
  sort: ResultSort,
): ResultRow[] {
  const kept = rows.filter((r) =>
    filter === 'all'
      ? true
      : filter === 'excluded'
        ? r.engine.outcome === 'excluded'
        : r.engine.outcome !== 'excluded',
  );
  const premium = (r: ResultRow) => r.engine.normalized?.premium.totalPaise ?? null;
  const byPremium = (dir: 1 | -1) => (a: ResultRow, b: ResultRow) => {
    const x = premium(a);
    const y = premium(b);
    // Missing premiums always sort last: a missing premium is never treated as zero.
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x - y) * dir;
  };
  const sorted = [...kept];
  if (sort === 'premium-asc') sorted.sort(byPremium(1));
  else if (sort === 'premium-desc') sorted.sort(byPremium(-1));
  else if (sort === 'insurer')
    sorted.sort((a, b) =>
      a.insurerLabel < b.insurerLabel ? -1 : a.insurerLabel > b.insurerLabel ? 1 : 0,
    );
  return sorted;
}

export interface ReportModel {
  reportId: string;
  generatedAt: string;
  clientName: string;
  request: QuoteRequestRecord;
  comparison: ComparisonSnapshot;
  simulators: { id: string; label: string }[];
  rows: ResultRow[];
  /** Simulators that did not return a usable response for this comparison. */
  missingResponses: { insurerLabel: string; status: JobStatus; message: string | null }[];
  outcome: ReturnType<typeof describeOutcome>;
}

export function buildReportModel(
  state: DemoState,
  adapters: readonly SimulatorAdapter[],
  reportId: string,
): ReportModel | null {
  const report = state.reports.find((r) => r.id === reportId);
  const comparison = state.comparisons.find((c) => c.id === report?.comparisonId);
  const request = state.quoteRequests.find((r) => r.id === report?.quoteRequestId);
  if (!report || !comparison || !request) return null;
  const rows = buildResultRows(state, adapters, comparison);
  return {
    reportId: report.id,
    generatedAt: report.generatedAt,
    clientName: clientName(state, request.clientId),
    request,
    comparison,
    simulators: request.insurerIds.map((id) => ({
      id,
      label: adapters.find((a) => a.id === id)?.displayName ?? id,
    })),
    rows,
    missingResponses: rows
      .filter((r) => r.attemptStatus !== 'completed')
      .map((r) => ({ insurerLabel: r.insurerLabel, status: r.attemptStatus, message: r.message })),
    outcome: describeOutcome(
      comparison.result,
      rows.map((r) => r.engine),
    ),
  };
}

/** Whether a newer attempt finished after this comparison was generated. */
export function comparisonIsStale(state: DemoState, snapshot: ComparisonSnapshot): boolean {
  return jobsForRequest(state, snapshot.quoteRequestId).some((job) => {
    const used = snapshot.inputs.find((i) => i.jobId === job.id);
    return used !== undefined && latestAttempt(job).number !== used.attempt;
  });
}
