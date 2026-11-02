// Insurer sign-in details: the credential store on the real vault (with a fake OS backend), the
// service behind the IPC channels, the IPC contract, and the fill-outcome mapping.
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  CredentialError,
  createInsurerCredentials,
  type InsurerCredentials,
} from '../src/main/insurers/credentials';
import { fillOutcomeOf, isFormProblem } from '../src/main/insurers/fill-outcome';
import { createClientService } from '../src/main/clients/service';
import { createInsurerService, insurerPortalsEnabled } from '../src/main/insurers/service';
import { createDispatcher } from '../src/main/ipc/dispatcher';
import { createHandlers } from '../src/main/ipc/handlers';
import { createLogger, type LogRecord } from '../src/main/logging/logger';
import type { SecretBackend } from '../src/main/secrets/secret-store';
import { createVaultOpener } from '../src/main/secrets/vault-opener';
import { FILL_OUTCOMES } from '../src/shared/insurers/fill-outcomes';
import { ipcContract } from '../src/shared/ipc/contract';

vi.mock('electron', () => ({ app: {} }));

const root = mkdtempSync(join(tmpdir(), 'fqf-insurer-login-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let counter = 0;
const freshDir = (): string => join(root, `d${++counter}`);

/** XOR with a random IV and no integrity, like macOS safeStorage (see vault.test.ts). */
function fakeBackend(available = true): SecretBackend {
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
    isAsyncEncryptionAvailable: () => Promise.resolve(available),
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

// Synthetic sign-in details: never real ones.
const LOGIN = { username: 'SYNTHETIC.USER01', password: `Pw-${randomBytes(12).toString('hex')}` };

function allBytes(dir: string): Buffer {
  return Buffer.concat(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => readFileSync(join(e.parentPath, e.name))),
  );
}

describe('insurer credentials (encrypted vault)', () => {
  it('saves, reads back in the main process, and survives a restart', async () => {
    const dir = freshDir();
    const store = createInsurerCredentials(createVaultOpener(dir, fakeBackend()));
    await store.save('bajaj-allianz', LOGIN);
    expect(await store.read('bajaj-allianz')).toEqual(LOGIN);
    expect([...(await store.saved())]).toEqual(['bajaj-allianz']);
    const reopened = createInsurerCredentials(createVaultOpener(dir, fakeBackend()));
    expect(await reopened.read('bajaj-allianz')).toEqual(LOGIN);
    expect(await reopened.read('united-india')).toBeNull();
  });

  it('writes neither the user ID nor the password to disk in plain text', async () => {
    const dir = freshDir();
    await createInsurerCredentials(createVaultOpener(dir, fakeBackend())).save(
      'united-india',
      LOGIN,
    );
    const bytes = allBytes(dir);
    for (const value of [LOGIN.username, LOGIN.password]) {
      expect(bytes.includes(Buffer.from(value, 'utf8'))).toBe(false);
      expect(bytes.includes(Buffer.from(value, 'utf16le'))).toBe(false);
      expect(bytes.includes(Buffer.from(Buffer.from(value).toString('base64')))).toBe(false);
    }
  });

  it('forgets saved details, and reports whether there were any', async () => {
    const store = createInsurerCredentials(createVaultOpener(freshDir(), fakeBackend()));
    await store.save('niva-bupa', LOGIN);
    expect(await store.forget('niva-bupa')).toBe(true);
    expect(await store.forget('niva-bupa')).toBe(false);
    expect(await store.read('niva-bupa')).toBeNull();
    expect((await store.saved()).size).toBe(0);
  });

  it('refuses to store anything when OS secure storage is unavailable', async () => {
    const dir = freshDir();
    const store = createInsurerCredentials(createVaultOpener(dir, fakeBackend(false)));
    await expect(store.save('new-india', LOGIN)).rejects.toMatchObject({
      code: 'SECRET_STORE_UNAVAILABLE',
    });
    expect(() => readdirSync(dir)).toThrow(); // nothing was written, not even the folder
  });

  it('reports a damaged entry as unreadable, and saving again replaces it', async () => {
    const dir = freshDir();
    const store = createInsurerCredentials(createVaultOpener(dir, fakeBackend()));
    await store.save('icici-lombard', LOGIN);
    const file = join(dir, 'insurer-login.icici-lombard.fqse');
    const bytes = readFileSync(file);
    bytes[bytes.length - 1]! ^= 0xff;
    writeFileSync(file, bytes);
    await expect(store.read('icici-lombard')).rejects.toBeInstanceOf(CredentialError);
    await store.save('icici-lombard', { ...LOGIN, password: 'NewPassword-1' });
    expect(await store.read('icici-lombard')).toEqual({ ...LOGIN, password: 'NewPassword-1' });
  });

  it('rejects empty or oversized details before anything is stored', async () => {
    const store = createInsurerCredentials(createVaultOpener(freshDir(), fakeBackend()));
    await expect(store.save('bajaj-allianz', { username: '', password: 'x' })).rejects.toThrow();
    await expect(
      store.save('bajaj-allianz', { username: 'u', password: 'x'.repeat(257) }),
    ).rejects.toThrow();
    expect((await store.saved()).size).toBe(0);
  });
});

/** A credential store that records calls and holds details in memory. */
function memoryCredentials(): InsurerCredentials & { calls: string[] } {
  const saved = new Map<string, { username: string; password: string }>();
  const calls: string[] = [];
  return {
    calls,
    saved: () => Promise.resolve(new Set(saved.keys())),
    save: (id, login) => {
      calls.push(`save:${id}`);
      saved.set(id, login);
      return Promise.resolve();
    },
    forget: (id) => {
      calls.push(`forget:${id}`);
      return Promise.resolve(saved.delete(id));
    },
    read: (id) => Promise.resolve(saved.get(id) ?? null),
  };
}

function service(enabled: boolean, credentials = memoryCredentials()) {
  const records: LogRecord[] = [];
  const opened: string[] = [];
  const insurers = createInsurerService({
    enabled,
    credentials,
    windows: {
      open: (id) => {
        opened.push(id);
        return Promise.resolve();
      },
      state: (id) => ({
        open: opened.includes(id),
        lastFill: null,
        sessionEndsAt: opened.includes(id) ? new Date(Date.UTC(2026, 10, 2, 22, 0)) : null,
        lastSessionEnd: null,
      }),
      signOut: (id) => {
        const was = opened.includes(id);
        opened.splice(0, opened.length, ...opened.filter((o) => o !== id));
        return Promise.resolve(was);
      },
    },
    logger: createLogger([(r) => records.push(r)]),
  });
  return { insurers, credentials, records, opened };
}

describe('the insurer service', () => {
  it('is off unless FQF_INSURER_PORTALS=1', async () => {
    expect(insurerPortalsEnabled({})).toBe(false);
    expect(insurerPortalsEnabled({ FQF_INSURER_PORTALS: 'true' })).toBe(false);
    expect(insurerPortalsEnabled({ FQF_INSURER_PORTALS: '1' })).toBe(true);

    const { insurers, credentials, opened } = service(false);
    expect(await insurers.list()).toEqual({ enabled: false, vaultError: null, portals: [] });
    await expect(insurers.saveLogin({ id: 'bajaj-allianz', ...LOGIN })).rejects.toMatchObject({
      code: 'UNSUPPORTED_FLOW',
    });
    await expect(insurers.forgetLogin('bajaj-allianz')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FLOW',
    });
    await expect(insurers.openPortal('bajaj-allianz')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FLOW',
    });
    await expect(insurers.signOut('bajaj-allianz')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FLOW',
    });
    expect(credentials.calls).toEqual([]);
    expect(opened).toEqual([]);
  });

  it('lists every insurer with whether a sign-in is saved, never the details', async () => {
    const { insurers } = service(true);
    await insurers.saveLogin({ id: 'united-india', ...LOGIN });
    await insurers.openPortal('united-india');
    const list = await insurers.list();
    expect(list.enabled).toBe(true);
    expect(list.portals).toHaveLength(8);
    expect(list.portals.find((p) => p.id === 'united-india')).toMatchObject({
      loginSaved: true,
      windowOpen: true,
      sessionEndsAt: '2026-11-02T22:00:00.000Z',
    });
    expect(list.portals.find((p) => p.id === 'bajaj-allianz')?.sessionEndsAt).toBeNull();
    expect(JSON.stringify(list)).not.toContain(LOGIN.username);
    expect(JSON.stringify(list)).not.toContain(LOGIN.password);
    expect(ipcContract['insurers:list'].response.safeParse(list).success).toBe(true);
  });

  it('signs out of a running session, and refuses unknown insurers', async () => {
    const { insurers, opened } = service(true);
    await insurers.openPortal('niva-bupa');
    expect(await insurers.signOut('niva-bupa')).toBe(true);
    expect(opened).toEqual([]);
    expect(await insurers.signOut('niva-bupa')).toBe(false);
    await expect(insurers.signOut('no-such-insurer')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('stores sign-in details only for portals it fills', async () => {
    const { insurers, credentials } = service(true);
    for (const id of ['star-health', 'tata-aig', 'no-such-insurer']) {
      await expect(insurers.saveLogin({ id, ...LOGIN })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    }
    expect(credentials.calls).toEqual([]);
  });

  it('reports an unavailable vault without failing the list', async () => {
    const broken = memoryCredentials();
    broken.saved = () => Promise.reject(new CredentialError('SECRET_STORE_UNAVAILABLE'));
    const list = await service(true, broken).insurers.list();
    expect(list.vaultError).toBe('SECRET_STORE_UNAVAILABLE');
    expect(list.portals.every((p) => !p.loginSaved)).toBe(true);
  });

  it('logs the insurer and what happened, never the details', async () => {
    const { insurers, records } = service(true);
    await insurers.saveLogin({ id: 'new-india', ...LOGIN });
    await insurers.forgetLogin('new-india');
    expect(records.map((r) => [r.event, r['insurer']])).toEqual([
      ['insurer.login-saved', 'new-india'],
      ['insurer.login-forgotten', 'new-india'],
    ]);
    expect(JSON.stringify(records)).not.toContain(LOGIN.username);
    expect(JSON.stringify(records)).not.toContain(LOGIN.password);
  });
});

/** The client handlers are not exercised here (see client-store.test.ts). */
const unusedClients = createClientService({
  enabled: false,
  open: () => Promise.reject(new Error('not used')),
  logger: createLogger([]),
});

describe('the insurer IPC channels', () => {
  const trusted = { webContentsId: 1, frameIsMain: true, frameUrl: 'app://fqf/index.html' };

  function dispatcher() {
    const records: LogRecord[] = [];
    const { insurers, credentials } = service(true);
    const dispatch = createDispatcher(createHandlers({ insurers, clients: unusedClients }), {
      isTrustedSender: (s) => s.webContentsId === 1,
      logger: createLogger([(r) => records.push(r)]),
    });
    return { dispatch, records, credentials };
  }

  it('saves through the real dispatcher and contract', async () => {
    const { dispatch, credentials } = dispatcher();
    const result = await dispatch(trusted, 'insurers:save-login', {
      id: 'bajaj-allianz',
      ...LOGIN,
    });
    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(credentials.calls).toEqual(['save:bajaj-allianz']);
  });

  it.each([
    ['an extra field', { id: 'bajaj-allianz', ...LOGIN, remember: true }],
    ['an empty password', { id: 'bajaj-allianz', ...LOGIN, password: '' }],
    ['a line break', { id: 'bajaj-allianz', ...LOGIN, username: 'a\nb' }],
    ['a control character', { id: 'bajaj-allianz', ...LOGIN, password: 'a\u0000b' }],
    ['a long password', { id: 'bajaj-allianz', ...LOGIN, password: 'x'.repeat(257) }],
    ['a bad insurer id', { id: '../keyring', ...LOGIN }],
  ])('rejects %s, without echoing any value', async (_label, payload) => {
    const { dispatch, records, credentials } = dispatcher();
    const result = await dispatch(trusted, 'insurers:save-login', payload);
    expect(result.ok).toBe(false);
    expect(credentials.calls).toEqual([]);
    const text = JSON.stringify([result, records]);
    expect(text).not.toContain(LOGIN.password);
    expect(text).not.toContain(LOGIN.username);
  });

  it('refuses an untrusted sender before anything is stored', async () => {
    const { dispatch, credentials } = dispatcher();
    const result = await dispatch({ ...trusted, webContentsId: 2 }, 'insurers:save-login', {
      id: 'bajaj-allianz',
      ...LOGIN,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
    expect(credentials.calls).toEqual([]);
  });
});

describe('fill outcomes', () => {
  it('maps every agent result to one outcome', () => {
    expect(fillOutcomeOf({ ok: false, reason: 'wrong-origin' })).toBe('left-login-page');
    expect(fillOutcomeOf({ ok: false, reason: 'form-not-found' })).toBe('form-not-found');
    const ok = { ok: true as const, captchaFocused: false };
    expect(fillOutcomeOf({ ...ok, username: 'filled', password: 'filled' })).toBe('filled');
    expect(fillOutcomeOf({ ...ok, username: 'kept', password: 'filled' })).toBe('filled');
    expect(fillOutcomeOf({ ...ok, username: 'kept', password: 'kept' })).toBe('kept-advisor-input');
    expect(fillOutcomeOf({ ...ok, username: 'not-found', password: 'kept' })).toBe(
      'field-not-found',
    );
    expect(fillOutcomeOf({ ...ok, username: 'filled', password: 'ambiguous' })).toBe(
      'field-ambiguous',
    );
    expect(fillOutcomeOf({ ...ok, username: 'kept', password: 'wrong-type' })).toBe(
      'field-wrong-type',
    );
  });

  it('flags the outcomes that mean the portal changed', () => {
    expect(FILL_OUTCOMES.filter(isFormProblem)).toEqual([
      'form-not-found',
      'field-not-found',
      'field-ambiguous',
      'field-wrong-type',
    ]);
  });
});
