// M2 shell: proves the secured window, the typed bridge and IPC end to end. Product screens
// (new quote, results, history, settings) arrive in M6 per IMPLEMENTATION_PLAN.
import { Suspense, lazy, useEffect, useState } from 'react';
import type { AppInfo } from '../../shared/ipc/contract';

// DEVELOPMENT ONLY: the M3 Quote Comparison demo with synthetic data. It wraps the home screen
// and adds its own launcher, so all of its text lives in the dev chunk. `import.meta.env.DEV` is
// replaced with `false` in production builds, so this import and its chunk are dropped.
const DevQuoteComparison = import.meta.env.DEV
  ? lazy(() =>
      import('./dev/ComparisonDemo').then((module) => ({
        default: module.DevQuoteComparison,
      })),
    )
  : null;

// DEMO ONLY — temporary portal automation demo (src/demo/portal-automation/README.md). Its
// launcher is added under the home screen only when the preload exposed window.fqfPortalDemo,
// which happens only with ENABLE_PORTAL_AUTOMATION_DEMO set.
const PortalDemoGate = window.fqfPortalDemo
  ? lazy(() =>
      import('../../demo/portal-automation/renderer/PortalDemo').then((module) => ({
        default: module.PortalDemoGate,
      })),
    )
  : null;

type Status =
  | { state: 'loading' }
  | { state: 'ready'; info: AppInfo }
  | { state: 'error'; message: string; reference?: string };

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    let active = true;
    window.fqf.app
      .getInfo()
      .then((result) => {
        if (!active) return;
        setStatus(
          result.ok
            ? { state: 'ready', info: result.data }
            : {
                state: 'error',
                message: result.error.message,
                ...(result.error.correlationId ? { reference: result.error.correlationId } : {}),
              },
        );
      })
      .catch(() => {
        if (active)
          setStatus({ state: 'error', message: 'The application could not start correctly.' });
      });
    return () => {
      active = false;
    };
  }, []);

  const home = (
    <main className="shell">
      <h1>Fiducial Quote Fetcher</h1>
      <p className="lead">Foundation build. Quote features are added in later milestones.</p>
      <section aria-labelledby="about-heading" className="panel">
        <h2 id="about-heading">About this build</h2>
        <div role="status" aria-live="polite">
          {status.state === 'loading' && <p>Checking the application…</p>}
          {status.state === 'ready' && (
            <dl className="facts">
              <dt>Version</dt>
              <dd>{status.info.version}</dd>
              <dt>Platform</dt>
              <dd>
                {status.info.platform} ({status.info.arch})
              </dd>
              <dt>Electron</dt>
              <dd>{status.info.electron}</dd>
              <dt>Build</dt>
              <dd>{status.info.isPackaged ? 'Installed' : 'Development'}</dd>
            </dl>
          )}
          {status.state === 'error' && (
            <p className="error">
              {status.message}
              {status.reference && <> Reference: {status.reference}</>}
            </p>
          )}
        </div>
      </section>
    </main>
  );

  const homeScreen = PortalDemoGate ? (
    <Suspense fallback={home}>
      <PortalDemoGate>{home}</PortalDemoGate>
    </Suspense>
  ) : (
    home
  );

  if (!DevQuoteComparison) return homeScreen;
  return (
    <Suspense fallback={homeScreen}>
      <DevQuoteComparison home={homeScreen} />
    </Suspense>
  );
}
