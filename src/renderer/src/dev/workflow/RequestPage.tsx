// DEVELOPMENT-ONLY demo workflow: the quote request form and its review. The review shows the
// result of the existing validators exactly (validateQuoteDraft with the placeholder input rules,
// then the required-field pre-flight per simulator); jobs start only for a request that passes.
import { useId, useState } from 'react';
import { parseInrAmount } from '../../../../shared/money';
import { PLACEHOLDER_QUOTE_INPUT_RULES } from '../../../../shared/rules/quote-input-rules';
import {
  describeCoverType,
  describeIssue,
  describeIssueLocation,
  describeMembers,
  describeTenure,
  formatAmount,
  relationshipLabel,
} from '../demo-model';
import { Icon } from '../icons';
import { type QuoteRequestForm, REQUIRED_FIELD_LABEL } from './engine';
import type { SimulatorAdapter } from './simulators';
import type { DemoState, Member } from './types';
import { Badge, Callout, PageTitle, SimulatedTag, StatePanel, plural, useWorkflow } from './ui';

const RULES = PLACEHOLDER_QUOTE_INPUT_RULES;

function sumInsuredHint(): string {
  const rule = RULES.sumInsured;
  return rule.kind === 'range'
    ? `${formatAmount(rule.minPaise)} to ${formatAmount(rule.maxPaise)} in steps of ${formatAmount(rule.stepPaise)}`
    : `one of ${rule.valuesPaise.map(formatAmount).join(', ')}`;
}

function familyOf(state: DemoState, clientId: string, employeeId: string): Member[] {
  return state.members.filter((m) => m.clientId === clientId && m.employeeId === employeeId);
}

/** The form fields that follow from the chosen employee: their family, cover type and pincode. */
function familyFields(
  state: DemoState,
  clientId: string,
  employeeId: string | null,
): Pick<QuoteRequestForm, 'employeeId' | 'memberIds' | 'coverType' | 'pincode'> {
  const employees = state.employees.filter((e) => e.clientId === clientId);
  const employee = employees.find((e) => e.employeeId === employeeId) ?? employees[0];
  const family = employee ? familyOf(state, clientId, employee.employeeId) : [];
  return {
    employeeId: employee?.employeeId ?? '',
    memberIds: family.map((m) => m.id),
    coverType: family.length >= 2 ? 'floater' : 'individual',
    pincode: employee?.pincode ?? '',
  };
}

export function RequestPage(): React.JSX.Element {
  const { state, workflow, nav, go, flash } = useWorkflow();
  const eligible = state.clients.filter((c) => state.employees.some((e) => e.clientId === c.id));
  const startClient = eligible.find((c) => c.id === nav.clientId)?.id ?? eligible[0]?.id ?? '';
  const [form, setForm] = useState<QuoteRequestForm>(() => ({
    clientId: startClient,
    sumInsuredRupees: '5,00,000',
    tenureYears: 1,
    insurerIds: workflow.adapters.map((a) => a.id),
    ...familyFields(state, startClient, nav.employeeId),
  }));
  const [stage, setStage] = useState<'edit' | 'review'>('edit');

  if (eligible.length === 0) {
    return (
      <>
        <PageTitle title="Quote request" />
        <StatePanel
          tone="neutral"
          icon="inbox"
          title="Import a census first"
          text="A quote request covers one employee's family, so it needs imported census members."
        >
          <div>
            <button type="button" className="qc-btn qc-btn-primary" onClick={() => go('census')}>
              Go to clients & census
              <Icon name="arrow-right" />
            </button>
          </div>
        </StatePanel>
      </>
    );
  }

  const start = (): void => {
    const created = workflow.createQuoteRequest(form);
    if (!created.ok) {
      flash('danger', created.error);
      return;
    }
    go('jobs', { requestId: created.value.id, clientId: created.value.clientId });
    flash(
      'info',
      `Quote request ${created.value.id} created: ${plural(created.value.insurerIds.length, 'simulated job')} queued.`,
    );
  };

  return (
    <>
      <PageTitle
        title="Quote request"
        description={
          stage === 'edit'
            ? 'Choose the employee, the family members to cover and the cover wanted, then review the request before any job starts.'
            : 'Check the request and the validation results. Jobs start only when the request passes.'
        }
      />
      <ol className="wf-stepper" aria-label="Quote request steps">
        <li
          className={stage === 'edit' ? 'is-current' : 'is-done'}
          aria-current={stage === 'edit' ? 'step' : undefined}
        >
          1. Request details
        </li>
        <li
          className={stage === 'review' ? 'is-current' : ''}
          aria-current={stage === 'review' ? 'step' : undefined}
        >
          2. Review and start
        </li>
      </ol>
      {stage === 'edit' ? (
        <RequestForm
          form={form}
          setForm={setForm}
          eligibleIds={eligible.map((c) => c.id)}
          onReview={() => setStage('review')}
        />
      ) : (
        <RequestReview form={form} onEdit={() => setStage('edit')} onStart={start} />
      )}
    </>
  );
}

