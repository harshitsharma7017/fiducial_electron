// Outcomes of an attempt to fill an insurer's sign-in form: what happened, never any value.
// Shared by the main process (logging) and the IPC contract (shown to the advisor).

export const FILL_OUTCOMES = [
  'filled',
  'kept-advisor-input',
  'no-login-saved',
  'login-unreadable',
  'form-not-found',
  'field-not-found',
  'field-ambiguous',
  'field-wrong-type',
  'left-login-page',
  'agent-failed',
] as const;

export type FillOutcome = (typeof FILL_OUTCOMES)[number];
