// DEVELOPMENT-ONLY demo workflow: comparison results and the report preview. Both read one
// comparison snapshot (the engine's input and output, kept as generated) through
// `buildResultRows`, so the report always shows what the comparison screen showed. Which quote
// is highlighted, comparable or excluded is the engine's decision; nothing here re-ranks.
import { Fragment, useId, useState } from 'react';
import type { ComparisonResult } from '../../../../shared/contracts/comparison';
import {
  type DemoRow,
  FINDING_TEXT,
  FINDING_TITLE,
  REVIEW_FLAG_LABEL,
  cellValue,
  describeBasis,
  describeCoverType,
  describeDifference,
  describeMembers,
  describeOutcome,
  describeTenure,
  formatAmount,
  formatQuoteAmount,
  outcomeBadge,
  premiumText,
  sumInsuredText,
  termCellText,
} from '../demo-model';
import { Icon } from '../icons';
import { formatDateTime, formatTime } from './clock';
import { isTerminal, latestAttempt } from './engine';
import {
  type ResultFilter,
  type ResultRow,
  type ResultSort,
  attemptLabel,
  buildReportModel,
  buildResultRows,
  comparisonIsStale,
  filterAndSortRows,
  jobsForRequest,
  latestComparison,
} from './selectors';
import { SIMULATOR_NOTICE } from './simulators';
import type { ComparisonSnapshot } from './types';
import {
  Badge,
  Callout,
  PageTitle,
  RequestPicker,
  SimulatedTag,
  StatePanel,
  TONE_ICON,
  describeRequest,
  plural,
  selectedRequest,
  useWorkflow,
} from './ui';

const SUITABILITY_NOTE =
  'Premium alone does not establish whether a policy suits the customer. Review the coverage terms before advising.';

const REPORT_DISCLAIMER =
  'Demonstration report produced from synthetic data. The insurers are DEMO SIMULATORS: no insurer was contacted and every premium is invented. This is not a quotation, an offer of insurance or advice.';

// ---- Cells, formatted from the normalised result in its own currency --------------------------

function premiumCell(row: DemoRow): { value: string; missing: boolean } {
  const n = row.normalized;
  return cellValue(row, ['premium.total', 'premium', 'currency'], n ? premiumText(n) : null);
}

/** The premium breakdown lines under the total, each in the quote's own currency. */
function breakdownLines(row: DemoRow): string[] {
  const n = row.normalized;
  if (!n || n.status !== 'completed') return [];
  const gst = formatQuoteAmount(n.premium.gstPaise, n.currency);
  const base = formatQuoteAmount(n.premium.basePaise, n.currency);
  return [
    gst ? `Taxes & charges ${gst}` : 'Taxes & charges not itemised',
    ...(base ? [`Base ${base}`] : []),
    describeBasis(n.premium.basis) ?? 'GST basis not shown',
  ];
}

/** Coverage facts in lines of short parts; a line wraps only between its parts. */
function coverageParts(row: DemoRow): string[][] {
  const n = row.normalized;
  if (!n) return [['Unreadable response']];
  if (n.status !== 'completed') return [['No quote returned']];
  return [
    [`Sum insured ${sumInsuredText(n) ?? 'not shown'}`],
    [
      describeCoverType(n.coverType) ?? 'Cover type not shown',
      n.tenureYears === null ? 'Tenure not shown' : describeTenure(n.tenureYears),
      n.members === null ? 'Members not shown' : plural(n.members.length, 'member'),
    ],
    [
      `Room rent: ${termCellText(n, 'roomRent') ?? 'not shown'}`,
      `Co-pay: ${termCellText(n, 'coPay') ?? 'not shown'}`,
      `Deductible: ${termCellText(n, 'deductible') ?? 'not shown'}`,
    ],
  ];
}

function PartsLine({ parts }: { parts: readonly string[] }): React.JSX.Element {
  return (
    <span className="wf-subline">
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 && ' · '}
          <span className="wf-nowrap">{part}</span>
        </Fragment>
      ))}
    </span>
  );
}

function statusText(row: ResultRow): string {
  return row.attemptStatus === 'completed'
    ? 'Response received'
    : attemptLabel({ status: row.attemptStatus, step: null }).label;
}

