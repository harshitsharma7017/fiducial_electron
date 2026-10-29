// DEVELOPMENT-ONLY demo workflow: the records the demo keeps in memory. Everything here is
// synthetic demo data. Contract types (quote request, insurer result, normalised result,
// comparison result, progress event) are reused from src/shared/contracts; only the demo-layer
// organisation (client company, census staging, jobs, snapshots, activity) is defined here.
import type { ComparisonResult, Finding } from '../../../../shared/contracts/comparison';
import type { Relationship } from '../../../../shared/contracts/customer';
import type { ValidationIssue } from '../../../../shared/contracts/issues';
import type {
  InsurerResultInput,
  NormalizedResult,
  QuoteDraft,
} from '../../../../shared/contracts/quote';
import type { ProgressEvent, RunStatus } from '../../../../shared/contracts/status';
import type { AppErrorCode } from '../../../../shared/ipc/errors';

/** A client organisation. The customer of each quote is a person in its census. */
export interface Client {
  id: string;
  name: string;
  email: string | null;
  notes: string | null;
  /** True for the seeded synthetic company. User-created clients are demo data too. */
  seeded: boolean;
  createdAt: string;
}

// ---- Census staging -------------------------------------------------------------------------

/**
 * Census columns. One row per insured person, grouped by `employee_id`. `name`, `email` and
 * `pincode` belong to the employee's own (`self`) row: they become the quote's customer and
 * pincode. Dependants carry relationship and age only, as the member contract does (C-04).
 */
export const CENSUS_COLUMNS = [
  'employee_id',
  'relationship',
  'age',
  'name',
  'email',
  'pincode',
] as const;
export type CensusField = (typeof CENSUS_COLUMNS)[number];
export const REQUIRED_CENSUS_COLUMNS: readonly CensusField[] = [
  'employee_id',
  'relationship',
  'age',
];

/** One row as supplied, kept as text so it can be corrected and re-validated. */
export interface CensusRow {
  id: string;
  /** Line in the CSV text (1 is the header). */
  line: number;
  values: Record<CensusField, string>;
  imported: boolean;
  /** Left out of the import by the user (for example, a duplicate). */
  excluded: boolean;
  /** The user confirmed a flagged "possible duplicate" is a different person. */
  notDuplicate: boolean;
}

export type CensusIssueCode =
  | 'REQUIRED'
  | 'INVALID_FORMAT'
  | 'UNSUPPORTED_VALUE'
  | 'OUT_OF_RANGE'
  | 'POSSIBLE_DUPLICATE'
  | 'DUPLICATE_EMPLOYEE_ROW'
  | 'NO_EMPLOYEE_ROW'
  | 'EMPLOYEE_ROW_INVALID'
  | 'NOT_STORED';

export interface CensusIssue {
  field: CensusField | 'row';
  code: CensusIssueCode;
  message: string;
  /** Blocking issues keep the row out of the import. */
  blocking: boolean;
}

export interface CensusBatch {
  clientId: string;
  source: 'supplied-demo' | 'pasted';
  loadedAt: string;
  rows: CensusRow[];
  /** Problems with the file as a whole (missing columns, unparseable CSV). */
  fileIssues: string[];
}

/** An imported census member: relationship and age, as in the member contract. */
export interface Member {
  id: string;
  clientId: string;
  employeeId: string;
  relationship: Relationship;
  age: number;
  sourceLine: number;
  importedAt: string;
}

/** The employee's own details from the `self` row: the customer of that family's quotes. */
export interface Employee {
  clientId: string;
  employeeId: string;
  name: string;
  email: string | null;
  pincode: string;
  importedAt: string;
}

// ---- Quote requests and jobs ----------------------------------------------------------------

export interface QuoteRequestRecord {
  id: string;
  clientId: string;
  employeeId: string;
  memberIds: string[];
  /** Validated with the existing `validateQuoteDraft` and the placeholder input rules. */
  draft: QuoteDraft;
  insurerIds: string[];
  createdAt: string;
}

/** Sub-steps of `running`, reported as the progress event's `progressStep` (slugs). */
export const JOB_STEPS = [
  'queued',
  'validating',
  'preparing',
  'submitting-simulated',
  'awaiting-response',
  'normalizing',
] as const;
export type JobStep = (typeof JOB_STEPS)[number];

/** Statuses a demo job attempt can have: a subset of the contract's RunStatus. */
export type JobStatus = Extract<
  RunStatus,
  'pending' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled'
>;
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  'completed',
  'failed',
  'timed_out',
  'cancelled',
];

export interface JobAttempt {
  number: number;
  status: JobStatus;
  step: JobStep | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Execution history, each entry a contract progress event. */
  events: ProgressEvent[];
  /** The simulator's raw response, exactly as received (synthetic JSON). */
  simulatedPayload: string | null;
  /** What the adapter's `parse` produced, with the orchestrator's result ID. */
  resultInput: InsurerResultInput | null;
  normalized: NormalizedResult | null;
  /** Fields the normalised result does not have (shown, never filled in). */
  missingFields: string[];
  /** The engine's own validity findings for this result. */
  validityFindings: Finding[];
  /** Contract issues when the response could not be normalised (paths and codes only). */
  normalizationIssues: ValidationIssue[];
  errorCode: AppErrorCode | null;
  message: string | null;
}

export interface JobRecord {
  id: string;
  quoteRequestId: string;
  clientId: string;
  insurerId: string;
  createdAt: string;
  attempts: JobAttempt[];
}

/** The engine input and output for one comparison, kept so the report shows the same thing. */
export interface ComparisonSnapshot {
  id: string;
  quoteRequestId: string;
  generatedAt: string;
  /** The latest attempt of each job, as passed to `compareQuotes`. */
  inputs: { jobId: string; attempt: number; result: InsurerResultInput }[];
  result: ComparisonResult;
}

export interface ReportRecord {
  id: string;
  quoteRequestId: string;
  comparisonId: string;
  generatedAt: string;
}

// ---- Activity -------------------------------------------------------------------------------

export const ACTIVITY_TYPES = [
  'demo.reset',
  'client.created',
  'census.loaded',
  'census.corrected',
  'census.imported',
  'quote-request.created',
  'job.queued',
  'job.started',
  'job.response-received',
  'job.normalized',
  'job.failed',
  'job.timed-out',
  'job.cancelled',
  'job.retried',
  'comparison.generated',
  'report.generated',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** An application event. Messages carry counts and IDs only: never names, ages or contacts. */
export interface ActivityEvent {
  id: string;
  at: string;
  type: ActivityType;
  message: string;
  refs: {
    clientId?: string;
    quoteRequestId?: string;
    jobId?: string;
    attempt?: number;
    comparisonId?: string;
    reportId?: string;
  };
}

export interface DemoState {
  clients: Client[];
  census: CensusBatch[];
  employees: Employee[];
  members: Member[];
  quoteRequests: QuoteRequestRecord[];
  jobs: JobRecord[];
  comparisons: ComparisonSnapshot[];
  reports: ReportRecord[];
  activity: ActivityEvent[];
  counters: Record<string, number>;
}
