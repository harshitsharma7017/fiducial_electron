// DEVELOPMENT-ONLY "Quote Comparison" demonstration of the M3 comparison engine, using synthetic
// in-memory data. App.tsx loads this module only when `import.meta.env.DEV` is true, so
// production builds never include it. No IPC, storage or network: every outcome shown comes from
// `runDemo`, which calls the real engine (see demo-model.ts). This file only lays the output out.
import { type ReactNode, Suspense, lazy, useEffect, useId, useRef, useState } from 'react';
import { CONTRACTS_STATUS, CONTRACTS_VERSION } from '../../../shared/contracts/common';
import type { ComparisonResult, Finding } from '../../../shared/contracts/comparison';
import { COVERAGE_TERM_NAMES, type CoverageTermName } from '../../../shared/contracts/coverage';
import type { Member } from '../../../shared/contracts/customer';
import type { ValidationIssue } from '../../../shared/contracts/issues';
import type { NormalizedResult } from '../../../shared/contracts/quote';
import {
  type DemoRow,
  type DemoRun,
  type Tone,
  FINDING_TEXT,
  FINDING_TITLE,
  NO_HIGHLIGHT_TEXT,
  REVIEW_FLAG_LABEL,
  RUN_STATUS_LABEL,
  STAGE_GROUP,
  TERM_LABEL,
  describeBasis,
  describeCoverType,
  describeDifference,
  describeIssue,
  describeIssueLocation,
  describeMembers,
  describeOutcome,
  describeSource,
  describeTenure,
  cellValue,
  differingTerms,
  exclusionCounts,
  findingsAt,
  formatAmount,
  groupFindings,
  memberIndexOf,
  outcomeBadge,
  premiumText,
  relationshipLabel,
  runDemo,
  sumInsuredText,
  termCellText,
} from './demo-model';
import { DEMO_DISCLAIMER, DEMO_SCENARIOS, type DemoScenario } from './demo-scenarios';
import { Icon, type IconName } from './icons';
import './comparison-demo.css';

const SUITABILITY_NOTE =
  'Premium alone does not establish whether a policy suits the customer. Review the coverage terms before advising.';

const TONE_ICON: Record<Tone, IconName> = {
  positive: 'check-circle',
  info: 'check',
  neutral: 'minus-circle',
  warning: 'alert-triangle',
  danger: 'x-circle',
};

// ---------------------------------------------------------------------------------------------
// Entry: hands the development-tools launcher to the home screen, which shows it on its
// Development page.
// ---------------------------------------------------------------------------------------------

// The end-to-end workflow demo (synthetic census, simulated insurers, the real M3 engine). It is
// a separate dev-only chunk, loaded when opened; this module itself is only loaded in DEV.
const WorkflowApp = lazy(() =>
  import('./workflow/WorkflowApp').then((module) => ({ default: module.WorkflowApp })),
);