function ResultsTable(props: {
  rows: readonly ResultRow[];
  comparison: ComparisonResult;
  caption: string;
}): React.JSX.Element {
  const tie = props.comparison.cheapest?.tie ?? false;
  return (
    <div className="wf-table-scroll" role="region" aria-label={props.caption} tabIndex={0}>
      <table className="wf-table wf-results-table">
        <caption className="qc-visually-hidden">{props.caption}</caption>
        <thead>
          <tr>
            <th scope="col">Insurer, plan and status</th>
            <th scope="col" className="is-numeric">
              Total premium
            </th>
            <th scope="col">Coverage</th>
            <th scope="col">Engine outcome and warnings</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const badge = outcomeBadge(row.engine, tie);
            const premium = premiumCell(row.engine);
            const n = row.engine.normalized;
            const notes = [
              ...(n ? n.reviewFlags.map((f) => `Review flag: ${REVIEW_FLAG_LABEL[f]}`) : []),
              ...(row.missingFields.length > 0
                ? [`Not in the response: ${row.missingFields.join(', ')}`]
                : []),
              ...(row.attemptStatus !== 'completed' && row.message ? [row.message] : []),
            ];
            return (
              <tr key={row.jobId} className={`is-${row.engine.outcome}`}>
                <th scope="row">
                  <span className="wf-insurer">{row.insurerLabel}</span>
                  <span className="qc-muted wf-plan">{n?.planLabel ?? 'Plan not shown'}</span>
                  <SimulatedTag text="SIMULATED RESPONSE" />
                  <span className="wf-subline wf-status-line">
                    {statusText(row)}
                    {row.receivedAt ? ` at ${formatTime(row.receivedAt)}` : ''}
                  </span>
                  <span className="qc-muted wf-subline">
                    {row.jobId}, attempt {row.attempt}
                  </span>
                </th>
                <td className={`is-numeric${premium.missing ? ' is-missing' : ''}`}>
                  <span className="qc-num wf-premium">{premium.value}</span>
                  {breakdownLines(row.engine).map((line) => (
                    <span key={line} className="qc-muted wf-subline">
                      {line}
                    </span>
                  ))}
                </td>
                <td className="is-coverage">
                  {coverageParts(row.engine).map((parts) => (
                    <PartsLine key={parts.join('|')} parts={parts} />
                  ))}
                </td>
                <td>
                  <Badge tone={badge.tone} label={badge.label} />
                  {row.engine.findings.length > 0 && (
                    <ul className="wf-findings">
                      {row.engine.findings.map((f, index) => (
                        <li key={index}>{FINDING_TITLE[f.code]}</li>
                      ))}
                    </ul>
                  )}
                  {notes.length > 0 && (
                    <ul className="wf-findings is-notes">
                      {notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeBanner(props: {
  comparison: ComparisonResult;
  rows: readonly ResultRow[];
}): React.JSX.Element {
  const engineRows = props.rows.map((r) => r.engine);
  const outcome = describeOutcome(props.comparison, engineRows);
  return (
    <section className={`qc-outcome tone-${outcome.tone}`} aria-label="Comparison outcome">
      <Icon name={TONE_ICON[outcome.tone]} size={20} className="qc-outcome-icon" />
      <div className="qc-outcome-body">
        <h2>{outcome.title}</h2>
        <p>{outcome.detail}</p>
        {props.comparison.differences.length > 0 && (
          <ul className="qc-outcome-list">
            {props.comparison.differences.map((difference) => (
              <li key={difference.term}>{describeDifference(difference, engineRows)}</li>
            ))}
          </ul>
        )}
        <p className="qc-outcome-note">
          {props.comparison.cheapest && <span>{props.comparison.cheapest.label}. </span>}
          {SUITABILITY_NOTE}
        </p>
      </div>
    </section>
  );
}

// ---- Comparison ------------------------------------------------------------------------------

const FILTER_OPTIONS: { id: ResultFilter; label: string }[] = [
  { id: 'all', label: 'All results' },
  { id: 'comparable', label: 'Comparable' },
  { id: 'excluded', label: 'Excluded' },
];
const SORT_OPTIONS: { id: ResultSort; label: string }[] = [
  { id: 'received', label: 'Order of the request' },
  { id: 'premium-asc', label: 'Premium, low to high' },
  { id: 'premium-desc', label: 'Premium, high to low' },
  { id: 'insurer', label: 'Insurer name' },
];

export function ComparisonPage(): React.JSX.Element {
  const { state, workflow, nav, go, flash } = useWorkflow();
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [sort, setSort] = useState<ResultSort>('received');
  const filterName = useId();
  const sortId = useId();
  const historyId = useId();
  const request = selectedRequest(state, nav.requestId);

  if (!request) {
    return (
      <>
        <PageTitle title="Comparison" />
        <StatePanel
          tone="neutral"
          icon="inbox"
          title="No quote requests yet"
          text="Comparisons are generated from the jobs of a quote request."
        >
          <div>
            <button type="button" className="qc-btn qc-btn-primary" onClick={() => go('request')}>
              Create a quote request
              <Icon name="arrow-right" />
            </button>
          </div>
        </StatePanel>
      </>
    );
  }

  const picker = (
    <section className="qc-card wf-request-bar" aria-label="Quote request">
      <RequestPicker
        requests={state.quoteRequests}
        selectedId={request.id}
        onSelect={(id) => go('comparison', { requestId: id })}
      />
      <p className="qc-muted">{describeRequest(request)}</p>
    </section>
  );
  const comparison = latestComparison(state, request.id);
  const unfinished = jobsForRequest(state, request.id).filter(
    (j) => !isTerminal(latestAttempt(j).status),
  );

  if (!comparison) {
    return (
      <>
        <PageTitle title="Comparison" />
        {picker}
        <StatePanel
          tone="neutral"
          icon="cpu"
          title="No comparison yet"
          text={`The comparison is generated automatically when every job of ${request.id} has finished. ${plural(unfinished.length, 'job')} still running or queued.`}
        >
          <div>
            <button
              type="button"
              className="qc-btn qc-btn-secondary"
              onClick={() => go('jobs', { requestId: request.id })}
            >
              Watch the jobs
              <Icon name="arrow-right" />
            </button>
          </div>
        </StatePanel>
      </>
    );
  }

  const rows = buildResultRows(state, workflow.adapters, comparison);
  const shown = filterAndSortRows(rows, filter, sort);
  const stale = comparisonIsStale(state, comparison);
  const history = state.comparisons.filter((c) => c.quoteRequestId === request.id).reverse();

  const generateReport = (): void => {
    const report = workflow.generateReport(request.id);
    if (!report.ok) {
      flash('danger', report.error);
      return;
    }
    go('report', { reportId: report.value.id, requestId: request.id });
    flash(
      'positive',
      `Report ${report.value.id} generated from comparison ${report.value.comparisonId}.`,
    );
  };

  return (
    <>
      <PageTitle
        title="Comparison"
        description="Simulated responses normalised and compared by the existing M3 engine with its default, provisional rule. The engine decides what is comparable and what is highlighted."
        actions={
          <button type="button" className="qc-btn qc-btn-primary" onClick={generateReport}>
            Generate report
            <Icon name="arrow-right" />
          </button>
        }
      />
      {picker}
      {stale && (
        <Callout tone="warning" title="A newer attempt exists">
          This comparison ({comparison.id}) used earlier attempts.
          {unfinished.length > 0
            ? ` ${plural(unfinished.length, 'job')} still running; a new comparison is generated automatically when it finishes.`
            : ' A new comparison is generated when every job has finished.'}
        </Callout>
      )}
      <ComparisonFacts comparison={comparison} rows={rows} />
      <OutcomeBanner comparison={comparison.result} rows={rows} />

      <section className="qc-card wf-results-card" aria-label="Results">
        <div className="wf-toolbar">
          <fieldset className="wf-segmented">
            <legend className="qc-visually-hidden">Show</legend>
            {FILTER_OPTIONS.map((f) => (
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
          <div className="wf-field wf-field-inline">
            <label htmlFor={sortId}>Sort by</label>
            <select
              id={sortId}
              value={sort}
              onChange={(e) => setSort(e.target.value as ResultSort)}
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="wf-empty">No results match this filter.</p>
        ) : (
          <ResultsTable
            rows={shown}
            comparison={comparison.result}
            caption={`Results of ${comparison.id}`}
          />
        )}
        <p className="qc-muted wf-count-line">
          {plural(shown.length, 'result')} shown of {rows.length}. A missing premium is shown as
          missing and sorts last; it is never treated as zero.
        </p>
      </section>

      <section className="qc-card" aria-labelledby={historyId}>
        <h2 id={historyId} className="wf-card-title">
          Comparison history for {request.id}
        </h2>
        <ol className="wf-history-list">
          {history.map((snapshot) => (
            <li key={snapshot.id}>
              <span className="qc-num">{snapshot.id}</span>
              <span className="qc-muted">{formatDateTime(snapshot.generatedAt)}</span>
              <span>
                {snapshot.inputs.map((i) => `${i.jobId} attempt ${i.attempt}`).join(', ')}
              </span>
              <span>
                {
                  describeOutcome(
                    snapshot.result,
                    buildResultRows(state, workflow.adapters, snapshot).map((r) => r.engine),
                  ).title
                }
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function ComparisonFacts(props: {
  comparison: ComparisonSnapshot;
  rows: readonly ResultRow[];
}): React.JSX.Element {
  const { result } = props.comparison;
  const highlighted = props.rows.filter((r) => r.engine.outcome === 'highlighted');
  return (
    <ul className="qc-metrics wf-metrics" aria-label="Comparison summary">
      <li className="qc-metric">
        <p className="qc-metric-label">Results</p>
        <p className="qc-metric-value">{props.rows.length}</p>
        <p className="qc-metric-detail">
          {props.comparison.id}, generated {formatTime(props.comparison.generatedAt)}
        </p>
      </li>
      <li className="qc-metric">
        <p className="qc-metric-label">Comparable</p>
        <p className="qc-metric-value">{result.comparable.length}</p>
        <p className="qc-metric-detail">Passed validity, eligibility and comparability</p>
      </li>
      <li className="qc-metric">
        <p className="qc-metric-label">Excluded</p>
        <p className="qc-metric-value">{result.excluded.length}</p>
        <p className="qc-metric-detail">Failed, incomplete, flagged or not like for like</p>
      </li>
      {result.cheapest ? (
        <li className="qc-metric tone-positive">
          <p className="qc-metric-label">Lowest comparable premium</p>
          <p className="qc-metric-value">{formatAmount(result.cheapest.totalPremiumPaise)}</p>
          <p className="qc-metric-detail">{highlighted.map((r) => r.insurerLabel).join(', ')}</p>
        </li>
      ) : (
        <li className="qc-metric is-muted">
          <p className="qc-metric-label">Lowest comparable premium</p>
          <p className="qc-metric-value">Not highlighted</p>
          <p className="qc-metric-detail">The engine withheld the highlight; see the outcome</p>
        </li>
      )}
    </ul>
  );
}

// ---- Report ----------------------------------------------------------------------------------

export function ReportPage(): React.JSX.Element {
  const { state, workflow, nav, go } = useWorkflow();
  const pickerId = useId();
  const reports = state.reports;
  const report = reports.find((r) => r.id === nav.reportId) ?? reports.at(-1);

  if (!report) {
    return (
      <>
        <PageTitle title="Report" />
        <StatePanel
          tone="neutral"
          icon="inbox"
          title="No report yet"
          text="Generate a report from a comparison. The report shows exactly the comparison it was generated from."
        >
          <div>
            <button
              type="button"
              className="qc-btn qc-btn-primary"
              onClick={() => go('comparison')}
            >
              Go to the comparison
              <Icon name="arrow-right" />
            </button>
          </div>
        </StatePanel>
      </>
    );
  }

  const model = buildReportModel(state, workflow.adapters, report.id);
  if (!model) {
    return (
      <>
        <PageTitle title="Report" />
        <StatePanel
          tone="danger"
          icon="x-circle"
          title="The report could not be built"
          text="Its comparison or quote request is no longer in the demo data."
        />
      </>
    );
  }
  const newest = latestComparison(state, model.request.id);
  const employee = state.employees.find(
    (e) => e.clientId === model.request.clientId && e.employeeId === model.request.employeeId,
  );
  const draft = model.request.draft;

  return (
    <>
      <PageTitle
        title="Report"
        description="An in-app preview of the customer report, built from the same comparison snapshot as the comparison screen."
      />
      <section className="qc-card wf-request-bar" aria-label="Report selection">
        <div className="wf-field wf-field-inline">
          <label htmlFor={pickerId}>Report</label>
          <select
            id={pickerId}
            value={report.id}
            onChange={(e) => go('report', { reportId: e.target.value })}
          >
            {[...reports].reverse().map((r) => (
              <option key={r.id} value={r.id}>
                {`${r.id} · ${r.quoteRequestId} · from ${r.comparisonId} · ${formatTime(r.generatedAt)}`}
              </option>
            ))}
          </select>
        </div>
        <p className="qc-muted">
          Preview only. This build cannot save or print the report: downloads are blocked by the
          application&apos;s security policy, and the PDF report is planned for milestone M7.
        </p>
      </section>
      {newest && newest.id !== model.comparison.id && (
        <Callout tone="warning" title="A newer comparison exists">
          {newest.id} was generated after this report. Generate a new report from the comparison
          screen to include it.
        </Callout>
      )}

      <article className="wf-report" aria-label={`Report ${model.reportId}`}>
        <header className="wf-report-head">
          <div>
            <p className="qc-section-label">Health insurance quote comparison</p>
            <h2>Quote comparison report</h2>
          </div>
          <span className="wf-report-stamp">DEMONSTRATION · SIMULATED DATA</span>
        </header>
        <p className="wf-report-disclaimer" role="note">
          <Icon name="alert-triangle" />
          <span>{REPORT_DISCLAIMER}</span>
        </p>

        <dl className="wf-dl wf-report-meta">
          <div>
            <dt>Report</dt>
            <dd>{model.reportId}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{formatDateTime(model.generatedAt)}</dd>
          </div>
          <div>
            <dt>Comparison</dt>
            <dd>
              {model.comparison.id} ({formatDateTime(model.comparison.generatedAt)})
            </dd>
          </div>
          <div>
            <dt>Quote request</dt>
            <dd>{model.request.id}</dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>{model.clientName}</dd>
          </div>
          <div>
            <dt>Customer</dt>
            <dd>
              {employee ? `${draft.customer.name} (${employee.employeeId})` : draft.customer.name}
            </dd>
          </div>
        </dl>

        <h3 className="wf-report-section">Cover requested</h3>
        <dl className="wf-dl">
          <div>
            <dt>Members</dt>
            <dd>{describeMembers(draft.request.members)}</dd>
          </div>
          <div>
            <dt>Cover type</dt>
            <dd>{describeCoverType(draft.request.coverType)}</dd>
          </div>
          <div>
            <dt>Sum insured</dt>
            <dd>{formatAmount(draft.request.sumInsuredPaise)}</dd>
          </div>
          <div>
            <dt>Policy tenure</dt>
            <dd>{describeTenure(draft.request.tenureYears)}</dd>
          </div>
          <div>
            <dt>Pincode</dt>
            <dd>{draft.request.pincode}</dd>
          </div>
          <div>
            <dt>Insurers asked</dt>
            <dd>{model.simulators.map((s) => s.label).join(', ')}</dd>
          </div>
        </dl>

        <h3 className="wf-report-section">Outcome</h3>
        <OutcomeBanner comparison={model.comparison.result} rows={model.rows} />

        <h3 className="wf-report-section">Quotes</h3>
        <ResultsTable
          rows={model.rows}
          comparison={model.comparison.result}
          caption={`Quotes in report ${model.reportId}`}
        />

        {model.missingResponses.length > 0 && (
          <>
            <h3 className="wf-report-section">Insurers without a usable response</h3>
            <ul className="wf-bullets">
              {model.missingResponses.map((m) => (
                <li key={m.insurerLabel}>
                  {m.insurerLabel}: {attemptLabel({ status: m.status, step: null }).label}
                  {m.message ? ` — ${m.message}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}

        {model.rows.some((r) => r.engine.findings.length > 0) && (
          <>
            <h3 className="wf-report-section">Why some quotes are not compared</h3>
            <ul className="wf-report-findings">
              {model.rows
                .filter((r) => r.engine.findings.length > 0)
                .map((r) => (
                  <li key={r.jobId}>
                    <strong>{r.insurerLabel}</strong>
                    <ul className="wf-bullets">
                      {r.engine.findings.map((f, index) => (
                        <li key={index}>
                          {FINDING_TITLE[f.code]}: {FINDING_TEXT[f.code]}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          </>
        )}

        <footer className="wf-report-foot">
          <p>
            Every row above comes from comparison {model.comparison.id}: the same normalised result
            set shown on the comparison screen. {SIMULATOR_NOTICE}
          </p>
        </footer>
      </article>
    </>
  );
}
