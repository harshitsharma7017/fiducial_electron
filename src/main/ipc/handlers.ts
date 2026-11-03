// IPC handlers: read-only application information (M2) and the insurer portals feature
// (src/main/insurers/service.ts), which is off unless switched on.
import { app } from 'electron';
import type { ClientService } from '../clients/service';
import type { InsurerService } from '../insurers/service';
import type { QuoteService } from '../quotes/service';
import type { IpcHandlers } from './dispatcher';

export function createHandlers(deps: {
  insurers: InsurerService;
  clients: ClientService;
  quotes: QuoteService;
}): IpcHandlers {
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
    'vehicles:list': async () => ({ vehicles: await deps.clients.listVehicles() }),
    'vehicles:get': ({ id }) => deps.clients.getVehicle(id),
    'vehicles:save': async ({ id, saved }) => ({
      id: await deps.clients.saveVehicle(id ?? null, saved),
    }),
    'vehicles:delete': async ({ id }) => ({ deleted: await deps.clients.deleteVehicle(id) }),
    'quotes:run': (request) => deps.quotes.run(request),
  };
}
