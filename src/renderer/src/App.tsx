// M2 shell: proves the secured window, the typed bridge and IPC end to end. Product screens
// (new quote, results, history, settings) arrive in M6 per IMPLEMENTATION_PLAN.
import { useEffect, useState } from 'react';
import type { AppInfo } from '../../shared/ipc/contract';

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

  return (
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
}
