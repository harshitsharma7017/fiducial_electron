// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// What the in-page agent reports and accepts, and the run report the demo screen shows. Plain
// data only: it crosses from the portal page to the main process and on to the demo screen.

export type ControlKind =
  'text' | 'search' | 'date' | 'radio' | 'checkbox' | 'file' | 'select' | 'textarea' | 'other';

/** A labelled form control as the page shows it. */
export interface ControlSnapshot {
  /** The label's whole text, whitespace collapsed. */
  label: string;
  /** The label's first line (a radio card's title, without its hint); else the whole label. */
  primary: string;
  kind: ControlKind;
  name: string | null;
  value: string;
  checked: boolean;
  disabled: boolean;
  /** Option texts and values of a select. */
  options: { text: string; value: string }[];
}

export interface PageSnapshot {
  path: string;
  heading: string;
  /** A password field is on the page: the user has to sign in. */
  signInShown: boolean;
  controls: ControlSnapshot[];
  /** Texts of the page's submit buttons (the actions the demo never takes). */
  submitButtons: string[];
  /** The insured shown as chosen on the New proposal form, if any. */
  chosenClient: string | null;
  /** Client names offered by the client search, as listed. */
  clientChoices: string[];
  /** Texts of the page's alerts (a failed sign-in, a refused save), if any. */
  alerts?: string[];
  /** The chosen client's risk locations on the form, as the portal ticks them (read only). */
  riskLocations?: { name: string; checked: boolean }[];
}

/** Finds one control: by its label's first line and, where known, its name and value. */
export interface ControlTarget {
  primary: string;
  kind: ControlKind;
  name?: string;
  value?: string;
}

export type AgentCommand =
  | { op: 'snapshot' }
  | { op: 'set'; target: ControlTarget; value: string }
  | { op: 'check'; target: ControlTarget }
  | { op: 'select-option'; target: ControlTarget; optionText: string }
  | { op: 'pick-client'; target: ControlTarget; name: string; timeoutMs: number }
  /** Installs the submit block and the banner (the full workflow passes its own banner text). */
  | { op: 'guard'; banner?: string }
  /** Read-only: who is signed in (GET /api/proxy/auth/me). Never credentials. */
  | { op: 'session' }
  /**
   * Full workflow only, after the user confirmed: allows one submit and presses the form's one
   * final action of exactly this text, on the New proposal form.
   */
  | { op: 'create'; action: string }
  /** Read-only: one proposal (GET /api/proxy/proposals/<id>). */
  | { op: 'read-proposal'; id: string }
  /** Read-only: the newest proposals (GET /api/proxy/proposals?limit=100). */
  | { op: 'recent-proposals' };

/** The signed-in user as the portal reports them: a name and whether they may create. */
export interface SessionInfo {
  signedIn: boolean;
  name: string | null;
  /** Holds property.create (to create) and property.view (to read the proposal back). */
  canCreateProperty: boolean;
}

/** A proposal as the portal returns it, reduced to what the demo checks and shows. */
export interface ProposalReadback {
  id: string;
  reference: string;
  type: string;
  stage: string;
  clientName: string;
  ownerName: string;
  policyStart: string | null;
  policyEnd: string | null;
  dueDate: string;
  createdAt: string;
}

export type AgentFailure =
  'not-found' | 'ambiguous' | 'disabled' | 'no-match' | 'timeout' | 'failed';

export type AgentResult =
  | {
      ok: true;
      snapshot?: PageSnapshot;
      session?: SessionInfo;
      proposal?: ProposalReadback;
      proposals?: ProposalReadback[];
    }
  | { ok: false; reason: AgentFailure };

export type RunState =
  | 'idle'
  | 'opening'
  | 'waiting-for-login'
  | 'finding-form'
  | 'filling'
  | 'done'
  | 'failed'
  | 'cancelled'
  // The full workflow only:
  | 'awaiting-confirmation'
  | 'creating'
  | 'verifying-result'
  | 'created'
  | 'creation-failed'
  | 'uncertain';

export type StepStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped' | 'uncertain';

export const PROGRESS_STEPS = [
  { key: 'authentication', label: 'Authentication' },
  { key: 'navigation', label: 'Navigation' },
  { key: 'filling', label: 'Form filling' },
  { key: 'verification', label: 'Field verification' },
  { key: 'confirmation', label: 'User confirmation' },
  { key: 'creation', label: 'Proposal creation' },
  { key: 'result', label: 'Result verification' },
] as const;

export type ProgressKey = (typeof PROGRESS_STEPS)[number]['key'];

export interface ProgressStep {
  key: ProgressKey;
  label: string;
  status: StepStatus;
}

/** What the user reviews before confirming creation. */
export interface CreationReview {
  /** Ties a confirmation to this review: a confirmation for any other review is refused. */
  token: string;
  environment: string;
  origin: string;
  caseType: string;
  insured: string;
  policyStart: string;
  policyEnd: string;
  quotesNeededBy: string;
  assignedTo: string;
  /** The risk locations ticked on the form: the proposal covers these. */
  riskLocations: string[];
  /** The button the confirmation will press. */
  action: string;
  fields: FieldOutcome[];
  skipped: SkippedField[];
  warnings: string[];
}

export interface FieldOutcome {
  key: string;
  label: string;
  value: string;
  /** Filled and read back with the expected value. */
  verified: boolean;
}

export interface SkippedField {
  key: string;
  label: string;
  reason: string;
}

export interface RunReport {
  state: RunState;
  message: string;
  portal: string;
  filled: FieldOutcome[];
  skipped: SkippedField[];
  errors: SkippedField[];
  /** The final action found on the form and deliberately not taken ("Create proposal"). */
  stoppedBefore: string | null;
  /** Write requests (POST, PUT, PATCH, DELETE) the demo window blocked. */
  blockedWrites: number;
  mode: 'fill-only' | 'full';
  /** The portal environment, always shown. */
  environment: {
    kind: 'production' | 'test' | 'unrecognised';
    name: string;
    verified: boolean | null;
  };
  /** Why the full workflow was asked for but refused. */
  fullRefused: string | null;
  /** The signed-in user's name, once the session is verified. */
  signedInAs: string | null;
  progress: ProgressStep[];
  /** Set while the full workflow waits for the user's confirmation. */
  review: CreationReview | null;
  /** The created proposal, as read back from the portal. */
  proposal: ProposalReadback | null;
}

export const IDLE_REPORT: RunReport = {
  state: 'idle',
  message: 'Not started.',
  portal: '',
  filled: [],
  skipped: [],
  errors: [],
  stoppedBefore: null,
  blockedWrites: 0,
  mode: 'fill-only',
  environment: { kind: 'unrecognised', name: '', verified: null },
  fullRefused: null,
  signedInAs: null,
  progress: PROGRESS_STEPS.map((step) => ({ ...step, status: 'pending' })),
  review: null,
  proposal: null,
};
