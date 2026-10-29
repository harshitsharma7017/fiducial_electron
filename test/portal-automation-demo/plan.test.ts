// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): field mapping, unsupported and changed
// fields, verification and the refusal of final actions.
import { describe, expect, it } from 'vitest';
import { SYNTHETIC_DEMO_PROPOSAL } from '../../src/demo/portal-automation/shared/demo-data';
import { UNMAPPED } from '../../src/demo/portal-automation/shared/field-map';
import {
  assertNoFinalAction,
  planFill,
  verifyStep,
} from '../../src/demo/portal-automation/shared/plan';
import { control, formSnapshot } from './fixtures';

const data = { ...SYNTHETIC_DEMO_PROPOSAL, assignedTo: 'Demo Manager' };
const skippedKeys = (plan: ReturnType<typeof planFill>) => plan.skipped.map((item) => item.key);

describe('planFill on the inspected New proposal form', () => {
  it('maps each demo field to its own field of the form, in order', () => {
    const plan = planFill(formSnapshot(), data);
    expect(plan.steps.map((step) => [step.key, step.command])).toEqual([
      [
        'caseType',
        {
          op: 'check',
          target: { primary: 'New business', kind: 'radio', name: 'type', value: 'NEW' },
        },
      ],
      [
        'insuredName',
        {
          op: 'pick-client',
          target: { primary: 'Search clients by name or GSTIN', kind: 'search' },
          name: 'Deccan Cold Chain LLP',
          timeoutMs: 8000,
        },
      ],
      [
        'policyStart',
        {
          op: 'set',
          target: { primary: 'Policy period from', kind: 'date', name: 'policyStart' },
          value: '2026-12-01',
        },
      ],
      [
        'policyEnd',
        {
          op: 'set',
          target: { primary: 'Policy period to', kind: 'date', name: 'policyEnd' },
          value: '2027-11-30',
        },
      ],
      [
        'assignedTo',
        {
          op: 'select-option',
          target: { primary: 'Assigned to', kind: 'select', name: 'ownerId' },
          optionText: 'Demo Manager',
        },
      ],
      [
        'quotesNeededBy',
        {
          op: 'set',
          target: { primary: 'Quotes needed by', kind: 'date', name: 'dueDate' },
          value: '2026-11-20',
        },
      ],
    ]);
  });

  it('chooses the Renewal card for a renewal', () => {
    const plan = planFill(formSnapshot(), { ...data, caseType: 'RENEWAL' });
    expect(plan.steps[0]!.command).toEqual({
      op: 'check',
      target: { primary: 'Renewal', kind: 'radio', name: 'type', value: 'EXISTING' },
    });
  });

  it('lists the data the form has no field for, with the reason, and never fills it', () => {
    const plan = planFill(formSnapshot(), data);
    for (const field of UNMAPPED) {
      expect(plan.skipped).toContainEqual(field);
      expect(plan.steps.some((step) => step.key === field.key)).toBe(false);
    }
    expect(skippedKeys(plan)).toEqual(
      expect.arrayContaining(['risk.stockSumInsured', 'dataSheetFile']),
    );
  });

  it('keeps the signed-in user when no staff name is given, and never picks another person', () => {
    expect(skippedKeys(planFill(formSnapshot(), { ...data, assignedTo: '' }))).toContain(
      'assignedTo',
    );
    const unknown = planFill(formSnapshot(), { ...data, assignedTo: 'Nobody Known' });
    expect(unknown.skipped.find((item) => item.key === 'assignedTo')?.reason).toMatch(
      /No “Nobody Known” in the list/,
    );
  });

  it('skips a field missing from a changed form instead of typing elsewhere', () => {
    const changed = formSnapshot();
    changed.controls = changed.controls.filter((item) => item.primary !== 'Quotes needed by');
    const plan = planFill(changed, data);
    expect(plan.steps.map((step) => step.key)).not.toContain('quotesNeededBy');
    expect(plan.skipped.find((item) => item.key === 'quotesNeededBy')?.reason).toMatch(
      /not on the form/,
    );
  });

  it('skips a field whose type or name changed', () => {
    const changed = formSnapshot();
    changed.controls = changed.controls.map((item) =>
      item.primary === 'Policy period from' ? { ...item, kind: 'text' as const } : item,
    );
    changed.controls = changed.controls.map((item) =>
      item.primary === 'Policy period to' ? { ...item, name: 'endDate' } : item,
    );
    const plan = planFill(changed, data);
    expect(plan.skipped.find((item) => item.key === 'policyStart')?.reason).toMatch(
      /now a text field/,
    );
    expect(plan.skipped.find((item) => item.key === 'policyEnd')?.reason).toMatch(/has changed/);
  });

  it('skips an ambiguous or disabled field', () => {
    const twice = formSnapshot();
    twice.controls.push(control({ primary: 'Policy period to', kind: 'date', name: 'policyEnd' }));
    expect(planFill(twice, data).skipped.find((item) => item.key === 'policyEnd')?.reason).toMatch(
      /More than one field/,
    );
    const disabled = formSnapshot();
    disabled.controls = disabled.controls.map((item) =>
      item.primary === 'Assigned to' ? { ...item, disabled: true } : item,
    );
    expect(
      planFill(disabled, data).skipped.find((item) => item.key === 'assignedTo')?.reason,
    ).toMatch(/disabled/);
  });
});

