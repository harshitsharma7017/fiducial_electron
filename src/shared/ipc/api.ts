// The renderer-facing API exposed by the preload as `window.fqf`. Type-only imports keep zod
// out of the preload bundle. API_SHAPE lists the exact exposed surface, checked by the smoke test.
import type { AppInfo, InsurerPortalList, SaveLoginRequest } from './contract';
import type { AppResult } from './result';

export interface FqfApi {
  app: {
    getInfo(): Promise<AppResult<AppInfo>>;
  };
  insurers: {
    list(): Promise<AppResult<InsurerPortalList>>;
    /** Saves sign-in details in the encrypted vault. They can never be read back here. */
    saveLogin(request: SaveLoginRequest): Promise<AppResult<{ saved: true }>>;
    forgetLogin(id: string): Promise<AppResult<{ forgotten: boolean }>>;
    openPortal(id: string): Promise<AppResult<{ opened: true }>>;
    /** Ends the insurer's saved session: its window closes and its cookies are wiped. */
    signOut(id: string): Promise<AppResult<{ signedOut: boolean }>>;
  };
}

export const API_SHAPE = {
  app: ['getInfo'],
  insurers: ['list', 'saveLogin', 'forgetLogin', 'openPortal', 'signOut'],
} as const satisfies { [K in keyof FqfApi]: readonly (keyof FqfApi[K])[] };
