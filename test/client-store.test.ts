// Saved clients: the encrypted, durable client store (src/main/storage/client-store.ts) with the
// real vault (fake OS backend) and the client service behind the IPC channels. Synthetic data.
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createClientService } from '../src/main/clients/service';
import { createDispatcher } from '../src/main/ipc/dispatcher';
import { createHandlers } from '../src/main/ipc/handlers';
import { createInsurerService } from '../src/main/insurers/service';
import { createLogger, type LogRecord } from '../src/main/logging/logger';
import type { SecretBackend } from '../src/main/secrets/secret-store';
import { createVaultOpener } from '../src/main/secrets/vault-opener';
import { SecretVault } from '../src/main/secrets/vault/vault';
import {
  ClientStoreError,
  openClientStore,
  type ClientStore,
} from '../src/main/storage/client-store';
import { openDurable } from '../src/main/storage/durable-db';
import { cipherName, openEncrypted } from '../src/main/storage/encrypted-db';
import { quoteRequestFor, type ClientInputRaw } from '../src/shared/contracts/client';

vi.mock('electron', () => ({ app: {} }));

const root = mkdtempSync(join(tmpdir(), 'fqf-clients-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let counter = 0;

/** XOR with a random IV and no integrity, like macOS safeStorage (see vault.test.ts). */
function fakeBackend(): SecretBackend {
  const stream = (iv: Buffer, n: number): Buffer => {
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i += 32) {
      createHash('sha256')
        .update(`seed:${iv.toString('hex')}:${i}`)
        .digest()
        .copy(out, i);
    }
    return out;
  };
  return {
    isAsyncEncryptionAvailable: () => Promise.resolve(true),
    encryptStringAsync: (plain) => {
      const iv = randomBytes(16);
      const data = Buffer.from(plain, 'utf8');
      const key = stream(iv, data.length);
      return Promise.resolve(Buffer.concat([iv, data.map((b, i) => b ^ key[i]!)]));
    },
    decryptStringAsync: (sealed) => {
      const iv = sealed.subarray(0, 16);
      const data = sealed.subarray(16);
      const key = stream(iv, data.length);
      return Promise.resolve({
        shouldReEncrypt: false,
        result: Buffer.from(data.map((b, i) => b ^ key[i]!)).toString('utf8'),
      });
    },
  };
}

interface Place {
  dir: string;
  dbPath: string;
  ledgerPath: string;
  vaultDir: string;
}

function place(): Place {
  const dir = join(root, `p${++counter}`);
  return {
    dir,
    dbPath: join(dir, 'data', 'fqf.db'),
    ledgerPath: join(dir, 'ledger', 'fqf.ledger'),
    vaultDir: join(dir, 'secrets'),
  };
}

const backend = fakeBackend();
function open(p: Place, now = () => new Date('2026-11-02T10:00:00.000Z')): Promise<ClientStore> {
  return openClientStore({
    dbPath: p.dbPath,
    ledgerPath: p.ledgerPath,
    openVault: createVaultOpener(p.vaultDir, backend),
    now,
  });
}

async function refusal(p: Place): Promise<string> {
  try {
    (await open(p)).close();
    return 'OK';
  } catch (err) {
    return err instanceof ClientStoreError ? `${err.code}:${err.reason}` : String(err);
  }
}

// Synthetic client data with unique markers, to look for on disk.
const MARK = randomBytes(4).toString('hex').toUpperCase();
const CLIENT: ClientInputRaw = {
  customer: {
    name: `Synthetic Client ${MARK}`,
    phone: '+91 98765-43210',
    email: `synthetic.${MARK.toLowerCase()}@example.test`,
    notes: `Prefers floater ${MARK}`,
  },
  pincode: '560 001',
  members: [
    { relationship: 'self', age: 41 },
    { relationship: 'spouse', age: 38 },
    { relationship: 'son', age: 9 },
  ],
  preferences: { coverType: 'floater', sumInsuredPaise: 10_00_000_00, tenureYears: 1 },
};

function allBytes(dir: string): Buffer {
  return Buffer.concat(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => readFileSync(join(e.parentPath, e.name))),
  );
}

/** Quote runs are not exercised here (see quotes.test.ts). */
const unusedQuotes = {
  run: () => Promise.reject(new Error('not used')),
};

