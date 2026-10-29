// DEVELOPMENT-ONLY demo workflow: the dashboard and the activity timeline. Every number is
// derived from the recorded state (selectors.ts); every event is one the engine recorded.
import { useId, useState } from 'react';
import type { Tone } from '../demo-model';
import { Icon } from '../icons';
import { formatDateTime, formatTime } from './clock';
import { dashboardMetrics } from './selectors';
import type { ActivityEvent, ActivityType, DemoState } from './types';
import { Badge, type PageId, PageTitle, SimulatedTag, plural, useWorkflow } from './ui';

// ---- Dashboard -------------------------------------------------------------------------------

interface WalkthroughStep {
  title: string;
  detail: string;
  page: PageId;
  done: (state: DemoState) => boolean;
}

const WALKTHROUGH: readonly WalkthroughStep[] = [
  {
    title: 'Load the synthetic census',
    detail: '52 invented people at a fictitious company, with deliberate errors to correct.',
    page: 'census',
    done: (s) => s.census.length > 0,
  },
  {
    title: 'Correct flagged rows and import the members',
    detail: 'Row-level validation; possible duplicates are flagged for a decision.',
    page: 'census',
    done: (s) => s.members.length > 0,
  },
  {
    title: 'Create and review a quote request',
    detail: 'Checked by the existing quote request validator and the required-field pre-flight.',
    page: 'request',
    done: (s) => s.quoteRequests.length > 0,
  },
  {
    title: 'Watch the simulated jobs, then retry the one that timed out',
    detail: 'Each job moves through real states; a retry is a new attempt with its own history.',
    page: 'jobs',
    done: (s) => s.jobs.some((j) => j.attempts.length > 1),
  },
  {
    title: 'Review the comparison',
    detail: 'Normalised and compared by the existing M3 engine with its provisional rule.',
    page: 'comparison',
    done: (s) => s.comparisons.length > 0,
  },
  {
    title: 'Generate the report preview',
    detail: 'Built from the same comparison snapshot the comparison screen shows.',
    page: 'report',
    done: (s) => s.reports.length > 0,
  },
];

