// webPreferences for app-owned windows (ARCHITECTURE_REVIEW §3.3), ported from the M1 spike.
// Insurer views (R2) and the PDF window (M7) will get their own factories from the same baseline.
import type { WebPreferences } from 'electron';

export const LOCKED_DOWN = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  navigateOnDragDrop: false,
  spellcheck: false,
  safeDialogs: true,
} as const satisfies WebPreferences;

/** App-owned UI: the only window type that gets the preload bridge. */
export function appWindowPreferences(preloadPath: string): WebPreferences {
  return { ...LOCKED_DOWN, preload: preloadPath };
}
