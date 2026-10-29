// DEVELOPMENT-ONLY end-to-end quote workflow demo: client → census → quote request → simulated
// insurer jobs → normalisation and comparison (the existing M3 engine) → report preview. Loaded
// lazily from ComparisonDemo.tsx, which App.tsx loads only in development builds. The screens
// render the workflow store; every change goes through the workflow engine (engine.ts).
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Tone } from '../demo-model';
import { Icon, type IconName } from '../icons';
import { CensusPage } from './CensusPage';
import { latestAttempt, isTerminal } from './engine';
import { demoWorkflow } from './instance';
import { JobsPage } from './JobsPage';
import { ActivityPage, DashboardPage } from './OverviewPages';
import { RequestPage } from './RequestPage';
import { ComparisonPage, ReportPage } from './ResultsPages';
import { SEEDED_CLIENT_ID } from './store';
import type { DemoState } from './types';
import {
  ConfirmDialog,
  type NavState,
  type PageId,
  TONE_ICON,
  WorkflowContext,
  type WorkflowContextValue,
} from './ui';
import '../comparison-demo.css';
import './workflow.css';

const INITIAL_NAV: NavState = {
  page: 'dashboard',
  clientId: SEEDED_CLIENT_ID,
  requestId: null,
  reportId: null,
  employeeId: null,
};

interface NavItem {
  id: PageId;
  label: string;
  icon: IconName;
  /** Position in the demo flow; overview pages have none. */
  step?: number;
  /** A short count for the chip, and what it counts, for screen readers. */
  count: (state: DemoState) => { text: string; spoken: string } | null;
}

const counted = (n: number, spoken: string) => (n > 0 ? { text: String(n), spoken } : null);

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'inbox', count: () => null },
  {
    id: 'census',
    label: 'Clients & census',
    icon: 'edit',
    step: 1,
    count: (s) => counted(s.members.length, 'members imported'),
  },
  {
    id: 'request',
    label: 'Quote request',
    icon: 'check',
    step: 2,
    count: (s) => counted(s.quoteRequests.length, 'quote requests'),
  },
  {
    id: 'jobs',
    label: 'Jobs',
    icon: 'cpu',
    step: 3,
    count: (s) => {
      const active = s.jobs.filter((j) => !isTerminal(latestAttempt(j).status)).length;
      return active > 0
        ? { text: `${active} active`, spoken: 'jobs queued or running' }
        : counted(s.jobs.length, 'jobs');
    },
  },
  {
    id: 'comparison',
    label: 'Comparison',
    icon: 'check-circle',
    step: 4,
    count: (s) => counted(s.comparisons.length, 'comparisons'),
  },
  {
    id: 'report',
    label: 'Report',
    icon: 'info',
    step: 5,
    count: (s) => counted(s.reports.length, 'reports'),
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: 'refresh',
    count: (s) => counted(s.activity.length, 'events'),
  },
];

