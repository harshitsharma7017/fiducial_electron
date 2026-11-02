// IPC handlers: read-only application information (M2) and the insurer portals feature
// (src/main/insurers/service.ts), which is off unless switched on.
import { app } from 'electron';
import type { InsurerService } from '../insurers/service';
import type { IpcHandlers } from './dispatcher';

export function createHandlers(deps: { insurers: InsurerService }): IpcHandlers {
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
  };
}
