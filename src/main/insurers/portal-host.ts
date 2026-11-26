// Insurer pages inside the app window (decision of 3 November 2026), as tabs under the app's own
// tab bar, instead of windows of their own.
//
// Each insurer page is a WebContentsView laid over the app window's page area:
// - it keeps the insurer's locked-down web preferences, with no preload (no bridge to the app),
//   and its own session (partition): being drawn inside the app window gives it no access to the
//   app's page, which is a separate WebContents with its own process;
// - only the active tab's view is attached; the others stay alive but detached, and are not
//   throttled while in the background. Except the tabs of insurers being filled (setWorking): a
//   tab that loads a page while detached never draws it (no animation frame at all: Flutter's
//   1up shows no buttons, Ionic's and Material's overlays never close; measured 26 November
//   2026), so while insurers are filled their tabs stay attached at full size in the page area,
//   the one in front on top and the others drawing behind it. Filling them out of sight while the
//   app's own screens show was tried (26 November 2026: the pages kept at full size with one pixel
//   inside the window) and broke the real insurers' pages (Niva's UNO drew nothing): a page is
//   filled where it can be seen;
// - pop-ups the portal opens (calculators, e-proposal forms) are adopted as tabs of the same
//   insurer (window.open's createWindow), so the advisor sees one window for everything.
// The app's page reports where the insurer page goes (setBounds) and which tab it shows.
import {
  WebContentsView,
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
  type WebContents,
  type WebPreferences,
} from 'electron';

/** An insurer page the automation works in: a tab here, or (in tests) a window. */
export interface PortalPage {
  readonly webContents: WebContents;
  isDestroyed(): boolean;
  /** Brings the page to the front (selects its tab). */
  focus(): void;
}

export interface PortalTab {
  id: string;
  insurerId: string;
  title: string;
  /** The insurer's own page, or a pop-up it opened. */
  kind: 'portal' | 'popup';
  /** Still loading its page. */
  loading: boolean;
}

