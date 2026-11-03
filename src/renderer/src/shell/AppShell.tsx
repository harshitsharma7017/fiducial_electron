// Application frame: a floating sidebar, a frosted top bar and the scrolling content area. Screens
// are passed in and stay mounted while hidden, so a half-filled form or a running sign-in status
// poll survives switching sections. Insurer pages open as tabs in the top bar (App, then each
// insurer page and pop-up); while one is shown, it fills the content area.
import {
  Building2,
  Car,
  FlaskConical,
  LayoutDashboard,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PortalArea, PortalTabStrip, showAppScreens, usePortalTabs } from '../insurers/PortalTabs';
import { ThemeSwitcher } from '../theme/ThemeSwitcher';

export type ViewId =
  'overview' | 'clients' | 'travellers' | 'vehicles' | 'insurers' | 'development';

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  /** Only shown when the automation features are on. */
  automation: boolean;
}

/** Development builds only: the demo launchers. Listed apart from the product screens. */
const DEVELOPMENT_ITEM: NavItem = {
  id: 'development',
  label: 'Development',
  icon: FlaskConical,
  automation: false,
};

const NAV: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, automation: false },
  { id: 'clients', label: 'Health clients', icon: Users, automation: true },
  { id: 'travellers', label: 'Travel clients', icon: Plane, automation: true },
  { id: 'vehicles', label: 'Vehicles', icon: Car, automation: true },
  { id: 'insurers', label: 'Insurer portals', icon: Building2, automation: true },
];

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
  const items = NAV.filter((item) => automation || !item.automation);
  const devItems = development ? [DEVELOPMENT_ITEM] : [];
  const current = [...items, ...devItems].find((item) => item.id === view) ?? items[0];
  const portals = usePortalTabs(automation);
  const portalShown = portals?.active != null;
  const hasTabs = (portals?.tabs.length ?? 0) > 0;

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
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <span className="brand-name">Fiducial</span>
            <span className="brand-sub">Quote Fetcher</span>
          </span>
        </div>
        <nav aria-label="Main">
          <p className="nav-label">Workspace</p>
          <ul className="nav-list">{items.map(renderItem)}</ul>
          {devItems.length > 0 && (
            <>
              <p className="nav-label nav-label-spaced">Tools</p>
              <ul className="nav-list">{devItems.map(renderItem)}</ul>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <Lock size={14} aria-hidden="true" />
          <span className="sidebar-footer-text">
            Encrypted on this computer
            {version && <span className="sidebar-version">v{version}</span>}
          </span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="icon-button sidebar-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            onClick={toggle}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
          </button>
          {portals && hasTabs ? (
            <PortalTabStrip state={portals} />
          ) : (
            <span className="topbar-title">{current?.label}</span>
          )}
          <span className="topbar-spacer" />
          <ThemeSwitcher />
        </header>
        <main className="content" hidden={portalShown}>
          {children}
        </main>
        {portalShown && <PortalArea />}
      </div>
    </div>
  );
}