describe('the client store', () => {
  it('saves a client and reads it back, normalised', async () => {
    const store = await open(place());
    const saved = store.save(null, CLIENT);
    expect(saved.client).toEqual({
      customer: {
        name: `Synthetic Client ${MARK}`,
        phone: '9876543210',
        email: `synthetic.${MARK.toLowerCase()}@example.test`,
        notes: `Prefers floater ${MARK}`,
      },
      pincode: '560001',
      members: [
        { relationship: 'self', age: 41 },
        { relationship: 'spouse', age: 38 },
        { relationship: 'son', age: 9 },
      ],
      preferences: { coverType: 'floater', sumInsuredPaise: 10_00_000_00, tenureYears: 1 },
    });
    expect(store.get(saved.id)).toEqual(saved);
    expect(store.list()).toEqual([
      {
        id: saved.id,
        name: `Synthetic Client ${MARK}`,
        pincode: '560001',
        memberCount: 3,
        hasVehicle: false,
        hasPreferences: true,
        updatedAt: '2026-11-02T10:00:00.000Z',
      },
    ]);
    store.close();
  });

  it('turns a saved client into a quote request', async () => {
    const store = await open(place());
    const saved = store.save(null, CLIENT);
    expect(quoteRequestFor(saved.client)).toEqual({
      members: saved.client.members,
      coverType: 'floater',
      sumInsuredPaise: 10_00_000_00,
      tenureYears: 1,
      pincode: '560001',
    });
    const noPrefs = store.save(null, { ...CLIENT, preferences: undefined });
    expect(noPrefs.client.preferences).toBeUndefined();
    expect(quoteRequestFor(noPrefs.client)).toBeNull();
    store.close();
  });

  it('updates a client in place: members replaced, created time kept', async () => {
    const p = place();
    let t = new Date('2026-11-02T10:00:00.000Z');
    const store = await open(p, () => t);
    const first = store.save(null, CLIENT);
    t = new Date('2026-11-03T09:30:00.000Z');
    const updated = store.save(first.id, {
      ...CLIENT,
      members: [{ relationship: 'self', age: 42 }],
      preferences: undefined,
    } as never);
    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe('2026-11-02T10:00:00.000Z');
    expect(updated.updatedAt).toBe('2026-11-03T09:30:00.000Z');
    expect(updated.client.members).toEqual([{ relationship: 'self', age: 42 }]);
    expect(updated.client.preferences).toBeUndefined();
    expect(store.list()).toHaveLength(1);
    expect(() => store.save('no-such-client', CLIENT as never)).toThrow(ClientStoreError);
    store.close();
  });

  it('deletes a client with its members, and says whether it existed', async () => {
    const store = await open(place());
    const a = store.save(null, CLIENT);
    const b = store.save(null, { ...CLIENT, customer: { name: 'Other Synthetic' } });
    expect(store.delete(a.id)).toBe(true);
    expect(store.delete(a.id)).toBe(false);
    expect(store.get(a.id)).toBeNull();
    expect(store.list().map((c) => c.id)).toEqual([b.id]);
    store.close();
  });

  it('keeps clients across a restart', async () => {
    const p = place();
    const store = await open(p);
    const saved = store.save(null, CLIENT);
    store.close();
    const reopened = await open(p);
    expect(reopened.get(saved.id)).toEqual(saved);
    reopened.close();
  });

  it('writes no client data to disk in plain text, and the database is really encrypted', async () => {
    const p = place();
    const store = await open(p);
    store.save(null, CLIENT);
    // Before closing (WAL and ledger in place) and after.
    for (const phase of ['open', 'closed']) {
      if (phase === 'closed') store.close();
      const bytes = allBytes(p.dir);
      for (const value of [MARK, `Synthetic Client ${MARK}`, '9876543210', 'example.test']) {
        expect(bytes.includes(Buffer.from(value, 'utf8')), `${phase}: ${value}`).toBe(false);
        expect(bytes.includes(Buffer.from(value, 'utf16le')), `${phase}: ${value}`).toBe(false);
      }
      expect(readFileSync(p.dbPath).subarray(0, 16).toString('latin1')).not.toBe(
        'SQLite format 3\0',
      );
    }
    // Positive control: the key from the vault opens it, and the cipher is on.
    const vault = await SecretVault.open(p.vaultDir, backend);
    if (!vault.ok) throw new Error(vault.error.code);
    const key = await vault.data.get('database-key');
    if (!key.ok) throw new Error(key.error.code);
    const db = openEncrypted(p.dbPath, Buffer.from(key.data, 'hex'));
    expect(cipherName(db)).toBe('sqlcipher');
    expect(db.pragma('secure_delete', { simple: true })).toBe(1);
    expect(db.prepare('SELECT count(*) AS n FROM client').get()).toEqual({ n: 1 });
    db.close();
  });

  it('refuses a database whose key is missing, and changes nothing', async () => {
    const p = place();
    (await open(p)).close();
    const vault = await SecretVault.open(p.vaultDir, backend);
    if (!vault.ok) throw new Error(vault.error.code);
    await vault.data.delete('database-key');
    const before = readFileSync(p.dbPath);
    expect(await refusal(p)).toBe('STORAGE_ERROR:database-key-missing');
    expect(readFileSync(p.dbPath).equals(before)).toBe(true);
    // Still refused next time: a new key is never created over an existing database.
    expect(await refusal(p)).toBe('STORAGE_ERROR:database-key-missing');
  });

  it('refuses a database opened with the wrong key', async () => {
    const p = place();
    (await open(p)).close();
    const vault = await SecretVault.open(p.vaultDir, backend);
    if (!vault.ok) throw new Error(vault.error.code);
    await vault.data.put('database-key', randomBytes(32).toString('hex'));
    expect(await refusal(p)).toBe('STORAGE_ERROR:database-unreadable');
  });

  it('refuses a database whose commit ledger is missing (completeness unknown)', async () => {
    const p = place();
    const store = await open(p);
    store.save(null, CLIENT);
    store.close();
    rmSync(p.ledgerPath);
    expect(await refusal(p)).toBe('STORAGE_ERROR:durability-refused');
  });

  it('refuses an older copy of the database (acknowledged saves missing)', async () => {
    const p = place();
    const store = await open(p);
    store.save(null, CLIENT);
    store.close();
    const older = readFileSync(p.dbPath);
    const again = await open(p);
    again.save(null, CLIENT);
    again.close();
    writeFileSync(p.dbPath, older);
    expect(await refusal(p)).toBe('STORAGE_ERROR:durability-refused');
  });

  it('refuses a database from a newer version of the app', async () => {
    const p = place();
    (await open(p)).close();
    const vault = await SecretVault.open(p.vaultDir, backend);
    if (!vault.ok) throw new Error(vault.error.code);
    const key = await vault.data.get('database-key');
    if (!key.ok) throw new Error(key.error.code);
    const db = openEncrypted(p.dbPath, Buffer.from(key.data, 'hex'));
    db.pragma('user_version = 99');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    expect(await refusal(p)).toBe('STORAGE_ERROR:schema-too-new');
  });

  it('rejects invalid client details before anything is written', async () => {
    const store = await open(place());
    for (const bad of [
      { ...CLIENT, members: [] },
      { ...CLIENT, pincode: '012345' },
      { ...CLIENT, members: [{ relationship: 'cousin', age: 30 }] },
      { ...CLIENT, members: [{ relationship: 'self', age: 121 }] },
      { ...CLIENT, customer: { name: '' } },
      { ...CLIENT, customer: { name: 'A', phone: '12345' } },
      { ...CLIENT, preferences: { coverType: 'floater', sumInsuredPaise: 0, tenureYears: 1 } },
      { ...CLIENT, extra: true },
    ]) {
      expect(() => store.save(null, bad as never)).toThrow();
    }
    expect(store.list()).toEqual([]);
    store.close();
  });

  it('creates nothing until the store is first opened', () => {
    const p = place();
    expect(existsSync(p.dir)).toBe(false);
  });

  it('keeps the database, ledger and vault in separate, owner-only folders', async () => {
    if (process.platform === 'win32') return; // POSIX permissions
    const p = place();
    (await open(p)).close();
    for (const dir of [join(p.dir, 'data'), join(p.dir, 'ledger'), p.vaultDir]) {
      expect(statSync(dir).mode & 0o077).toBe(0);
    }
  });
});

