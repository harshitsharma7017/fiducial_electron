// The renderer-facing API exposed by the preload as `window.fqf`. Type-only imports keep zod
// out of the preload bundle. API_SHAPE lists the exact exposed surface, checked by the smoke test.
import type {
  AppInfo,
  ClientListResponse,
  ClientView,
  QuoteRunRequest,
  InsurerPortalList,
  QuoteRunResultView,
  SaveClientRequest,
  SaveLoginRequest,
} from './contract';
import type { AppResult } from './result';
import type { VehicleInputRaw, VehicleRecord, VehicleSummary } from '../contracts/vehicle';

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
    /** Starts or stops recording the insurer's quote form (structure only, never typed values). */
    record(
      id: string,
      action: 'start' | 'stop',
    ): Promise<AppResult<{ recording: boolean; file: string | null }>>;
  };
  quotes: {
    /** Fills the insurer's quote form for a saved client (United India health so far). */
    /** Motor: for a saved vehicle; health and the Family Medicare e-proposal: for a client. */
    run(request: QuoteRunRequest): Promise<AppResult<QuoteRunResultView>>;
  };
  clients: {
    list(): Promise<AppResult<ClientListResponse>>;
    /** The client, and of the Aadhaar number only its last four digits. */
    get(id: string): Promise<AppResult<ClientView>>;
    save(request: SaveClientRequest): Promise<AppResult<{ id: string }>>;
    delete(id: string): Promise<AppResult<{ deleted: boolean }>>;
  };
  /** Saved vehicles, for motor quotes (kept on their own, not part of a client). */
  vehicles: {
    list(): Promise<AppResult<{ vehicles: VehicleSummary[] }>>;
    get(id: string): Promise<AppResult<VehicleRecord>>;
    save(request: { id?: string; saved: VehicleInputRaw }): Promise<AppResult<{ id: string }>>;
    delete(id: string): Promise<AppResult<{ deleted: boolean }>>;
  };
}

export const API_SHAPE = {
  app: ['getInfo'],
  insurers: ['list', 'saveLogin', 'forgetLogin', 'openPortal', 'signOut', 'record'],
  quotes: ['run'],
  clients: ['list', 'get', 'save', 'delete'],
  vehicles: ['list', 'get', 'save', 'delete'],
} as const satisfies { [K in keyof FqfApi]: readonly (keyof FqfApi[K])[] };
