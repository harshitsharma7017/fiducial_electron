// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The demo screen: synthetic proposal data to review and edit, the Run button, the portal
// environment, the progress of the run and the summary of what was filled, skipped and failed.
// In the full workflow it also shows the review and asks for an explicit confirmation before a
// proposal is created, then the result as read back from the portal, field by field. Earlier
// creation attempts whose outcome is unknown are listed with the actions that resolve them (a
// read-only look-up in the portal, then the user's decision). Shown only when the preload exposed
// window.fqfPortalDemo (the flag is on). Talks to the main process through that bridge only.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { AttemptState, AttemptSummary } from '../shared/attempt-state';
import type { AttemptResolution } from '../shared/contract';
import { SYNTHETIC_DEMO_PROPOSAL, demoDataErrors, type DemoProposal } from '../shared/demo-data';
import { IDLE_REPORT, type CreationReview, type RunReport } from '../shared/protocol';
import './portal-demo.css';

const ACTIVE: ReadonlySet<RunReport['state']> = new Set([
  'opening',
  'waiting-for-login',
  'finding-form',
  'filling',
  'creating',
  'verifying-result',
]);
const POLL_MS = 1000;

/** Wraps the home screen and adds the demo's launcher beneath it. */
export function PortalDemoGate({ children }: { children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  if (open) {
    return (
      <PortalDemoScreen
        onClose={() => {
          setOpen(false);
          requestAnimationFrame(() => launcher.current?.focus());
        }}
      />
    );
  }
  return (
    <>
      {children}
      <aside className="pd-launcher" aria-labelledby={headingId}>
        <div>
          <p className="pd-badge">Demo Only — Temporary Feature</p>
          <h2 id={headingId} className="pd-launcher-title">
            Fill the Fiducial portal form
          </h2>
          <p className="pd-muted">
            Fills the portal’s New proposal form with synthetic data and stops before saving.
          </p>
        </div>
        <button ref={launcher} type="button" className="pd-button" onClick={() => setOpen(true)}>
          Open demo
        </button>
      </aside>
    </>
  );
}

type Errors = Record<string, string>;

function PortalDemoScreen({ onClose }: { onClose: () => void }): React.JSX.Element {
  const api = window.fqfPortalDemo;
  const [data, setData] = useState<DemoProposal>(SYNTHETIC_DEMO_PROPOSAL);
  const [errors, setErrors] = useState<Errors>({});
  const [checked, setChecked] = useState(false);
  const [report, setReport] = useState<RunReport>(IDLE_REPORT);
  const [failure, setFailure] = useState<string | null>(null);
  const running = ACTIVE.has(report.state);
  const full = report.mode === 'full';
  const awaiting = report.state === 'awaiting-confirmation' && report.review !== null;

  const refresh = useCallback(async () => {
    if (!api) return;
    const result = await api.report();
    if (result.ok) setReport(result.data);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const change = (next: DemoProposal) => {
    setData(next);
    if (checked) setErrors(demoDataErrors(next));
  };
  const set = <K extends keyof DemoProposal>(key: K, value: DemoProposal[K]) =>
    change({ ...data, [key]: value });
  const setRisk = <K extends keyof DemoProposal['risk']>(key: K, value: string) =>
    change({ ...data, risk: { ...data.risk, [key]: value } });

  const run = async () => {
    setChecked(true);
    const found = demoDataErrors(data);
    setErrors(found);
    if (Object.keys(found).length > 0 || !api) return;
    setFailure(null);
    const result = await api.start(data);
    if (result.ok) setReport(result.data);
    else setFailure(result.error.message);
  };

  const stop = async () => {
    if (!api) return;
    const result = await api.cancel();
    if (result.ok) setReport(result.data);
  };

  const answer = (result: Awaited<ReturnType<NonNullable<typeof api>['report']>>) => {
    if (result.ok) {
      setReport(result.data);
      return;
    }
    const reason = result.error.details?.['reason'];
    setFailure(typeof reason === 'string' ? reason : result.error.message);
    void refresh();
  };

  const confirm = async (review: CreationReview, acknowledgeDuplicates: boolean) => {
    if (!api) return;
    setFailure(null);
    answer(await api.confirm(review.token, acknowledgeDuplicates));
  };

  const reconcile = async (attemptId: string) => {
    if (!api) return;
    setFailure(null);
    answer(await api.reconcile(attemptId));
  };

  const resolve = async (resolution: AttemptResolution) => {
    if (!api) return;
    setFailure(null);
    answer(await api.resolve(resolution));
  };

  return (
    <main className="pd-page">
      <header className="pd-header">
        <p className="pd-badge">Demo Only — Temporary Feature</p>
        <h1>{full ? 'Fiducial proposal workflow' : 'Fill the Fiducial portal form'}</h1>
        {full ? (
          <p className="pd-muted">
            Synthetic data only. The demo opens the portal in its own window, waits while you sign
            in, fills the New proposal form and checks it, then shows a review.{' '}
            <strong>A proposal is created only after you confirm the review</strong>, and only in
            the environment shown below. The window blocks every other request that would create or
            change a record.
          </p>
        ) : (
          <p className="pd-muted">
            Synthetic data only. The demo opens the Fiducial portal in its own window, waits while
            you sign in, fills the New proposal form and stops before{' '}
            <strong>Create proposal</strong>. Nothing is saved: that window blocks every request
            that would create or change a record.
          </p>
        )}
        <button type="button" className="pd-link" onClick={onClose}>
          ← Back to home
        </button>
      </header>

      <EnvironmentBanner report={report} />
      {report.storeProblem ? (
        <p className="pd-env-note pd-error" role="alert">
          {report.storeProblem}
        </p>
      ) : null}
      <EarlierAttempts
        attempts={report.attempts}
        busy={running || awaiting}
        onReconcile={reconcile}
        onResolve={resolve}
      />

      <form
        className="pd-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <fieldset className="pd-fieldset" disabled={running || awaiting}>
          <legend>Proposal (filled on the New proposal form)</legend>
          <Field label="Type of case" error={errors['caseType']}>
            {(id) => (
              <select
                id={id}
                value={data.caseType}
                onChange={(event) =>
                  set('caseType', event.target.value === 'RENEWAL' ? 'RENEWAL' : 'NEW')
                }
              >
                <option value="NEW">New business</option>
                <option value="RENEWAL">Renewal</option>
              </select>
            )}
          </Field>
          <Field
            label="Insured name"
            hint="Chosen only if the portal’s client master has exactly this name."
            error={errors['insuredName']}
          >
            {(id) => (
              <input
                id={id}
                value={data.insuredName}
                onChange={(event) => set('insuredName', event.target.value)}
              />
            )}
          </Field>
          <Field label="Policy period from" error={errors['policyStart']}>
            {(id) => (
              <input
                id={id}
                type="date"
                value={data.policyStart}
                onChange={(event) => set('policyStart', event.target.value)}
              />
            )}
          </Field>
          <Field label="Policy period to" error={errors['policyEnd']}>
            {(id) => (
              <input
                id={id}
                type="date"
                value={data.policyEnd}
                onChange={(event) => set('policyEnd', event.target.value)}
              />
            )}
          </Field>
          <Field label="Quotes needed by" error={errors['quotesNeededBy']}>
            {(id) => (
              <input
                id={id}
                type="date"
                value={data.quotesNeededBy}
                onChange={(event) => set('quotesNeededBy', event.target.value)}
              />
            )}
          </Field>
          <Field
            label="Assigned to (optional)"
            hint="A staff name as the portal lists it. Empty keeps the signed-in user."
            error={errors['assignedTo']}
          >
            {(id) => (
              <input
                id={id}
                value={data.assignedTo}
                onChange={(event) => set('assignedTo', event.target.value)}
              />
            )}
          </Field>
        </fieldset>

        <fieldset className="pd-fieldset" disabled={running || awaiting}>
          <legend>Risk and contact (not on the New proposal form; reported as skipped)</legend>
          <Field label="Contact email" error={errors['contactEmail']}>
            {(id) => (
              <input
                id={id}
                value={data.contactEmail}
                onChange={(event) => set('contactEmail', event.target.value)}
              />
            )}
          </Field>
          <Field label="Occupancy" error={errors['risk.occupancy']}>
            {(id) => (
              <input
                id={id}
                value={data.risk.occupancy}
                onChange={(event) => setRisk('occupancy', event.target.value)}
              />
            )}
          </Field>
          <Field label="Risk location" error={errors['risk.location']}>
            {(id) => (
              <input
                id={id}
                value={data.risk.location}
                onChange={(event) => setRisk('location', event.target.value)}
              />
            )}
          </Field>
          <Field label="Building sum insured (₹)" error={errors['risk.buildingSumInsured']}>
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                value={data.risk.buildingSumInsured}
                onChange={(event) => setRisk('buildingSumInsured', event.target.value)}
              />
            )}
          </Field>
          <Field label="Plant & machinery sum insured (₹)" error={errors['risk.plantSumInsured']}>
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                value={data.risk.plantSumInsured}
                onChange={(event) => setRisk('plantSumInsured', event.target.value)}
              />
            )}
          </Field>
          <Field label="Stock sum insured (₹)" error={errors['risk.stockSumInsured']}>
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                value={data.risk.stockSumInsured}
                onChange={(event) => setRisk('stockSumInsured', event.target.value)}
              />
            )}
          </Field>
        </fieldset>

        <div className="pd-actions">
          <button type="submit" className="pd-button" disabled={running || awaiting}>
            {full ? 'Run workflow — fill, then review' : 'Run Demo — Fill Fiducial Form'}
          </button>
          {running || awaiting ? (
            <button type="button" className="pd-button pd-secondary" onClick={() => void stop()}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="pd-button pd-secondary"
              onClick={() => {
                setData(SYNTHETIC_DEMO_PROPOSAL);
                setErrors({});
                setChecked(false);
              }}
            >
              Reset sample data
            </button>
          )}
        </div>
      </form>

      <Progress report={report} />
      {awaiting && report.review ? (
        <Review
          key={report.review.token}
          review={report.review}
          live={report.environment.kind === 'production'}
          onConfirm={confirm}
        />
      ) : null}
      <ProposalResult report={report} />
      <Summary report={report} failure={failure} />
    </main>
  );
}

