// The renderer-facing API exposed by the preload as `window.fqf`. Type-only imports keep zod
// out of the preload bundle. API_SHAPE lists the exact exposed surface, checked by the smoke test.
import type { AppInfo } from './contract';
import type { AppResult } from './result';

export interface FqfApi {
  app: {
    getInfo(): Promise<AppResult<AppInfo>>;
  };
}

export const API_SHAPE = {
  app: ['getInfo'],
} as const satisfies { [K in keyof FqfApi]: readonly (keyof FqfApi[K])[] };