describe('the client service and IPC channels', () => {
  function setup(enabled: boolean, opener?: () => Promise<ClientStore>) {
    const records: LogRecord[] = [];
    const logger = createLogger([(r) => records.push(r)]);
    const p = place();
    const clients = createClientService({ enabled, open: opener ?? (() => open(p)), logger });
    const insurers = createInsurerService({
      enabled: false,
      credentials: {
        saved: () => Promise.resolve(new Set()),
        save: () => Promise.resolve(),
        forget: () => Promise.resolve(false),
        read: () => Promise.resolve(null),
      },
      windows: {
        open: () => Promise.resolve(),
        state: () => ({
          open: false,
          lastFill: null,
          sessionEndsAt: null,
          lastSessionEnd: null,
          blockedOrigins: [],
        }),
        signOut: () => Promise.resolve(false),
        windowsOf: () => [],
      },
      logger,
    });
    const dispatch = createDispatcher(createHandlers({ insurers, clients, quotes: unusedQuotes }), {
      isTrustedSender: (s) => s.webContentsId === 1,
      logger,
    });
    const call = (channel: string, payload: unknown) =>
      dispatch({ webContentsId: 1, frameIsMain: true, frameUrl: 'app://fqf/' }, channel, payload);
    return { clients, call, records, p };
  }

  it('is off unless switched on: no database is created', async () => {
    const { call, p } = setup(false);
    expect(await call('clients:list', {})).toEqual({
      ok: true,
      data: { enabled: false, storageError: null, clients: [] },
    });
    expect(await call('clients:save', { client: CLIENT })).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_FLOW' },
    });
    expect(existsSync(p.dir)).toBe(false);
  });

  it('saves, lists, reads and deletes through the real dispatcher and contract', async () => {
    const { call, clients } = setup(true);
    const saved = await call('clients:save', { client: CLIENT });
    expect(saved.ok).toBe(true);
    const id = (saved as { data: { id: string } }).data.id;
    const list = await call('clients:list', {});
    expect(list).toMatchObject({ ok: true, data: { enabled: true, storageError: null } });
    expect((list as { data: { clients: unknown[] } }).data.clients).toHaveLength(1);
    expect(await call('clients:get', { id })).toMatchObject({
      ok: true,
      data: { id, client: { pincode: '560001' } },
    });
    expect(await call('clients:save', { id, client: { ...CLIENT, pincode: '400001' } })).toEqual({
      ok: true,
      data: { id },
    });
    expect(await call('clients:delete', { id })).toEqual({ ok: true, data: { deleted: true } });
    expect(await call('clients:get', { id })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    clients.close();
  });

  it('rejects invalid details at the channel, without echoing them', async () => {
    const { call, records, clients } = setup(true);
    const result = await call('clients:save', { client: { ...CLIENT, pincode: 'ABC123' } });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(JSON.stringify([result, records])).not.toContain(MARK);
    clients.close();
  });

  it('reports storage that cannot be opened, and tries again later', async () => {
    let attempts = 0;
    const { call } = setup(true, () => {
      attempts += 1;
      return Promise.reject(new ClientStoreError('SECRET_STORE_UNAVAILABLE', 'vault-unavailable'));
    });
    expect(await call('clients:list', {})).toEqual({
      ok: true,
      data: { enabled: true, storageError: 'SECRET_STORE_UNAVAILABLE', clients: [] },
    });
    expect(await call('clients:save', { client: CLIENT })).toMatchObject({
      ok: false,
      error: { code: 'SECRET_STORE_UNAVAILABLE' },
    });
    expect(attempts).toBe(2);
  });

  it('refuses a date of birth in the future', async () => {
    const { call, clients } = setup(true);
    const result = await call('clients:save', {
      client: { ...CLIENT, members: [{ relationship: 'self', age: 1, dateOfBirth: '2999-01-01' }] },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    clients.close();
  });

  it('logs what happened, never client data', async () => {
    const { call, records, clients } = setup(true);
    const saved = await call('clients:save', { client: CLIENT });
    await call('clients:delete', { id: (saved as { data: { id: string } }).data.id });
    expect(records.map((r) => r.event).filter((e) => e.startsWith('client.'))).toEqual([
      'client.saved',
      'client.deleted',
    ]);
    const text = JSON.stringify(records);
    for (const value of [MARK, '9876543210', '560001', 'example.test']) {
      expect(text).not.toContain(value);
    }
    clients.close();
  });
});

describe('date of birth, gender and marital status (schema version 2)', () => {
  it('saves and reads them back', async () => {
    const store = await open(place());
    const saved = store.save(null, {
      ...CLIENT,
      proposerMaritalStatus: 'married',
      members: [
        { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
        { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02', gender: 'female' },
        { relationship: 'son', age: 9 },
      ],
    } as never);
    expect(store.get(saved.id)?.client).toMatchObject({
      proposerMaritalStatus: 'married',
      members: [
        { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
        { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02', gender: 'female' },
        { relationship: 'son', age: 9 },
      ],
    });
    // The comparison request still carries relationship and age only.
    expect(quoteRequestFor(saved.client)?.members[0]).toEqual({ relationship: 'self', age: 41 });
    store.close();
  });

  it('rejects impossible dates, future dates and unknown values', async () => {
    const store = await open(place());
    for (const member of [
      { relationship: 'self', age: 41, dateOfBirth: '1985-02-30' },
      { relationship: 'self', age: 41, dateOfBirth: '1899-12-31' },
      { relationship: 'self', age: 41, dateOfBirth: '14/03/1985' },
      { relationship: 'self', age: 41, gender: 'other' },
    ]) {
      expect(() => store.save(null, { ...CLIENT, members: [member] } as never)).toThrow();
    }
    expect(() =>
      store.save(null, { ...CLIENT, proposerMaritalStatus: 'single' } as never),
    ).toThrow();
    store.close();
  });

  it('upgrades a version 1 database in place, keeping its clients', async () => {
    const p = place();
    // A version 1 database, as the app created it before 2 November 2026.
    const opener = createVaultOpener(p.vaultDir, backend);
    const vault = await opener();
    const key = randomBytes(32);
    await vault.put('database-key', key.toString('hex'));
    mkdirSync(join(p.dir, 'data'), { recursive: true });
    mkdirSync(join(p.dir, 'ledger'), { recursive: true });
    const db = openEncrypted(p.dbPath, key);
    const opened = openDurable(db, { ledgerPath: p.ledgerPath, key });
    if (!opened.ok) throw opened.error;
    opened.store.commit((d) => {
      d.exec(`
        CREATE TABLE client (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT,
          notes TEXT, pincode TEXT NOT NULL, cover_type TEXT, sum_insured_paise INTEGER,
          tenure_years INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE client_member (client_id TEXT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
          position INTEGER NOT NULL, relationship TEXT NOT NULL, age INTEGER NOT NULL,
          PRIMARY KEY (client_id, position));
        INSERT INTO client VALUES ('old-1', 'Synthetic Old Client', NULL, NULL, NULL, '560001',
          NULL, NULL, NULL, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
        INSERT INTO client_member VALUES ('old-1', 0, 'self', 50);
      `);
      d.pragma('user_version = 1');
    });
    db.close();

    const store = await openClientStore({
      dbPath: p.dbPath,
      ledgerPath: p.ledgerPath,
      openVault: opener,
    });
    expect(store.get('old-1')?.client).toEqual({
      customer: { name: 'Synthetic Old Client' },
      pincode: '560001',
      members: [{ relationship: 'self', age: 50 }],
    });
    store.save('old-1', {
      customer: { name: 'Synthetic Old Client' },
      pincode: '560001',
      proposerMaritalStatus: 'widowed',
      members: [{ relationship: 'self', age: 50, dateOfBirth: '1976-01-20', gender: 'female' }],
    } as never);
    expect(store.get('old-1')?.client.members[0]).toEqual({
      relationship: 'self',
      age: 50,
      dateOfBirth: '1976-01-20',
      gender: 'female',
    });
    store.close();
  });
});

describe('vehicles for motor quotes (schema version 3)', () => {
  const CAR = {
    vehicleClass: 'private-car',
    condition: 'pre-owned',
    registrationDate: '2021-06-15',
    zone: 'A',
    idvRupees: 450000,
    odDiscountPercent: 10,
    cubicCapacityCc: 1197,
    batteryOperated: false,
    claimLastYear: false,
    previousNcbPercent: 25,
  };

  it('saves a vehicle-only client (no health members) and reads it back', async () => {
    const store = await open(place());
    const saved = store.save(null, {
      customer: { name: 'Synthetic Car Owner' },
      pincode: '560001',
      members: [],
      vehicle: CAR,
    } as never);
    expect(store.get(saved.id)?.client).toEqual({
      customer: { name: 'Synthetic Car Owner' },
      pincode: '560001',
      members: [],
      vehicle: CAR,
    });
    expect(store.list()[0]).toMatchObject({ memberCount: 0, hasVehicle: true });
    expect(quoteRequestFor(saved.client)).toBeNull();
    store.close();
  });

  it('needs members or a vehicle, and rejects invalid vehicle details', async () => {
    const store = await open(place());
    const base = { customer: { name: 'X' }, pincode: '560001' };
    expect(() => store.save(null, { ...base, members: [] })).toThrow();
    for (const bad of [
      { ...CAR, vehicleClass: 'spaceship' },
      { ...CAR, zone: 'D' },
      { ...CAR, idvRupees: 0 },
      { ...CAR, previousNcbPercent: 30 },
      { ...CAR, registrationDate: '2021-02-30' },
      { ...CAR, extra: true },
    ]) {
      expect(() => store.save(null, { ...base, members: [], vehicle: bad } as never)).toThrow();
    }
    expect(store.list()).toEqual([]);
    store.close();
  });
});