function RequestForm(props: {
  form: QuoteRequestForm;
  setForm: React.Dispatch<React.SetStateAction<QuoteRequestForm>>;
  eligibleIds: string[];
  onReview: () => void;
}): React.JSX.Element {
  const { state, workflow } = useWorkflow();
  const { form, setForm } = props;
  const ids = {
    client: useId(),
    employee: useId(),
    sumInsured: useId(),
    sumInsuredHint: useId(),
    tenure: useId(),
    pincode: useId(),
    coverName: useId(),
  };
  const employees = state.employees.filter((e) => e.clientId === form.clientId);
  const family = familyOf(state, form.clientId, form.employeeId);
  const toggle = (list: string[], id: string, order: readonly string[]): string[] =>
    list.includes(id)
      ? list.filter((x) => x !== id)
      : order.filter((x) => x === id || list.includes(x));

  return (
    <form
      className="wf-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        props.onReview();
      }}
    >
      <section className="qc-card" aria-labelledby={`${ids.client}-h`}>
        <h2 id={`${ids.client}-h`} className="wf-card-title">
          Customer and members
        </h2>
        <div className="wf-form-grid">
          <div className="wf-field">
            <label htmlFor={ids.client}>Client</label>
            <select
              id={ids.client}
              value={form.clientId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  clientId: e.target.value,
                  ...familyFields(state, e.target.value, null),
                }))
              }
            >
              {state.clients
                .filter((c) => props.eligibleIds.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${c.name} (${c.id})`}
                  </option>
                ))}
            </select>
          </div>
          <div className="wf-field">
            <label htmlFor={ids.employee}>Employee (the customer)</label>
            <select
              id={ids.employee}
              value={form.employeeId}
              onChange={(e) =>
                setForm((f) => ({ ...f, ...familyFields(state, f.clientId, e.target.value) }))
              }
            >
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {`${e.employeeId} — ${e.name} (${plural(familyOf(state, form.clientId, e.employeeId).length, 'member')})`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="wf-checks">
          <legend>Members to cover</legend>
          {family.map((m, index) => (
            <label key={m.id} className="wf-check">
              <input
                type="checkbox"
                checked={form.memberIds.includes(m.id)}
                onChange={() =>
                  setForm((f) => ({
                    ...f,
                    memberIds: toggle(
                      f.memberIds,
                      m.id,
                      family.map((x) => x.id),
                    ),
                  }))
                }
              />
              <span>
                {relationshipLabel(m.relationship)}, age {m.age}
                {index === 0 && m.relationship === 'self' ? (
                  <span className="qc-muted"> (employee)</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className="qc-card" aria-labelledby={`${ids.coverName}-h`}>
        <h2 id={`${ids.coverName}-h`} className="wf-card-title">
          Cover
        </h2>
        <div className="wf-form-grid">
          <fieldset className="wf-checks is-inline">
            <legend>Cover type</legend>
            {(['floater', 'individual'] as const).map((type) => (
              <label key={type} className="wf-check">
                <input
                  type="radio"
                  name={ids.coverName}
                  checked={form.coverType === type}
                  onChange={() => setForm((f) => ({ ...f, coverType: type }))}
                />
                <span>{describeCoverType(type)}</span>
              </label>
            ))}
          </fieldset>
          <div className="wf-field">
            <label htmlFor={ids.sumInsured}>Sum insured (₹)</label>
            <input
              id={ids.sumInsured}
              value={form.sumInsuredRupees}
              inputMode="numeric"
              maxLength={20}
              aria-describedby={ids.sumInsuredHint}
              onChange={(e) => setForm((f) => ({ ...f, sumInsuredRupees: e.target.value }))}
            />
            <span id={ids.sumInsuredHint} className="wf-field-hint">
              Placeholder rule: {sumInsuredHint()}.
            </span>
          </div>
          <div className="wf-field">
            <label htmlFor={ids.tenure}>Policy tenure</label>
            <select
              id={ids.tenure}
              value={form.tenureYears}
              onChange={(e) => setForm((f) => ({ ...f, tenureYears: Number(e.target.value) }))}
            >
              {RULES.tenureYears.map((years) => (
                <option key={years} value={years}>
                  {describeTenure(years)}
                </option>
              ))}
            </select>
            <span className="wf-field-hint">
              The provisional comparison rule ranks 1-year quotes only.
            </span>
          </div>
          <div className="wf-field">
            <label htmlFor={ids.pincode}>Pincode</label>
            <input
              id={ids.pincode}
              value={form.pincode}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
            />
          </div>
        </div>
      </section>

      <section className="qc-card" aria-labelledby={`${ids.employee}-sims`}>
        <div className="qc-card-head">
          <div>
            <h2 id={`${ids.employee}-sims`}>Insurers</h2>
            <p className="qc-muted">
              Every insurer here is a deterministic simulator. Nothing is sent to any insurer.
            </p>
          </div>
          <SimulatedTag />
        </div>
        <fieldset className="wf-sim-list">
          <legend className="qc-visually-hidden">Simulators to request quotes from</legend>
          {workflow.adapters.map((adapter) => (
            <SimulatorOption
              key={adapter.id}
              adapter={adapter}
              checked={form.insurerIds.includes(adapter.id)}
              onChange={() =>
                setForm((f) => ({
                  ...f,
                  insurerIds: toggle(
                    f.insurerIds,
                    adapter.id,
                    workflow.adapters.map((a) => a.id),
                  ),
                }))
              }
            />
          ))}
        </fieldset>
      </section>

      <div className="wf-actions is-end">
        <button type="submit" className="qc-btn qc-btn-primary">
          Review request
          <Icon name="arrow-right" />
        </button>
      </div>
    </form>
  );
}

function SimulatorOption(props: {
  adapter: SimulatorAdapter;
  checked: boolean;
  onChange: () => void;
}): React.JSX.Element {
  const { adapter } = props;
  return (
    <label className={`wf-sim-option${props.checked ? ' is-selected' : ''}`}>
      <input type="checkbox" checked={props.checked} onChange={props.onChange} />
      <span className="wf-sim-text">
        <span className="wf-sim-name">
          {adapter.displayName} <SimulatedTag />
        </span>
        <span className="qc-muted">{adapter.scenario}</span>
        <span className="wf-sim-req">
          Requires:{' '}
          {adapter.requiredFields.length === 0
            ? 'nothing beyond the request'
            : adapter.requiredFields.map((f) => REQUIRED_FIELD_LABEL[f]).join(', ')}
        </span>
      </span>
    </label>
  );
}

function RequestReview(props: {
  form: QuoteRequestForm;
  onEdit: () => void;
  onStart: () => void;
}): React.JSX.Element {
  const { state, workflow } = useWorkflow();
  const { form } = props;
  const review = workflow.review(form);
  const employee = state.employees.find(
    (e) => e.clientId === form.clientId && e.employeeId === form.employeeId,
  );
  const members = form.memberIds
    .map((id) => state.members.find((m) => m.id === id))
    .filter((m): m is Member => m !== undefined);
  const selected = workflow.adapters.filter((a) => form.insurerIds.includes(a.id));
  const blocked = review.preflight.filter((p) => !p.ready).length;
  // The same parser the review uses, so the summary shows the amount that will be validated.
  const sumInsured = parseInrAmount(form.sumInsuredRupees);
  const summaryId = useId();
  const checksId = useId();

  return (
    <>
      <section className="qc-card" aria-labelledby={summaryId}>
        <h2 id={summaryId} className="wf-card-title">
          Request summary
        </h2>
        <dl className="wf-dl">
          <div>
            <dt>Customer</dt>
            <dd>{employee ? `${employee.name} (${employee.employeeId})` : 'Not selected'}</dd>
          </div>
          <div>
            <dt>Customer e-mail</dt>
            <dd>{employee?.email ?? 'None'}</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{members.length > 0 ? describeMembers(members) : 'None selected'}</dd>
          </div>
          <div>
            <dt>Cover type</dt>
            <dd>{describeCoverType(form.coverType)}</dd>
          </div>
          <div>
            <dt>Sum insured</dt>
            <dd>{sumInsured.ok ? formatAmount(sumInsured.paise) : 'Not a valid amount'}</dd>
          </div>
          <div>
            <dt>Policy tenure</dt>
            <dd>{describeTenure(form.tenureYears)}</dd>
          </div>
          <div>
            <dt>Pincode</dt>
            <dd>{form.pincode || 'Not entered'}</dd>
          </div>
          <div>
            <dt>Simulators</dt>
            <dd>
              {selected.length > 0
                ? selected.map((a) => a.displayName).join(', ')
                : 'None selected'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="qc-card" aria-labelledby={checksId}>
        <h2 id={checksId} className="wf-card-title">
          Validation
        </h2>
        <div className="wf-stack">
          {review.formIssues.length > 0 && (
            <Callout tone="danger" title="Complete the request">
              <ul className="wf-bullets">
                {review.formIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Callout>
          )}
          {review.draft && !review.draft.ok && (
            <Callout tone="danger" title="The quote request validator rejected the request">
              <ul className="wf-bullets">
                {review.draft.issues.map((issue, index) => (
                  <li key={index}>
                    <strong>{describeIssueLocation(issue, members)}:</strong> {describeIssue(issue)}{' '}
                    <code>{issue.code}</code>
                  </li>
                ))}
              </ul>
              <p>Edit the request to fix these. No job has been created.</p>
            </Callout>
          )}
          {review.draft?.ok && (
            <Callout tone="positive" title="The request passes the quote request validator">
              Contract schema and the placeholder input rules ({RULES.id} {RULES.version}, not yet
              approved by the business).
            </Callout>
          )}
          {review.draft?.ok && (
            <div
              className="wf-table-scroll"
              role="region"
              aria-label="Pre-flight per simulator"
              tabIndex={0}
            >
              <table className="wf-table">
                <caption className="wf-caption">Required-field pre-flight per simulator</caption>
                <thead>
                  <tr>
                    <th scope="col">Simulator</th>
                    <th scope="col">Data shared with it</th>
                    <th scope="col">Pre-flight</th>
                  </tr>
                </thead>
                <tbody>
                  {review.preflight.map((check) => {
                    const adapter = workflow.adapters.find((a) => a.id === check.insurerId);
                    const shares = adapter?.requiredFields.includes('customer.email')
                      ? 'Request and customer e-mail'
                      : 'Request only (members, cover, sum insured, tenure, pincode)';
                    return (
                      <tr key={check.insurerId}>
                        <td>
                          {adapter?.displayName ?? check.insurerId} <SimulatedTag />
                        </td>
                        <td>{shares}</td>
                        <td>
                          {check.ready ? (
                            <Badge tone="positive" label="Ready" />
                          ) : (
                            <>
                              <Badge tone="danger" label="Blocked" />{' '}
                              <span>
                                Missing{' '}
                                {check.missing.map((f) => REQUIRED_FIELD_LABEL[f]).join(', ')}. This
                                job will fail at validation; the others are not affected.
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {blocked > 0 && (
            <Callout tone="warning">
              {plural(blocked, 'simulator')} cannot run with this request. You can start anyway to
              see the pre-flight failure recorded, or go back and deselect{' '}
              {blocked === 1 ? 'it' : 'them'}.
            </Callout>
          )}
        </div>
      </section>

      <div className="wf-actions is-end">
        <button type="button" className="qc-btn qc-btn-secondary" onClick={props.onEdit}>
          <Icon name="arrow-left" />
          Edit request
        </button>
        <button
          type="button"
          className="qc-btn qc-btn-primary"
          disabled={!review.ready}
          onClick={props.onStart}
        >
          Start {plural(selected.length, 'simulated job')}
          <Icon name="arrow-right" />
        </button>
      </div>
    </>
  );
}
