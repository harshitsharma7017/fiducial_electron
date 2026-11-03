// Insurer pages as tabs of the app window (src/main/insurers/portal-host.ts). This page only shows
// the tab bar and keeps an empty area where the main process lays the insurer's page: the page
// itself is a separate, walled-off view the app's page cannot reach.
import { Loader2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PortalTabsView } from '../../../shared/ipc/contract';

/** The tabs, kept up to date: the main process answers as soon as they change. */
export function usePortalTabs(enabled: boolean): PortalTabsView | null {
  const [state, setState] = useState<PortalTabsView | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let since = 0;
    void (async () => {
      while (alive) {
        const result = await window.fqf.portals.tabs(since).catch(() => null);
        if (!alive) return;
        if (result?.ok) {
          since = result.data.version;
          setState(result.data);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}

export function showAppScreens(): void {
  void window.fqf.portals.show(null).catch(() => undefined);
}

export function PortalTabStrip(props: { state: PortalTabsView }): React.JSX.Element {
  const { state } = props;
  return (
    <nav className="portal-tabs" aria-label="Open pages">
      <button
        type="button"
        className="portal-tab"
        aria-current={state.active === null ? 'page' : undefined}
        onClick={showAppScreens}
      >
        <span className="portal-tab-title">App</span>
      </button>
      {state.tabs.map((tab) => (
        <span
          key={tab.id}
          className="portal-tab"
          aria-current={state.active === tab.id ? 'page' : undefined}
        >
          <button
            type="button"
            className="portal-tab-open"
            title={tab.title}
            onClick={() => void window.fqf.portals.show(tab.id).catch(() => undefined)}
          >
            {tab.loading && <Loader2 size={13} className="spin" aria-label="Loading" />}
            <span className="portal-tab-title">{tab.title}</span>
          </button>
          <button
            type="button"
            className="portal-tab-close"
            aria-label={
              tab.kind === 'portal' ? `Hide ${tab.title} (stays signed in)` : `Close ${tab.title}`
            }
            title={tab.kind === 'portal' ? 'Hide (stays signed in)' : 'Close'}
            onClick={() => void window.fqf.portals.close(tab.id).catch(() => undefined)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      ))}
    </nav>
  );
}

/** The empty area the insurer's page is laid over: its place and size are sent to the main process. */
export function PortalArea(): React.JSX.Element {
  const area = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const send = () => {
      const r = el.getBoundingClientRect();
      void window.fqf.portals
        .setBounds({ x: r.left, y: r.top, width: r.width, height: r.height })
        .catch(() => undefined);
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(el);
    window.addEventListener('resize', send);
    const scroller = el.closest('.workspace');
    scroller?.scrollTo({ top: 0 });
    scroller?.addEventListener('scroll', send, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', send);
      scroller?.removeEventListener('scroll', send);
    };
  }, []);
  return (
    <div ref={area} className="portal-area">
      <p className="portal-area-note">Loading the insurer&rsquo;s page…</p>
    </div>
  );
}
