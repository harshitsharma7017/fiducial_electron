// The only bridge between the renderer and the main process: a fixed set of typed methods,
// never raw ipcRenderer access (SEC-03). Bundled into one CommonJS file for the sandbox.
import { contextBridge, ipcRenderer } from 'electron';
import { exposePortalDemo } from '../demo/portal-automation/preload/expose';
import type { FqfApi } from '../shared/ipc/api';
import { IPC_CHANNELS } from '../shared/ipc/channels';
import type { ClientRecord } from '../shared/contracts/client';
import type {
  AppInfo,
  ClientListResponse,
  InsurerPortalList,
  QuoteRunResultView,
} from '../shared/ipc/contract';
import type { AppResult } from '../shared/ipc/result';

const api: FqfApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo, {}) as Promise<AppResult<AppInfo>>,
  },
  insurers: {
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.insurersList, {}) as Promise<AppResult<InsurerPortalList>>,
    saveLogin: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.insurersSaveLogin, request) as Promise<
        AppResult<{ saved: true }>
      >,
    forgetLogin: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.insurersForgetLogin, { id }) as Promise<
        AppResult<{ forgotten: boolean }>
      >,
    openPortal: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.insurersOpenPortal, { id }) as Promise<
        AppResult<{ opened: true }>
      >,
    signOut: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.insurersSignOut, { id }) as Promise<
        AppResult<{ signedOut: boolean }>
      >,
    record: (id, action) =>
      ipcRenderer.invoke(IPC_CHANNELS.insurersRecord, { id, action }) as Promise<
        AppResult<{ recording: boolean; file: string | null }>
      >,
  },
  quotes: {
    run: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.quotesRun, request) as Promise<AppResult<QuoteRunResultView>>,
  },
  clients: {
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.clientsList, {}) as Promise<AppResult<ClientListResponse>>,
    get: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.clientsGet, { id }) as Promise<AppResult<ClientRecord>>,
    save: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.clientsSave, request) as Promise<AppResult<{ id: string }>>,
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.clientsDelete, { id }) as Promise<
        AppResult<{ deleted: boolean }>
      >,
  },
};

contextBridge.exposeInMainWorld('fqf', api);

// DEMO ONLY — temporary portal automation demo (src/demo/portal-automation/README.md), in
// development builds only: `import.meta.env.DEV` is `false` in production builds, so this call and
// the demo's bridge code are left out of them. In development it exposes window.fqfPortalDemo only
// when ENABLE_PORTAL_AUTOMATION_DEMO is set.
if (import.meta.env.DEV) exposePortalDemo(process.env);
