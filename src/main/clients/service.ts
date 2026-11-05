// Saved clients behind the IPC handlers. Off unless the automation features are switched on
// (FQF_INSURER_PORTALS=1, see ../insurers/service.ts): then list() reports it disabled and every
// other call is refused, so no database is created.
// The store opens on first use; if it cannot (secure storage unavailable, key or database
// refused), the list says so and the next call tries again.
import {
  hasFutureDateOfBirth,
  type ClientInput,
  type ClientRecord,
  type ClientSummary,
} from '../../shared/contracts/client';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import type { VehicleInput, VehicleRecord, VehicleSummary } from '../../shared/contracts/vehicle';
import type {
  Traveller,
  TravellerRecord,
  TravellerSummary,
} from '../../shared/contracts/traveller';
import type { RuralClient, RuralRecord, RuralSummary } from '../../shared/contracts/rural';
import type { MarineClient, MarineRecord, MarineSummary } from '../../shared/contracts/marine';
import type {
  PropertyClient,
  PropertyRecord,
  PropertySummary,
} from '../../shared/contracts/property';
import { ClientStoreError, type ClientStore } from '../storage/client-store';
import type { AadhaarVault, PassportVault } from './aadhaar-vault';

export interface ClientList {
  enabled: boolean;
  storageError: 'SECRET_STORE_UNAVAILABLE' | 'STORAGE_ERROR' | null;
  clients: ClientSummary[];
}

export interface ClientService {
  list(): Promise<ClientList>;
  get(id: string): Promise<ClientRecord>;
  /** Saves the client; `aadhaar` sets (a number) or removes (null) its Aadhaar number, kept apart
   * in the secret vault; absent keeps it. */
  save(id: string | null, input: ClientInput, aadhaar?: string | null): Promise<string>;
  delete(id: string): Promise<boolean>;
  /** The last four digits of the client's Aadhaar number, or null if none is saved. */
  aadhaarLastFour(id: string): Promise<string | null>;
  /** Main process only (filling an insurer's form): the whole Aadhaar number, or null. */
  aadhaarFor(id: string): Promise<string | null>;
  /** Saved vehicles (for motor quotes), kept on their own in the same encrypted database. */
  listVehicles(): Promise<VehicleSummary[]>;
  getVehicle(id: string): Promise<VehicleRecord>;
  saveVehicle(id: string | null, input: VehicleInput): Promise<string>;
  deleteVehicle(id: string): Promise<boolean>;
  /** Travel clients (for travel e-proposals), kept apart from health clients. */
  listTravellers(): Promise<TravellerSummary[]>;
  getTraveller(id: string): Promise<TravellerRecord>;
  /** `aadhaar` / `passport`: a number sets, null removes, absent keeps (kept in the vault). */
  saveTraveller(
    id: string | null,
    input: Traveller,
    numbers?: { aadhaar?: string | null; passport?: string | null },
  ): Promise<string>;
  /** Removes the travel client with its Aadhaar and passport numbers. */
  deleteTraveller(id: string): Promise<boolean>;
  /** The last four characters of the travel client's passport number, or null. */
  passportLastFour(id: string): Promise<string | null>;
  /** Main process only (filling an insurer's form): the whole passport number, or null. */
  passportFor(id: string): Promise<string | null>;
  /** Rural clients (a farmer, their animals and farm), kept apart from the others. */
  listRural(): Promise<RuralSummary[]>;
  getRural(id: string): Promise<RuralRecord>;
  saveRural(id: string | null, input: RuralClient): Promise<string>;
  deleteRural(id: string): Promise<boolean>;
  /** Marine clients (the policy holder of a voyage), kept apart from the others. */
  listMarine(): Promise<MarineSummary[]>;
  getMarine(id: string): Promise<MarineRecord>;
  saveMarine(id: string | null, input: MarineClient): Promise<string>;
  deleteMarine(id: string): Promise<boolean>;
  /** Property clients (an owner and their home or premises), kept apart from the others. */
  listProperties(): Promise<PropertySummary[]>;
  getProperty(id: string): Promise<PropertyRecord>;
  saveProperty(id: string | null, input: PropertyClient): Promise<string>;
  deleteProperty(id: string): Promise<boolean>;
  close(): void;
}

