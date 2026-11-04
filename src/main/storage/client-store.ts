// Saved clients (M4), in the encrypted database.
//
// - The database is SQLCipher-encrypted (encrypted-db.ts) with a random 256-bit key held in the
//   vault (entry "database-key"), never on disk in the clear.
// - A key is created only together with a new, empty database. If the database exists but its
//   key is missing, opening is refused: a new key would silently strand the data.
// - Every change goes through the durable commit layer (durable-db.ts): once a save returns, it
//   is in the database file, and a lost or older database file is refused, never silently used.
// - Deleting a client removes it and its members; secure_delete overwrites the deleted content.
// - Clients are kept until the advisor deletes them (retention period Q-B06 still open).
// - Saved vehicles (for motor quotes) are kept in the same database, in their own table, not as
//   part of a client (decision of 3 November 2026).
// - Travel clients (for travel e-proposals) likewise, in their own table: kept apart from health
//   clients (decision of 3 November 2026).
// - Nothing here logs; errors carry codes only, never client data.
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type Database from 'better-sqlite3-multiple-ciphers';
import {
  clientInputSchema,
  type ClientInput,
  type ClientRecord,
  type ClientSummary,
} from '../../shared/contracts/client';
import type { Gender, MaritalStatus } from '../../shared/contracts/client';
import type { Relationship } from '../../shared/contracts/customer';
import {
  vehicleInputSchema,
  vehicleSchema,
  type VehicleInput,
  type VehicleRecord,
  type VehicleSummary,
} from '../../shared/contracts/vehicle';
import type { CoverType } from '../../shared/contracts/coverage';
import {
  travellerSchema,
  type Traveller,
  type TravellerRecord,
  type TravellerSummary,
} from '../../shared/contracts/traveller';
import {
  ruralClientSchema,
  type RuralClient,
  type RuralRecord,
  type RuralSummary,
} from '../../shared/contracts/rural';
import { VaultOpenError, type VaultOpener } from '../secrets/vault-opener';
import { openDurable, type DurableStore } from './durable-db';
import { openEncrypted } from './encrypted-db';
import type { StoreProblem } from './store-problems';

const KEY_ENTRY = 'database-key';
const KEY_HEX = /^[0-9a-f]{64}$/;
const SCHEMA_VERSION = 7;

/** Why the store could not be used. `code` is safe to show; `reason` is for logs and support. */
export class ClientStoreError extends Error {
  constructor(
    readonly code: 'SECRET_STORE_UNAVAILABLE' | 'STORAGE_ERROR',
    readonly reason: StoreProblem,
  ) {
    super(code);
    this.name = 'ClientStoreError';
  }
}

export interface ClientStore {
  list(): ClientSummary[];
  get(id: string): ClientRecord | null;
  /** Creates a client (id null) or replaces an existing one. Returns the saved record. */
  save(id: string | null, input: ClientInput): ClientRecord;
  /** Removes the client and its members. Returns whether it existed. */
  delete(id: string): boolean;
  vehicles: {
    list(): VehicleSummary[];
    get(id: string): VehicleRecord | null;
    /** Creates a vehicle (id null) or replaces an existing one. Returns the saved record. */
    save(id: string | null, input: VehicleInput): VehicleRecord;
    /** Removes the vehicle. Returns whether it existed. */
    delete(id: string): boolean;
  };
  travellers: {
    list(): TravellerSummary[];
    get(id: string): TravellerRecord | null;
    /** Creates a travel client (id null) or replaces an existing one. Returns the saved record. */
    save(id: string | null, input: Traveller): TravellerRecord;
    /** Removes the travel client. Returns whether it existed. */
    delete(id: string): boolean;
  };
  rural: {
    list(): RuralSummary[];
    get(id: string): RuralRecord | null;
    /** Creates a rural client (id null) or replaces an existing one. Returns the saved record. */
    save(id: string | null, input: RuralClient): RuralRecord;
    /** Removes the rural client. Returns whether it existed. */
    delete(id: string): boolean;
  };
  /** Clients the last upgrade removed (vehicle-only clients, version 5): their Aadhaar entries
   * are removed by the caller. */
  removedByUpgrade: readonly string[];
  close(): void;
}

