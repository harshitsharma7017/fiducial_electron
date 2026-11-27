// Application frame: the sidebar (grouped navigation, collapsible), the top bar (breadcrumbs or the
// insurer tabs, theme switcher) and the scrolling content. Screens are passed in and stay mounted
// while hidden, so a half-filled form or a running status poll survives switching sections.
// Insurer pages open as tabs of this window (../insurers/PortalTabs.tsx).
import {
  Building2,
  Car,
  ChevronRight,
  Flame,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  RotateCcw,
  Scale,
  ShieldCheck,
  Ship,
  Tractor,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ThemeSwitcher } from '../theme/ThemeSwitcher';
import { Toaster } from '../ui/toast';
import { PortalArea, PortalTabStrip, showAppScreens, usePortalTabs } from '../insurers/PortalTabs';
import { QuoteRunCancel } from '../quote/QuoteRunCancel';
import { QuoteFinishStatus } from '../quote/QuoteFinish';
import { isPagePaused } from '../../../shared/insurers/availability';
import { PlanChoiceDialog } from '../quote/PlanChoice';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { toast } from '../ui/toast';
import { resetEverything } from '../quote/run';

export type ViewId =
  | 'overview'
  | 'clients'
  | 'travellers'
  | 'rural'
  | 'marine'
  | 'properties'
  | 'vehicles'
  | 'compare'
  | 'insurers'
  | 'development';

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  /** Only shown when the automation features are on. */
  automation: boolean;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: 'Workspace',
    automation: false,
    items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Clients',
    automation: true,
    items: [
      { id: 'clients', label: 'Health clients', icon: HeartPulse },
      { id: 'travellers', label: 'Travel clients', icon: Plane },
      { id: 'properties', label: 'Property clients', icon: Flame },
      { id: 'rural', label: 'Rural clients', icon: Tractor },
      { id: 'marine', label: 'Marine clients', icon: Ship },
      { id: 'vehicles', label: 'Vehicles', icon: Car },
    ],
  },
  {
    label: 'Quotes',
    automation: true,
    items: [{ id: 'compare', label: 'Compare quotes', icon: Scale }],
  },
  {
    label: 'Insurers',
    automation: true,
    items: [{ id: 'insurers', label: 'Insurer portals', icon: Building2 }],
  },
];

/** Development builds only: the demo launchers. Listed apart from the product screens. */
const DEVELOPMENT_GROUP: NavGroup = {
  label: 'Tools',
  automation: false,
  items: [{ id: 'development', label: 'Development', icon: FlaskConical }],
};

