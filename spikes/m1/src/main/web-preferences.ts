// webPreferences factories (ARCHITECTURE_REVIEW §3.3). Every window starts from the same
// locked-down baseline; only the preload, partition and JavaScript switch differ.
import type { WebPreferences } from 'electron';

const LOCKED_DOWN = {
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

/** App-owned UI: the only window type that gets a preload bridge. */
export function appWindowPreferences(preloadPath: string): WebPreferences {
  return { ...LOCKED_DOWN, preload: preloadPath };
}

/** Untrusted insurer content: own persistent partition, never a preload. */
export function insurerViewPreferences(partition: string): WebPreferences {
  if (!/^persist:insurer-[a-z0-9-]+$/.test(partition)) {
    throw new Error('insurer partitions must be named persist:insurer-<id>');
  }
  return { ...LOCKED_DOWN, partition };
}

/** PDF rendering: in-memory partition, JavaScript disabled, no preload. */
export function pdfRenderPreferences(partition: string): WebPreferences {
  if (partition.startsWith('persist:')) throw new Error('PDF rendering must not persist data');
  return { ...LOCKED_DOWN, partition, javascript: false };
}
