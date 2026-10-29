// DEVELOPMENT-ONLY demo workflow: the job monitor. Each card shows one job's latest attempt as
// the engine recorded it: status, current step, timestamps, message and result. Cancel and
// Retry call the engine; a retry is a new attempt and the earlier ones stay in the history.
import { useId } from 'react';
import { FINDING_TITLE, REVIEW_FLAG_LABEL, premiumText } from '../demo-model';
import { Icon } from '../icons';
import { elapsedText, formatTime } from './clock';
import { RETRYABLE_STATUSES, isTerminal, latestAttempt } from './engine';
import { attemptLabel, jobsForRequest, latestComparison, stepPosition } from './selectors';
import { JOB_STEPS, type JobAttempt, type JobRecord, type JobStatus, type JobStep } from './types';
import {
  Badge,
  Callout,
  PageTitle,
  RequestPicker,
  SimulatedTag,
  StatePanel,
  describeRequest,
  plural,
  selectedRequest,
  useWorkflow,
} from './ui';

const STEP_SHORT: Record<JobStep, string> = {
  queued: 'Queued',
  validating: 'Validating',
  preparing: 'Preparing',
  'submitting-simulated': 'Submitting (simulated)',
  'awaiting-response': 'Awaiting response',
  normalizing: 'Normalizing',
};