describe('the final action', () => {
  it('is never part of a plan', () => {
    const plan = planFill(formSnapshot(), data);
    for (const step of plan.steps) {
      expect(['set', 'check', 'select-option', 'pick-client']).toContain(step.command.op);
      expect(JSON.stringify(step.command)).not.toMatch(/Create proposal/);
    }
  });

  it('is refused if a step ever names it', () => {
    const snapshot = formSnapshot();
    const plan = planFill(snapshot, data);
    const pressing = {
      ...plan,
      steps: [
        ...plan.steps,
        {
          ...plan.steps[0]!,
          key: 'create',
          command: {
            op: 'check' as const,
            target: { primary: 'Create proposal', kind: 'other' as const },
          },
        },
      ],
    };
    expect(() => assertNoFinalAction(pressing, snapshot)).toThrow(/final action/);
    const renamed = {
      ...plan,
      steps: [
        {
          ...plan.steps[0]!,
          command: {
            op: 'check' as const,
            target: { primary: 'Save draft', kind: 'other' as const },
          },
        },
      ],
    };
    expect(() => assertNoFinalAction(renamed, snapshot)).toThrow(/final action/);
  });
});

describe('verifyStep', () => {
  it('reads each kind of field back', () => {
    const plan = planFill(formSnapshot(), data);
    const after = formSnapshot();
    after.chosenClient = 'Deccan Cold Chain LLP';
    after.controls = after.controls.map((item) => {
      if (item.name === 'policyStart') return { ...item, value: '2026-12-01' };
      if (item.name === 'policyEnd') return { ...item, value: '2027-11-30' };
      if (item.name === 'dueDate') return { ...item, value: '2026-11-20' };
      if (item.name === 'ownerId') return { ...item, value: 'u2' };
      return item;
    });
    expect(plan.steps.map((step) => verifyStep(step, after))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('reports a value the form did not keep, a different person and an unchosen client', () => {
    const plan = planFill(formSnapshot(), data);
    const after = formSnapshot();
    after.controls = after.controls.map((item) =>
      item.name === 'policyStart' ? { ...item, value: '2026-12-02' } : item,
    );
    const byKey = Object.fromEntries(plan.steps.map((step) => [step.key, verifyStep(step, after)]));
    expect(byKey).toMatchObject({
      policyStart: false,
      assignedTo: false,
      insuredName: false,
      caseType: true,
    });
  });

  it('fails when the field has gone after filling', () => {
    const plan = planFill(formSnapshot(), data);
    const after = formSnapshot();
    after.controls = [];
    expect(
      plan.steps
        .filter((step) => step.key !== 'insuredName')
        .some((step) => verifyStep(step, after)),
    ).toBe(false);
  });
});
