// Home: saved records by kind, recent activity (the records changed most recently), quick
// actions, the insurers' connection status and build details. Read-only: it calls the same list
// endpoints the other screens use, every time it is shown.
import {
  ArrowRight,
  Building2,
  Car,
  Flame,
  HeartPulse,
  History,
  Plane,
  Plus,
  Ship,
  Tractor,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppInfo, InsurerPortalList } from '../../../shared/ipc/contract';
import { endTime, InsurerAvatar, portalStatus, StatusBadge } from '../insurers/branding';
import { relativeTime, shortDate } from '../ui/format';
import { requestIntent } from '../ui/intents';
import { EmptyState } from '../ui/PageHeader';
import type { ViewId } from './AppShell';

export type AppStatus =
  | { state: 'loading' }
  | { state: 'ready'; info: AppInfo }
  | { state: 'error'; message: string; reference?: string };

type Kind = 'clients' | 'travellers' | 'properties' | 'rural' | 'marine' | 'vehicles';

const KINDS: Record<Kind, { label: string; one: string; icon: LucideIcon; hue: number }> = {
  clients: { label: 'Health clients', one: 'Health client', icon: HeartPulse, hue: 4 },
  travellers: { label: 'Travel clients', one: 'Travel client', icon: Plane, hue: 5 },
  properties: { label: 'Property clients', one: 'Property client', icon: Flame, hue: 3 },
  rural: { label: 'Rural clients', one: 'Rural client', icon: Tractor, hue: 1 },
  marine: { label: 'Marine clients', one: 'Marine client', icon: Ship, hue: 0 },
  vehicles: { label: 'Vehicles', one: 'Vehicle', icon: Car, hue: 2 },
};

interface Activity {
  kind: Kind;
  name: string;
  updatedAt: string;
}

interface Data {
  /** null: that list could not be loaded. */
  counts: Record<Kind, number | null>;
  /** Health clients with quote details. */
  readyClients: number;
  recent: Activity[];
  portals: InsurerPortalList | null;
}

async function loadData(): Promise<Data> {
  const [clients, travellers, properties, rural, marine, vehicles, portals] = await Promise.all([
    window.fqf.clients.list().catch(() => null),
    window.fqf.travellers.list().catch(() => null),
    window.fqf.properties.list().catch(() => null),
    window.fqf.rural.list().catch(() => null),
    window.fqf.marine.list().catch(() => null),
    window.fqf.vehicles.list().catch(() => null),
    window.fqf.insurers.list().catch(() => null),
  ]);
  const lists: Record<Kind, { name: string; updatedAt: string }[] | null> = {
    clients: clients?.ok && !clients.data.storageError ? clients.data.clients : null,
    travellers: travellers?.ok ? travellers.data.travellers : null,
    properties: properties?.ok ? properties.data.properties : null,
    rural: rural?.ok ? rural.data.rural : null,
    marine: marine?.ok ? marine.data.marine : null,
    vehicles: vehicles?.ok ? vehicles.data.vehicles : null,
  };
  const kinds = Object.keys(lists) as Kind[];
  return {
    counts: Object.fromEntries(kinds.map((k) => [k, lists[k]?.length ?? null])) as Record<
      Kind,
      number | null
    >,
    readyClients: clients?.ok ? clients.data.clients.filter((c) => c.hasPreferences).length : 0,
    recent: kinds
      .flatMap((kind) =>
        (lists[kind] ?? []).map((r) => ({ kind, name: r.name, updatedAt: r.updatedAt })),
      )
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
      .slice(0, 8),
    portals: portals?.ok ? portals.data : null,
  };
}

