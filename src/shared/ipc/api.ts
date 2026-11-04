// The renderer-facing API exposed by the preload as `window.fqf`. Type-only imports keep zod
// out of the preload bundle. API_SHAPE lists the exact exposed surface, checked by the smoke test.
import type {
  AppInfo,
  ClientListResponse,
  ClientView,
  ImportCommitResult,
  ImportPreview,
  PortalTabsView,
  QuoteRunRequest,
  InsurerPortalList,
  QuoteRunResultView,
  SaveClientRequest,
  SaveLoginRequest,
  SaveRuralRequest,
  SaveTravellerRequest,
  TravellerView,
} from './contract';
import type { AppResult } from './result';
import type { VehicleInputRaw, VehicleRecord, VehicleSummary } from '../contracts/vehicle';
import type { TravellerSummary } from '../contracts/traveller';
import type { RuralRecord, RuralSummary } from '../contracts/rural';
import type { ImportKind } from '../import/import-kinds';

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
    /** Motor: for a saved vehicle; health: for a client; travel: for a travel client. */
    run(request: QuoteRunRequest): Promise<AppResult<QuoteRunResultView>>;
  };
  clients: {
    list(): Promise<AppResult<ClientListResponse>>;
    /** The client, and of the Aadhaar number only its last four digits. */
    get(id: string): Promise<AppResult<ClientView>>;
    save(request: SaveClientRequest): Promise<AppResult<{ id: string }>>;
    delete(id: string): Promise<AppResult<{ deleted: boolean }>>;
  };
  /** Insurer pages as tabs of the app window. */
  portals: {
    /** The tabs, once they changed after version `since` (or after 20 seconds anyway). */
    tabs(since: number): Promise<AppResult<PortalTabsView>>;
    /** Shows a tab, or the app's own screens (null). */
    show(tabId: string | null): Promise<AppResult<{ shown: true }>>;
    close(tabId: string): Promise<AppResult<{ closed: true }>>;
    setBounds(bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    }): Promise<AppResult<{ set: true }>>;
  };
  /** Travel clients, for travel e-proposals (kept apart from health clients). */
  travellers: {
    list(): Promise<AppResult<{ travellers: TravellerSummary[] }>>;
    /** The travel client, and of its Aadhaar and passport numbers only the last four. */
    get(id: string): Promise<AppResult<TravellerView>>;
    save(request: SaveTravellerRequest): Promise<AppResult<{ id: string }>>;
    delete(id: string): Promise<AppResult<{ deleted: boolean }>>;
  };
  /** Rural clients (a farmer, their animals and farm), for New India's rural forms. */
  rural: {
    list(): Promise<AppResult<{ rural: RuralSummary[] }>>;
    get(id: string): Promise<AppResult<RuralRecord>>;
    save(request: SaveRuralRequest): Promise<AppResult<{ id: string }>>;
    delete(id: string): Promise<AppResult<{ deleted: boolean }>>;
  };
  /** Saved vehicles, for motor quotes (kept on their own, not part of a client). */
  vehicles: {
    list(): Promise<AppResult<{ vehicles: VehicleSummary[] }>>;
    get(id: string): Promise<AppResult<VehicleRecord>>;
    save(request: { id?: string; saved: VehicleInputRaw }): Promise<AppResult<{ id: string }>>;
    delete(id: string): Promise<AppResult<{ deleted: boolean }>>;
  };
  /** Client imports from an .xlsx or .csv file (main process dialogs; numbers stay in main). */
  imports: {
    template(kind: ImportKind, format: 'xlsx' | 'csv'): Promise<AppResult<{ saved: boolean }>>;
    preview(kind: ImportKind): Promise<AppResult<ImportPreview>>;
    commit(token: string, includeDuplicates: boolean): Promise<AppResult<ImportCommitResult>>;
  };
}

export const API_SHAPE = {
  app: ['getInfo'],
  insurers: ['list', 'saveLogin', 'forgetLogin', 'openPortal', 'signOut', 'record'],
  quotes: ['run'],
  clients: ['list', 'get', 'save', 'delete'],
  portals: ['tabs', 'show', 'close', 'setBounds'],
  travellers: ['list', 'get', 'save', 'delete'],
  rural: ['list', 'get', 'save', 'delete'],
  vehicles: ['list', 'get', 'save', 'delete'],
  imports: ['template', 'preview', 'commit'],
} as const satisfies { [K in keyof FqfApi]: readonly (keyof FqfApi[K])[] };
