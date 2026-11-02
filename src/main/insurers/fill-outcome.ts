// Pure mapping from the in-page agent's result to the one outcome shown and logged.
import type { FillOutcome } from '../../shared/insurers/fill-outcomes';
import type { FieldState, FillResult } from './login-agent';

const FIELD_PROBLEM: Partial<Record<FieldState, FillOutcome>> = {
  'not-found': 'field-not-found',
  ambiguous: 'field-ambiguous',
  'wrong-type': 'field-wrong-type',
};

export function fillOutcomeOf(result: FillResult): FillOutcome {
  if (!result.ok) return result.reason === 'wrong-origin' ? 'left-login-page' : 'form-not-found';
  for (const state of [result.username, result.password]) {
    const problem = FIELD_PROBLEM[state];
    if (problem) return problem;
  }
  return result.username === 'filled' || result.password === 'filled'
    ? 'filled'
    : 'kept-advisor-input';
}

/** Whether an outcome means the portal's form no longer matches what the app expects. */
export function isFormProblem(outcome: FillOutcome): boolean {
  return (
    outcome === 'form-not-found' ||
    outcome === 'field-not-found' ||
    outcome === 'field-ambiguous' ||
    outcome === 'field-wrong-type'
  );
}