export interface ClientStoreOptions {
  /** The database file, for example <userData>/data/fqf.db. */
  dbPath: string;
  /** The commit ledger, kept outside the database folder. */
  ledgerPath: string;
  openVault: VaultOpener;
  now?: () => Date;
  newId?: () => string;
}

async function databaseKey(openVault: VaultOpener, dbPath: string): Promise<Buffer> {
  let vault;
  try {
    vault = await openVault();
  } catch (err) {
    throw new ClientStoreError(
      err instanceof VaultOpenError && err.code !== 'SECRET_STORE_UNAVAILABLE'
        ? 'STORAGE_ERROR'
        : 'SECRET_STORE_UNAVAILABLE',
      'vault-unavailable',
    );
  }
  const stored = await vault.get(KEY_ENTRY);
  if (stored.ok) {
    if (!KEY_HEX.test(stored.data))
      throw new ClientStoreError('STORAGE_ERROR', 'database-key-invalid');
    return Buffer.from(stored.data, 'hex');
  }
  if (stored.error.code !== 'SECRET_NOT_FOUND') {
    throw new ClientStoreError('STORAGE_ERROR', 'database-key-invalid');
  }
  // No key: only acceptable if there is no database yet.
  if (existsSync(dbPath)) throw new ClientStoreError('STORAGE_ERROR', 'database-key-missing');
  const key = randomBytes(32);
  const put = await vault.put(KEY_ENTRY, key.toString('hex'));
  if (!put.ok) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
  return key;
}

