// The only bridge between the renderer and the main process: a fixed set of typed methods,
// never raw ipcRenderer access (SEC-03). Bundled into one CommonJS file for the sandbox.
import { contextBridge, ipcRenderer } from 'electron';
import { exposePortalDemo } from '../demo/portal-automation/preload/expose';
import type { FqfApi } from '../shared/ipc/api';
import { IPC_CHANNELS } from '../shared/ipc/channels';
import type {
  AppInfo,
  ClientListResponse,
  ClientView,
  ImportCommitResult,
  ImportPreview,
  PortalTabsView,
  InsurerPortalList,
  QuoteRunResultView,
  TravellerView,
} from '../shared/ipc/contract';
import type { AppResult } from '../shared/ipc/result';
import type { VehicleRecord, VehicleSummary } from '../shared/contracts/vehicle';
import type { TravellerSummary } from '../shared/contracts/traveller';
import type { RuralRecord, RuralSummary } from '../shared/contracts/rural';
import type { MarineRecord, MarineSummary } from '../shared/contracts/marine';
import type { PropertyRecord, PropertySummary } from '../shared/contracts/property';

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
      ipcRenderer.invoke(IPC_CHANNELS.clientsGet, { id }) as Promise<AppResult<ClientView>>,
    save: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.clientsSave, request) as Promise<AppResult<{ id: string }>>,
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.clientsDelete, { id }) as Promise<
        AppResult<{ deleted: boolean }>
      >,
  },
  portals: {
    tabs: (since) =>
      ipcRenderer.invoke(IPC_CHANNELS.portalsTabs, { since }) as Promise<AppResult<PortalTabsView>>,
    show: (tabId) =>
      ipcRenderer.invoke(IPC_CHANNELS.portalsShow, { tabId }) as Promise<
        AppResult<{ shown: true }>
      >,
    close: (tabId) =>
      ipcRenderer.invoke(IPC_CHANNELS.portalsClose, { tabId }) as Promise<
        AppResult<{ closed: true }>
      >,
    setBounds: (bounds) =>
      ipcRenderer.invoke(IPC_CHANNELS.portalsSetBounds, bounds) as Promise<
        AppResult<{ set: true }>
      >,
  },
  travellers: {
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.travellersList, {}) as Promise<
        AppResult<{ travellers: TravellerSummary[] }>
      >,
    get: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.travellersGet, { id }) as Promise<AppResult<TravellerView>>,
    save: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.travellersSave, request) as Promise<
        AppResult<{ id: string }>
      >,
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.travellersDelete, { id }) as Promise<
        AppResult<{ deleted: boolean }>
      >,
  },
  rural: {
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ruralList, {}) as Promise<
        AppResult<{ rural: RuralSummary[] }>
      >,
    get: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.ruralGet, { id }) as Promise<AppResult<RuralRecord>>,
    save: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.ruralSave, request) as Promise<AppResult<{ id: string }>>,
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.ruralDelete, { id }) as Promise<
        AppResult<{ deleted: boolean }>
      >,
  },
  marine: {
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.marineList, {}) as Promise<
        AppResult<{ marine: MarineSummary[] }>
      >,
    get: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.marineGet, { id }) as Promise<AppResult<MarineRecord>>,
    save: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.marineSave, request) as Promise<AppResult<{ id: string }>>,
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.marineDelete, { id }) as Promise<
        AppResult<{ deleted: boolean }>
      >,
  },
  properties: {
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.propertiesList, {}) as Promise<
        AppResult<{ properties: PropertySummary[] }>
      >,
    get: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.propertiesGet, { id }) as Promise<AppResult<PropertyRecord>>,
    save: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.propertiesSave, request) as Promise<
        AppResult<{ id: string }>
      >,
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.propertiesDelete, { id }) as Promise<
        AppResult<{ deleted: boolean }>
      >,
  },
  vehicles: {
    list: () =>
      ipcRenderer.invoke(IPC_CHANNELS.vehiclesList, {}) as Promise<
        AppResult<{ vehicles: VehicleSummary[] }>
      >,
    get: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.vehiclesGet, { id }) as Promise<AppResult<VehicleRecord>>,
    save: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.vehiclesSave, request) as Promise<AppResult<{ id: string }>>,
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.vehiclesDelete, { id }) as Promise<
        AppResult<{ deleted: boolean }>
      >,
  },
  imports: {
    template: (kind, format) =>
      ipcRenderer.invoke(IPC_CHANNELS.importsTemplate, { kind, format }) as Promise<
        AppResult<{ saved: boolean }>
      >,
    preview: (kind) =>
      ipcRenderer.invoke(IPC_CHANNELS.importsPreview, { kind }) as Promise<
        AppResult<ImportPreview>
      >,
    commit: (token, includeDuplicates) =>
      ipcRenderer.invoke(IPC_CHANNELS.importsCommit, { token, includeDuplicates }) as Promise<
        AppResult<ImportCommitResult>
      >,
  },
};

contextBridge.exposeInMainWorld('fqf', api);

// DEMO ONLY — temporary portal automation demo (src/demo/portal-automation/README.md), in
// development builds only: `import.meta.env.DEV` is `false` in production builds, so this call and
// the demo's bridge code are left out of them. In development it exposes window.fqfPortalDemo only
// when ENABLE_PORTAL_AUTOMATION_DEMO is set.
if (import.meta.env.DEV) exposePortalDemo(process.env);
