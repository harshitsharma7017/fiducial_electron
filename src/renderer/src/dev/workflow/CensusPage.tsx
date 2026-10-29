// DEVELOPMENT-ONLY demo workflow: clients and the member census. Loading, row-level validation,
// correction, exclusion, duplicate decisions and import all go through the workflow engine; the
// screen shows the staged rows with the issues `validateCensus` reports for them.
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { describeMembers } from '../demo-model';
import { Icon } from '../icons';
import {
  type CensusRowStatus,
  loadCensusCsv,
  rowStatus,
  summariseCensus,
  validateCensus,
} from './census';
import { formatDateTime } from './clock';
import { MAX_CSV_CHARS } from './csv';
import {
  CENSUS_COLUMNS,
  type CensusField,
  type CensusIssue,
  type CensusRow,
  type Client,
} from './types';
import { Badge, ConfirmDialog, Modal, PageTitle, StatePanel, plural, useWorkflow } from './ui';

const FIELD_LABEL: Record<CensusField | 'row', string> = {
  employee_id: 'Employee ID',
  relationship: 'Relationship',
  age: 'Age',
  name: 'Name',
  email: 'E-mail',
  pincode: 'Pincode',
  row: 'Row',
};

const STATUS_BADGE: Record<
  CensusRowStatus,
  { tone: 'positive' | 'info' | 'neutral' | 'danger'; label: string }
> = {
  ready: { tone: 'positive', label: 'Ready' },
  blocked: { tone: 'danger', label: 'Needs correction' },
  imported: { tone: 'info', label: 'Imported' },
  excluded: { tone: 'neutral', label: 'Excluded' },
};

type RowFilter = 'all' | CensusRowStatus;

const ROW_FILTERS: { id: RowFilter; label: string }[] = [
  { id: 'all', label: 'All rows' },
  { id: 'blocked', label: 'Needs correction' },
  { id: 'ready', label: 'Ready' },
  { id: 'imported', label: 'Imported' },
  { id: 'excluded', label: 'Excluded' },
];

type PendingLoad = { source: 'supplied' } | { source: 'text'; text: string; label: string };