/** Which portal, in which mode: always visible. */
function EnvironmentBanner({ report }: { report: RunReport }): React.JSX.Element {
  const full = report.mode === 'full';
  const live = report.environment.kind === 'production';
  const verified =
    report.environment.verified === null
      ? 'checked after you sign in'
      : report.environment.verified
        ? 'verified'
        : 'NOT verified';
  return (
    <section
      className={`pd-env ${full ? (live ? 'pd-env-live' : 'pd-env-test') : 'pd-env-fill'}`}
      aria-label="Portal environment"
    >
      <p className="pd-env-mode">
        {full
          ? live
            ? 'Live verification — creates one real proposal after your confirmation'
            : 'Full workflow — creates a proposal after your confirmation'
          : 'Fill-only — nothing is saved'}
      </p>
      <p className="pd-env-name">
        <strong>{report.environment.name || 'Portal'}</strong> · {report.portal}
        {full ? ` · Environment ${verified}` : ''}
      </p>
      {report.fullRefused ? <p className="pd-env-note">{report.fullRefused}</p> : null}
    </section>
  );
}

const STEP_MARKS: Record<RunReport['progress'][number]['status'], string> = {
  pending: '○',
  active: '◐',
  done: '✓',
  failed: '✗',
  skipped: '–',
  uncertain: '?',
};