export function DevQuoteComparison({
  home,
}: {
  home: (launcher: ReactNode) => ReactNode;
}): React.JSX.Element {
  const [view, setView] = useState<'home' | 'comparison' | 'workflow'>('home');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const workflowLauncherRef = useRef<HTMLButtonElement>(null);
  const returning = useRef<'comparison' | 'workflow' | null>(null);
  const headingId = useId();
  const workflowHeadingId = useId();

  useEffect(() => {
    if (view === 'home' && returning.current) {
      const target = returning.current === 'workflow' ? workflowLauncherRef : launcherRef;
      returning.current = null;
      target.current?.focus();
    }
  }, [view]);

  if (view === 'comparison') {
    return (
      <QuoteComparisonPage
        onClose={() => {
          returning.current = 'comparison';
          setView('home');
        }}
      />
    );
  }

  if (view === 'workflow') {
    return (
      <Suspense
        fallback={
          <div className="qc-page">
            <p className="qc-launcher-text" role="status">
              Loading the workflow demo…
            </p>
          </div>
        }
      >
        <WorkflowApp
          onClose={() => {
            returning.current = 'workflow';
            setView('home');
          }}
        />
      </Suspense>
    );
  }

  return (
    <>
      {home(
        <aside className="qc-launcher" aria-label="Development tools">
          <section className="qc-launcher-card" aria-labelledby={headingId}>
            <div>
              <p className="qc-launcher-eyebrow">Development tools</p>
              <h2 id={headingId}>Quote Comparison demo</h2>
              <p className="qc-launcher-text">
                Explore the comparison engine with synthetic quotes. Available in development builds
                only.
              </p>
            </div>
            <button
              ref={launcherRef}
              type="button"
              className="qc-btn qc-btn-primary"
              onClick={() => setView('comparison')}
            >
              Open Quote Comparison
              <Icon name="arrow-right" />
            </button>
          </section>
          <section className="qc-launcher-card" aria-labelledby={workflowHeadingId}>
            <div>
              <p className="qc-launcher-eyebrow">Development tools</p>
              <h2 id={workflowHeadingId}>End-to-end workflow demo</h2>
              <p className="qc-launcher-text">
                Census, quote request, simulated insurer jobs, comparison and report, with synthetic
                data. No insurer is contacted. Available in development builds only.
              </p>
            </div>
            <button
              ref={workflowLauncherRef}
              type="button"
              className="qc-btn qc-btn-primary"
              onClick={() => setView('workflow')}
            >
              Open workflow demo
              <Icon name="arrow-right" />
            </button>
          </section>
        </aside>,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

type Execution = { ok: true; run: DemoRun } | { ok: false };

function execute(scenario: DemoScenario): Execution {
  try {
    return { ok: true, run: runDemo(scenario) };
  } catch {
    return { ok: false };
  }
}

interface PageState {
  scenarioId: string;
  execution: Execution;
  runs: number;
}

function QuoteComparisonPage({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [state, setState] = useState<PageState | null>(() => {
    const first = DEMO_SCENARIOS[0];
    return first ? { scenarioId: first.id, execution: execute(first), runs: 1 } : null;
  });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  const scenarioIndex = DEMO_SCENARIOS.findIndex((s) => s.id === state?.scenarioId);
  const scenario = DEMO_SCENARIOS[scenarioIndex];

  const select = (next: DemoScenario): void =>
    setState({ scenarioId: next.id, execution: execute(next), runs: 1 });
  const rerun = (): void => {
    if (!scenario) return;
    setState((current) => ({
      scenarioId: scenario.id,
      execution: execute(scenario),
      runs: (current?.runs ?? 0) + 1,
    }));
  };

  return (
    <div className="qc-page">
      <header className="qc-appbar">
        <button type="button" className="qc-btn qc-btn-ghost" onClick={onClose}>
          <Icon name="arrow-left" />
          Back to home
        </button>
        <span className="qc-appbar-divider" aria-hidden="true" />
        <span className="qc-appbar-product">Fiducial Quote Fetcher</span>
      </header>

      <div className="qc-pagehead">
        <div className="qc-title-row">
          <h1 ref={headingRef} tabIndex={-1}>
            Quote Comparison
          </h1>
          <span className="qc-devbadge">Development demo</span>
        </div>
        <p className="qc-notice" role="note">
          <Icon name="info" />
          <span>{DEMO_DISCLAIMER}</span>
        </p>
      </div>

      <div className="qc-layout">
        <nav className="qc-sidebar" aria-label="Scenarios">
          <ScenarioPicker selectedId={state?.scenarioId ?? ''} onSelect={select} />
        </nav>

        <main className="qc-main">
          {!state || !scenario ? (
            <StatePanel
              tone="neutral"
              icon="inbox"
              title="No scenarios available"
              text="No demonstration scenarios are defined."
            />
          ) : (
            <>
              <ScenarioHeader
                scenario={scenario}
                position={scenarioIndex + 1}
                total={DEMO_SCENARIOS.length}
                onRun={rerun}
              />
              <LiveAnnouncement state={state} scenario={scenario} />
              <RequestSummary scenario={scenario} execution={state.execution} />
              <Results scenario={scenario} execution={state.execution} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function LiveAnnouncement(props: { state: PageState; scenario: DemoScenario }): React.JSX.Element {
  const { execution, runs } = props.state;
  let text = 'The comparison could not be displayed.';
  if (execution.ok) {
    const { run } = execution;
    if (run.kind === 'compared') text = describeOutcome(run.comparison, run.rows).title;
    else if (run.kind === 'request-invalid')
      text = 'Comparison not run: customer input needs correction.';
    else text = 'Comparison not run: the engine rejected its input.';
  }
  return (
    <p className="qc-visually-hidden" aria-live="polite" aria-atomic="true">
      {`${props.scenario.title}. ${text}`}
      {/* A zero-width suffix changes with each run so repeated runs are announced again. */}
      {runs % 2 === 0 ? '\u200b' : ''}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// Scenario selection
// ---------------------------------------------------------------------------------------------

function ScenarioPicker(props: {
  selectedId: string;
  onSelect: (scenario: DemoScenario) => void;
}): React.JSX.Element {
  const name = useId();
  return (
    <fieldset className="qc-scenarios">
      <legend className="qc-section-label">Scenarios</legend>
      <p className="qc-hint">Selecting a scenario runs the comparison on its synthetic quotes.</p>
      <ol className="qc-scenario-list">
        {DEMO_SCENARIOS.map((s, index) => {
          const selected = s.id === props.selectedId;
          return (
            <li key={s.id}>
              <label className={selected ? 'qc-scenario is-selected' : 'qc-scenario'}>
                <input
                  type="radio"
                  className="qc-visually-hidden"
                  name={name}
                  value={s.id}
                  checked={selected}
                  onChange={() => props.onSelect(s)}
                />
                <span className="qc-scenario-num" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="qc-scenario-text">
                  <span className="qc-scenario-title">{s.title}</span>
                  <span className="qc-scenario-focus">{s.focus}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}

function ScenarioHeader(props: {
  scenario: DemoScenario;
  position: number;
  total: number;
  onRun: () => void;
}): React.JSX.Element {
  const headingId = useId();
  return (
    <section className="qc-card qc-scenario-head" aria-labelledby={headingId}>
      <div className="qc-scenario-head-text">
        <p className="qc-eyebrow">
          Scenario {props.position} of {props.total}
        </p>
        <h2 id={headingId}>{props.scenario.title}</h2>
        <p className="qc-muted">{props.scenario.description}</p>
      </div>
      <button type="button" className="qc-btn qc-btn-secondary" onClick={props.onRun}>
        <Icon name="refresh" />
        Run comparison again
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Customer and policy summary
// ---------------------------------------------------------------------------------------------

function RequestSummary(props: {
  scenario: DemoScenario;
  execution: Execution;
}): React.JSX.Element {
  const headingId = useId();
  const run = props.execution.ok ? props.execution.run : null;
  // Validated values when validation passed; otherwise the values as submitted.
  const customer = run?.kind === 'compared' ? run.draft.customer : props.scenario.customer;
  const request = run?.kind === 'compared' ? run.draft.request : props.scenario.request;
  const issues = run?.kind === 'request-invalid' ? run.issues : [];
  const memberIssues = new Set(
    issues.map(memberIndexOf).filter((index): index is number => index !== null),
  );

  let status: { tone: Tone; label: string } | null = null;
  if (run?.kind === 'compared') status = { tone: 'positive', label: 'Request valid' };
  else if (run?.kind === 'request-invalid') {
    status = {
      tone: 'danger',
      label: issues.length === 1 ? '1 issue to correct' : `${issues.length} issues to correct`,
    };
  } else if (run?.kind === 'engine-rejected') {
    status = { tone: 'danger', label: 'Rejected by the engine' };
  }

  return (
    <section className="qc-card" aria-labelledby={headingId}>
      <div className="qc-card-head">
        <h2 id={headingId}>Customer and requested cover</h2>
        {status && <Badge tone={status.tone} label={status.label} />}
      </div>
      <dl className="qc-facts">
        <div className="qc-fact">
          <dt>Customer</dt>
          <dd>{customer.name}</dd>
        </div>
        <div className="qc-fact qc-fact-wide">
          <dt>Covered members</dt>
          <dd>
            <ul className="qc-member-list">
              {request.members.map((member: Member, index) => {
                const flagged = memberIssues.has(index);
                return (
                  <li key={index} className={flagged ? 'qc-member is-flagged' : 'qc-member'}>
                    {flagged && <Icon name="alert-triangle" size={14} />}
                    <span className="qc-member-rel">{relationshipLabel(member.relationship)}</span>
                    <span className="qc-member-age">Age {member.age}</span>
                    {flagged && <span className="qc-visually-hidden">(needs correction)</span>}
                  </li>
                );
              })}
            </ul>
          </dd>
        </div>
        <div className="qc-fact">
          <dt>Cover type</dt>
          <dd>{describeCoverType(request.coverType)}</dd>
        </div>
        <div className="qc-fact">
          <dt>Sum insured</dt>
          <dd className="qc-num">{formatAmount(request.sumInsuredPaise)}</dd>
        </div>
        <div className="qc-fact">
          <dt>Policy tenure</dt>
          <dd>{describeTenure(request.tenureYears)}</dd>
        </div>
        <div className="qc-fact">
          <dt>Pincode</dt>
          <dd className="qc-num">{request.pincode}</dd>
        </div>
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

function Results(props: { scenario: DemoScenario; execution: Execution }): React.JSX.Element {
  if (!props.execution.ok) {
    return (
      <StatePanel
        tone="danger"
        icon="x-circle"
        title="The comparison could not be displayed"
        text="Something went wrong while presenting the engine output. Choose another scenario or run this one again."
      />
    );
  }
  const { run } = props.execution;
  const quoteCount = props.scenario.quotes.length;

  if (run.kind === 'request-invalid' || run.kind === 'engine-rejected') {
    const invalidRequest = run.kind === 'request-invalid';
    return (
      <StatePanel
        tone="danger"
        icon="alert-triangle"
        title={
          invalidRequest
            ? 'Comparison not run: customer input needs correction'
            : 'Comparison not run: the engine rejected its input'
        }
        text={`${
          invalidRequest
            ? 'The request does not meet the input rules, so no quotes were compared.'
            : 'The comparison engine did not accept the request or rule.'
        } ${quoteCount === 1 ? '1 quote record was' : `${quoteCount} quote records were`} not compared. Choose another scenario to see a comparison.`}
      >
        <IssueList issues={run.issues} members={props.scenario.request.members} />
      </StatePanel>
    );
  }

  const { comparison, rows } = run;
  if (rows.length === 0) {
    return (
      <StatePanel
        tone="neutral"
        icon="inbox"
        title="No quotes received"
        text={`${NO_HIGHLIGHT_TEXT.NO_RESULTS} Choose another scenario to see a comparison.`}
      />
    );
  }

  return (
    <>
      <Metrics comparison={comparison} rows={rows} />
      <OutcomeBanner comparison={comparison} rows={rows} />
      <ComparisonMatrix comparison={comparison} rows={rows} />
      <Findings rows={rows} />
      <details className="qc-about">
        <summary>About this comparison</summary>
        <p>
          Results come from the comparison engine using rule{' '}
          <code>
            {comparison.rule.id} {comparison.rule.version}
          </code>{' '}
          ({comparison.rule.status}) and contracts {CONTRACTS_VERSION} ({CONTRACTS_STATUS}). The
          comparison rule and the input limits are provisional placeholders and have not been
          approved.
        </p>
      </details>
    </>
  );
}

function IssueList(props: {
  issues: readonly ValidationIssue[];
  members: readonly Pick<Member, 'relationship'>[];
}): React.JSX.Element {
  return (
    <>
      <ul className="qc-issue-list">
        {props.issues.map((issue, i) => (
          <li key={i}>
            <span className="qc-issue-where">{describeIssueLocation(issue, props.members)}</span>
            <span>{describeIssue(issue)}</span>
          </li>
        ))}
      </ul>
      <details className="qc-tech">
        <summary>Technical details</summary>
        <ul>
          {props.issues.map((issue, i) => (
            <li key={i}>
              <code>{issue.code}</code> at <code>{issue.path || '(root)'}</code>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function Metrics(props: {
  comparison: ComparisonResult;
  rows: readonly DemoRow[];
}): React.JSX.Element {
  const { comparison, rows } = props;
  const { invalid, notRanked } = exclusionCounts(rows);
  const cheapest = comparison.cheapest;
  const highlightedLabels = rows
    .filter((row) => row.outcome === 'highlighted')
    .map((row) => row.insurerLabel);
  const excludedDetail = [
    invalid > 0 ? `${invalid} cannot be used` : null,
    notRanked > 0 ? `${notRanked} not eligible or not comparable` : null,
  ].filter(Boolean);

  return (
    <section className="qc-metrics" aria-label="Comparison summary">
      <Metric
        label="Quote records"
        value={String(rows.length)}
        detail="Received for this request"
      />
      <Metric
        label="Comparable"
        value={String(comparison.comparable.length)}
        detail="Passed validity, eligibility and comparability checks"
      />
      <Metric
        label="Excluded"
        value={String(comparison.excluded.length)}
        detail={excludedDetail.length > 0 ? excludedDetail.join(' · ') : 'None excluded'}
      />
      {cheapest ? (
        <Metric
          label="Lowest comparable premium"
          value={formatAmount(cheapest.totalPremiumPaise)}
          detail={
            cheapest.tie ? `Tied: ${highlightedLabels.join(', ')}` : highlightedLabels.join(', ')
          }
          tone="positive"
        />
      ) : (
        <Metric
          label="Lowest comparable premium"
          value="Not highlighted"
          detail="See the comparison outcome"
          muted
        />
      )}
    </section>
  );
}

function Metric(props: {
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
  muted?: boolean;
}): React.JSX.Element {
  const classes = ['qc-metric'];
  if (props.tone) classes.push(`tone-${props.tone}`);
  if (props.muted) classes.push('is-muted');
  return (
    <div className={classes.join(' ')}>
      <p className="qc-metric-label">{props.label}</p>
      <p className="qc-metric-value">{props.value}</p>
      <p className="qc-metric-detail">{props.detail}</p>
    </div>
  );
}

function OutcomeBanner(props: {
  comparison: ComparisonResult;
  rows: readonly DemoRow[];
}): React.JSX.Element {
  const { comparison, rows } = props;
  const outcome = describeOutcome(comparison, rows);
  return (
    <section className={`qc-outcome tone-${outcome.tone}`} aria-label="Comparison outcome">
      <Icon name={TONE_ICON[outcome.tone]} size={20} className="qc-outcome-icon" />
      <div className="qc-outcome-body">
        <h2>{outcome.title}</h2>
        <p>{outcome.detail}</p>
        {comparison.differences.length > 0 && (
          <ul className="qc-outcome-list">
            {comparison.differences.map((difference) => (
              <li key={difference.term}>{describeDifference(difference, rows)}</li>
            ))}
          </ul>
        )}
        {comparison.comparable.length > 0 && (
          <p className="qc-outcome-note">
            {comparison.cheapest && <span>{comparison.cheapest.label}. </span>}
            {SUITABILITY_NOTE}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Comparison matrix: quotes as columns, attributes as rows
// ---------------------------------------------------------------------------------------------

interface Attribute {
  key: string;
  label: string;
  hint?: string;
  /** Engine finding paths that refer to this attribute. */
  paths: readonly string[];
  term?: CoverageTermName;
  numeric?: boolean;
  value: (quote: NormalizedResult) => string | null;
}

const BASE_ATTRIBUTES: readonly Attribute[] = [
  {
    key: 'premium',
    label: 'Premium',
    hint: 'Total for the quoted tenure',
    paths: ['premium.total', 'premium', 'premium.base', 'premium.gst', 'currency'],
    numeric: true,
    value: (q) => premiumText(q),
  },
  {
    key: 'basis',
    label: 'GST basis',
    paths: ['premium.basis'],
    value: (q) => describeBasis(q.premium.basis),
  },
  {
    key: 'sumInsured',
    label: 'Sum insured',
    paths: ['coverage.sumInsured'],
    numeric: true,
    value: (q) => sumInsuredText(q),
  },
  {
    key: 'tenure',
    label: 'Policy tenure',
    paths: ['coverage.tenureYears'],
    value: (q) => (q.tenureYears === null ? null : describeTenure(q.tenureYears)),
  },
  {
    key: 'coverType',
    label: 'Cover type',
    paths: ['coverage.coverType'],
    value: (q) => describeCoverType(q.coverType),
  },
  {
    key: 'members',
    label: 'Members covered',
    paths: ['coverage.members'],
    value: (q) => (q.members === null ? null : describeMembers(q.members)),
  },
  ...COVERAGE_TERM_NAMES.map((name): Attribute => ({
    key: name,
    label: TERM_LABEL[name],
    paths: [`coverage.terms.${name}`],
    term: name,
    value: (q) => termCellText(q, name),
  })),
  {
    key: 'source',
    label: 'Quote source',
    paths: ['source'],
    value: (q) => describeSource(q.source),
  },
  {
    key: 'status',
    label: 'Quote status',
    paths: ['status'],
    value: (q) => RUN_STATUS_LABEL[q.status],
  },
];

const REVIEW_ATTRIBUTE: Attribute = {
  key: 'review',
  label: 'Review flags',
  paths: ['reviewFlags'],
  value: (q) =>
    q.reviewFlags.length === 0 ? 'None' : q.reviewFlags.map((f) => REVIEW_FLAG_LABEL[f]).join(', '),
};

function columnClass(row: DemoRow): string {
  return `qc-col is-${row.outcome}`;
}

function ComparisonMatrix(props: {
  comparison: ComparisonResult;
  rows: readonly DemoRow[];
}): React.JSX.Element {
  const { comparison, rows } = props;
  const headingId = useId();
  const tie = comparison.cheapest?.tie ?? false;
  const attributes = rows.some((row) => (row.normalized?.reviewFlags.length ?? 0) > 0)
    ? [...BASE_ATTRIBUTES, REVIEW_ATTRIBUTE]
    : BASE_ATTRIBUTES;
  const differs = new Map(rows.map((row) => [row.index, differingTerms(comparison, row.resultId)]));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Shows a hint only when the table is wider than the card, which depends on the window width.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = (): void => setOverflows(element.scrollWidth > element.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rows.length]);

  return (
    <section className="qc-card qc-matrix-card" aria-labelledby={headingId}>
      <div className="qc-card-head">
        <div>
          <h2 id={headingId}>Quotes</h2>
          <p className="qc-muted">
            {rows.length === 1 ? '1 quote' : `${rows.length} quotes`} in the order received. Values
            are shown as each quote states them.
          </p>
        </div>
        <ul className="qc-legend" aria-label="Table markers">
          <li>
            <span className="qc-legend-swatch is-lowest" aria-hidden="true" />
            Lowest comparable premium
          </li>
          <li>
            <Icon name="alert-triangle" size={14} className="qc-tone-warning" />
            Raised by the engine
          </li>
        </ul>
      </div>
      {overflows && (
        <p className="qc-scroll-hint">
          <Icon name="arrow-right" size={14} />
          Scroll the table sideways to see all {rows.length} quotes. The attribute column stays in
          place.
        </p>
      )}
      <div
        ref={scrollRef}
        className="qc-matrix-scroll"
        role="region"
        aria-labelledby={headingId}
        // Lets keyboard users scroll the table horizontally when it is wider than the window.
        tabIndex={0}
      >
        <table className="qc-matrix">
          <caption className="qc-visually-hidden">
            Quotes as columns and policy attributes as rows, with the comparison outcome for each
            quote.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="qc-attr-col">
                <span className="qc-visually-hidden">Attribute</span>
              </th>
              {rows.map((row) => (
                <th key={row.index} scope="col" className={columnClass(row)}>
                  <QuoteHeader row={row} tie={tie} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attributes.map((attribute) => (
              <tr key={attribute.key} className={`qc-attr-${attribute.key}`}>
                <th scope="row" className="qc-attr-col">
                  {attribute.label}
                  {attribute.hint && <span className="qc-attr-hint">{attribute.hint}</span>}
                </th>
                {rows.map((row) => (
                  <MatrixCell
                    key={row.index}
                    row={row}
                    attribute={attribute}
                    differs={
                      attribute.term !== undefined &&
                      (differs.get(row.index)?.has(attribute.term) ?? false)
                    }
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuoteHeader({ row, tie }: { row: DemoRow; tie: boolean }): React.JSX.Element {
  const badge = outcomeBadge(row, tie);
  const plan = row.normalized?.planLabel;
  return (
    <div className="qc-quote-head">
      <span className="qc-quote-insurer">{row.insurerLabel}</span>
      <span className="qc-quote-plan">
        {plan ?? (row.normalized ? 'Plan name not shown' : 'Unreadable record')}
      </span>
      <span className="qc-quote-badges">
        <Badge tone={badge.tone} label={badge.label} />
        {row.normalized?.source === 'manual' && (
          <span className="qc-chip">
            <Icon name="edit" size={12} />
            Manual entry
          </span>
        )}
      </span>
    </div>
  );
}

function MatrixCell(props: {
  row: DemoRow;
  attribute: Attribute;
  differs: boolean;
}): React.JSX.Element {
  const { row, attribute } = props;
  const quote = row.normalized;
  const flags: Finding[] = findingsAt(row, attribute.paths);
  const isLowestPremium = attribute.key === 'premium' && row.outcome === 'highlighted';

  const { value, missing } = cellValue(row, attribute.paths, quote ? attribute.value(quote) : null);

  const classes = ['qc-cell', columnClass(row)];
  if (attribute.numeric) classes.push('is-numeric');
  if (missing) classes.push('is-missing');
  if (flags.length > 0) classes.push('has-flag');
  if (props.differs) classes.push('has-difference');

  return (
    <td className={classes.join(' ')}>
      <span className="qc-cell-value">
        {isLowestPremium && <Icon name="check-circle" size={16} className="qc-tone-positive" />}
        {value}
      </span>
      {isLowestPremium && <span className="qc-cell-note qc-tone-positive">Lowest comparable</span>}
      {props.differs && (
        <span className="qc-cell-note qc-tone-info">Differs between comparable quotes</span>
      )}
      {flags.map((finding, i) => (
        <span key={i} className="qc-cell-note qc-tone-warning">
          <Icon name="alert-triangle" size={12} />
          {FINDING_TITLE[finding.code]}
        </span>
      ))}
    </td>
  );
}

// ---------------------------------------------------------------------------------------------
// Findings and exclusions
// ---------------------------------------------------------------------------------------------

function Findings({ rows }: { rows: readonly DemoRow[] }): React.JSX.Element {
  const headingId = useId();
  const excluded = rows.filter((row) => row.outcome === 'excluded');
  return (
    <section className="qc-card" aria-labelledby={headingId}>
      <div className="qc-card-head">
        <div>
          <h2 id={headingId}>Findings and exclusions</h2>
          <p className="qc-muted">
            Why quotes were left out of the comparison, by quote and most serious first.
          </p>
        </div>
      </div>
      {excluded.length === 0 ? (
        <p className="qc-all-clear">
          <Icon name="check-circle" size={18} className="qc-tone-positive" />
          No quote was excluded. Every quote passed the validity, eligibility and comparability
          checks.
        </p>
      ) : (
        <ul className="qc-finding-list">
          {excluded.map((row) => (
            <FindingCard key={row.index} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FindingCard({ row }: { row: DemoRow }): React.JSX.Element {
  const badge = outcomeBadge(row, false);
  return (
    <li className="qc-finding-card">
      <div className="qc-finding-head">
        <div>
          <h3>{row.insurerLabel}</h3>
          <p className="qc-muted">
            {row.normalized?.planLabel ??
              (row.normalized ? 'Plan name not shown' : 'Unreadable record')}
          </p>
        </div>
        <Badge tone={badge.tone} label={badge.label} />
      </div>
      {groupFindings(row.findings).map((group) => {
        const { title, tone } = STAGE_GROUP[group.stage];
        return (
          <div key={group.stage} className={`qc-finding-group tone-${tone}`}>
            <h4>
              <Icon name={TONE_ICON[tone]} size={14} />
              {title}
            </h4>
            <ul>
              {group.findings.map((finding, i) => (
                <li key={i}>
                  <span className="qc-finding-title">{FINDING_TITLE[finding.code]}</span>
                  <span className="qc-finding-text">{FINDING_TEXT[finding.code]}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <details className="qc-tech">
        <summary>Technical details</summary>
        <ul>
          {row.resultId && (
            <li>
              Result <code>{row.resultId}</code>
            </li>
          )}
          {row.findings.map((finding, i) => (
            <li key={i}>
              <code>{finding.code}</code>
              {finding.path && (
                <>
                  {' '}
                  at <code>{finding.path}</code>
                </>
              )}{' '}
              ({finding.stage})
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------

function Badge({ tone, label }: { tone: Tone; label: string }): React.JSX.Element {
  return (
    <span className={`qc-badge tone-${tone}`}>
      <Icon name={TONE_ICON[tone]} size={12} />
      {label}
    </span>
  );
}

function StatePanel(props: {
  tone: Tone;
  icon: IconName;
  title: string;
  text: string;
  children?: ReactNode;
}): React.JSX.Element {
  const headingId = useId();
  return (
    <section className={`qc-card qc-state tone-${props.tone}`} aria-labelledby={headingId}>
      <span className="qc-state-icon">
        <Icon name={props.icon} size={22} />
      </span>
      <div className="qc-state-body">
        <h2 id={headingId}>{props.title}</h2>
        <p>{props.text}</p>
        {props.children}
      </div>
    </section>
  );
}
