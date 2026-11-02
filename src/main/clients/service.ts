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
import { ClientStoreError, type ClientStore } from '../storage/client-store';

export interface ClientList {
  enabled: boolean;
  storageError: 'SECRET_STORE_UNAVAILABLE' | 'STORAGE_ERROR' | null;
  clients: ClientSummary[];
}

export interface ClientService {
  list(): Promise<ClientList>;
  get(id: string): Promise<ClientRecord>;
  save(id: string | null, input: ClientInput): Promise<string>;
  delete(id: string): Promise<boolean>;
  close(): void;
}

export function createClientService(deps: {
  enabled: boolean;
  open: () => Promise<ClientStore>;
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

    save: async (id, input) => {
      const s = await requireStore();
      if (hasFutureDateOfBirth(input, (deps.now ?? (() => new Date()))())) {
        throw new AppException('VALIDATION_FAILED');
      }
      if (id !== null && !guard(() => s.get(id))) throw new AppException('VALIDATION_FAILED');
      const saved = guard(() => s.save(id, input));
      deps.logger.info('client.saved');
      return saved.id;
    },

    delete: async (id) => {
      const s = await requireStore();
      const deleted = guard(() => s.delete(id));
      if (deleted) deps.logger.info('client.deleted');
      return deleted;
    },

    close: () => {
      store?.close();
      store = null;
    },
  };
}
