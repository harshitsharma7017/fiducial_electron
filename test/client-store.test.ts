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
import {
  aadhaarEntryName,
  createAadhaarVault,
  createPassportVault,
  passportEntryName,
} from '../src/main/clients/aadhaar-vault';
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
    const clients = createClientService({
      enabled,
      open: opener ?? (() => open(p)),
      aadhaar: createAadhaarVault(createVaultOpener(p.vaultDir, backend)),
      passport: createPassportVault(createVaultOpener(p.vaultDir, backend)),
      logger,
    });
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
        pagesOf: () => [],
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

  // Aadhaar numbers, kept apart in the secret vault. UIDAI's published test number (sandbox), with
  // a valid check digit.
  const AADHAAR = '9999 4105 7058';
  const HOLDER = {
    customer: { name: 'Synthetic Aadhaar Holder' },
    pincode: '560001',
    members: [{ relationship: 'self', age: 40 }],
  };
  const idOf = (result: unknown) => (result as { data: { id: string } }).data.id;

  it('keeps an Aadhaar number in the vault, never in the database, showing only its last four digits', async () => {
    const { clients, call, records, p } = setup(true);
    const id = idOf(await call('clients:save', { client: HOLDER, aadhaar: AADHAAR }));
    expect(await call('clients:get', { id })).toMatchObject({
      ok: true,
      data: { id, aadhaarLastFour: '7058' },
    });
    // Only the main process reads the whole number.
    expect(await clients.aadhaarFor(id)).toBe('999941057058');
    // Its own vault entry, named by a hash of the client id; nowhere in plain text on disk.
    expect(existsSync(join(p.vaultDir, `${aadhaarEntryName(id)}.fqse`))).toBe(true);
    const bytes = allBytes(p.dir);
    for (const value of ['999941057058', '9999 4105 7058', id]) {
      expect(bytes.includes(Buffer.from(value, 'utf8')), value).toBe(false);
    }
    clients.close();
    // The database itself has no trace of it.
    const vault = await SecretVault.open(p.vaultDir, backend);
    if (!vault.ok) throw new Error(vault.error.code);
    const key = await vault.data.get('database-key');
    if (!key.ok) throw new Error(key.error.code);
    const db = openEncrypted(p.dbPath, Buffer.from(key.data, 'hex'));
    expect(JSON.stringify(db.prepare('SELECT * FROM client').all())).not.toContain('7058');
    db.close();
    expect(JSON.stringify(records)).not.toContain('7058');
  });

  it('keeps the Aadhaar number when not sent, removes it with null, and deletes it with the client', async () => {
    const { clients, call } = setup(true);
    const id = idOf(await call('clients:save', { client: HOLDER, aadhaar: AADHAAR }));
    await call('clients:save', { id, client: { ...HOLDER, pincode: '400001' } });
    expect(await clients.aadhaarLastFour(id)).toBe('7058');
    await call('clients:save', { id, client: HOLDER, aadhaar: null });
    expect(await clients.aadhaarLastFour(id)).toBeNull();
    await call('clients:save', { id, client: HOLDER, aadhaar: AADHAAR });
    await call('clients:delete', { id });
    expect(await clients.aadhaarFor(id)).toBeNull();
    clients.close();
  });

  it('rejects an Aadhaar number with a wrong check digit or format, without echoing it', async () => {
    const { clients, call, records } = setup(true);
    for (const bad of ['999941057059', '099941057058', '99994105705', 'abcdefghijkl']) {
      const result = await call('clients:save', { client: HOLDER, aadhaar: bad });
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
      expect(JSON.stringify([result, records])).not.toContain(bad);
    }
    expect((await clients.list()).clients).toEqual([]);
    clients.close();
  });

  it('saves, lists, reads and deletes vehicles through the real dispatcher and contract', async () => {
    const { call, clients } = setup(true);
    const vehicle = {
      vehicleClass: 'two-wheeler',
      condition: 'new',
      registrationDate: '2026-10-01',
      zone: 'B',
      idvRupees: 90000,
      cubicCapacityCc: 125,
    };
    const saved = await call('vehicles:save', { saved: { name: 'Synthetic Scooter', vehicle } });
    const id = idOf(saved);
    expect(await call('vehicles:list', {})).toMatchObject({
      ok: true,
      data: { vehicles: [{ id, name: 'Synthetic Scooter', vehicleClass: 'two-wheeler' }] },
    });
    expect(await call('vehicles:get', { id })).toMatchObject({
      ok: true,
      data: { id, saved: { name: 'Synthetic Scooter', vehicle } },
    });
    expect(
      await call('vehicles:save', { saved: { name: 'X', vehicle: { ...vehicle, zone: 'Z' } } }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(await call('vehicles:delete', { id })).toEqual({ ok: true, data: { deleted: true } });
    expect(await call('vehicles:get', { id })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    clients.close();
  });

  // Travel clients, kept apart from health clients; passport and Aadhaar numbers in the vault.
  const TRAVELLER = {
    customer: { name: 'Synthetic Traveller', phone: '9876543210' },
    pincode: '560001',
    dateOfBirth: '1986-04-12',
    gender: 'female',
    maritalStatus: 'married',
    occupation: 'Salaried',
    proposal: { pan: 'ABCDE1234F', nomineeRelationship: 'spouse' },
    passport: { issuingAuthority: 'Passport Office, Bengaluru', expiryDate: '2031-06-30' },
  };

  it('saves, lists, reads and deletes travel clients, apart from health clients', async () => {
    const { call, clients } = setup(true);
    const healthId = idOf(await call('clients:save', { client: HOLDER }));
    const id = idOf(
      await call('travellers:save', {
        traveller: TRAVELLER,
        passport: 'z 1234567',
        aadhaar: AADHAAR,
      }),
    );
    expect(await call('travellers:list', {})).toEqual({
      ok: true,
      data: {
        travellers: [
          {
            id,
            name: 'Synthetic Traveller',
            pincode: '560001',
            dateOfBirth: '1986-04-12',
            updatedAt: expect.any(String) as string,
          },
        ],
      },
    });
    expect(await call('travellers:get', { id })).toMatchObject({
      ok: true,
      data: { id, traveller: TRAVELLER, aadhaarLastFour: '7058', passportLastFour: '4567' },
    });
    // Each list has only its own: the travel client is not a health client, nor the reverse.
    expect((await clients.list()).clients.map((c) => c.id)).toEqual([healthId]);
    expect(await call('travellers:get', { id: healthId })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(await call('clients:get', { id })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    // Updating keeps the numbers unless sent; deleting removes them with the travel client.
    await call('travellers:save', { id, traveller: { ...TRAVELLER, pincode: '400001' } });
    expect(await clients.passportFor(id)).toBe('Z1234567');
    expect(await call('travellers:delete', { id })).toEqual({ ok: true, data: { deleted: true } });
    expect(await clients.passportFor(id)).toBeNull();
    expect(await clients.aadhaarFor(id)).toBeNull();
    clients.close();
  });

  it('keeps the passport number in the vault only, never in the database, the log or a reply', async () => {
    const { clients, call, records, p } = setup(true);
    const id = idOf(await call('travellers:save', { traveller: TRAVELLER, passport: 'Z1234567' }));
    expect(existsSync(join(p.vaultDir, `${passportEntryName(id)}.fqse`))).toBe(true);
    expect(allBytes(p.dir).includes(Buffer.from('Z1234567', 'utf8'))).toBe(false);
    expect(JSON.stringify([await call('travellers:get', { id }), records])).not.toContain(
      'Z1234567',
    );
    await call('travellers:save', { id, traveller: TRAVELLER, passport: null });
    expect(await clients.passportLastFour(id)).toBeNull();
    clients.close();
  });

  it('rejects malformed travel clients and passport numbers, without echoing them', async () => {
    const { call, clients, records } = setup(true);
    for (const request of [
      { traveller: TRAVELLER, passport: 'Z-12' },
      { traveller: { ...TRAVELLER, dateOfBirth: undefined } },
      { traveller: { ...TRAVELLER, dateOfBirth: '2099-01-01' } },
      {
        traveller: {
          ...TRAVELLER,
          passport: { issueDate: '2031-01-01', expiryDate: '2030-01-01' },
        },
      },
      { traveller: { ...TRAVELLER, members: [{ relationship: 'self', age: 40 }] } },
    ]) {
      const result = await call('travellers:save', request);
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
      expect(JSON.stringify([result, records])).not.toContain('Z-12');
    }
    expect(await clients.listTravellers()).toEqual([]);
    clients.close();
  });

  // Rural clients (schema version 7): a farmer, their animals and farm, apart from the others.
  const RURAL = {
    customer: { name: 'Synthetic Farmer', phone: '9876543210' },
    pincode: '411001',
    gender: 'male',
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'spouse',
    animals: [
      {
        kind: 'cattle',
        cattleType: 'milch-cow',
        origin: 'cross-breed',
        gender: 'female',
        breed: 'HF, black and white',
        ageYears: 4,
        ageMonths: 2,
        tagNumber: 'TAG-0001',
        marketValueRupees: 60000,
      },
      {
        kind: 'goat',
        origin: 'indigenous',
        gender: 'female',
        breed: 'Osmanabadi',
        ageYears: 2,
        ageMonths: 0,
        marketValueRupees: 9000,
        sumInsuredRupees: 9000,
      },
    ],
    farm: { dwellingSumInsuredRupees: 300000, contentsSumInsuredRupees: 50000, katcha: false },
  };

  it('saves, lists, reads and deletes rural clients, apart from health and travel clients', async () => {
    const { call, clients } = setup(true);
    const healthId = idOf(await call('clients:save', { client: HOLDER }));
    const id = idOf(await call('rural:save', { rural: RURAL }));
    expect(await call('rural:list', {})).toEqual({
      ok: true,
      data: {
        rural: [
          {
            id,
            name: 'Synthetic Farmer',
            pincode: '411001',
            animalCount: 2,
            hasFarm: true,
            updatedAt: expect.any(String) as string,
          },
        ],
      },
    });
    expect(await call('rural:get', { id })).toMatchObject({ ok: true, data: { id, rural: RURAL } });
    expect((await clients.list()).clients.map((c) => c.id)).toEqual([healthId]);
    expect(await clients.listTravellers()).toEqual([]);
    expect(await call('rural:get', { id: healthId })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await call('rural:save', { id, rural: { ...RURAL, animals: [] } });
    expect((await clients.getRural(id)).rural.animals).toEqual([]);
    expect(await call('rural:delete', { id })).toEqual({ ok: true, data: { deleted: true } });
    expect(await clients.listRural()).toEqual([]);
    clients.close();
  });

  it('rejects malformed rural clients', async () => {
    const { call, clients } = setup(true);
    const [cow, goat] = RURAL.animals;
    for (const rural of [
      { ...RURAL, animals: [{ ...cow, cattleType: undefined }] },
      { ...RURAL, animals: [{ ...goat, cattleType: 'milch-cow' }] },
      { ...RURAL, animals: [{ ...cow, ageMonths: 12 }] },
      { ...RURAL, animals: [{ ...cow, marketValueRupees: 0 }] },
      { ...RURAL, dateOfBirth: '2099-01-01' },
      { ...RURAL, animals: Array.from({ length: 21 }, () => cow) },
    ]) {
      expect(await call('rural:save', { rural })).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
    }
    expect(await clients.listRural()).toEqual([]);
    clients.close();
  });

  // Marine clients (schema version 8): the policy holder of a voyage, a business or a person.
  const BUSINESS = {
    kind: 'organization',
    customer: { name: 'Synthetic Exports Pvt Ltd', phone: '9876543210' },
    pincode: '400001',
    address: '5 Synthetic Dock Road',
    pan: 'ABCDE1234F',
    registrationNo: 'U12345MH2020PTC000001',
    registrationDate: '2020-05-01',
    msme: true,
    organisationType: 'Private Limited Company',
  };

  it('saves, lists, reads and deletes marine clients, apart from the others', async () => {
    const { call, clients } = setup(true);
    const id = idOf(await call('marine:save', { marine: BUSINESS }));
    expect(await call('marine:list', {})).toEqual({
      ok: true,
      data: {
        marine: [
          {
            id,
            name: 'Synthetic Exports Pvt Ltd',
            pincode: '400001',
            kind: 'organization',
            updatedAt: expect.any(String) as string,
          },
        ],
      },
    });
    expect(await call('marine:get', { id })).toMatchObject({
      ok: true,
      data: { id, marine: BUSINESS },
    });
    expect(await clients.listRural()).toEqual([]);
    expect(await call('rural:get', { id })).toMatchObject({ ok: false });
    expect(await call('marine:delete', { id })).toEqual({ ok: true, data: { deleted: true } });
    expect(await clients.listMarine()).toEqual([]);
    clients.close();
  });

  it('rejects malformed marine clients', async () => {
    const { call, clients } = setup(true);
    for (const marine of [
      { ...BUSINESS, gender: 'male' },
      { ...BUSINESS, kind: 'individual' },
      { ...BUSINESS, pan: 'ABC' },
      { ...BUSINESS, registrationDate: '2099-01-01' },
      { ...BUSINESS, organisationType: 'Partnership' },
    ]) {
      expect(await call('marine:save', { marine })).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
    }
    expect(await clients.listMarine()).toEqual([]);
    clients.close();
  });

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

describe('saved vehicles, kept on their own (schema version 5)', () => {
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

  it('saves, lists, updates and deletes a vehicle, with no client involved', async () => {
    const store = await open(place());
    const saved = store.vehicles.save(null, {
      name: '  Swift   - Synthetic ',
      vehicle: CAR,
    } as never);
    expect(store.vehicles.get(saved.id)?.saved).toEqual({
      name: 'Swift - Synthetic',
      vehicle: CAR,
    });
    expect(store.vehicles.list()).toEqual([
      {
        id: saved.id,
        name: 'Swift - Synthetic',
        vehicleClass: 'private-car',
        condition: 'pre-owned',
        updatedAt: '2026-11-02T10:00:00.000Z',
      },
    ]);
    expect(store.list()).toEqual([]); // no client was created
    store.vehicles.save(saved.id, { name: 'Swift', vehicle: { ...CAR, zone: 'B' } } as never);
    expect(store.vehicles.get(saved.id)?.saved.vehicle.zone).toBe('B');
    expect(store.vehicles.get(saved.id)?.createdAt).toBe(saved.createdAt);
    expect(store.vehicles.delete(saved.id)).toBe(true);
    expect(store.vehicles.delete(saved.id)).toBe(false);
    expect(store.vehicles.list()).toEqual([]);
    store.close();
  });

  it('rejects invalid vehicles, and clients without members, before anything is written', async () => {
    const store = await open(place());
    for (const bad of [
      { ...CAR, vehicleClass: 'spaceship' },
      { ...CAR, zone: 'D' },
      { ...CAR, idvRupees: 0 },
      { ...CAR, previousNcbPercent: 30 },
      { ...CAR, registrationDate: '2021-02-30' },
      { ...CAR, extra: true },
    ]) {
      expect(() => store.vehicles.save(null, { name: 'X', vehicle: bad } as never)).toThrow();
    }
    expect(() => store.vehicles.save(null, { name: '', vehicle: CAR } as never)).toThrow();
    expect(() =>
      store.save(null, { customer: { name: 'X' }, pincode: '560001', members: [] }),
    ).toThrow();
    expect(store.vehicles.list()).toEqual([]);
    expect(store.list()).toEqual([]);
    store.close();
  });

  it('upgrades a version 4 database: vehicles move to their own list, vehicle-only clients go', async () => {
    const p = place();
    // A version 4 database as the app wrote it before 3 November 2026: vehicles inside clients.
    const opener = createVaultOpener(p.vaultDir, backend);
    const vault = await opener();
    const key = randomBytes(32);
    await vault.put('database-key', key.toString('hex'));
    mkdirSync(join(p.dir, 'data'), { recursive: true });
    mkdirSync(join(p.dir, 'ledger'), { recursive: true });
    const db = openEncrypted(p.dbPath, key);
    const opened = openDurable(db, { ledgerPath: p.ledgerPath, key });
    if (!opened.ok) throw opened.error;
    const car = JSON.stringify(CAR);
    opened.store.commit((d) => {
      d.exec(`
        CREATE TABLE client (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT,
          notes TEXT, pincode TEXT NOT NULL, cover_type TEXT, sum_insured_paise INTEGER,
          tenure_years INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          proposer_marital_status TEXT, vehicle_json TEXT, proposal_json TEXT);
        CREATE TABLE client_member (client_id TEXT NOT NULL REFERENCES client(id) ON DELETE CASCADE,
          position INTEGER NOT NULL, relationship TEXT NOT NULL, age INTEGER NOT NULL,
          date_of_birth TEXT, gender TEXT, PRIMARY KEY (client_id, position));
      `);
      const add = d.prepare(
        `INSERT INTO client (id, name, pincode, created_at, updated_at, vehicle_json)
         VALUES (?, ?, '560001', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', ?)`,
      );
      add.run('family', 'Synthetic Family', car); // members and a vehicle
      add.run('car-only', 'Synthetic Car Owner', car); // a vehicle only
      add.run('health-only', 'Synthetic Health', null); // members only
      d.prepare("INSERT INTO client_member VALUES ('family', 0, 'self', 45, NULL, NULL)").run();
      d.prepare(
        "INSERT INTO client_member VALUES ('health-only', 0, 'self', 30, NULL, NULL)",
      ).run();
      d.pragma('user_version = 4');
    });
    db.close();

    const store = await open(p);
    expect(store.removedByUpgrade).toEqual(['car-only']);
    expect(
      store
        .list()
        .map((c) => c.id)
        .sort(),
    ).toEqual(['family', 'health-only']);
    expect(store.get('family')?.client).not.toHaveProperty('vehicle');
    const vehicles = store.vehicles.list();
    expect(vehicles.map((v) => v.name).sort()).toEqual(['Synthetic Car Owner', 'Synthetic Family']);
    for (const v of vehicles) expect(store.vehicles.get(v.id)?.saved.vehicle).toEqual(CAR);
    store.close();

    // The client table no longer has a vehicle column; opening again changes nothing.
    const again = await open(p);
    expect(again.removedByUpgrade).toEqual([]);
    expect(again.vehicles.list()).toHaveLength(2);
    // Version 6: the clients stay health clients; the travel client list starts empty.
    expect(again.travellers.list()).toEqual([]);
    expect(again.list()).toHaveLength(2);
    again.close();
  });
});

describe('proposal details for e-proposals (schema version 4)', () => {
  const PROPOSAL = {
    pan: 'abcde 1234f',
    address: '  12, Synthetic Street,   Bengaluru ',
    occupation: 'Software Professional',
    nomineeRelationship: 'spouse',
    highRiskCustomer: false,
  };
  const base = {
    customer: { name: 'Synthetic Proposer' },
    pincode: '560001',
    members: [{ relationship: 'self', age: 40 }],
  };

  it('saves them normalised and reads them back; never holds an Aadhaar number', async () => {
    const store = await open(place());
    const saved = store.save(null, { ...base, proposal: PROPOSAL } as never);
    expect(store.get(saved.id)?.client.proposal).toEqual({
      pan: 'ABCDE1234F',
      address: '12, Synthetic Street, Bengaluru',
      occupation: 'Software Professional',
      nomineeRelationship: 'spouse',
      highRiskCustomer: false,
    });
    expect(() =>
      store.save(null, { ...base, proposal: { ...PROPOSAL, aadhaar: '000011112222' } } as never),
    ).toThrow();
    store.close();
  });

  it('rejects an invalid PAN or nominee relationship', async () => {
    const store = await open(place());
    for (const bad of [
      { pan: 'ABCD1234F' },
      { pan: '12345ABCDE' },
      { nomineeRelationship: 'cousin' },
    ]) {
      expect(() => store.save(null, { ...base, proposal: bad } as never)).toThrow();
    }
    expect(store.list()).toEqual([]);
    store.close();
  });
});