export function CensusPage(): React.JSX.Element {
  const { state, nav, go } = useWorkflow();
  const client = state.clients.find((c) => c.id === nav.clientId) ?? state.clients[0];
  const clientFieldId = useId();

  return (
    <>
      <PageTitle
        title="Clients & census"
        description="Choose a client, load its member census, correct the rows that fail validation and import the rest. Each employee's family becomes the members of their quote requests."
      />
      <section className="qc-card" aria-label="Client">
        <div className="wf-client-bar">
          <div className="wf-field wf-field-inline">
            <label htmlFor={clientFieldId}>Client</label>
            <select
              id={clientFieldId}
              value={client?.id ?? ''}
              onChange={(e) => go('census', { clientId: e.target.value })}
            >
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.name} (${c.id})`}
                </option>
              ))}
            </select>
          </div>
          {client && <ClientFacts client={client} />}
        </div>
        <NewClientForm />
      </section>
      {client ? (
        <ClientCensus key={client.id} client={client} />
      ) : (
        <StatePanel
          tone="neutral"
          icon="inbox"
          title="No client"
          text="Add a client to load a census."
        />
      )}
    </>
  );
}

function ClientFacts({ client }: { client: Client }): React.JSX.Element {
  return (
    <dl className="wf-inline-facts">
      <div>
        <dt>E-mail</dt>
        <dd>{client.email ?? 'None'}</dd>
      </div>
      <div>
        <dt>Created</dt>
        <dd>{formatDateTime(client.createdAt)}</dd>
      </div>
      <div>
        <dt>Data</dt>
        <dd>
          <Badge tone="warning" label="Synthetic" />
        </dd>
      </div>
    </dl>
  );
}

function NewClientForm(): React.JSX.Element {
  const { workflow, go, flash } = useWorkflow();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();
  const errorId = useId();

  return (
    <details className="wf-disclosure">
      <summary>Add a client</summary>
      <form
        className="wf-inline-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const created = workflow.createClient({ name, email });
          if (!created.ok) {
            setError(created.error);
            return;
          }
          setError(null);
          setName('');
          setEmail('');
          go('census', { clientId: created.value.id });
          flash('positive', `Client ${created.value.id} created. Load a census for it below.`);
        }}
      >
        <div className="wf-field">
          <label htmlFor={nameId}>Client name</label>
          <input
            id={nameId}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <div className="wf-field">
          <label htmlFor={emailId}>
            E-mail <span className="qc-muted">(optional; use an example.com address)</span>
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button type="submit" className="qc-btn qc-btn-secondary">
          Create client
        </button>
        {error && (
          <p id={errorId} className="wf-field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}

function ClientCensus({ client }: { client: Client }): React.JSX.Element {
  const { state, workflow, go, flash } = useWorkflow();
  const batch = state.census.find((b) => b.clientId === client.id);
  const [pending, setPending] = useState<PendingLoad | null>(null);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const returnFocusTo = useRef<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const editorTitleId = useId();
  const censusHeadingId = useId();
  const membersHeadingId = useId();
  const filterName = useId();
  const pasteId = useId();
  const fileId = useId();

  useEffect(() => {
    if (editingId === null && returnFocusTo.current) {
      // The row's own button, or the table if the row left the current filter.
      (document.getElementById(returnFocusTo.current) ?? tableRef.current)?.focus();
      returnFocusTo.current = null;
    }
  }, [editingId]);

  const issues = batch ? validateCensus(batch.rows) : new Map<string, CensusIssue[]>();
  const summary = summariseCensus(batch);
  const members = state.members.filter((m) => m.clientId === client.id);
  const employees = state.employees.filter((e) => e.clientId === client.id);

  const performLoad = (load: PendingLoad): void => {
    setPending(null);
    setEditingId(null);
    const result =
      load.source === 'supplied'
        ? workflow.loadSuppliedCensus(client.id)
        : workflow.loadCensusText(client.id, load.text);
    if (!result.ok) {
      flash('danger', `The census was not loaded: ${result.error}`);
      return;
    }
    const loaded = summariseCensus(
      workflow.store.read().census.find((b) => b.clientId === client.id),
    );
    setFilter('all');
    flash(
      loaded.blocked > 0 ? 'warning' : 'positive',
      `Census loaded: ${plural(result.value.rows, 'row')}. ${loaded.ready} ready to import, ${loaded.blocked} need correction.`,
    );
  };

  const requestLoad = (load: PendingLoad): void => {
    if (load.source === 'text') {
      // Check the file before asking to replace anything, so a bad file changes nothing.
      const check = loadCensusCsv(load.text, 1);
      if (!check.ok) {
        flash('danger', `The census was not loaded: ${check.error}`);
        return;
      }
    }
    if (batch) setPending(load);
    else performLoad(load);
  };

  const readFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    if (file.size > MAX_CSV_CHARS) {
      flash('danger', 'The census was not loaded: the file is too large for the demo.');
      return;
    }
    requestLoad({ source: 'text', text: await file.text(), label: file.name });
  };

  const importRows = (): void => {
    const result = workflow.importCensus(client.id);
    if (!result.ok) {
      flash('danger', result.error);
      return;
    }
    const after = summariseCensus(
      workflow.store.read().census.find((b) => b.clientId === client.id),
    );
    flash(
      'positive',
      `Imported ${plural(result.value.members, 'member')} in ${plural(result.value.employees, 'new employee record')}.${
        after.blocked > 0 ? ` ${plural(after.blocked, 'row')} still need correction.` : ''
      }`,
    );
  };

  const closeEditor = (rowId: string): void => {
    returnFocusTo.current = `wf-correct-${rowId}`;
    setEditingId(null);
  };

  // Closes the editor if its row is gone (census replaced) or was imported meanwhile.
  const editingRow = batch?.rows.find((r) => r.id === editingId && !r.imported);
  const visible = batch
    ? batch.rows.filter(
        (row) => filter === 'all' || rowStatus(row, issues.get(row.id) ?? []) === filter,
      )
    : [];

  return (
    <>
      <section className="qc-card" aria-labelledby={censusHeadingId}>
        <div className="qc-card-head">
          <div>
            <h2 id={censusHeadingId}>Member census</h2>
            <p className="qc-muted">
              {batch
                ? `${batch.source === 'supplied-demo' ? 'Supplied synthetic census' : 'CSV file'}, loaded ${formatDateTime(batch.loadedAt)}.`
                : 'No census loaded for this client yet.'}
            </p>
          </div>
          <div className="wf-actions">
            <button
              type="button"
              className={batch ? 'qc-btn qc-btn-secondary' : 'qc-btn qc-btn-primary'}
              onClick={() => requestLoad({ source: 'supplied' })}
            >
              <Icon name="inbox" />
              {!batch
                ? 'Load the synthetic census (52 people)'
                : batch.source === 'supplied-demo'
                  ? 'Reload the synthetic census'
                  : 'Replace with the synthetic census'}
            </button>
          </div>
        </div>

        <details className="wf-disclosure">
          <summary>Load a census from a CSV file</summary>
          <div className="wf-csv-help">
            <p>
              Columns: <code>employee_id, relationship, age, name, email, pincode</code>. One row
              per person; name, e-mail and pincode belong on the employee&apos;s own (
              <code>self</code>) row. Dependants carry relationship and age only. Use synthetic data
              only.
            </p>
            <div className="wf-field">
              <label htmlFor={fileId}>CSV file</label>
              <input
                id={fileId}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  void readFile(file);
                }}
              />
            </div>
            <div className="wf-field">
              <label htmlFor={pasteId}>Or paste CSV text</label>
              <textarea
                id={pasteId}
                rows={4}
                value={pasted}
                spellCheck={false}
                onChange={(e) => setPasted(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="qc-btn qc-btn-secondary"
              disabled={pasted.trim() === ''}
              onClick={() => requestLoad({ source: 'text', text: pasted, label: 'pasted text' })}
            >
              Load pasted CSV
            </button>
          </div>
        </details>

        {batch ? (
          <>
            <ul className="wf-summary" aria-label="Census summary">
              <SummaryItem label="Rows" value={summary.total} />
              <SummaryItem label="Ready to import" value={summary.ready} tone="positive" />
              <SummaryItem label="Need correction" value={summary.blocked} tone="danger" />
              <SummaryItem label="Imported" value={summary.imported} tone="info" />
              <SummaryItem label="Excluded" value={summary.excluded} />
              <SummaryItem label="With warnings" value={summary.warnings} tone="warning" />
            </ul>

            <div className="wf-toolbar">
              <fieldset className="wf-segmented">
                <legend className="qc-visually-hidden">Show rows</legend>
                {ROW_FILTERS.map((f) => (
                  <label key={f.id} className={filter === f.id ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name={filterName}
                      value={f.id}
                      checked={filter === f.id}
                      onChange={() => setFilter(f.id)}
                    />
                    {f.label}
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                className="qc-btn qc-btn-primary"
                disabled={summary.ready === 0}
                onClick={importRows}
              >
                {summary.ready > 0
                  ? `Import ${plural(summary.ready, 'ready row')}`
                  : 'No rows ready to import'}
              </button>
            </div>

            <div
              ref={tableRef}
              className="wf-table-scroll"
              role="region"
              aria-label="Census rows"
              tabIndex={0}
            >
              <table className="wf-table wf-census-table">
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    {CENSUS_COLUMNS.map((c) => (
                      <th key={c} scope="col">
                        {FIELD_LABEL[c]}
                      </th>
                    ))}
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="qc-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={CENSUS_COLUMNS.length + 3} className="wf-empty">
                        No rows match this filter.
                      </td>
                    </tr>
                  )}
                  {visible.map((row) => (
                    <CensusTableRow
                      key={row.id}
                      clientId={client.id}
                      row={row}
                      issues={issues.get(row.id) ?? []}
                      onEdit={() => setEditingId(row.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="qc-muted wf-count-line">
              Showing {plural(visible.length, 'row')} of {batch.rows.length}. Imported rows are
              locked. Rows that need correction stay staged until corrected or excluded.
            </p>
          </>
        ) : (
          <StatePanel
            tone="neutral"
            icon="inbox"
            title="No census loaded"
            text="Load the supplied synthetic census to see row-level validation, or load your own CSV file of synthetic data."
          />
        )}
      </section>

      <section className="qc-card" aria-labelledby={membersHeadingId}>
        <div className="qc-card-head">
          <div>
            <h2 id={membersHeadingId}>Imported members</h2>
            <p className="qc-muted">
              {plural(members.length, 'member')} in {plural(employees.length, 'employee record')}.
              Dependants are stored with relationship and age only.
            </p>
          </div>
        </div>
        {employees.length === 0 ? (
          <p className="wf-empty">No members imported yet.</p>
        ) : (
          <div className="wf-table-scroll" role="region" aria-label="Imported members" tabIndex={0}>
            <table className="wf-table">
              <thead>
                <tr>
                  <th scope="col">Employee ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Pincode</th>
                  <th scope="col">Members (relationship, age)</th>
                  <th scope="col">
                    <span className="qc-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const family = members.filter((m) => m.employeeId === e.employeeId);
                  return (
                    <tr key={e.employeeId}>
                      <td className="qc-num">{e.employeeId}</td>
                      <td>{e.name}</td>
                      <td className="is-email">
                        {e.email ? (
                          <Breakable text={e.email} />
                        ) : (
                          <span className="qc-muted">None</span>
                        )}
                      </td>
                      <td className="qc-num">{e.pincode}</td>
                      <td>{describeMembers(family)}</td>
                      <td className="wf-cell-actions">
                        <button
                          type="button"
                          className="qc-btn qc-btn-secondary wf-btn-small"
                          onClick={() =>
                            go('request', { clientId: client.id, employeeId: e.employeeId })
                          }
                        >
                          Request quotes
                          <span className="qc-visually-hidden"> for {e.employeeId}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title="Replace this client's census?"
        confirmLabel="Replace census"
        onConfirm={() => pending && performLoad(pending)}
        onCancel={() => setPending(null)}
      >
        <p>
          Loading {pending?.source === 'text' ? `“${pending.label}”` : 'the synthetic census'}{' '}
          replaces the {plural(batch?.rows.length ?? 0, 'staged row')} and the{' '}
          {plural(members.length, 'imported member')} of {client.name}. Corrections made so far are
          discarded.
        </p>
        <p>Quote requests already created keep their own copy of their members.</p>
      </ConfirmDialog>

      <Modal
        open={editingRow !== undefined}
        labelledBy={editorTitleId}
        wide
        onCancel={() => editingRow && closeEditor(editingRow.id)}
      >
        {editingRow && (
          <RowEditor
            titleId={editorTitleId}
            clientId={client.id}
            row={editingRow}
            issues={issues.get(editingRow.id) ?? []}
            onClose={() => closeEditor(editingRow.id)}
          />
        )}
      </Modal>
    </>
  );
}

/** Text that may wrap after `@` and `.`, so e-mail addresses break at sensible places. */
function Breakable({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(?<=[@.])/);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  );
}

function SummaryItem(props: {
  label: string;
  value: number;
  tone?: 'positive' | 'info' | 'warning' | 'danger';
}): React.JSX.Element {
  return (
    <li className={`wf-summary-item${props.tone && props.value > 0 ? ` tone-${props.tone}` : ''}`}>
      <span className="wf-summary-value qc-num">{props.value}</span>
      <span className="wf-summary-label">{props.label}</span>
    </li>
  );
}

function CensusTableRow(props: {
  clientId: string;
  row: CensusRow;
  issues: readonly CensusIssue[];
  onEdit: () => void;
}): React.JSX.Element {
  const { workflow, flash } = useWorkflow();
  const { row, issues, clientId } = props;
  const status = rowStatus(row, issues);
  const badge = STATUS_BADGE[status];
  const flagged = new Set(issues.filter((i) => i.blocking).map((i) => i.field));
  const shownIssues = status === 'imported' ? [] : issues;
  const colSpan = CENSUS_COLUMNS.length + 3;

  const toggleExcluded = (): void => {
    const result = workflow.setCensusRowExcluded(clientId, row.id, !row.excluded);
    flash(
      result.ok ? 'info' : 'danger',
      result.ok
        ? `Line ${row.line} ${row.excluded ? 'included again' : 'excluded from the import'}.`
        : result.error,
    );
  };
  const notDuplicate = (): void => {
    const result = workflow.confirmNotDuplicate(clientId, row.id);
    flash(
      result.ok ? 'info' : 'danger',
      result.ok ? `Line ${row.line} confirmed as a different person.` : result.error,
    );
  };

  return (
    <Fragment>
      <tr className={`wf-census-row is-${status}`}>
        <td className="qc-num">{row.line}</td>
        {CENSUS_COLUMNS.map((field) => (
          <td
            key={field}
            className={[`is-${field}`, flagged.has(field) ? 'has-issue' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {row.values[field] === '' ? (
              <span className="qc-muted">
                <span aria-hidden="true">—</span>
                <span className="qc-visually-hidden">empty</span>
              </span>
            ) : field === 'email' ? (
              <Breakable text={row.values[field]} />
            ) : (
              row.values[field]
            )}
            {flagged.has(field) && (
              <Icon name="alert-triangle" size={12} className="wf-cell-flag" />
            )}
          </td>
        ))}
        <td>
          <Badge tone={badge.tone} label={badge.label} />
        </td>
        <td className="wf-cell-actions">
          {status !== 'imported' && (
            <div className="wf-row-actions">
              <button
                id={`wf-correct-${row.id}`}
                type="button"
                className="qc-btn qc-btn-secondary wf-btn-small"
                onClick={props.onEdit}
                disabled={row.excluded}
              >
                Correct<span className="qc-visually-hidden"> line {row.line}</span>
              </button>
              <button
                type="button"
                className="qc-btn qc-btn-secondary wf-btn-small"
                onClick={toggleExcluded}
              >
                {row.excluded ? 'Include' : 'Exclude'}
                <span className="qc-visually-hidden"> line {row.line}</span>
              </button>
            </div>
          )}
        </td>
      </tr>
      {shownIssues.length > 0 && (
        <tr className="wf-issue-row">
          <td colSpan={colSpan}>
            <IssueList issues={shownIssues} line={row.line} onNotDuplicate={notDuplicate} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function IssueList(props: {
  issues: readonly CensusIssue[];
  line: number;
  /** Offered next to a "possible duplicate" issue. */
  onNotDuplicate?: () => void;
}): React.JSX.Element {
  return (
    <ul className="wf-row-issues" aria-label={`Issues on line ${props.line}`}>
      {props.issues.map((issue, index) => (
        <li key={index} className={issue.blocking ? 'is-blocking' : 'is-warning'}>
          <Icon name={issue.blocking ? 'x-circle' : 'alert-triangle'} size={13} />
          <span className="wf-issue-text">
            <strong>{FIELD_LABEL[issue.field]}:</strong> {issue.message}
            {!issue.blocking && (
              <span className="qc-muted"> (warning; does not block the import)</span>
            )}
          </span>
          {issue.code === 'POSSIBLE_DUPLICATE' && props.onNotDuplicate && (
            <button
              type="button"
              className="qc-btn qc-btn-secondary wf-btn-small"
              onClick={props.onNotDuplicate}
            >
              Not a duplicate<span className="qc-visually-hidden"> (line {props.line})</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The correction form, shown in a modal so the table never has to make room for it. */
function RowEditor(props: {
  titleId: string;
  clientId: string;
  row: CensusRow;
  issues: readonly CensusIssue[];
  onClose: () => void;
}): React.JSX.Element {
  const { workflow, flash } = useWorkflow();
  const { row, clientId } = props;
  const [values, setValues] = useState<Record<CensusField, string>>({ ...row.values });
  const baseId = useId();
  const firstFlagged =
    CENSUS_COLUMNS.find((f) => props.issues.some((i) => i.field === f && i.blocking)) ??
    CENSUS_COLUMNS[0];

  const save = (): void => {
    const result = workflow.correctCensusRow(clientId, row.id, values);
    if (!result.ok) {
      flash('danger', result.error);
      return;
    }
    const batch = workflow.store.read().census.find((b) => b.clientId === clientId);
    const updated = batch?.rows.find((r) => r.id === row.id);
    const after = updated && batch ? (validateCensus(batch.rows).get(row.id) ?? []) : [];
    const status = updated ? rowStatus(updated, after) : 'blocked';
    const changed =
      result.value.length === 0
        ? 'no change'
        : result.value.map((f) => FIELD_LABEL[f].toLowerCase()).join(', ');
    if (status === 'blocked') {
      flash('warning', `Line ${row.line} saved (${changed}) but still needs correction.`);
      return;
    }
    flash('positive', `Line ${row.line} corrected (${changed}). The row is ready to import.`);
    props.onClose();
  };

  const rowIssues = props.issues.filter((i) => i.field === 'row');
  return (
    <form
      className="wf-row-editor"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h2 id={props.titleId}>
        Correct line {row.line}
        <span className="qc-muted wf-dialog-sub">
          {' '}
          · {row.values.employee_id || 'no employee ID'}
        </span>
      </h2>
      {rowIssues.length > 0 && <IssueList issues={rowIssues} line={row.line} />}
      <div className="wf-edit-grid">
        {CENSUS_COLUMNS.map((field) => {
          const fieldIssues = props.issues.filter((i) => i.field === field);
          const describedBy = fieldIssues.length > 0 ? `${baseId}-${field}-issue` : undefined;
          return (
            <div key={field} className="wf-field">
              <label htmlFor={`${baseId}-${field}`}>{FIELD_LABEL[field]}</label>
              <input
                id={`${baseId}-${field}`}
                data-autofocus={field === firstFlagged ? true : undefined}
                className={fieldIssues.length > 0 ? 'is-mono' : undefined}
                value={values[field]}
                maxLength={200}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={fieldIssues.some((i) => i.blocking)}
                aria-describedby={describedBy}
                onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
              />
              {describedBy && (
                <span id={describedBy} className="wf-field-error">
                  {fieldIssues.map((i) => i.message).join(' ')}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="qc-muted wf-dialog-note">
        Saved corrections are validated again at once. The activity log records the field names
        only, never the values.
      </p>
      <div className="wf-dialog-actions">
        <button type="button" className="qc-btn qc-btn-secondary" onClick={props.onClose}>
          Cancel
        </button>
        <button type="submit" className="qc-btn qc-btn-primary">
          Save correction
        </button>
      </div>
    </form>
  );
}
