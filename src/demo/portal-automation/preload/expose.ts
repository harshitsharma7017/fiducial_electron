// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// Exposes window.fqfPortalDemo to the app's own window, only when the demo flag is set: six
// typed calls, no raw IPC. The application's own bridge (window.fqf) is not changed.
import { contextBridge, ipcRenderer } from 'electron';
import type { AppResult } from '../../../shared/ipc/result';
import {
  PORTAL_DEMO_CHANNELS,
  type AttemptResolution,
  type PortalDemoApi,
} from '../shared/contract';
import type { DemoProposal } from '../shared/demo-data';
import { isPortalDemoEnabled } from '../shared/flag';
import type { RunReport } from '../shared/protocol';

export function exposePortalDemo(env: Readonly<Record<string, string | undefined>>): void {
  if (!isPortalDemoEnabled(env)) return;
  const call = (
    channel: string,
    payload?:
      | DemoProposal
      | { token: string; acknowledgeDuplicates: boolean }
      | { attemptId: string }
      | AttemptResolution,
  ) => ipcRenderer.invoke(channel, payload) as Promise<AppResult<RunReport>>;
  const api: PortalDemoApi = {
    start: (data) => call(PORTAL_DEMO_CHANNELS.start, data),
    report: () => call(PORTAL_DEMO_CHANNELS.report),
    cancel: () => call(PORTAL_DEMO_CHANNELS.cancel),
    confirm: (token, acknowledgeDuplicates) =>
      call(PORTAL_DEMO_CHANNELS.confirm, { token, acknowledgeDuplicates }),
    reconcile: (attemptId) => call(PORTAL_DEMO_CHANNELS.reconcile, { attemptId }),
    resolve: (resolution) => call(PORTAL_DEMO_CHANNELS.resolve, resolution),
  };
  contextBridge.exposeInMainWorld('fqfPortalDemo', api);
}