function Progress({ report }: { report: RunReport }): React.JSX.Element | null {
  if (report.state === 'idle') return null;
  return (
    <section className="pd-progress" aria-label="Progress">
      <ol>
        {report.progress.map((step) => (
          <li key={step.key} className={`pd-step pd-step-${step.status}`}>
            <span aria-hidden="true">{STEP_MARKS[step.status]}</span> {step.label}
            <span className="pd-visually-hidden"> — {step.status}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ATTEMPT_STATES: Record<AttemptState, string> = {
  PREPARED: 'Prepared',
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  SUBMITTING: 'Being submitted',
  VERIFYING: 'Being verified',
  CREATED: 'Created',
  REFUSED: 'Refused',
  NOT_CREATED: 'Not created',
  CANCELLED: 'Cancelled',
  UNCERTAIN: 'Outcome unknown',
  RECONCILIATION_REQUIRED: 'Outcome unknown (found after a restart)',
};

/** Earlier creation attempts: the unresolved ones with their actions, then the latest results. */
function EarlierAttempts({
  attempts,
  busy,
  onReconcile,
  onResolve,
}: {
  attempts: AttemptSummary[];
  busy: boolean;
  onReconcile: (attemptId: string) => Promise<void>;
  onResolve: (resolution: AttemptResolution) => Promise<void>;
}): React.JSX.Element | null {
  if (attempts.length === 0) return null;
  const unresolved = attempts.filter((attempt) => attempt.unresolved).length;
  return (
    <section className="pd-attempts" aria-labelledby="pd-attempts-heading">
      <h2 id="pd-attempts-heading">Earlier creation attempts</h2>
      {unresolved > 0 ? (
        <p className="pd-error" role="alert">
          {unresolved} attempt(s) have an unknown outcome: a proposal may or may not have been
          created. No new proposal can be created until each is resolved. Check the portal first; it
          only reads the portal and never submits again.
        </p>
      ) : null}
      <ul className="pd-attempt-list">
        {attempts.map((attempt) => (
          <li key={attempt.id} className={attempt.unresolved ? 'pd-attempt-open' : 'pd-attempt'}>
            <p>
              <strong>{ATTEMPT_STATES[attempt.state]}</strong> · {attempt.caseType} ·{' '}
              {attempt.clientName}
              {attempt.policyStart ? ` · ${attempt.policyStart} to ${attempt.policyEnd ?? ''}` : ''}
              {attempt.proposalReference ? ` · ${attempt.proposalReference}` : ''}
            </p>
            <p className="pd-muted">
              {attempt.submittedAt
                ? `Submitted ${attempt.submittedAt}`
                : `Started ${attempt.createdAt}`}
              {attempt.lastReconciledAt
                ? ` · Last checked ${attempt.lastReconciledAt} (${RECONCILED[attempt.reconciliation ?? 'failed']})`
                : ' · Not checked yet'}
            </p>
            {attempt.unresolved ? (
              <div className="pd-actions">
                <button
                  type="button"
                  className="pd-button"
                  disabled={busy}
                  onClick={() => void onReconcile(attempt.id)}
                >
                  Check the portal
                </button>
                {attempt.candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className="pd-button pd-secondary"
                    disabled={busy}
                    onClick={() =>
                      void onResolve({
                        attemptId: attempt.id,
                        resolution: 'created',
                        proposalId: candidate.id,
                      })
                    }
                  >
                    It created {candidate.reference}
                  </button>
                ))}
                {attempt.canMarkNotCreated ? (
                  <button
                    type="button"
                    className="pd-button pd-secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Mark this attempt as not created? Do this only if you have checked the Proposals list in the portal and no proposal from it exists.',
                        )
                      ) {
                        void onResolve({ attemptId: attempt.id, resolution: 'not-created' });
                      }
                    }}
                  >
                    Mark as not created
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const RECONCILED: Record<NonNullable<AttemptSummary['reconciliation']>, string> = {
  found: 'found',
  none: 'no matching proposal found',
  several: 'several matching proposals found',
  failed: 'the portal could not be checked',
};

/** The pre-creation review; nothing is created until the confirmation below is given. */
function Review({
  review,
  live,
  onConfirm,
}: {
  review: CreationReview;
  live: boolean;
  onConfirm: (review: CreationReview, acknowledgeDuplicates: boolean) => Promise<void>;
}): React.JSX.Element {
  const [agreed, setAgreed] = useState(false);
  const [checkedDuplicates, setCheckedDuplicates] = useState(false);
  const [sending, setSending] = useState(false);
  const agreeId = useId();
  const duplicatesId = useId();
  const needsDuplicateCheck = review.duplicates.length > 0;
  const rows: [string, string][] = [
    ['Target environment', `${review.environment} (${review.origin})`],
    ['Type of case', review.caseType],
    ['Insured', review.insured],
    [
      'Client in the portal',
      `${review.clientId}${review.clientGstin ? ` · GSTIN ${review.clientGstin}` : ' · No GSTIN'}`,
    ],
    ['Policy period', `${review.policyStart} to ${review.policyEnd}`],
    ['Quotes needed by', review.quotesNeededBy],
    ['Assigned to', review.assignedTo],
    [
      'Risk locations',
      review.riskLocations.length > 0 ? review.riskLocations.join('; ') : 'None ticked',
    ],
  ];
  return (
    <section className="pd-review" aria-labelledby="pd-review-heading">
      <h2 id="pd-review-heading">Review before creating</h2>
      <p className="pd-muted">
        Check these values. They were filled in the portal window and read back from it. Nothing has
        been created yet.
      </p>
      <table className="pd-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
          {review.fields
            .filter(
              (field) =>
                !['caseType', 'insuredName', 'policyStart', 'policyEnd', 'quotesNeededBy'].includes(
                  field.key,
                ),
            )
            .map((field) => (
              <tr key={field.key}>
                <th scope="row">{field.label}</th>
                <td>{field.value}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {review.warnings.length > 0 || review.skipped.length > 0 ? (
        <ul className="pd-warnings">
          {review.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
          {review.skipped.map((field) => (
            <li key={field.key}>
              Skipped: {field.label} — {field.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {needsDuplicateCheck ? (
        <>
          <table className="pd-table">
            <caption>Possible duplicates ({review.duplicates.length})</caption>
            <thead>
              <tr>
                <th scope="col">Proposal</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col">Known from</th>
              </tr>
            </thead>
            <tbody>
              {review.duplicates.map((duplicate) => (
                <tr key={`${duplicate.source}-${duplicate.reference}`}>
                  <td>{duplicate.reference}</td>
                  <td>{duplicate.stage}</td>
                  <td>{duplicate.createdAt}</td>
                  <td>{duplicate.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pd-confirm">
            <input
              id={duplicatesId}
              type="checkbox"
              checked={checkedDuplicates}
              disabled={sending}
              onChange={(event) => setCheckedDuplicates(event.target.checked)}
            />
            <label htmlFor={duplicatesId}>
              I have checked the proposals above and still want to create another one.
            </label>
          </div>
        </>
      ) : null}
      <div className="pd-confirm">
        <input
          id={agreeId}
          type="checkbox"
          checked={agreed}
          disabled={sending}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <label htmlFor={agreeId}>
          I have reviewed these values and want to create this proposal in{' '}
          <strong>{review.environment}</strong>.
          {live ? ' I am following the approved live verification procedure.' : ''}
        </label>
      </div>
      <button
        type="button"
        className="pd-button"
        disabled={!agreed || (needsDuplicateCheck && !checkedDuplicates) || sending}
        onClick={() => {
          setSending(true);
          void onConfirm(review, checkedDuplicates).finally(() => setSending(false));
        }}
      >
        {sending ? 'Creating…' : `${review.action} in ${review.environment}`}
      </button>
    </section>
  );
}

const CHECK_MARKS = {
  verified: '✓ Verified',
  mismatch: '✗ Differs',
  unverified: '? Not verified',
} as const;

/** The created proposal as read back from the portal, or why the outcome is not a success. */
function ProposalResult({ report }: { report: RunReport }): React.JSX.Element | null {
  if (!['created', 'created-unverified', 'creation-failed', 'uncertain'].includes(report.state)) {
    return null;
  }
  const proposal = report.proposal;
  const tone =
    report.state === 'created'
      ? 'pd-result-ok'
      : report.state === 'uncertain' || report.state === 'created-unverified'
        ? 'pd-result-warn'
        : 'pd-result-bad';
  const title =
    report.state === 'created'
      ? 'Proposal created and verified'
      : report.state === 'created-unverified'
        ? 'Proposal created — not every field verified'
        : report.state === 'uncertain'
          ? 'Result not certain'
          : 'Proposal not created';
  return (
    <section className={`pd-result ${tone}`} aria-labelledby="pd-result-heading">
      <h2 id="pd-result-heading">{title}</h2>
      <p>{report.message}</p>
      {proposal ? (
        <table className="pd-table">
          <tbody>
            <tr>
              <th scope="row">Proposal number</th>
              <td>{proposal.reference}</td>
            </tr>
            <tr>
              <th scope="row">Status</th>
              <td>{proposal.stage}</td>
            </tr>
            <tr>
              <th scope="row">Insured</th>
              <td>{proposal.clientName}</td>
            </tr>
            <tr>
              <th scope="row">Policy period</th>
              <td>
                {proposal.policyStart} to {proposal.policyEnd}
              </td>
            </tr>
            <tr>
              <th scope="row">Assigned to</th>
              <td>{proposal.ownerName}</td>
            </tr>
            <tr>
              <th scope="row">Portal record</th>
              <td>
                {report.portal}/proposals/{proposal.id}
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}
      {report.verification ? (
        <table className="pd-table">
          <caption>Read back from the portal</caption>
          <tbody>
            {report.verification.map((check) => (
              <tr key={check.field}>
                <th scope="row">{check.label}</th>
                <td className={check.status === 'verified' ? 'pd-ok' : 'pd-error'}>
                  {CHECK_MARKS[check.status]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error: string | undefined;
  children: (id: string) => ReactNode;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className="pd-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <p className="pd-hint">{hint}</p> : null}
      {error ? (
        <p className="pd-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const STATE_LABELS: Record<RunReport['state'], string> = {
  idle: 'Not started',
  opening: 'Opening the portal',
  'waiting-for-login': 'Waiting for you to sign in',
  'finding-form': 'Opening the form',
  filling: 'Filling',
  done: 'Done — stopped before saving',
  failed: 'Stopped',
  cancelled: 'Stopped',
  'awaiting-confirmation': 'Waiting for your confirmation',
  creating: 'Creating the proposal',
  'verifying-result': 'Verifying the result',
  created: 'Created and verified',
  'created-unverified': 'Created, not fully verified',
  'creation-failed': 'Not created',
  uncertain: 'Result not certain',
};

function Summary({
  report,
  failure,
}: {
  report: RunReport;
  failure: string | null;
}): React.JSX.Element {
  return (
    <section className="pd-summary" aria-labelledby="pd-summary-heading">
      <h2 id="pd-summary-heading">Result</h2>
      <div role="status" aria-live="polite" className="pd-status">
        <p>
          <strong>{STATE_LABELS[report.state]}.</strong> {failure ?? report.message}
        </p>
        {report.portal ? (
          <p className="pd-muted">
            Portal: {report.portal}
            {report.signedInAs ? ` · Signed in as ${report.signedInAs}` : ''} · Write requests
            blocked: {report.blockedWrites}
            {report.stoppedBefore ? ` · Not pressed: “${report.stoppedBefore}”` : ''}
          </p>
        ) : null}
      </div>
      {report.filled.length > 0 ? (
        <table className="pd-table">
          <caption>Filled ({report.filled.length})</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Value</th>
              <th scope="col">Read back</th>
            </tr>
          </thead>
          <tbody>
            {report.filled.map((field) => (
              <tr key={field.key}>
                <td>{field.label}</td>
                <td>{field.value}</td>
                <td className={field.verified ? 'pd-ok' : 'pd-error'}>
                  {field.verified ? '✓ Matches' : '✗ Differs'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {report.skipped.length > 0 ? (
        <table className="pd-table">
          <caption>Skipped ({report.skipped.length})</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            {report.skipped.map((field) => (
              <tr key={field.key}>
                <td>{field.label}</td>
                <td>{field.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {report.errors.length > 0 ? (
        <table className="pd-table">
          <caption>Errors ({report.errors.length})</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">What happened</th>
            </tr>
          </thead>
          <tbody>
            {report.errors.map((field) => (
              <tr key={field.key}>
                <td>{field.label}</td>
                <td className="pd-error">{field.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
