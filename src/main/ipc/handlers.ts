// IPC handlers. M2 exposes only read-only application information.
import { app } from 'electron';
import type { IpcHandlers } from './dispatcher';

export function createHandlers(): IpcHandlers {
  return {
    'app:get-info': () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform as 'darwin' | 'win32' | 'linux',
      arch: process.arch,
      electron: process.versions.electron,
      isPackaged: app.isPackaged,
    }),
  };
}