export function createClientService(deps: {
  enabled: boolean;
  open: () => Promise<ClientStore>;
  /** Where Aadhaar numbers are kept (absent: none can be saved). */
  aadhaar?: AadhaarVault;
  /** Where travel clients' passport numbers are kept (absent: none can be saved). */
  passport?: PassportVault;
  logger: Logger;
  now?: () => Date;
}): ClientService {
  let store: ClientStore | null = null;
  let opening: Promise<ClientStore> | null = null;

  const ready = (): Promise<ClientStore> => {
    if (store) return Promise.resolve(store);
    opening ??= deps
      .open()
      .then((opened) => {
        store = opened;
        // Clients removed by an upgrade (vehicle-only clients, when vehicles moved to their own
        // list) take their Aadhaar number with them, as a deleted client does.
        for (const id of opened.removedByUpgrade)
          void deps.aadhaar?.clear(id).catch(() => undefined);
        return opened;
      })
      .catch((err: unknown) => {
        opening = null;
        const problem = err instanceof ClientStoreError ? err.reason : 'database-unreadable';
        deps.logger.error('storage.open-failed', { storeProblem: problem });
        throw err instanceof ClientStoreError
          ? err
          : new ClientStoreError('STORAGE_ERROR', 'database-unreadable');
      });
    return opening;
  };

  const requireStore = async (): Promise<ClientStore> => {
    if (!deps.enabled) throw new AppException('UNSUPPORTED_FLOW');
    try {
      return await ready();
    } catch (err) {
      throw new AppException(err instanceof ClientStoreError ? err.code : 'STORAGE_ERROR');
    }
  };

  const guard = <T>(work: () => T): T => {
    try {
      return work();
    } catch (err) {
      if (err instanceof AppException) throw err;
      if (err instanceof ClientStoreError) {
        deps.logger.error('storage.write-failed', { storeProblem: err.reason });
        throw new AppException(err.code);
      }
      throw new AppException('STORAGE_ERROR');
    }
  };

  return {
    list: async () => {
      if (!deps.enabled) return { enabled: false, storageError: null, clients: [] };
      try {
        const s = await ready();
        return { enabled: true, storageError: null, clients: guard(() => s.list()) };
      } catch (err) {
        return {
          enabled: true,
          storageError: err instanceof ClientStoreError ? err.code : 'STORAGE_ERROR',
          clients: [],
        };
      }
    },

    get: async (id) => {
      const s = await requireStore();
      const record = guard(() => s.get(id));
      if (!record) throw new AppException('VALIDATION_FAILED');
      return record;
    },

    save: async (id, input, aadhaar) => {
      const s = await requireStore();
      if (hasFutureDateOfBirth(input, (deps.now ?? (() => new Date()))())) {
        throw new AppException('VALIDATION_FAILED');
      }
      if (aadhaar && !deps.aadhaar) throw new AppException('UNSUPPORTED_FLOW');
      if (id !== null && !guard(() => s.get(id))) throw new AppException('VALIDATION_FAILED');
      const saved = guard(() => s.save(id, input));
      deps.logger.info('client.saved');
      if (aadhaar) await deps.aadhaar!.set(saved.id, aadhaar);
      else if (aadhaar === null) await deps.aadhaar?.clear(saved.id);
      return saved.id;
    },

    delete: async (id) => {
      const s = await requireStore();
      const deleted = guard(() => s.delete(id));
      // The Aadhaar number goes with the client (also if the client was already gone).
      await deps.aadhaar?.clear(id);
      if (deleted) deps.logger.info('client.deleted');
      return deleted;
    },

    aadhaarLastFour: async (id) => {
      await requireStore();
      return deps.aadhaar ? deps.aadhaar.lastFour(id) : null;
    },

    aadhaarFor: async (id) => {
      await requireStore();
      return deps.aadhaar ? deps.aadhaar.read(id) : null;
    },

    listVehicles: async () => {
      const s = await requireStore();
      return guard(() => s.vehicles.list());
    },

    getVehicle: async (id) => {
      const s = await requireStore();
      const record = guard(() => s.vehicles.get(id));
      if (!record) throw new AppException('VALIDATION_FAILED');
      return record;
    },

    saveVehicle: async (id, input) => {
      const s = await requireStore();
      if (id !== null && !guard(() => s.vehicles.get(id))) {
        throw new AppException('VALIDATION_FAILED');
      }
      const saved = guard(() => s.vehicles.save(id, input));
      deps.logger.info('vehicle.saved');
      return saved.id;
    },

    deleteVehicle: async (id) => {
      const s = await requireStore();
      const deleted = guard(() => s.vehicles.delete(id));
      if (deleted) deps.logger.info('vehicle.deleted');
      return deleted;
    },

    listTravellers: async () => {
      const s = await requireStore();
      return guard(() => s.travellers.list());
    },

    getTraveller: async (id) => {
      const s = await requireStore();
      const record = guard(() => s.travellers.get(id));
      if (!record) throw new AppException('VALIDATION_FAILED');
      return record;
    },

    saveTraveller: async (id, input, numbers = {}) => {
      const s = await requireStore();
      const today = (deps.now ?? (() => new Date()))();
      if (hasFutureDateOfBirth({ members: [{ dateOfBirth: input.dateOfBirth }] }, today)) {
        throw new AppException('VALIDATION_FAILED');
      }
      if ((numbers.aadhaar && !deps.aadhaar) || (numbers.passport && !deps.passport)) {
        throw new AppException('UNSUPPORTED_FLOW');
      }
      if (id !== null && !guard(() => s.travellers.get(id))) {
        throw new AppException('VALIDATION_FAILED');
      }
      const saved = guard(() => s.travellers.save(id, input));
      deps.logger.info('traveller.saved');
      if (numbers.aadhaar) await deps.aadhaar!.set(saved.id, numbers.aadhaar);
      else if (numbers.aadhaar === null) await deps.aadhaar?.clear(saved.id);
      if (numbers.passport) await deps.passport!.set(saved.id, numbers.passport);
      else if (numbers.passport === null) await deps.passport?.clear(saved.id);
      return saved.id;
    },

    deleteTraveller: async (id) => {
      const s = await requireStore();
      const deleted = guard(() => s.travellers.delete(id));
      // The numbers go with the travel client (also if it was already gone).
      await deps.aadhaar?.clear(id);
      await deps.passport?.clear(id);
      if (deleted) deps.logger.info('traveller.deleted');
      return deleted;
    },

    passportLastFour: async (id) => {
      await requireStore();
      return deps.passport ? deps.passport.lastFour(id) : null;
    },

    passportFor: async (id) => {
      await requireStore();
      return deps.passport ? deps.passport.read(id) : null;
    },

    listRural: async () => {
      const s = await requireStore();
      return guard(() => s.rural.list());
    },

    getRural: async (id) => {
      const s = await requireStore();
      const record = guard(() => s.rural.get(id));
      if (!record) throw new AppException('VALIDATION_FAILED');
      return record;
    },

    saveRural: async (id, input) => {
      const s = await requireStore();
      const today = (deps.now ?? (() => new Date()))();
      if (
        input.dateOfBirth &&
        hasFutureDateOfBirth({ members: [{ dateOfBirth: input.dateOfBirth }] }, today)
      ) {
        throw new AppException('VALIDATION_FAILED');
      }
      if (id !== null && !guard(() => s.rural.get(id))) {
        throw new AppException('VALIDATION_FAILED');
      }
      const saved = guard(() => s.rural.save(id, input));
      deps.logger.info('rural.saved');
      return saved.id;
    },

    deleteRural: async (id) => {
      const s = await requireStore();
      const deleted = guard(() => s.rural.delete(id));
      if (deleted) deps.logger.info('rural.deleted');
      return deleted;
    },

    listMarine: async () => {
      const s = await requireStore();
      return guard(() => s.marine.list());
    },

    getMarine: async (id) => {
      const s = await requireStore();
      const record = guard(() => s.marine.get(id));
      if (!record) throw new AppException('VALIDATION_FAILED');
      return record;
    },

    saveMarine: async (id, input) => {
      const s = await requireStore();
      const today = (deps.now ?? (() => new Date()))();
      const dates = [input.dateOfBirth, input.registrationDate].filter(
        (d): d is string => d !== undefined,
      );
      if (hasFutureDateOfBirth({ members: dates.map((dateOfBirth) => ({ dateOfBirth })) }, today)) {
        throw new AppException('VALIDATION_FAILED');
      }
      if (id !== null && !guard(() => s.marine.get(id))) {
        throw new AppException('VALIDATION_FAILED');
      }
      const saved = guard(() => s.marine.save(id, input));
      deps.logger.info('marine.saved');
      return saved.id;
    },

    deleteMarine: async (id) => {
      const s = await requireStore();
      const deleted = guard(() => s.marine.delete(id));
      if (deleted) deps.logger.info('marine.deleted');
      return deleted;
    },

    listProperties: async () => {
      const s = await requireStore();
      return guard(() => s.properties.list());
    },

    getProperty: async (id) => {
      const s = await requireStore();
      const record = guard(() => s.properties.get(id));
      if (!record) throw new AppException('VALIDATION_FAILED');
      return record;
    },

    saveProperty: async (id, input) => {
      const s = await requireStore();
      const today = (deps.now ?? (() => new Date()))();
      const h = input.holder;
      const dates = [h.dateOfBirth, h.registrationDate].filter((d): d is string => d !== undefined);
      if (
        hasFutureDateOfBirth({ members: dates.map((dateOfBirth) => ({ dateOfBirth })) }, today) ||
        (input.property.yearOfConstruction ?? 0) > today.getFullYear()
      ) {
        throw new AppException('VALIDATION_FAILED');
      }
      if (id !== null && !guard(() => s.properties.get(id))) {
        throw new AppException('VALIDATION_FAILED');
      }
      const saved = guard(() => s.properties.save(id, input));
      deps.logger.info('property.saved');
      return saved.id;
    },

    deleteProperty: async (id) => {
      const s = await requireStore();
      const deleted = guard(() => s.properties.delete(id));
      if (deleted) deps.logger.info('property.deleted');
      return deleted;
    },

    close: () => {
      store?.close();
      store = null;
    },
  };
}
