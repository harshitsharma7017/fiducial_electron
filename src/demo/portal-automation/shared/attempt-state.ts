// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The life of one proposal-creation attempt, as the attempt store records it. Pure decisions,
// tested without Electron or files.
//
//   PREPARED ─▶ AWAITING_APPROVAL ─▶ APPROVED ─▶ SUBMITTING ─▶ VERIFYING ─▶ CREATED
//      │               │                │            │              │
//      └───────────────┴────────────────┴▶ CANCELLED │              ├▶ UNCERTAIN ◀─┐
//                                                    ├▶ REFUSED     └▶ RECONCILIATION_REQUIRED
//                                                    ├▶ NOT_CREATED
//                                                    ├▶ UNCERTAIN ─────▶ VERIFYING (a match found)
//                                                    └▶ RECONCILIATION_REQUIRED ─▶ VERIFYING
//   UNCERTAIN and RECONCILIATION_REQUIRED end in VERIFYING (a proposal was found) or NOT_CREATED
//   (the user, after a look-up, resolved that nothing was created).
//
// Nothing is ever submitted again from any state: a new submission is always a new attempt.

export const ATTEMPT_STATES = [
  'PREPARED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SUBMITTING',
  'VERIFYING',
  'CREATED',
  'REFUSED',
  'NOT_CREATED',
  'CANCELLED',
  'UNCERTAIN',
  'RECONCILIATION_REQUIRED',
] as const;

export type AttemptState = (typeof ATTEMPT_STATES)[number];

const TRANSITIONS: Readonly<Record<AttemptState, readonly AttemptState[]>> = {
  /** The form is filled and checked; the review is being prepared. */
  PREPARED: ['AWAITING_APPROVAL', 'CANCELLED'],
  /** The review is shown; nothing has been sent. */
  AWAITING_APPROVAL: ['APPROVED', 'CANCELLED'],
  /** The user confirmed; the last checks run before anything is sent. */
  APPROVED: ['SUBMITTING', 'CANCELLED'],
  /** Recorded before the network guard is armed: from here a request may reach the portal. */
  SUBMITTING: ['VERIFYING', 'REFUSED', 'NOT_CREATED', 'UNCERTAIN', 'RECONCILIATION_REQUIRED'],
  /** The portal created a proposal (its id is known); it is being read back. */
  VERIFYING: ['CREATED', 'UNCERTAIN', 'RECONCILIATION_REQUIRED'],
  /** Unknown outcome in this app run; needs a look-up or the user's decision. */
  UNCERTAIN: ['VERIFYING', 'NOT_CREATED'],
  /** Unknown outcome found after a restart; needs a look-up or the user's decision. */
  RECONCILIATION_REQUIRED: ['VERIFYING', 'NOT_CREATED'],
  /** A proposal exists for this attempt (its id is recorded). */
  CREATED: [],
  /** The portal refused the request, or the network guard blocked a request that differed. */
  REFUSED: [],
  /** Certainly not created: no request left the computer, or the user resolved it so. */
  NOT_CREATED: [],
  /** Stopped before submission. */
  CANCELLED: [],
};

export function canTransition(from: AttemptState, to: AttemptState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(state: AttemptState): boolean {
  return TRANSITIONS[state].length === 0;
}

/** States in which a proposal may or may not exist: no new submission until resolved. */
export const UNRESOLVED_STATES: readonly AttemptState[] = [
  'SUBMITTING',
  'VERIFYING',
  'UNCERTAIN',
  'RECONCILIATION_REQUIRED',
];

export function isUnresolved(state: AttemptState): boolean {
  return UNRESOLVED_STATES.includes(state);
}

/**
 * Where an attempt found in the store at start-up goes. The app was not running, so nothing is in
 * progress any more: before submission it is cancelled (the review no longer holds); from
 * submission on, the outcome is unknown and needs reconciliation. Never submitted again.
 */
export function stateAfterRestart(state: AttemptState): AttemptState {
  switch (state) {
    case 'PREPARED':
    case 'AWAITING_APPROVAL':
    case 'APPROVED':
      return 'CANCELLED';
    case 'SUBMITTING':
    case 'VERIFYING':
      return 'RECONCILIATION_REQUIRED';
    default:
      return state;
  }
}

/** How a reconciliation look-up ended. */
export type ReconciliationOutcome = 'found' | 'none' | 'several' | 'failed';

/** An attempt as the demo screen lists it: no payload, nothing it does not show. */
export interface AttemptSummary {
  id: string;
  state: AttemptState;
  createdAt: string;
  submittedAt: string | null;
  caseType: 'New business' | 'Renewal';
  clientName: string;
  policyStart: string | null;
  policyEnd: string | null;
  proposalReference: string | null;
  lastReconciledAt: string | null;
  reconciliation: ReconciliationOutcome | null;
  /** Proposals a look-up found that could be this attempt's (several). */
  candidates: { id: string; reference: string; createdAt: string }[];
  unresolved: boolean;
  /** "Not created" may be chosen only after a look-up that ran and found no single match. */
  canMarkNotCreated: boolean;
}
