// IPC handlers: read-only application information (M2) and the insurer portals feature
// (src/main/insurers/service.ts), which is off unless switched on.
import { app } from 'electron';
import type { ClientService } from '../clients/service';
import type { ImportService } from '../import/service';
import type { ClientExportService } from '../export/clients-export';
import type { PortalHost } from '../insurers/portal-host';
import type { InsurerService } from '../insurers/service';
import type { QuoteService } from '../quotes/service';
import { AppException, type IpcHandlers } from './dispatcher';

export function createHandlers(deps: {
  insurers: InsurerService;
  clients: ClientService;
  quotes: QuoteService;
  /** Client imports from .xlsx / .csv files (absent: refused, in tests). */
  imports?: ImportService;
  /** Every client to an Excel file (absent: refused, in tests). */
  exports?: ClientExportService;
  /** Insurer pages as tabs of the app window (absent: no tabs, in tests). */
  portals?: PortalHost;
}): IpcHandlers {
  const noTabs = { version: 1, tabs: [], active: null };
  const imports = (): ImportService => {
    if (!deps.imports) throw new AppException('UNSUPPORTED_FLOW');
    return deps.imports;
  };
  return {
    'app:get-info': () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform as 'darwin' | 'win32' | 'linux',
      arch: process.arch,
      electron: process.versions.electron,
      isPackaged: app.isPackaged,
    }),
    'insurers:list': () => deps.insurers.list(),
    'insurers:save-login': async (request) => {
      await deps.insurers.saveLogin(request);
      return { saved: true as const };
    },
    'insurers:forget-login': async ({ id }) => ({
      forgotten: await deps.insurers.forgetLogin(id),
    }),
    'insurers:open-portal': async ({ id }) => {
      await deps.insurers.openPortal(id);
      return { opened: true as const };
    },
    'insurers:sign-out': async ({ id }) => ({ signedOut: await deps.insurers.signOut(id) }),
    'insurers:record': ({ id, action }) => deps.insurers.record(id, action),
    'clients:list': () => deps.clients.list(),
    'clients:get': async ({ id }) => ({
      ...(await deps.clients.get(id)),
      aadhaarLastFour: await deps.clients.aadhaarLastFour(id),
    }),
    'clients:save': async ({ id, client, aadhaar }) => ({
      id: await deps.clients.save(id ?? null, client, aadhaar),
    }),
    'clients:delete': async ({ id }) => ({ deleted: await deps.clients.delete(id) }),
    'clients:export': () => {
      if (!deps.exports) throw new AppException('UNSUPPORTED_FLOW');
      return deps.exports.exportAll();
    },
    'vehicles:list': async () => ({ vehicles: await deps.clients.listVehicles() }),
    'vehicles:get': ({ id }) => deps.clients.getVehicle(id),
    'vehicles:save': async ({ id, saved }) => ({
      id: await deps.clients.saveVehicle(id ?? null, saved),
    }),
    'vehicles:delete': async ({ id }) => ({ deleted: await deps.clients.deleteVehicle(id) }),
    'travellers:list': async () => ({ travellers: await deps.clients.listTravellers() }),
    'travellers:get': async ({ id }) => ({
      ...(await deps.clients.getTraveller(id)),
      aadhaarLastFour: await deps.clients.aadhaarLastFour(id),
      passportLastFour: await deps.clients.passportLastFour(id),
    }),
    'travellers:save': async ({ id, traveller, aadhaar, passport }) => ({
      id: await deps.clients.saveTraveller(id ?? null, traveller, {
        ...(aadhaar !== undefined ? { aadhaar } : {}),
        ...(passport !== undefined ? { passport } : {}),
      }),
    }),
    'travellers:delete': async ({ id }) => ({ deleted: await deps.clients.deleteTraveller(id) }),
    'rural:list': async () => ({ rural: await deps.clients.listRural() }),
    'rural:get': ({ id }) => deps.clients.getRural(id),
    'rural:save': async ({ id, rural }) => ({
      id: await deps.clients.saveRural(id ?? null, rural),
    }),
    'rural:delete': async ({ id }) => ({ deleted: await deps.clients.deleteRural(id) }),
    'marine:list': async () => ({ marine: await deps.clients.listMarine() }),
    'marine:get': ({ id }) => deps.clients.getMarine(id),
    'marine:save': async ({ id, marine }) => ({
      id: await deps.clients.saveMarine(id ?? null, marine),
    }),
    'marine:delete': async ({ id }) => ({ deleted: await deps.clients.deleteMarine(id) }),
    'properties:list': async () => ({ properties: await deps.clients.listProperties() }),
    'properties:get': ({ id }) => deps.clients.getProperty(id),
    'properties:save': async ({ id, property }) => ({
      id: await deps.clients.saveProperty(id ?? null, property),
    }),
    'properties:delete': async ({ id }) => ({ deleted: await deps.clients.deleteProperty(id) }),
    'imports:template': ({ kind, format }) => imports().template(kind, format),
    'imports:preview': ({ kind }) => imports().preview(kind),
    'imports:commit': ({ token, includeDuplicates }) => imports().commit(token, includeDuplicates),
    'quotes:run': (request) => deps.quotes.run(request),
    'quotes:cancel': () => ({ cancelled: deps.quotes.cancel() }),
    'quotes:open-pdf': async ({ name }) => ({ opened: await deps.quotes.openPdf(name) }),
    'portals:tabs': async ({ since }) =>
      deps.portals ? deps.portals.waitForChange(since, 20_000) : noTabs,
    'portals:show': ({ tabId }) => {
      deps.portals?.show(tabId);
      return { shown: true as const };
    },
    'portals:close': ({ tabId }) => {
      deps.portals?.close(tabId);
      return { closed: true as const };
    },
    'portals:set-bounds': (bounds) => {
      deps.portals?.setBounds(bounds);
      return { set: true as const };
    },
  };
}
