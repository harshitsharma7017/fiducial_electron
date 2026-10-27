/// <reference types="vite/client" />
import type { FqfApi } from '../../shared/ipc/api';

declare global {
  interface Window {
    fqf: FqfApi;
  }
}

export {};
