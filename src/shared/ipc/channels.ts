// IPC channel names. Kept free of runtime dependencies so the sandboxed preload can bundle it.
// Every channel must have a request/response schema in contract.ts and a handler in main.

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  insurersList: 'insurers:list',
  insurersSaveLogin: 'insurers:save-login',
  insurersForgetLogin: 'insurers:forget-login',
  insurersOpenPortal: 'insurers:open-portal',
  insurersSignOut: 'insurers:sign-out',
  insurersRecord: 'insurers:record',
  clientsList: 'clients:list',
  clientsGet: 'clients:get',
  clientsSave: 'clients:save',
  clientsDelete: 'clients:delete',
  clientsExport: 'clients:export',
  vehiclesList: 'vehicles:list',
  vehiclesGet: 'vehicles:get',
  vehiclesSave: 'vehicles:save',
  vehiclesDelete: 'vehicles:delete',
  travellersList: 'travellers:list',
  travellersGet: 'travellers:get',
  travellersSave: 'travellers:save',
  travellersDelete: 'travellers:delete',
  ruralList: 'rural:list',
  ruralGet: 'rural:get',
  ruralSave: 'rural:save',
  ruralDelete: 'rural:delete',
  marineList: 'marine:list',
  marineGet: 'marine:get',
  marineSave: 'marine:save',
  marineDelete: 'marine:delete',
  propertiesList: 'properties:list',
  propertiesGet: 'properties:get',
  propertiesSave: 'properties:save',
  propertiesDelete: 'properties:delete',
  importsTemplate: 'imports:template',
  importsPreview: 'imports:preview',
  importsCommit: 'imports:commit',
  quotesRun: 'quotes:run',
  quotesCancel: 'quotes:cancel',
  quotesOpenPdf: 'quotes:open-pdf',
  portalsTabs: 'portals:tabs',
  portalsShow: 'portals:show',
  portalsClose: 'portals:close',
  portalsSetBounds: 'portals:set-bounds',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const ALL_CHANNELS: readonly IpcChannel[] = Object.values(IPC_CHANNELS);

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && (ALL_CHANNELS as readonly string[]).includes(value);
}
