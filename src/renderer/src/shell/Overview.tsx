// Home dashboard: summary cards, the insurer connection table and build details. Read-only; it
// only calls the same list endpoints the Health clients, Travel clients, Vehicles and Insurer
// portals screens use.
import { Building2, Car, Plane, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppInfo, InsurerPortalList } from '../../../shared/ipc/contract';
import { endTime, InsurerAvatar, portalStatus, StatusBadge } from '../insurers/branding';

export type AppStatus =
  | { state: 'loading' }
  | { state: 'ready'; info: AppInfo }
  | { state: 'error'; message: string; reference?: string };

interface Counts {
  clients: number;
  readyClients: number;
  travellers: number;
  vehicles: number;
  portals: InsurerPortalList | null;
  storageError: boolean;
}

function KpiCard(props: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: 'default' | 'warning';
}): React.JSX.Element {
  const Icon = props.icon;
  return (
    <article className={`kpi-card${props.tone === 'warning' ? ' kpi-warning' : ''}`}>
      <div className="kpi-top">
        <span className="kpi-label">{props.label}</span>
        <span className="kpi-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      <p className="kpi-value">{props.value}</p>
      <p className="kpi-note">{props.note}</p>
    </article>
  );
}

export function Overview(props: {
  active: boolean;
  status: AppStatus;
  automation: boolean;
}): React.JSX.Element {
  const { active, status, automation } = props;
  const [counts, setCounts] = useState<Counts | null>(null);

  // Refresh every time the dashboard is shown, so changes made on other screens appear.
  useEffect(() => {
    if (!active || !automation) return;
    let live = true;
    void (async () => {
      const [clients, travellers, vehicles, portals] = await Promise.all([
        window.fqf.clients.list().catch(() => null),
        window.fqf.travellers.list().catch(() => null),
        window.fqf.vehicles.list().catch(() => null),
        window.fqf.insurers.list().catch(() => null),
      ]);
      if (!live) return;
      setCounts({
        clients: clients?.ok ? clients.data.clients.length : 0,
        readyClients: clients?.ok ? clients.data.clients.filter((c) => c.hasPreferences).length : 0,
        travellers: travellers?.ok ? travellers.data.travellers.length : 0,
        vehicles: vehicles?.ok ? vehicles.data.vehicles.length : 0,
        portals: portals?.ok ? portals.data : null,
        storageError: !!(clients?.ok && clients.data.storageError) || !clients?.ok,
      });
    })();
    return () => {
      live = false;
    };
  }, [active, automation]);

  const portals = counts?.portals?.enabled ? counts.portals.portals : [];
  const signedIn = portals.filter((p) => p.sessionEndsAt).length;
  const vaultProblem = !!counts?.portals?.vaultError || !!counts?.storageError;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Overview</h1>
        <p className="lead">
          Your quote automation workspace. Client details and insurer sign-ins stay encrypted on
          this computer.
        </p>
      </header>

      {automation && counts && (
        <section className="kpi-grid" aria-label="Summary">
          <KpiCard
            icon={Users}
            label="Health clients"
            value={String(counts.clients)}
            note={`${counts.readyClients} ready to quote`}
          />
          <KpiCard
            icon={Plane}
            label="Travel clients"
            value={String(counts.travellers)}
            note="For travel e-proposals"
          />
          <KpiCard
            icon={Car}
            label="Vehicles"
            value={String(counts.vehicles)}
            note="Saved for motor quotes"
          />
          <KpiCard
            icon={Building2}
            label="Insurer sessions"
            value={`${signedIn}/${portals.length}`}
            note={signedIn === 1 ? '1 portal signed in' : `${signedIn} portals signed in`}
          />
          <KpiCard
            icon={ShieldCheck}
            label="Secure storage"
            value={vaultProblem ? 'Check' : 'Ready'}
            note={vaultProblem ? 'See Clients or Insurer portals' : 'Encrypted on this computer'}
            tone={vaultProblem ? 'warning' : 'default'}
          />
        </section>
      )}

      {automation && portals.length > 0 && (
        <section className="panel" aria-labelledby="connections-heading">
          <h2 id="connections-heading">Insurer connections</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Insurer</th>
                  <th scope="col">Sign-in</th>
                  <th scope="col">Status</th>
                  <th scope="col">Session</th>
                </tr>
              </thead>
              <tbody>
                {portals.map((portal) => (
                  <tr key={portal.id}>
                    <th scope="row">
                      <span className="cell-insurer">
                        <InsurerAvatar name={portal.displayName} />
                        {portal.displayName}
                      </span>
                    </th>
                    <td>
                      {portal.automation === 'autofill' || portal.automation === 'shortcut' ? (
                        <span className={portal.loginSaved ? 'badge saved' : 'badge'}>
                          {portal.loginSaved ? 'Saved' : 'Not saved'}
                        </span>
                      ) : (
                        <span className="muted">By hand</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={portalStatus(portal)} />
                    </td>
                    <td className="muted">
                      {portal.sessionEndsAt ? `Until ${endTime(portal.sessionEndsAt)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
    </div>
  );
}