export interface PortalTabsState {
  /** Goes up by one with every change (the app's page asks for changes since a version). */
  version: number;
  tabs: PortalTab[];
  /** The tab shown, or null when the app's own screens are shown. */
  active: string | null;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PortalHost {
  /** A tab for the insurer's own page, shown at once. */
  openPortal(insurerId: string, title: string, webPreferences: WebPreferences): PortalPage;
  /** The insurer's own page, if open (shown or hidden). */
  portalOf(insurerId: string): PortalPage | null;
  /** Shows the insurer's own page again (after its tab was closed). */
  showPortal(insurerId: string): void;
  /** For window.open (createWindow): the pop-up becomes a tab of the opener's insurer. */
  adoptPopup(insurerId: string, options: BrowserWindowConstructorOptions): WebContents;
  /** The insurer's pages: its own page first, then its pop-ups, oldest first. */
  pagesOf(insurerId: string): PortalPage[];
  /** Shows a tab, or the app's own screens (null). */
  show(tabId: string | null): void;
  /** Closes a tab: a pop-up is closed for good; the insurer's own page is only hidden. */
  close(tabId: string): void;
  /** Closes every page of the insurer (its session ended). */
  closeInsurer(insurerId: string): void;
  /** Where the page area is in the app window. */
  setBounds(bounds: Bounds): void;
  /**
   * The insurers being filled now: their tabs are kept attached and drawing (behind the tab in
   * front); while any is, the page area shows one of them (the app's own screens wait).
   */
  setWorking(insurerIds: string[]): void;
  state(): PortalTabsState;
  /** The state as soon as its version is past `since`, or after `timeoutMs` anyway. */
  waitForChange(since: number, timeoutMs: number): Promise<PortalTabsState>;
}

interface Entry {
  tab: PortalTab;
  view: WebContentsView;
  /** Hidden from the tab bar (the insurer's own page whose tab was closed). */
  hidden: boolean;
  page: PortalPage;
}

/** The page area until the app's page reports it: everything below a 48-pixel tab bar. */
const TAB_BAR = 48;

/**
 * Whether a tab's page is still there. Once Electron has destroyed it (the app quitting, the page
 * closing itself) the view's webContents is gone (undefined), not merely destroyed.
 */
const alive = (view: WebContentsView): boolean => {
  const wc = view.webContents as WebContents | undefined;
  return !!wc && !wc.isDestroyed();
};

export function createPortalHost(deps: { window: () => BrowserWindow | null }): PortalHost {
  const entries = new Map<string, Entry>();
  let active: string | null = null;
  /** The views attached to the window, bottom first. */
  let attached: WebContentsView[] = [];
  /** The insurers being filled now (setWorking). */
  let working: string[] = [];
  let bounds: Bounds | null = null;
  let counter = 0;
  let version = 1;
  const waiting = new Set<() => void>();

  const state = (): PortalTabsState => ({
    version,
    tabs: [...entries.values()].filter((e) => !e.hidden).map((e) => ({ ...e.tab })),
    active,
  });
  const changed = (): void => {
    version += 1;
    for (const wake of [...waiting]) wake();
  };

  const area = (win: BrowserWindow): Bounds => {
    if (bounds) return bounds;
    const [width = 1280, height = 900] = win.getContentSize();
    return { x: 0, y: TAB_BAR, width, height: Math.max(0, height - TAB_BAR) };
  };

  /** The tabs of the insurers being filled, oldest first (their own page before pop-ups). */
  const workingEntries = (): Entry[] =>
    [...entries.values()].filter(
      (e) => !e.hidden && working.includes(e.tab.insurerId) && alive(e.view),
    );

  /**
   * Attaches the active tab's view where the page area is, and, while insurers are filled, their
   * tabs too, at full size behind it (drawing; see above). With the app's own screens asked for
   * while insurers are filled, one of their tabs is shown instead.
   */
  const layout = (): void => {
    const win = deps.window();
    if (!win || win.isDestroyed()) return;
    if (!active && working.length > 0) {
      const first = workingEntries().find((e) => e.tab.kind === 'portal') ?? workingEntries()[0];
      if (first) active = first.tab.id;
    }
    const entry = active ? entries.get(active) : undefined;
    const front = entry && alive(entry.view) ? entry.view : null;
    const behind = workingEntries()
      .map((e) => e.view)
      .filter((v) => v !== front);
    const wanted = [...behind, ...(front ? [front] : [])];
    for (const view of attached) {
      if (!wanted.includes(view) && alive(view)) {
        win.contentView.removeChildView(view);
      }
    }
    // Added in order, each on top of the last (adding an attached view moves it to the top).
    for (const view of wanted) {
      win.contentView.addChildView(view);
      view.setBounds(area(win));
    }
    attached = wanted;
    if (front) front.webContents.focus();
    // The app's own screens: give the keyboard back to them.
    else win.webContents.focus();
  };

  const show = (tabId: string | null): void => {
    const entry = tabId ? entries.get(tabId) : undefined;
    active = entry ? entry.tab.id : null;
    if (entry) entry.hidden = false;
    layout();
    changed();
  };

  const remove = (tabId: string): void => {
    const entry = entries.get(tabId);
    if (!entry) return;
    entries.delete(tabId);
    if (attached.includes(entry.view)) {
      deps.window()?.contentView.removeChildView(entry.view);
      attached = attached.filter((v) => v !== entry.view);
    }
    if (alive(entry.view)) entry.view.webContents.close();
    if (active === tabId) {
      // Back to the tab that opened it (the insurer's own page), else the app.
      const portal = [...entries.values()].find(
        (e) => e.tab.insurerId === entry.tab.insurerId && e.tab.kind === 'portal' && !e.hidden,
      );
      active = portal?.tab.id ?? null;
      layout();
    }
    changed();
  };

  const add = (
    insurerId: string,
    kind: PortalTab['kind'],
    title: string,
    view: WebContentsView,
  ) => {
    counter += 1;
    const id = `${insurerId}:${counter}`;
    const contents = view.webContents;
    const entry: Entry = {
      tab: { id, insurerId, title, kind, loading: true },
      view,
      hidden: false,
      page: {
        webContents: contents,
        isDestroyed: () => contents.isDestroyed() || !entries.has(id),
        focus: () => show(id),
      },
    };
    entries.set(id, entry);
    contents.on('did-start-loading', () => {
      entry.tab.loading = true;
      changed();
    });
    contents.on('did-stop-loading', () => {
      entry.tab.loading = false;
      changed();
    });
    if (kind === 'popup') {
      // A pop-up is named by its page; the insurer's own tab keeps the insurer's name.
      contents.on('page-title-updated', (_event, pageTitle) => {
        entry.tab.title = pageTitle.trim().slice(0, 80) || title;
        changed();
      });
    }
    // The page closed itself (window.close) or its process went away for good.
    contents.on('destroyed', () => remove(id));
    show(id);
    return entry;
  };

  const ofInsurer = (insurerId: string): Entry[] =>
    [...entries.values()].filter((e) => e.tab.insurerId === insurerId && alive(e.view));

  return {
    openPortal: (insurerId, title, webPreferences) => {
      // Never throttled when not shown: the automation may work in a tab the advisor is not on.
      const view = new WebContentsView({
        webPreferences: { ...webPreferences, backgroundThrottling: false },
      });
      return add(insurerId, 'portal', title, view).page;
    },
    portalOf: (insurerId) =>
      ofInsurer(insurerId).find((e) => e.tab.kind === 'portal')?.page ?? null,
    showPortal: (insurerId) => {
      const entry = ofInsurer(insurerId).find((e) => e.tab.kind === 'portal');
      if (entry) show(entry.tab.id);
    },
    adoptPopup: (insurerId, options) => {
      // Electron created the pop-up's contents (with the opener's locked-down preferences and
      // session) and passes them here: the view adopts them rather than creating new ones.
      const guest = (options as BrowserWindowConstructorOptions & { webContents?: WebContents })
        .webContents;
      const view = new WebContentsView(guest ? { webContents: guest } : {});
      add(insurerId, 'popup', 'Opening…', view);
      return view.webContents;
    },
    pagesOf: (insurerId) => {
      const list = ofInsurer(insurerId);
      return [
        ...list.filter((e) => e.tab.kind === 'portal'),
        ...list.filter((e) => e.tab.kind === 'popup'),
      ].map((e) => e.page);
    },
    show,
    close: (tabId) => {
      const entry = entries.get(tabId);
      if (!entry) return;
      if (entry.tab.kind === 'popup') {
        remove(tabId);
        return;
      }
      // The insurer's own page is only hidden: its session and page stay until the session ends.
      entry.hidden = true;
      if (active === tabId) active = null;
      layout();
      changed();
    },
    closeInsurer: (insurerId) => {
      for (const e of [...entries.values()].filter((x) => x.tab.insurerId === insurerId)) {
        remove(e.tab.id);
      }
    },
    setWorking: (insurerIds) => {
      const was = active;
      working = [...insurerIds];
      layout();
      if (active !== was) changed();
    },
    setBounds: (next) => {
      bounds = {
        x: Math.max(0, Math.round(next.x)),
        y: Math.max(0, Math.round(next.y)),
        width: Math.max(0, Math.round(next.width)),
        height: Math.max(0, Math.round(next.height)),
      };
      layout();
    },
    state,
    waitForChange: (since, timeoutMs) =>
      new Promise((resolve) => {
        if (version > since) {
          resolve(state());
          return;
        }
        const wake = (): void => {
          clearTimeout(timer);
          waiting.delete(wake);
          resolve(state());
        };
        const timer = setTimeout(wake, timeoutMs);
        waiting.add(wake);
      }),
  };
}
