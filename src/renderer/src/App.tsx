// M2 shell: proves the secured window, the typed bridge and IPC end to end. Product screens
// (new quote, results, history, settings) arrive in M6 per IMPLEMENTATION_PLAN.
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { ClientsPanel } from './clients/ClientsPanel';
import { VehiclesPanel } from './vehicles/VehiclesPanel';
import { TravellersPanel } from './travellers/TravellersPanel';
import { RuralPanel } from './rural/RuralPanel';
import { MarinePanel } from './marine/MarinePanel';
import { PropertyPanel } from './property/PropertyPanel';
import { InsurerPortals } from './insurers/InsurerPortals';
import { AppShell, type ViewId } from './shell/AppShell';
import { Overview, type AppStatus } from './shell/Overview';

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

// DEMO ONLY — temporary portal automation demo (src/demo/portal-automation/README.md), in
// development builds only, like the comparison demo above: production builds drop this import and
// its chunk. Its launcher is added under the home screen only when the preload exposed
// window.fqfPortalDemo, which happens only with ENABLE_PORTAL_AUTOMATION_DEMO set.
const PortalDemoGate =
  import.meta.env.DEV && window.fqfPortalDemo
    ? lazy(() =>
        import('../../demo/portal-automation/renderer/PortalDemo').then((module) => ({
          default: module.PortalDemoGate,
        })),
      )
    : null;

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<AppStatus>({ state: 'loading' });

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

  // The Health clients, Travel clients, Vehicles and Insurer portals screens exist only when the
  // automation features are
  // on (FQF_INSURER_PORTALS=1); each of them also hides itself when they are off.
  const [automation, setAutomation] = useState(false);
  const [view, setView] = useState<ViewId>('overview');
  useEffect(() => {
    if (status.state !== 'ready') return;
    let active = true;
    window.fqf.insurers
      .list()
      .then((result) => {
        if (active && result.ok) setAutomation(result.data.enabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [status.state]);

  // Development builds add a Development page that holds the demo launchers. `dev` is that
  // page's content, or null when the build has none.
  const renderHome = (dev: ReactNode) => {
    const available: ViewId[] = ['overview'];
    if (automation)
      available.push(
        'clients',
        'travellers',
        'rural',
        'marine',
        'properties',
        'vehicles',
        'insurers',
      );
    if (dev) available.push('development');
    const shown = available.includes(view) ? view : 'overview';
    return (
      <AppShell
        view={shown}
        onViewChange={setView}
        automation={automation}
        development={dev !== null}
        version={status.state === 'ready' ? status.info.version : null}
      >
        <div hidden={shown !== 'overview'}>
          <Overview active={shown === 'overview'} status={status} automation={automation} />
        </div>
        {status.state === 'ready' && (
          <>
            <div className="page" hidden={shown !== 'clients'}>
              <ClientsPanel />
            </div>
            <div className="page" hidden={shown !== 'travellers'}>
              <TravellersPanel />
            </div>
            <div className="page" hidden={shown !== 'rural'}>
              <RuralPanel />
            </div>
            <div className="page" hidden={shown !== 'marine'}>
              <MarinePanel />
            </div>
            <div className="page" hidden={shown !== 'properties'}>
              <PropertyPanel />
            </div>
            <div className="page" hidden={shown !== 'vehicles'}>
              <VehiclesPanel />
            </div>
            <div className="page" hidden={shown !== 'insurers'}>
              <InsurerPortals />
            </div>
          </>
        )}
        {dev && (
          <div className="page" hidden={shown !== 'development'}>
            <header className="page-header">
              <h1>Development</h1>
              <p className="lead">
                Tools for development builds only. They use synthetic data and are not part of the
                installed app.
              </p>
            </header>
            {dev}
          </div>
        )}
      </AppShell>
    );
  };
  // Hands the dev launchers to the home screen, innermost first.
  const withPortalDemo = (comparison: ReactNode) =>
    PortalDemoGate ? (
      <Suspense fallback={renderHome(comparison)}>
        <PortalDemoGate>
          {(portal) =>
            renderHome(
              <>
                {comparison}
                {portal}
              </>,
            )
          }
        </PortalDemoGate>
      </Suspense>
    ) : (
      renderHome(comparison)
    );
  if (!DevQuoteComparison) return withPortalDemo(null);
  return (
    <Suspense fallback={withPortalDemo(null)}>
      <DevQuoteComparison home={withPortalDemo} />
    </Suspense>
  );
}
