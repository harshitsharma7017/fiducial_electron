// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// Pure planning and checking: which fields of the inspected form get which demo value, what is
// skipped and why, and whether each value reads back as filled. No Electron, no page access.
import type { DemoProposal } from './demo-data';
import { FIELD_MAP, FORBIDDEN_ACTION, UNMAPPED, type FieldMapping } from './field-map';
import type {
  AgentCommand,
  ControlSnapshot,
  ControlTarget,
  PageSnapshot,
  SkippedField,
} from './protocol';

export type Expectation =
  | { type: 'value'; target: ControlTarget; value: string }
  | { type: 'checked'; target: ControlTarget }
  | { type: 'option'; target: ControlTarget; optionText: string }
  | { type: 'client'; name: string };

export interface PlanStep {
  key: string;
  label: string;
  /** The value as the demo screen shows it. */
  display: string;
  command: AgentCommand;
  expect: Expectation;
}

export interface FillPlan {
  steps: PlanStep[];
  skipped: SkippedField[];
}

const PICK_CLIENT_TIMEOUT_MS = 8000;

/** The controls a target names: same first line and kind, and the same name and value if set. */
export function findControls(snapshot: PageSnapshot, target: ControlTarget): ControlSnapshot[] {
  return snapshot.controls.filter(
    (control) =>
      control.primary === target.primary &&
      control.kind === target.kind &&
      (target.name === undefined || control.name === target.name) &&
      (target.value === undefined || control.value === target.value),
  );
}

/** Why a target cannot be used on this page, or null when exactly one usable control matches. */
export function targetProblem(snapshot: PageSnapshot, target: ControlTarget): string | null {
  const matches = findControls(snapshot, target);
  if (matches.length === 1) {
    return matches[0]!.disabled ? 'The field is disabled on the form.' : null;
  }
  if (matches.length > 1) {
    return 'More than one field matches; skipped rather than guess which one.';
  }
  const sameLabel = snapshot.controls.filter((control) => control.primary === target.primary);
  if (sameLabel.some((control) => control.kind === target.kind)) {
    return `The form’s “${target.primary}” field has changed (it is not the one inspected); skipped.`;
  }
  if (sameLabel.length > 0) {
    return `The form’s “${target.primary}” is now a ${sameLabel[0]!.kind} field, not the ${target.kind} field inspected; skipped.`;
  }
  return `“${target.primary}” is not on the form (it may have changed); skipped.`;
}

function stepFor(mapping: FieldMapping, data: DemoProposal): PlanStep | string {
  if (mapping.action === 'check') {
    const target = mapping.target(data);
    return {
      key: mapping.key,
      label: mapping.label,
      display: mapping.display(data),
      command: { op: 'check', target },
      expect: { type: 'checked', target },
    };
  }
  const value = mapping.value(data);
  const { target } = mapping;
  if (mapping.action === 'select-option') {
    if (!value) return 'No name given: left as the portal sets it (the signed-in user).';
    return {
      key: mapping.key,
      label: mapping.label,
      display: value,
      command: { op: 'select-option', target, optionText: value },
      expect: { type: 'option', target, optionText: value },
    };
  }
  if (mapping.action === 'pick-client') {
    return {
      key: mapping.key,
      label: mapping.label,
      display: value,
      command: { op: 'pick-client', target, name: value, timeoutMs: PICK_CLIENT_TIMEOUT_MS },
      expect: { type: 'client', name: value },
    };
  }
  return {
    key: mapping.key,
    label: mapping.label,
    display: value,
    command: { op: 'set', target, value },
    expect: { type: 'value', target, value },
  };
}

function targetOf(command: AgentCommand): ControlTarget | null {
  return 'target' in command ? command.target : null;
}

/**
 * Plans the fill of the inspected form from a snapshot of it. A field missing, changed, ambiguous
 * or disabled is skipped with the reason; data the form has no field for is listed as skipped.
 */
export function planFill(snapshot: PageSnapshot, data: DemoProposal): FillPlan {
  const steps: PlanStep[] = [];
  const skipped: SkippedField[] = [];
  for (const mapping of FIELD_MAP) {
    const step = stepFor(mapping, data);
    if (typeof step === 'string') {
      skipped.push({ key: mapping.key, label: mapping.label, reason: step });
      continue;
    }
    const target = targetOf(step.command);
    const problem = target ? targetProblem(snapshot, target) : null;
    if (problem) {
      skipped.push({ key: mapping.key, label: mapping.label, reason: problem });
      continue;
    }
    if (step.command.op === 'select-option') {
      const control = findControls(snapshot, step.command.target)[0]!;
      const text = step.command.optionText;
      if (!control.options.some((option) => option.text === text)) {
        skipped.push({
          key: mapping.key,
          label: mapping.label,
          reason: `No “${text}” in the list; skipped rather than choose someone else.`,
        });
        continue;
      }
    }
    steps.push(step);
  }
  for (const field of UNMAPPED) skipped.push({ ...field });
  assertNoFinalAction({ steps, skipped }, snapshot);
  return { steps, skipped };
}

/**
 * Refuses a plan that would press a submit button or anything named like a final action. The
 * planner builds only field steps; this is the second, independent check.
 */
export function assertNoFinalAction(plan: FillPlan, snapshot: PageSnapshot): void {
  const allowed = new Set(['set', 'check', 'select-option', 'pick-client']);
  for (const step of plan.steps) {
    const target = targetOf(step.command);
    const named = target?.primary ?? '';
    if (
      !allowed.has(step.command.op) ||
      FORBIDDEN_ACTION.test(named) ||
      snapshot.submitButtons.includes(named)
    ) {
      throw new Error(`Refused: the plan would take a final action (${step.key}).`);
    }
  }
}

/** Whether a step's value reads back from the page as filled. */
export function verifyStep(step: PlanStep, after: PageSnapshot): boolean {
  const expectation = step.expect;
  if (expectation.type === 'client') return after.chosenClient === expectation.name;
  const matches = findControls(after, expectation.target);
  if (matches.length !== 1) return false;
  const control = matches[0]!;
  switch (expectation.type) {
    case 'value':
      return control.value === expectation.value;
    case 'checked':
      return control.checked;
    case 'option':
      return (
        control.options.find((option) => option.value === control.value)?.text ===
        expectation.optionText
      );
  }
}