const SIDEBAR_KEY = 'fqf.sidebar';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function AppShell(props: {
  view: ViewId;
  onViewChange: (view: ViewId) => void;
  automation: boolean;
  /** True in development builds that have launchers to show. */
  development: boolean;
  version: string | null;
  children: ReactNode;
}): React.JSX.Element {
  const { view, onViewChange, automation, development, version, children } = props;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  /** The sidebar's Reset: asked first (it puts away kept forms), then busy while it runs. */
  const [reset, setReset] = useState<'idle' | 'asking' | 'busy'>('idle');
  const runReset = async () => {
    setReset('busy');
    const r = await resetEverything().catch(() => null);
    setReset('idle');
    if (!r?.ok) {
      toast(r ? r.error.message : 'The reset could not be done.');
      return;
    }
    const { stopped, discarded, closedTabs, sentHome } = r.data;
    const done = [
      stopped && `${stopped} quote${stopped > 1 ? 's' : ''} stopped`,
      discarded && `${discarded} kept form${discarded > 1 ? 's' : ''} put away`,
      closedTabs && `${closedTabs} extra tab${closedTabs > 1 ? 's' : ''} closed`,
      sentHome && `${sentHome} insurer${sentHome > 1 ? 's' : ''} back on the home page`,
    ].filter(Boolean);
    toast(done.length > 0 ? `Reset: ${done.join(', ')}.` : 'Reset: nothing was running.');
  };
  const groups = [...NAV, ...(development ? [DEVELOPMENT_GROUP] : [])]
    .filter((g) => automation || !g.automation)
    // Pages paused with their insurer (shared/insurers/availability.ts).
    .map((g) => ({ ...g, items: g.items.filter((item) => !isPagePaused(item.id)) }));
  const allItems = groups.flatMap((g) => g.items.map((item) => ({ item, group: g.label })));
  const current = allItems.find(({ item }) => item.id === view) ?? allItems[0];
  const portals = usePortalTabs(automation);
  const portalShown = portals?.active != null;
  const hasTabs = (portals?.tabs.length ?? 0) > 0;
  const signedIn = portals?.tabs.filter((t) => t.kind === 'portal').length ?? 0;

  const renderItem = ({ id, label, icon: Icon }: NavItem) => (
    <li key={id}>
      <button
        type="button"
        className="nav-item"
        aria-current={id === view && !portalShown ? 'page' : undefined}
        title={collapsed ? label : undefined}
        onClick={() => {
          // Choosing a section shows the app's screens again.
          if (portalShown) showAppScreens();
          onViewChange(id);
        }}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="nav-text">{label}</span>
      </button>
    </li>
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      // The sidebar still collapses for this session.
    }
  };

  return (
    <div className="app" data-sidebar={collapsed ? 'collapsed' : 'expanded'}>
      <aside className="sidebar" aria-label="Sidebar">
        <div className="brand">
          <span className="brand-mark">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <span className="brand-name">Fiducial</span>
            <span className="brand-sub">Quote Fetcher</span>
          </span>
        </div>
        <nav className="nav-scroll" aria-label="Main">
          {groups.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-label">{group.label}</p>
              <ul className="nav-list">{group.items.map(renderItem)}</ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          {automation && (
            <button
              type="button"
              className="nav-item"
              title="Stop every quote, close the extra tabs and send every insurer home"
              disabled={reset === 'busy'}
              onClick={() => setReset('asking')}
            >
              <RotateCcw
                size={18}
                aria-hidden="true"
                className={reset === 'busy' ? 'spin' : undefined}
              />
              <span className="nav-text">{reset === 'busy' ? 'Resetting…' : 'Reset'}</span>
            </button>
          )}
          <div className="sidebar-status" title="Client data is encrypted on this computer">
            <Lock size={14} aria-hidden="true" />
            <span className="sidebar-status-text">
              <strong>Encrypted on this computer</strong>
              {version ? `Version ${version}` : 'Fiducial Quote Fetcher'}
            </span>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="icon-button btn-sm sidebar-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            onClick={toggle}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={16} aria-hidden="true" />
            )}
          </button>
          <span className="topbar-divider" aria-hidden="true" />
          {portals && hasTabs ? (
            <PortalTabStrip state={portals} />
          ) : (
            <ol className="breadcrumbs" aria-label="You are here">
              {current && current.group !== 'Workspace' && (
                <li>
                  {current.group}
                  <ChevronRight size={14} aria-hidden="true" />
                </li>
              )}
              <li aria-current="page">{current?.item.label}</li>
            </ol>
          )}
          <span className="topbar-spacer" />
          <QuoteRunCancel />
          <QuoteFinishStatus />
          {/* The tabs already show the insurers open: the count only when they are not shown. */}
          {signedIn > 0 && !hasTabs && (
            <span className="topbar-context" title="Insurer portals open as tabs">
              <span className="status-dot" aria-hidden="true" />
              {signedIn === 1 ? '1 insurer open' : `${signedIn} insurers open`}
            </span>
          )}
          <ThemeSwitcher />
        </header>
        <main className="content" hidden={portalShown}>
          {children}
        </main>
        {portalShown && <PortalArea />}
      </div>
      <Toaster />
      <PlanChoiceDialog />
      <ConfirmDialog
        open={reset === 'asking'}
        title="Reset everything?"
        message="Every quote being filled is stopped, every form waiting for Stop & make PDF is put away (no PDF is saved), the insurers' extra tabs are closed and every insurer goes back to its home page. You stay signed in; saved clients and PDFs are not touched."
        confirmLabel="Reset"
        onConfirm={() => void runReset()}
        onCancel={() => setReset('idle')}
      />
    </div>
  );
}