function KpiCard(props: {
  icon: LucideIcon;
  label: string;
  value: number | null | undefined;
  note: string;
  feature?: boolean;
  onOpen?: () => void;
}): React.JSX.Element {
  const Icon = props.icon;
  const body = (
    <>
      <div className="kpi-top">
        <span className="kpi-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="kpi-label">{props.label}</span>
      </div>
      <p className="kpi-value">
        {props.value === undefined ? (
          <span className="skeleton skeleton-line-sm" aria-label="Loading" />
        ) : props.value === null ? (
          '—'
        ) : (
          props.value
        )}
      </p>
      <p className="kpi-note">{props.note}</p>
    </>
  );
  const className = `kpi-card${props.feature ? ' kpi-feature' : ''}`;
  return props.onOpen ? (
    <button type="button" className={className} onClick={props.onOpen}>
      {body}
    </button>
  ) : (
    <article className={className}>{body}</article>
  );
}

export function Overview(props: {
  active: boolean;
  status: AppStatus;
  automation: boolean;
  onNavigate: (view: ViewId) => void;
}): React.JSX.Element {
  const { active, status, automation, onNavigate } = props;
  const [data, setData] = useState<Data | null>(null);

  // Refreshed every time the Overview is shown, so changes made on other screens appear.
  useEffect(() => {
    if (!active || !automation) return;
    let live = true;
    void loadData().then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, [active, automation]);

  const counts = data?.counts;
  const known = counts
    ? (['clients', 'travellers', 'properties', 'rural', 'marine'] as const)
        .map((k) => counts[k])
        .filter((n): n is number => n !== null)
    : [];
  const total = counts ? known.reduce((a, b) => a + b, 0) : undefined;
  const portals = data?.portals?.enabled ? data.portals.portals : [];
  const signedIn = portals.filter((p) => p.sessionEndsAt).length;
  const go = (view: ViewId, action?: 'add' | 'import') => {
    if (action) requestIntent(view, action);
    onNavigate(view);
  };

  return (
    <div className="page">
      <header className="welcome">
        <div>
          <h1>Overview</h1>
          <p>
            {shortDate(new Date().toISOString())} · Your clients, vehicles and insurer sessions at a
            glance.
          </p>
        </div>
        {automation && (
          <div className="page-header-actions">
            <button type="button" onClick={() => go('clients', 'import')}>
              <Upload size={16} aria-hidden="true" />
              Import clients
            </button>
            <button type="button" className="primary" onClick={() => go('clients', 'add')}>
              <Plus size={16} aria-hidden="true" />
              Add health client
            </button>
          </div>
        )}
      </header>

      {automation && (
        <>
          <section className="kpi-grid" aria-label="Saved records">
            <KpiCard
              feature
              icon={Users}
              label="Total saved clients"
              value={total}
              note={
                counts && known.length < 5
                  ? 'Some lists could not be loaded'
                  : 'Health, travel, property, rural and marine'
              }
            />
            <KpiCard
              icon={HeartPulse}
              label="Health clients"
              value={counts?.clients}
              note={data ? `${data.readyClients} ready to quote` : 'Health quotes and e-proposals'}
              onOpen={() => onNavigate('clients')}
            />
            <KpiCard
              icon={Plane}
              label="Travel clients"
              value={counts?.travellers}
              note="Travel quotes and e-proposals"
              onOpen={() => onNavigate('travellers')}
            />
            <KpiCard
              icon={Flame}
              label="Property clients"
              value={counts?.properties}
              note="New India fire"
              onOpen={() => onNavigate('properties')}
            />
            <KpiCard
              icon={Tractor}
              label="Rural clients"
              value={counts?.rural}
              note="New India rural"
              onOpen={() => onNavigate('rural')}
            />
            <KpiCard
              icon={Ship}
              label="Marine clients"
              value={counts?.marine}
              note="New India Specific Voyage"
              onOpen={() => onNavigate('marine')}
            />
            <KpiCard
              icon={Car}
              label="Saved vehicles"
              value={counts?.vehicles}
              note="Motor quotes"
              onOpen={() => onNavigate('vehicles')}
            />
          </section>

          <div className="overview-grid">
            <section className="card" aria-labelledby="activity-heading">
              <div className="card-header">
                <div>
                  <h2 id="activity-heading">Recent activity</h2>
                  <p>Records added or changed most recently.</p>
                </div>
              </div>
              {!data && <SkeletonRows />}
              {data && data.recent.length === 0 && (
                <EmptyState
                  icon={History}
                  title="Nothing yet"
                  text="Clients and vehicles you add or import appear here."
                />
              )}
              {data && data.recent.length > 0 && (
                <ul className="activity-list">
                  {data.recent.map((a) => {
                    const kind = KINDS[a.kind];
                    const Icon = kind.icon;
                    return (
                      <li key={`${a.kind}:${a.name}:${a.updatedAt}`} className="activity-item">
                        <span className={`record-icon avatar-tone-${kind.hue}`} aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <div className="activity-main">
                          <strong>{a.name}</strong>
                          <span>{kind.one}</span>
                        </div>
                        <span className="activity-time">{relativeTime(a.updatedAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div>
              <section className="card" aria-labelledby="actions-heading">
                <div className="card-header">
                  <h2 id="actions-heading">Quick actions</h2>
                </div>
                <div className="quick-actions">
                  <QuickAction
                    icon={HeartPulse}
                    title="Add a health client"
                    text="With their family members"
                    onClick={() => go('clients', 'add')}
                  />
                  <QuickAction
                    icon={Plane}
                    title="Add a travel client"
                    text="With passport details"
                    onClick={() => go('travellers', 'add')}
                  />
                  <QuickAction
                    icon={Car}
                    title="Add a vehicle"
                    text="For motor quotes"
                    onClick={() => go('vehicles', 'add')}
                  />
                  <QuickAction
                    icon={Building2}
                    title="Insurer portals"
                    text="Sign in before quoting"
                    onClick={() => onNavigate('insurers')}
                  />
                </div>
              </section>

              <section className="card" aria-labelledby="connections-heading">
                <div className="card-header">
                  <div>
                    <h2 id="connections-heading">Insurer connections</h2>
                    <p>
                      {portals.length > 0
                        ? `${signedIn} of ${portals.length} signed in`
                        : 'Loading the insurers…'}
                    </p>
                  </div>
                </div>
                {portals.length > 0 && (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Insurer</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portals.map((portal) => (
                          <tr key={portal.id}>
                            <th scope="row">
                              <span className="cell-insurer">
                                <InsurerAvatar name={portal.displayName} />
                                <span>
                                  {portal.displayName}
                                  {portal.sessionEndsAt && (
                                    <span className="insurer-mode">
                                      Until {endTime(portal.sessionEndsAt)}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </th>
                            <td>
                              <StatusBadge status={portalStatus(portal)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}

      {!automation && status.state === 'ready' && (
        <section className="card">
          <EmptyState
            icon={Building2}
            title="Client and insurer features are switched off"
            text="This build shows build details only. The client lists and insurer automation appear when the app is started with the automation features on."
          />
        </section>
      )}

      <section aria-labelledby="about-heading" className="card">
        <div className="card-header">
          <h2 id="about-heading">About this build</h2>
        </div>
        <div role="status" aria-live="polite">
          {status.state === 'loading' && <p className="muted">Checking the application…</p>}
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

function QuickAction(props: {
  icon: LucideIcon;
  title: string;
  text: string;
  onClick: () => void;
}): React.JSX.Element {
  const Icon = props.icon;
  return (
    <button type="button" className="quick-action" onClick={props.onClick}>
      <span className="kpi-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span>
        <strong>{props.title}</strong>
        <span>{props.text}</span>
      </span>
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}

function SkeletonRows(): React.JSX.Element {
  return (
    <ul className="activity-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="activity-item">
          <span className="skeleton skeleton-icon" />
          <div className="skeleton-lines">
            <span className="skeleton skeleton-line-lg" />
            <span className="skeleton skeleton-line-sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}