export function DashboardPage(): React.JSX.Element {
  const { state, go, workflow } = useWorkflow();
  const metrics = dashboardMetrics(state);
  const next = WALKTHROUGH.find((step) => !step.done(state));
  const cards: { label: string; value: number; detail: string; page: PageId }[] = [
    { label: 'Clients', value: metrics.clients, detail: 'Synthetic organisations', page: 'census' },
    {
      label: 'Quote requests',
      value: metrics.quoteRequests,
      detail: 'Validated and submitted to simulators',
      page: 'jobs',
    },
    {
      label: 'Active jobs',
      value: metrics.activeJobs,
      detail: 'Queued or running now',
      page: 'jobs',
    },
    {
      label: 'Successful responses',
      value: metrics.successfulResponses,
      detail: 'Simulated responses normalised',
      page: 'jobs',
    },
    {
      label: 'Failed jobs',
      value: metrics.failedJobs,
      detail: 'Latest attempt failed, timed out or was cancelled',
      page: 'jobs',
    },
    {
      label: 'Completed comparisons',
      value: metrics.completedComparisons,
      detail: 'Quote requests with a comparison',
      page: 'comparison',
    },
  ];
  const recent = [...state.activity].reverse().slice(0, 6);
  const walkthroughId = useId();
  const activityId = useId();
  const aboutId = useId();

  return (
    <>
      <PageTitle
        title="Dashboard"
        description="An end-to-end walk through the quote workflow, from census to report, using synthetic data and simulated insurers."
        actions={
          next ? (
            <button type="button" className="qc-btn qc-btn-primary" onClick={() => go(next.page)}>
              Next: {next.title}
              <Icon name="arrow-right" />
            </button>
          ) : null
        }
      />

      <ul className="wf-metric-grid" aria-label="Workflow counts">
        {cards.map((card) => (
          <li key={card.label}>
            <button
              type="button"
              className="qc-metric wf-metric-button"
              onClick={() => go(card.page)}
            >
              <span className="qc-metric-label">{card.label}</span>
              <span className="qc-metric-value">{card.value}</span>
              <span className="qc-metric-detail">{card.detail}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="wf-two-col">
        <section className="qc-card" aria-labelledby={walkthroughId}>
          <div className="qc-card-head">
            <div>
              <h2 id={walkthroughId}>Demo walkthrough</h2>
              <p className="qc-muted">Each step is marked done from the recorded data.</p>
            </div>
          </div>
          <ol className="wf-checklist">
            {WALKTHROUGH.map((step, index) => {
              const done = step.done(state);
              return (
                <li key={step.title} className={done ? 'is-done' : ''}>
                  <span className="wf-check-mark" aria-hidden="true">
                    {done ? <Icon name="check" size={13} /> : index + 1}
                  </span>
                  <div className="wf-check-text">
                    <span className="wf-check-title">
                      {step.title}
                      <span className="qc-visually-hidden">{done ? ' (done)' : ' (not done)'}</span>
                    </span>
                    <span className="qc-muted">{step.detail}</span>
                  </div>
                  <button
                    type="button"
                    className="qc-btn qc-btn-secondary wf-btn-small"
                    onClick={() => go(step.page)}
                    aria-label={`Open: ${step.title}`}
                  >
                    Open
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="qc-card" aria-labelledby={activityId}>
          <div className="qc-card-head">
            <div>
              <h2 id={activityId}>Recent activity</h2>
              <p className="qc-muted">Recorded as it happens, with application timestamps.</p>
            </div>
            <button
              type="button"
              className="qc-btn qc-btn-secondary wf-btn-small"
              onClick={() => go('activity')}
            >
              View all
            </button>
          </div>
          <ol className="wf-timeline is-compact">
            {recent.map((event) => (
              <ActivityItem key={event.id} event={event} compact />
            ))}
          </ol>
        </section>
      </div>

      <section className="qc-card" aria-labelledby={aboutId}>
        <div className="qc-card-head">
          <div>
            <h2 id={aboutId}>What is real and what is simulated</h2>
          </div>
          <SimulatedTag />
        </div>
        <div className="wf-two-col is-tight">
          <div>
            <p className="wf-subhead">Existing product code, unchanged</p>
            <ul className="wf-bullets">
              <li>Quote request validation: contract schema and the placeholder input rules.</li>
              <li>Required-field pre-flight per insurer adapter.</li>
              <li>Result normalisation, validity checks and the comparison engine.</li>
              <li>The provisional comparison rule, pending business sign-off.</li>
            </ul>
          </div>
          <div>
            <p className="wf-subhead">Simulated for this demo</p>
            <ul className="wf-bullets">
              <li>
                {plural(workflow.adapters.length, 'insurer simulator')}: responses, prices, delays,
                the timeout and the incomplete response are deterministic and invented.
              </li>
              <li>Storage: an in-memory store; nothing is written to disk.</li>
              <li>Report: an in-app preview; no file is produced.</li>
              <li>No insurer portal, network service or credential is used.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

// ---- Activity --------------------------------------------------------------------------------

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  'demo.reset': 'Demo data set loaded',
  'client.created': 'Client created',
  'census.loaded': 'Census loaded',
  'census.corrected': 'Census row changed',
  'census.imported': 'Census imported',
  'quote-request.created': 'Quote request created',
  'job.queued': 'Job queued',
  'job.started': 'Job started',
  'job.response-received': 'Simulated response received',
  'job.normalized': 'Response normalised',
  'job.failed': 'Job failed',
  'job.timed-out': 'Job timed out',
  'job.cancelled': 'Job cancelled',
  'job.retried': 'Job retried',
  'comparison.generated': 'Comparison generated',
  'report.generated': 'Report generated',
};

function activityTone(type: ActivityType): Tone {
  if (type === 'job.failed' || type === 'job.timed-out') return 'danger';
  if (type === 'job.cancelled' || type === 'demo.reset') return 'neutral';
  if (type === 'census.corrected' || type === 'job.retried') return 'warning';
  if (
    type === 'job.normalized' ||
    type === 'census.imported' ||
    type === 'comparison.generated' ||
    type === 'report.generated'
  ) {
    return 'positive';
  }
  return 'info';
}

type ActivityFilter = 'all' | 'census' | 'jobs' | 'results';

const FILTERS: { id: ActivityFilter; label: string; match: (t: ActivityType) => boolean }[] = [
  { id: 'all', label: 'All events', match: () => true },
  {
    id: 'census',
    label: 'Clients & census',
    match: (t) => t === 'demo.reset' || t.startsWith('client.') || t.startsWith('census.'),
  },
  {
    id: 'jobs',
    label: 'Requests & jobs',
    match: (t) => t.startsWith('quote-request.') || t.startsWith('job.'),
  },
  {
    id: 'results',
    label: 'Comparisons & reports',
    match: (t) => t.startsWith('comparison.') || t.startsWith('report.'),
  },
];

function refsText(event: ActivityEvent): string {
  const r = event.refs;
  return [
    r.quoteRequestId,
    r.jobId && `${r.jobId}${r.attempt ? `, attempt ${r.attempt}` : ''}`,
    r.comparisonId,
    r.reportId,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ActivityItem({
  event,
  compact = false,
}: {
  event: ActivityEvent;
  compact?: boolean;
}): React.JSX.Element {
  const refs = refsText(event);
  return (
    <li className="wf-event">
      <time dateTime={event.at} className="wf-event-time qc-num">
        {compact ? formatTime(event.at) : formatDateTime(event.at)}
      </time>
      <div className="wf-event-body">
        <Badge tone={activityTone(event.type)} label={ACTIVITY_LABEL[event.type]} />
        <p>{event.message}</p>
        {!compact && refs && <p className="qc-muted wf-event-refs">{refs}</p>}
      </div>
    </li>
  );
}

export function ActivityPage(): React.JSX.Element {
  const { state } = useWorkflow();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const groupName = useId();
  const match = FILTERS.find((f) => f.id === filter)!.match;
  const events = [...state.activity].reverse().filter((e) => match(e.type));

  return (
    <>
      <PageTitle
        title="Activity"
        description="Application events recorded by the workflow as they happened, newest first. Messages carry IDs and counts only: no names, ages or contact details."
      />
      <section className="qc-card" aria-label="Activity timeline">
        <fieldset className="wf-segmented">
          <legend className="qc-visually-hidden">Show</legend>
          {FILTERS.map((f) => (
            <label key={f.id} className={filter === f.id ? 'is-selected' : ''}>
              <input
                type="radio"
                name={groupName}
                value={f.id}
                checked={filter === f.id}
                onChange={() => setFilter(f.id)}
              />
              {f.label}
            </label>
          ))}
        </fieldset>
        <p className="qc-muted wf-count-line">
          {plural(events.length, 'event')} shown of {state.activity.length}.
        </p>
        {events.length === 0 ? (
          <p className="wf-empty">No events of this kind yet.</p>
        ) : (
          <ol className="wf-timeline">
            {events.map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
