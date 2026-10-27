// The app window: locked-down webPreferences, app:// (or the loopback dev server in development),
// navigation limited to its own origin, and the only webContents trusted for IPC.
import { BrowserWindow } from 'electron';
import type { SenderPolicy } from '../ipc/sender-policy';
import { allowOrigins } from '../security/navigation-policy';
import { appWindowPreferences } from '../security/web-preferences';

export interface MainWindowOptions {
  preloadPath: string;
  /** app://fqf/index.html, or the dev-server URL in development. */
  entryUrl: string;
  origin: string;
  senderPolicy: SenderPolicy;
  show: boolean;
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Fiducial Quote Fetcher',
    webPreferences: appWindowPreferences(options.preloadPath),
  });
  const id = win.webContents.id;
  allowOrigins(win.webContents, [options.origin]);
  options.senderPolicy.trust(id);
  win.on('closed', () => options.senderPolicy.forget(id));
  if (options.show) win.once('ready-to-show', () => win.show());
  void win.loadURL(options.entryUrl);
  return win;
}
