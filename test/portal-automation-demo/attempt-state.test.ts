// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the creation-attempt state machine.
import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_STATES,
  canTransition,
  isTerminal,
  isUnresolved,
  stateAfterRestart,
  type AttemptState,
} from '../../src/demo/portal-automation/shared/attempt-state';

const VALID: [AttemptState, AttemptState[]][] = [
  ['PREPARED', ['AWAITING_APPROVAL', 'CANCELLED']],
  ['AWAITING_APPROVAL', ['APPROVED', 'CANCELLED']],
  ['APPROVED', ['SUBMITTING', 'CANCELLED']],
  ['SUBMITTING', ['VERIFYING', 'REFUSED', 'NOT_CREATED', 'UNCERTAIN', 'RECONCILIATION_REQUIRED']],
  ['VERIFYING', ['CREATED', 'UNCERTAIN', 'RECONCILIATION_REQUIRED']],
  ['UNCERTAIN', ['VERIFYING', 'NOT_CREATED']],
  ['RECONCILIATION_REQUIRED', ['VERIFYING', 'NOT_CREATED']],
  ['CREATED', []],
  ['REFUSED', []],
  ['NOT_CREATED', []],
  ['CANCELLED', []],
];

describe('the creation-attempt state machine', () => {
  it('allows exactly the documented transitions', () => {
    expect(VALID.map(([from]) => from).sort()).toEqual([...ATTEMPT_STATES].sort());
    for (const [from, allowed] of VALID) {
      for (const to of ATTEMPT_STATES) {
        expect(canTransition(from, to), `${from} → ${to}`).toBe(allowed.includes(to));
      }
    }
  });

  it('never leads back to submission: no state returns to APPROVED or SUBMITTING after it', () => {
    for (const from of ATTEMPT_STATES) {
      if (from === 'AWAITING_APPROVAL') continue;
      expect(canTransition(from, 'APPROVED')).toBe(false);
    }
    for (const from of ATTEMPT_STATES) {
      expect(canTransition(from, 'SUBMITTING')).toBe(from === 'APPROVED');
    }
  });

  it('has four final states and four unresolved ones', () => {
    expect(ATTEMPT_STATES.filter(isTerminal)).toEqual([
      'CREATED',
      'REFUSED',
      'NOT_CREATED',
      'CANCELLED',
    ]);
    expect(ATTEMPT_STATES.filter(isUnresolved)).toEqual([
      'SUBMITTING',
      'VERIFYING',
      'UNCERTAIN',
      'RECONCILIATION_REQUIRED',
    ]);
  });

  it('after a restart: cancels what was not sent, and asks to reconcile what may have been', () => {
    expect(stateAfterRestart('PREPARED')).toBe('CANCELLED');
    expect(stateAfterRestart('AWAITING_APPROVAL')).toBe('CANCELLED');
    expect(stateAfterRestart('APPROVED')).toBe('CANCELLED');
    expect(stateAfterRestart('SUBMITTING')).toBe('RECONCILIATION_REQUIRED');
    expect(stateAfterRestart('VERIFYING')).toBe('RECONCILIATION_REQUIRED');
    for (const state of [
      'CREATED',
      'REFUSED',
      'NOT_CREATED',
      'CANCELLED',
      'UNCERTAIN',
      'RECONCILIATION_REQUIRED',
    ] as const) {
      expect(stateAfterRestart(state)).toBe(state);
    }
    // Every restart move is itself a valid transition.
    for (const state of ATTEMPT_STATES) {
      const to = stateAfterRestart(state);
      if (to !== state) expect(canTransition(state, to)).toBe(true);
    }
  });
});
