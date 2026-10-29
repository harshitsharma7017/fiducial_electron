// The only bridge between the renderer and the main process: a fixed set of typed methods,
// never raw ipcRenderer access (SEC-03). Bundled into one CommonJS file for the sandbox.
import { contextBridge, ipcRenderer } from 'electron';
import { exposePortalDemo } from '../demo/portal-automation/preload/expose';
import type { FqfApi } from '../shared/ipc/api';
import { IPC_CHANNELS } from '../shared/ipc/channels';
import type { AppInfo } from '../shared/ipc/contract';
import type { AppResult } from '../shared/ipc/result';

const api: FqfApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo, {}) as Promise<AppResult<AppInfo>>,
  },
};

contextBridge.exposeInMainWorld('fqf', api);

// DEMO ONLY — temporary portal automation demo: exposes window.fqfPortalDemo only when
// ENABLE_PORTAL_AUTOMATION_DEMO is set (src/demo/portal-automation/README.md).
exposePortalDemo(process.env);