export function JobsPage(): React.JSX.Element {
  const { state, nav, go } = useWorkflow();
  const request = selectedRequest(state, nav.requestId);

  if (!request) {
    return (
      <>
        <PageTitle title="Jobs" />
        <StatePanel
          tone="neutral"
          icon="inbox"
          title="No quote requests yet"
          text="Create a quote request to start simulated insurer jobs."
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

  const jobs = jobsForRequest(state, request.id);
  const latest = jobs.map(latestAttempt);
  const count = (statuses: JobStatus[]) => latest.filter((a) => statuses.includes(a.status)).length;
  const running = count(['running']);
  const queued = count(['pending']);
  const done = jobs.length - running - queued;
  const comparison = latestComparison(state, request.id);

  return (
    <>
      <PageTitle
        title="Jobs"
        description="One simulated job per insurer. States change as the engine runs each step; nothing on this screen is animated without a recorded change behind it."
        actions={
          comparison ? (
            <button
              type="button"
              className="qc-btn qc-btn-primary"
              onClick={() => go('comparison', { requestId: request.id })}
            >
              View comparison
              <Icon name="arrow-right" />
            </button>
          ) : null
        }
      />
      <section className="qc-card wf-request-bar" aria-label="Quote request">
        <RequestPicker
          requests={state.quoteRequests}
          selectedId={request.id}
          onSelect={(id) => go('jobs', { requestId: id })}
        />
        <p className="qc-muted">{describeRequest(request)}</p>
        <p className="wf-job-counts" aria-live="polite">
          {plural(jobs.length, 'job')}: {running} running, {queued} queued, {done} finished.
          {running + queued === 0
            ? ' All jobs have finished; the comparison was generated automatically.'
            : ' The comparison is generated automatically when every job has finished.'}
        </p>
      </section>

      <div className="wf-job-grid">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </>
  );
}

function JobCard({ job }: { job: JobRecord }): React.JSX.Element {
  const { workflow, flash } = useWorkflow();
  const adapter = workflow.adapters.find((a) => a.id === job.insurerId);
  const attempt = latestAttempt(job);
  const label = attemptLabel(attempt);
  const position = stepPosition(attempt);
  const active = !isTerminal(attempt.status);
  const retryable = RETRYABLE_STATUSES.includes(attempt.status);
  const attemptsLeft = job.attempts.length < workflow.config.maxAttemptsPerJob;
  // The job completed (a response arrived), but the result itself failed checks or is flagged.
  const withWarnings =
    attempt.status === 'completed' &&
    (attempt.validityFindings.length > 0 || (attempt.normalized?.reviewFlags.length ?? 0) > 0);
  const headingId = useId();

  const cancel = (): void => {
    const result = workflow.cancelJob(job.id);
    flash(result.ok ? 'info' : 'danger', result.ok ? `Job ${job.id} cancelled.` : result.error);
  };
  const retry = (): void => {
    const result = workflow.retryJob(job.id);
    flash(
      result.ok ? 'info' : 'danger',
      result.ok
        ? `Job ${job.id} retried: attempt ${result.value} started. Attempt ${result.value - 1} is kept in the history.`
        : result.error,
    );
  };

  return (
    <article className={`qc-card wf-job is-${attempt.status}`} aria-labelledby={headingId}>
      <header className="wf-job-head">
        <div className="wf-job-name">
          <h2 id={headingId} className="wf-job-title">
            {adapter?.displayName ?? job.insurerId}
          </h2>
          <SimulatedTag />
        </div>
        <div className="wf-job-badges">
          <Badge tone={label.tone} label={label.label} />
          {withWarnings && <Badge tone="warning" label="RESULT NEEDS REVIEW" />}
        </div>
      </header>
      {adapter && <p className="qc-muted wf-job-scenario">{adapter.scenario}</p>}

      <StepTrack attempt={attempt} />

      <dl className="wf-job-facts">
        <div>
          <dt>Job</dt>
          <dd className="qc-num">{job.id}</dd>
        </div>
        <div>
          <dt>Attempt</dt>
          <dd>
            {attempt.number} of at most {workflow.config.maxAttemptsPerJob}
          </dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{position ?? (active ? 'Waiting for a free slot' : 'Finished')}</dd>
        </div>
        <div>
          <dt>Queued</dt>
          <dd className="qc-num">{formatTime(attempt.queuedAt)}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd className="qc-num">{formatTime(attempt.startedAt)}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd className="qc-num">
            {formatTime(attempt.completedAt)}
            {attempt.completedAt && attempt.startedAt
              ? ` (${elapsedText(attempt.startedAt, attempt.completedAt)})`
              : ''}
          </dd>
        </div>
      </dl>

      {attempt.message && (
        <p className={`wf-job-message${attempt.status === 'cancelled' ? '' : ' is-error'}`}>
          <Icon name={attempt.status === 'cancelled' ? 'minus-circle' : 'x-circle'} size={14} />
          <span>
            {attempt.message} {attempt.errorCode && <code>{attempt.errorCode}</code>}
          </span>
        </p>
      )}
      {attempt.status === 'completed' && <ResultSummary attempt={attempt} />}

      <div className="wf-actions">
        {active && (
          <button type="button" className="qc-btn qc-btn-secondary wf-btn-small" onClick={cancel}>
            Cancel job<span className="qc-visually-hidden"> {job.id}</span>
          </button>
        )}
        {retryable && (
          <button
            type="button"
            className="qc-btn qc-btn-primary wf-btn-small"
            onClick={retry}
            disabled={!attemptsLeft}
          >
            <Icon name="refresh" size={14} />
            Retry as attempt {attempt.number + 1}
            <span className="qc-visually-hidden"> of job {job.id}</span>
          </button>
        )}
        {retryable && !attemptsLeft && (
          <span className="qc-muted">
            The demo allows {workflow.config.maxAttemptsPerJob} attempts per job.
          </span>
        )}
      </div>

      <details className="wf-history">
        <summary>
          Execution history: {plural(job.attempts.length, 'attempt')},{' '}
          {plural(
            job.attempts.reduce((total, a) => total + a.events.length, 0),
            'event',
          )}
        </summary>
        {[...job.attempts].reverse().map((a) => (
          <AttemptHistory key={a.number} attempt={a} />
        ))}
      </details>
    </article>
  );
}

/** The six real steps, marked from the attempt's recorded events. */
function StepTrack({ attempt }: { attempt: JobAttempt }): React.JSX.Element {
  const steps = attempt.events.map((e) => e.progressStep).filter((s) => s !== undefined);
  const reached = new Set(steps);
  // Where an attempt that did not complete stopped: its last recorded step.
  const stoppedAt =
    isTerminal(attempt.status) && attempt.status !== 'completed' ? steps.at(-1) : undefined;
  return (
    <ol className="wf-steps" aria-label="Job steps">
      {JOB_STEPS.map((step) => {
        const current = attempt.status === 'running' && attempt.step === step;
        const state = current
          ? 'current'
          : step === stoppedAt
            ? 'stopped'
            : reached.has(step)
              ? 'done'
              : 'todo';
        const spoken = {
          current: ' (in progress)',
          stopped: ' (stopped here)',
          done: ' (done)',
          todo: ' (not reached)',
        }[state];
        return (
          <li key={step} className={`is-${state}`} aria-current={current ? 'step' : undefined}>
            <span className="wf-step-dot" aria-hidden="true" />
            <span className="wf-step-label">
              {STEP_SHORT[step]}
              <span className="qc-visually-hidden">{spoken}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ResultSummary({ attempt }: { attempt: JobAttempt }): React.JSX.Element | null {
  const n = attempt.normalized;
  if (!n) return null;
  const premium = premiumText(n);
  const notes = [
    ...attempt.validityFindings.map((f) => FINDING_TITLE[f.code]),
    ...n.reviewFlags.map((f) => `Review flag: ${REVIEW_FLAG_LABEL[f]}`),
  ];
  return (
    <div className="wf-result-summary">
      <p>
        <span className="qc-muted">Total premium (simulated): </span>
        <strong className="qc-num">{premium ?? 'Not shown'}</strong>
        {n.planLabel && <span className="qc-muted"> · {n.planLabel}</span>}
      </p>
      {notes.length > 0 && (
        <Callout tone="warning" title="Result checks">
          <ul className="wf-bullets">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Callout>
      )}
      {attempt.missingFields.length > 0 && (
        <p className="wf-missing">
          <span className="qc-muted">Missing from the response:</span>{' '}
          {attempt.missingFields.join(', ')}
        </p>
      )}
    </div>
  );
}

function AttemptHistory({ attempt }: { attempt: JobAttempt }): React.JSX.Element {
  const label = attemptLabel(attempt);
  return (
    <section className="wf-attempt">
      <h3>
        Attempt {attempt.number} <Badge tone={label.tone} label={label.label} />
      </h3>
      <ol className="wf-events">
        {attempt.events.map((event, index) => {
          const eventLabel = attemptLabel({
            status: event.status as JobStatus,
            step: (event.progressStep as JobStep | undefined) ?? null,
          });
          return (
            <li key={index}>
              <time dateTime={event.occurredAt} className="qc-num">
                {formatTime(event.occurredAt)}
              </time>
              <span className="wf-event-state">{eventLabel.label}</span>
              <span>
                {event.safeMessage}
                {event.errorCode && (
                  <>
                    {' '}
                    <code>{event.errorCode}</code>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {attempt.normalizationIssues.length > 0 && (
        <Callout tone="danger" title="The response does not match the result contract">
          <ul className="wf-bullets">
            {attempt.normalizationIssues.map((issue, index) => (
              <li key={index}>
                <code>{issue.path || '(root)'}</code> — <code>{issue.code}</code>
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {attempt.simulatedPayload ? (
        <details className="wf-payload">
          <summary>
            Simulated response <SimulatedTag text="SYNTHETIC JSON" />
          </summary>
          <pre tabIndex={0}>{attempt.simulatedPayload}</pre>
        </details>
      ) : (
        <p className="qc-muted">No simulated response was received for this attempt.</p>
      )}
    </section>
  );
}