export function WorkflowApp({ onClose }: { onClose: () => void }): React.JSX.Element {
  const workflow = demoWorkflow();
  const state = useSyncExternalStore(workflow.store.subscribe, workflow.store.read);
  const [nav, setNav] = useState<NavState>(INITIAL_NAV);
  const [message, setMessage] = useState<{ tone: Tone; text: string; serial: number } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const serial = useRef(0);

  const go = useCallback<WorkflowContextValue['go']>((page, patch = {}) => {
    setNav((current) => ({ ...current, ...patch, page }));
    setMessage(null);
  }, []);
  const flash = useCallback<WorkflowContextValue['flash']>((tone, text) => {
    serial.current += 1;
    setMessage({ tone, text, serial: serial.current });
  }, []);
  const context = useMemo<WorkflowContextValue>(
    () => ({ workflow, state, nav, go, flash }),
    [workflow, state, nav, go, flash],
  );

  const resetDemo = (): void => {
    workflow.resetDemo();
    setConfirmingReset(false);
    setNav(INITIAL_NAV);
    flash(
      'positive',
      'Demo data reset: running simulated jobs were stopped and the synthetic client restored.',
    );
  };

  return (
    <WorkflowContext.Provider value={context}>
      <div className="qc-page wf-page">
        <header className="qc-appbar">
          <button type="button" className="qc-btn qc-btn-ghost" onClick={onClose}>
            <Icon name="arrow-left" />
            Back to home
          </button>
          <span className="qc-appbar-divider" aria-hidden="true" />
          <span className="qc-appbar-product">Fiducial Quote Fetcher</span>
          <span className="qc-devbadge">Development demo</span>
        </header>
        <p className="wf-banner" role="note">
          <Icon name="alert-triangle" />
          <span>
            <strong>DEMO SIMULATOR</strong> — synthetic data; no insurer is contacted. Insurer
            responses and prices are invented. Data is held in memory only and is lost when the
            window reloads.
          </span>
        </p>

        <div className="wf-layout">
          <nav className="wf-nav" aria-label="Quote workflow">
            <p className="qc-section-label">Quote workflow</p>
            <ul>
              {NAV_ITEMS.map((item) => {
                const count = item.count(state);
                const current = nav.page === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`wf-nav-item${current ? ' is-current' : ''}`}
                      aria-current={current ? 'page' : undefined}
                      onClick={() => go(item.id)}
                    >
                      <span className="wf-nav-step" aria-hidden="true">
                        {item.step ?? <Icon name={item.icon} size={13} />}
                      </span>
                      <span className="wf-nav-label">
                        {item.step ? (
                          <span className="qc-visually-hidden">Step {item.step}: </span>
                        ) : null}
                        {item.label}
                      </span>
                      {count && (
                        <span className="wf-nav-count">
                          {count.text}
                          <span className="qc-visually-hidden"> {count.spoken}</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="wf-nav-foot">
              <button
                type="button"
                className="qc-btn qc-btn-secondary wf-btn-block"
                onClick={() => setConfirmingReset(true)}
              >
                <Icon name="refresh" />
                Reset demo data
              </button>
              <p className="qc-muted">Clears this demo&apos;s in-memory data only.</p>
            </div>
          </nav>

          <div className="wf-main">
            <div className="wf-status-region" role="status" aria-live="polite">
              {message && (
                <p key={message.serial} className={`wf-flash tone-${message.tone}`}>
                  <Icon name={TONE_ICON[message.tone]} />
                  <span>{message.text}</span>
                  <button
                    type="button"
                    className="wf-flash-close"
                    aria-label="Dismiss message"
                    onClick={() => setMessage(null)}
                  >
                    <Icon name="x-circle" size={14} />
                  </button>
                </p>
              )}
            </div>
            <main className="wf-content" key={nav.page}>
              {nav.page === 'dashboard' && <DashboardPage />}
              {nav.page === 'census' && <CensusPage />}
              {nav.page === 'request' && <RequestPage />}
              {nav.page === 'jobs' && <JobsPage />}
              {nav.page === 'comparison' && <ComparisonPage />}
              {nav.page === 'report' && <ReportPage />}
              {nav.page === 'activity' && <ActivityPage />}
            </main>
          </div>
        </div>

        <ConfirmDialog
          open={confirmingReset}
          title="Reset the demo data?"
          confirmLabel="Reset demo data"
          onConfirm={resetDemo}
          onCancel={() => setConfirmingReset(false)}
        >
          <p>
            This stops any running simulated jobs and discards the demo&apos;s clients, census,
            quote requests, jobs, comparisons, reports and activity. The synthetic client is
            restored.
          </p>
          <p>
            Only this demo&apos;s in-memory data is affected. Nothing else in the application
            changes, and nothing is stored on disk.
          </p>
        </ConfirmDialog>
      </div>
    </WorkflowContext.Provider>
  );
}