/** Brings the database up to SCHEMA_VERSION. Returns the ids of clients the upgrade removed. */
function migrate(
  db: Database.Database,
  store: DurableStore,
  at: string,
  newId: () => string,
): string[] {
  const version = Number(db.pragma('user_version', { simple: true }));
  if (version > SCHEMA_VERSION) throw new ClientStoreError('STORAGE_ERROR', 'schema-too-new');
  if (version === SCHEMA_VERSION) return [];
  // Version 1: clients and members.
  if (version < 1)
    store.commit((d) => {
      d.exec(`
      CREATE TABLE client (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        notes TEXT,
        pincode TEXT NOT NULL,
        cover_type TEXT,
        sum_insured_paise INTEGER,
        tenure_years INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK ((cover_type IS NULL) = (sum_insured_paise IS NULL)),
        CHECK ((cover_type IS NULL) = (tenure_years IS NULL))
      );
      CREATE TABLE client_member (
        client_id TEXT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        relationship TEXT NOT NULL,
        age INTEGER NOT NULL,
        PRIMARY KEY (client_id, position)
      );
    `);
      d.pragma('user_version = 1');
    });
  // Each step runs only on a database older than it, so any older version is brought up to date.
  // Version 2 (2 November 2026): date of birth and gender per member, proposer marital status.
  if (version < 2) {
    store.commit((d) => {
      d.exec(`
        ALTER TABLE client ADD COLUMN proposer_marital_status TEXT;
        ALTER TABLE client_member ADD COLUMN date_of_birth TEXT;
        ALTER TABLE client_member ADD COLUMN gender TEXT;
      `);
      d.pragma('user_version = 2');
    });
  }
  // Version 3 (2 November 2026): the client's vehicle, for motor quotes (validated JSON).
  if (version < 3) {
    store.commit((d) => {
      d.exec('ALTER TABLE client ADD COLUMN vehicle_json TEXT;');
      d.pragma('user_version = 3');
    });
  }
  // Version 4 (3 November 2026): proposal details for e-proposal forms (validated JSON).
  if (version < 4) {
    store.commit((d) => {
      d.exec('ALTER TABLE client ADD COLUMN proposal_json TEXT;');
      d.pragma('user_version = 4');
    });
  }
  // Version 5 (3 November 2026): vehicles are kept on their own. Each client's vehicle becomes a
  // saved vehicle named after the client; clients that held only a vehicle (no members) are
  // removed; the client's vehicle column is dropped. One commit: all of it or none.
  let removed: string[] = [];
  if (version < 5) {
    removed = store.commit((d) => {
      d.exec(`
        CREATE TABLE vehicle (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          vehicle_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const owners = d
        .prepare(
          'SELECT id, name, vehicle_json, created_at FROM client WHERE vehicle_json IS NOT NULL',
        )
        .all() as { id: string; name: string; vehicle_json: string; created_at: string }[];
      const insert = d.prepare(
        'INSERT INTO vehicle (id, name, vehicle_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      );
      for (const o of owners) insert.run(newId(), o.name, o.vehicle_json, o.created_at, at);
      const vehicleOnly = `vehicle_json IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM client_member m WHERE m.client_id = client.id)`;
      const gone = (
        d.prepare(`SELECT id FROM client WHERE ${vehicleOnly}`).all() as { id: string }[]
      ).map((r) => r.id);
      d.prepare(`DELETE FROM client WHERE ${vehicleOnly}`).run();
      d.exec('ALTER TABLE client DROP COLUMN vehicle_json;');
      d.pragma('user_version = 5');
      return gone;
    }).value;
  }
  // Version 6 (3 November 2026): travel clients, kept apart from health clients (validated JSON).
  // Existing clients stay health clients.
  if (version < 6) {
    store.commit((d) => {
      d.exec(`
        CREATE TABLE traveller (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          traveller_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      d.pragma('user_version = 6');
    });
  }
  // Version 7 (4 November 2026): rural clients (a farmer, their animals and farm), kept apart
  // like travel clients (validated JSON).
  if (version < 7) {
    store.commit((d) => {
      d.exec(`
        CREATE TABLE rural_client (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          rural_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      d.pragma('user_version = 7');
    });
  }
  return removed;
}

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  pincode: string;
  proposer_marital_status: string | null;
  proposal_json: string | null;
  cover_type: string | null;
  sum_insured_paise: number | null;
  tenure_years: number | null;
  created_at: string;
  updated_at: string;
}

interface TravellerRow {
  id: string;
  name: string;
  traveller_json: string;
  created_at: string;
  updated_at: string;
}

interface RuralRow {
  id: string;
  name: string;
  rural_json: string;
  created_at: string;
  updated_at: string;
}

interface VehicleRow {
  id: string;
  name: string;
  vehicle_json: string;
  created_at: string;
  updated_at: string;
}

export async function openClientStore(options: ClientStoreOptions): Promise<ClientStore> {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => randomUUID());
  const key = await databaseKey(options.openVault, options.dbPath);

  let db: Database.Database;
  try {
    mkdirSync(dirname(options.dbPath), { recursive: true, mode: 0o700 });
    mkdirSync(dirname(options.ledgerPath), { recursive: true, mode: 0o700 });
    db = openEncrypted(options.dbPath, key);
  } catch {
    throw new ClientStoreError('STORAGE_ERROR', 'database-unreadable');
  }
  const opened = openDurable(db, { ledgerPath: options.ledgerPath, key });
  if (!opened.ok) {
    db.close();
    throw new ClientStoreError('STORAGE_ERROR', 'durability-refused');
  }
  const store = opened.store;
  let removedByUpgrade: string[];
  try {
    removedByUpgrade = migrate(db, store, now().toISOString(), newId);
  } catch (err) {
    db.close();
    throw err instanceof ClientStoreError
      ? err
      : new ClientStoreError('STORAGE_ERROR', 'write-failed');
  }

  const membersOf = (id: string): ClientInput['members'] =>
    (
      db
        .prepare(
          `SELECT relationship, age, date_of_birth, gender FROM client_member
           WHERE client_id = ? ORDER BY position`,
        )
        .all(id) as {
        relationship: Relationship;
        age: number;
        date_of_birth: string | null;
        gender: string | null;
      }[]
    ).map((m) => ({
      relationship: m.relationship,
      age: m.age,
      ...(m.date_of_birth !== null ? { dateOfBirth: m.date_of_birth } : {}),
      ...(m.gender !== null ? { gender: m.gender as Gender } : {}),
    }));

  const toRecord = (row: ClientRow): ClientRecord => {
    // Re-validated on the way out: a row that no longer fits the contract is not passed on.
    const client = clientInputSchema.parse({
      customer: {
        name: row.name,
        ...(row.phone !== null ? { phone: row.phone } : {}),
        ...(row.email !== null ? { email: row.email } : {}),
        ...(row.notes !== null ? { notes: row.notes } : {}),
      },
      pincode: row.pincode,
      members: membersOf(row.id),
      ...(row.proposer_marital_status !== null
        ? { proposerMaritalStatus: row.proposer_marital_status as MaritalStatus }
        : {}),
      ...(row.proposal_json !== null ? { proposal: JSON.parse(row.proposal_json) as unknown } : {}),
      ...(row.cover_type !== null && row.sum_insured_paise !== null && row.tenure_years !== null
        ? {
            preferences: {
              coverType: row.cover_type as CoverType,
              sumInsuredPaise: row.sum_insured_paise,
              tenureYears: row.tenure_years,
            },
          }
        : {}),
    });
    return { id: row.id, client, createdAt: row.created_at, updatedAt: row.updated_at };
  };

  const getRow = (id: string): ClientRow | undefined =>
    db.prepare('SELECT * FROM client WHERE id = ?').get(id) as ClientRow | undefined;

  const getVehicleRow = (id: string): VehicleRow | undefined =>
    db.prepare('SELECT * FROM vehicle WHERE id = ?').get(id) as VehicleRow | undefined;
  const toVehicleRecord = (row: VehicleRow): VehicleRecord => ({
    id: row.id,
    // Re-validated on the way out, like clients.
    saved: vehicleInputSchema.parse({
      name: row.name,
      vehicle: JSON.parse(row.vehicle_json) as unknown,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const getTravellerRow = (id: string): TravellerRow | undefined =>
    db.prepare('SELECT * FROM traveller WHERE id = ?').get(id) as TravellerRow | undefined;
  const toTravellerRecord = (row: TravellerRow): TravellerRecord => ({
    id: row.id,
    // Re-validated on the way out, like clients.
    traveller: travellerSchema.parse(JSON.parse(row.traveller_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const getRuralRow = (id: string): RuralRow | undefined =>
    db.prepare('SELECT * FROM rural_client WHERE id = ?').get(id) as RuralRow | undefined;
  const toRuralRecord = (row: RuralRow): RuralRecord => ({
    id: row.id,
    // Re-validated on the way out, like clients.
    rural: ruralClientSchema.parse(JSON.parse(row.rural_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const write = <T>(work: (d: Database.Database) => T): T => {
    try {
      return store.commit(work).value;
    } catch {
      throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
    }
  };

  return {
    list: () =>
      (
        db
          .prepare(
            `SELECT c.id, c.name, c.pincode, c.cover_type, c.updated_at,
                    (SELECT count(*) FROM client_member m WHERE m.client_id = c.id) AS members
             FROM client c ORDER BY c.updated_at DESC, c.name`,
          )
          .all() as {
          id: string;
          name: string;
          pincode: string;
          cover_type: string | null;
          updated_at: string;
          members: number;
        }[]
      ).map((r) => ({
        id: r.id,
        name: r.name,
        pincode: r.pincode,
        memberCount: r.members,
        hasPreferences: r.cover_type !== null,
        updatedAt: r.updated_at,
      })),

    get: (id) => {
      const row = getRow(id);
      return row ? toRecord(row) : null;
    },

    save: (id, raw) => {
      const input = clientInputSchema.parse(raw);
      const at = now().toISOString();
      const existing = id === null ? undefined : getRow(id);
      if (id !== null && !existing) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
      const clientId = existing?.id ?? newId();
      const c = input.customer;
      const p = input.preferences;
      write((d) => {
        const values = {
          id: clientId,
          name: c.name,
          phone: c.phone ?? null,
          email: c.email ?? null,
          notes: c.notes ?? null,
          pincode: input.pincode,
          proposer_marital_status: input.proposerMaritalStatus ?? null,
          proposal_json: input.proposal ? JSON.stringify(input.proposal) : null,
          cover_type: p?.coverType ?? null,
          sum_insured_paise: p?.sumInsuredPaise ?? null,
          tenure_years: p?.tenureYears ?? null,
          created_at: existing?.created_at ?? at,
          updated_at: at,
        };
        if (existing) {
          d.prepare(
            `UPDATE client SET name = @name, phone = @phone, email = @email, notes = @notes,
               pincode = @pincode, proposer_marital_status = @proposer_marital_status,
               proposal_json = @proposal_json,
               cover_type = @cover_type, sum_insured_paise = @sum_insured_paise,
               tenure_years = @tenure_years, updated_at = @updated_at WHERE id = @id`,
          ).run(values);
          d.prepare('DELETE FROM client_member WHERE client_id = ?').run(clientId);
        } else {
          d.prepare(
            `INSERT INTO client (id, name, phone, email, notes, pincode, proposer_marital_status,
               proposal_json, cover_type, sum_insured_paise, tenure_years, created_at,
               updated_at)
             VALUES (@id, @name, @phone, @email, @notes, @pincode, @proposer_marital_status,
               @proposal_json, @cover_type, @sum_insured_paise, @tenure_years, @created_at,
               @updated_at)`,
          ).run(values);
        }
        const member = d.prepare(
          `INSERT INTO client_member (client_id, position, relationship, age, date_of_birth, gender)
           VALUES (?, ?, ?, ?, ?, ?)`,
        );
        input.members.forEach((m, i) =>
          member.run(clientId, i, m.relationship, m.age, m.dateOfBirth ?? null, m.gender ?? null),
        );
      });
      const saved = getRow(clientId);
      if (!saved) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
      return toRecord(saved);
    },

    delete: (id) => write((d) => d.prepare('DELETE FROM client WHERE id = ?').run(id).changes > 0),

    vehicles: {
      list: () =>
        (
          db
            .prepare(
              'SELECT id, name, vehicle_json, updated_at FROM vehicle ORDER BY updated_at DESC, name',
            )
            .all() as VehicleRow[]
        ).map((r) => {
          const v = vehicleSchema.parse(JSON.parse(r.vehicle_json));
          return {
            id: r.id,
            name: r.name,
            vehicleClass: v.vehicleClass,
            condition: v.condition,
            updatedAt: r.updated_at,
          };
        }),
      get: (id) => {
        const row = getVehicleRow(id);
        return row ? toVehicleRecord(row) : null;
      },
      save: (id, raw) => {
        const input = vehicleInputSchema.parse(raw);
        const at = now().toISOString();
        const existing = id === null ? undefined : getVehicleRow(id);
        if (id !== null && !existing) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
        const vehicleId = existing?.id ?? newId();
        const values = {
          id: vehicleId,
          name: input.name,
          vehicle_json: JSON.stringify(input.vehicle),
          created_at: existing?.created_at ?? at,
          updated_at: at,
        };
        write((d) =>
          existing
            ? d
                .prepare(
                  `UPDATE vehicle SET name = @name, vehicle_json = @vehicle_json,
                     updated_at = @updated_at WHERE id = @id`,
                )
                .run(values)
            : d
                .prepare(
                  `INSERT INTO vehicle (id, name, vehicle_json, created_at, updated_at)
                   VALUES (@id, @name, @vehicle_json, @created_at, @updated_at)`,
                )
                .run(values),
        );
        const saved = getVehicleRow(vehicleId);
        if (!saved) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
        return toVehicleRecord(saved);
      },
      delete: (id) =>
        write((d) => d.prepare('DELETE FROM vehicle WHERE id = ?').run(id).changes > 0),
    },

    travellers: {
      list: () =>
        (
          db
            .prepare(
              'SELECT id, name, traveller_json, updated_at FROM traveller ORDER BY updated_at DESC, name',
            )
            .all() as TravellerRow[]
        ).map((r) => {
          const t = travellerSchema.parse(JSON.parse(r.traveller_json));
          return {
            id: r.id,
            name: r.name,
            pincode: t.pincode,
            dateOfBirth: t.dateOfBirth,
            updatedAt: r.updated_at,
          };
        }),
      get: (id) => {
        const row = getTravellerRow(id);
        return row ? toTravellerRecord(row) : null;
      },
      save: (id, raw) => {
        const input = travellerSchema.parse(raw);
        const at = now().toISOString();
        const existing = id === null ? undefined : getTravellerRow(id);
        if (id !== null && !existing) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
        const travellerId = existing?.id ?? newId();
        const values = {
          id: travellerId,
          name: input.customer.name,
          traveller_json: JSON.stringify(input),
          created_at: existing?.created_at ?? at,
          updated_at: at,
        };
        write((d) =>
          existing
            ? d
                .prepare(
                  `UPDATE traveller SET name = @name, traveller_json = @traveller_json,
                     updated_at = @updated_at WHERE id = @id`,
                )
                .run(values)
            : d
                .prepare(
                  `INSERT INTO traveller (id, name, traveller_json, created_at, updated_at)
                   VALUES (@id, @name, @traveller_json, @created_at, @updated_at)`,
                )
                .run(values),
        );
        const saved = getTravellerRow(travellerId);
        if (!saved) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
        return toTravellerRecord(saved);
      },
      delete: (id) =>
        write((d) => d.prepare('DELETE FROM traveller WHERE id = ?').run(id).changes > 0),
    },

    rural: {
      list: () =>
        (
          db
            .prepare(
              'SELECT id, name, rural_json, updated_at FROM rural_client ORDER BY updated_at DESC, name',
            )
            .all() as RuralRow[]
        ).map((r) => {
          const rural = ruralClientSchema.parse(JSON.parse(r.rural_json));
          return {
            id: r.id,
            name: r.name,
            pincode: rural.pincode,
            animalCount: rural.animals.length,
            hasFarm: rural.farm !== undefined,
            updatedAt: r.updated_at,
          };
        }),
      get: (id) => {
        const row = getRuralRow(id);
        return row ? toRuralRecord(row) : null;
      },
      save: (id, raw) => {
        const input = ruralClientSchema.parse(raw);
        const at = now().toISOString();
        const existing = id === null ? undefined : getRuralRow(id);
        if (id !== null && !existing) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
        const ruralId = existing?.id ?? newId();
        const values = {
          id: ruralId,
          name: input.customer.name,
          rural_json: JSON.stringify(input),
          created_at: existing?.created_at ?? at,
          updated_at: at,
        };
        write((d) =>
          existing
            ? d
                .prepare(
                  `UPDATE rural_client SET name = @name, rural_json = @rural_json,
                     updated_at = @updated_at WHERE id = @id`,
                )
                .run(values)
            : d
                .prepare(
                  `INSERT INTO rural_client (id, name, rural_json, created_at, updated_at)
                   VALUES (@id, @name, @rural_json, @created_at, @updated_at)`,
                )
                .run(values),
        );
        const saved = getRuralRow(ruralId);
        if (!saved) throw new ClientStoreError('STORAGE_ERROR', 'write-failed');
        return toRuralRecord(saved);
      },
      delete: (id) =>
        write((d) => d.prepare('DELETE FROM rural_client WHERE id = ?').run(id).changes > 0),
    },

    removedByUpgrade,

    close: () => {
      try {
        store.checkpoint();
      } catch {
        // Closing still releases the file; every acknowledged commit was already checkpointed.
      }
      db.close();
    },
  };
}
