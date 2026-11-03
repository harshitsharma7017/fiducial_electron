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
import type { CoverType } from '../../shared/contracts/coverage';
import { VaultOpenError, type VaultOpener } from '../secrets/vault-opener';
import { openDurable, type DurableStore } from './durable-db';
import { openEncrypted } from './encrypted-db';
import type { StoreProblem } from './store-problems';

const KEY_ENTRY = 'database-key';
const KEY_HEX = /^[0-9a-f]{64}$/;
const SCHEMA_VERSION = 3;

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

function migrate(db: Database.Database, store: DurableStore): void {
  const version = Number(db.pragma('user_version', { simple: true }));
  if (version > SCHEMA_VERSION) throw new ClientStoreError('STORAGE_ERROR', 'schema-too-new');
  if (version === SCHEMA_VERSION) return;
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
}

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  pincode: string;
  proposer_marital_status: string | null;
  vehicle_json: string | null;
  cover_type: string | null;
  sum_insured_paise: number | null;
  tenure_years: number | null;
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
  try {
    migrate(db, store);
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
      ...(row.vehicle_json !== null ? { vehicle: JSON.parse(row.vehicle_json) as unknown } : {}),
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
            `SELECT c.id, c.name, c.pincode, c.cover_type, c.updated_at, c.vehicle_json,
                    (SELECT count(*) FROM client_member m WHERE m.client_id = c.id) AS members
             FROM client c ORDER BY c.updated_at DESC, c.name`,
          )
          .all() as {
          id: string;
          name: string;
          pincode: string;
          cover_type: string | null;
          updated_at: string;
          vehicle_json: string | null;
          members: number;
        }[]
      ).map((r) => ({
        id: r.id,
        name: r.name,
        pincode: r.pincode,
        memberCount: r.members,
        hasVehicle: r.vehicle_json !== null,
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
          vehicle_json: input.vehicle ? JSON.stringify(input.vehicle) : null,
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
               vehicle_json = @vehicle_json,
               cover_type = @cover_type, sum_insured_paise = @sum_insured_paise,
               tenure_years = @tenure_years, updated_at = @updated_at WHERE id = @id`,
          ).run(values);
          d.prepare('DELETE FROM client_member WHERE client_id = ?').run(clientId);
        } else {
          d.prepare(
            `INSERT INTO client (id, name, phone, email, notes, pincode, proposer_marital_status,
               vehicle_json, cover_type, sum_insured_paise, tenure_years, created_at, updated_at)
             VALUES (@id, @name, @phone, @email, @notes, @pincode, @proposer_marital_status,
               @vehicle_json, @cover_type, @sum_insured_paise, @tenure_years, @created_at,
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
