// Keeping an insurer's sign-in (its session cookies) across app restarts, encrypted.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Cookie, CookiesSetDetails } from 'electron';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createSessionKeeper,
  sessionCookies,
  toSetDetails,
  type CookieJar,
} from '../src/main/insurers/session-keeper';
import type { SecretBackend } from '../src/main/secrets/secret-store';

const root = mkdtempSync(join(tmpdir(), 'fqf-session-keeper-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let counter = 0;
const freshDir = (): string => join(root, `k${++counter}`);

/** A stand-in for the OS key: reversible, but the stored bytes never contain the text. */
function fakeBackend(available = true): SecretBackend {
  return {
    isAsyncEncryptionAvailable: () => Promise.resolve(available),
    encryptStringAsync: (text) =>
      Promise.resolve(Buffer.from(`sealed:${Buffer.from(text).toString('base64')}`)),
    decryptStringAsync: (bytes) => {
      const s = bytes.toString();
      if (!s.startsWith('sealed:')) return Promise.reject(new Error('bad'));
      return Promise.resolve({
        shouldReEncrypt: false,
        result: Buffer.from(s.slice(7), 'base64').toString(),
      });
    },
  };
}

function jar(cookies: Partial<Cookie>[] = []): CookieJar & { set_: CookiesSetDetails[] } {
  const set_: CookiesSetDetails[] = [];
  return {
    set_,
    get: () => Promise.resolve(cookies as Cookie[]),
    set: (d) => {
      set_.push(d);
      return Promise.resolve();
    },
  };
}

const SIGN_IN: Partial<Cookie> = {
  name: 'JSESSIONID',
  value: 'synthetic-session-value',
  domain: 'portal.example.test',
  hostOnly: true,
  path: '/GCWebPortal',
  secure: true,
  httpOnly: true,
  session: true,
  sameSite: 'lax',
};
const LASTING: Partial<Cookie> = {
  name: 'pref',
  value: 'x',
  domain: '.example.test',
  hostOnly: false,
  path: '/',
  secure: true,
  session: false,
  expirationDate: 1_900_000_000,
};
const HOME = 'https://portal.example.test/GCWebPortal/login/HomeAction.do';

describe('the insurer session keeper', () => {
  it('keeps only session cookies, and puts them back as session cookies for their own host', async () => {
    const dir = freshDir();
    const keeper = createSessionKeeper(dir, fakeBackend());
    await keeper.save('united-india', jar([SIGN_IN, LASTING]), HOME);

    const restored = jar();
    expect(await keeper.restore('united-india', restored)).toEqual({ lastUrl: HOME });
    expect(restored.set_).toEqual([
      {
        url: 'https://portal.example.test/GCWebPortal',
        name: 'JSESSIONID',
        value: 'synthetic-session-value',
        path: '/GCWebPortal',
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
      },
    ]);
    // No expiry: still a session cookie after it is put back.
    expect(restored.set_[0]).not.toHaveProperty('expirationDate');
  });

  it('never stores the cookie value or the page address in the clear', async () => {
    const dir = freshDir();
    await createSessionKeeper(dir, fakeBackend()).save('united-india', jar([SIGN_IN]), HOME);
    const stored = readFileSync(join(dir, 'united-india.session'), 'utf8');
    expect(stored).not.toContain('synthetic-session-value');
    expect(stored).not.toContain('HomeAction');
  });

  it('writes nothing when the OS key is unavailable', async () => {
    const dir = freshDir();
    await createSessionKeeper(dir, fakeBackend(false)).save('united-india', jar([SIGN_IN]), HOME);
    expect(existsSync(join(dir, 'united-india.session'))).toBe(false);
  });

  it('forgets on sign-out: the file is deleted and nothing comes back', async () => {
    const dir = freshDir();
    const keeper = createSessionKeeper(dir, fakeBackend());
    await keeper.save('united-india', jar([SIGN_IN]), HOME);
    keeper.forget('united-india');
    expect(existsSync(join(dir, 'united-india.session'))).toBe(false);
    expect(await keeper.restore('united-india', jar())).toBeNull();
  });

  it('does not write a save that was still being sealed when the advisor signed out', async () => {
    const dir = freshDir();
    const keeper = createSessionKeeper(dir, fakeBackend());
    const saving = keeper.save('united-india', jar([SIGN_IN]), HOME);
    keeper.forget('united-india');
    await saving;
    expect(existsSync(join(dir, 'united-india.session'))).toBe(false);
  });

  it('deletes and ignores a file it cannot read', async () => {
    const dir = freshDir();
    const keeper = createSessionKeeper(dir, fakeBackend());
    await keeper.save('united-india', jar([SIGN_IN]), HOME);
    writeFileSync(join(dir, 'united-india.session'), 'not sealed');
    const restored = jar();
    expect(await keeper.restore('united-india', restored)).toBeNull();
    expect(restored.set_).toEqual([]);
    expect(existsSync(join(dir, 'united-india.session'))).toBe(false);
  });

  it('keeps a domain cookie for its domain, and a host-only cookie for its host only', () => {
    const [domainWide] = sessionCookies([{ ...LASTING, session: true } as Cookie]);
    expect(toSetDetails(domainWide!)).toMatchObject({
      url: 'https://example.test/',
      domain: '.example.test',
    });
    const [hostOnly] = sessionCookies([SIGN_IN as Cookie]);
    expect(toSetDetails(hostOnly!)).not.toHaveProperty('domain');
  });

  it('refuses an insurer id that is not a plain name', async () => {
    const keeper = createSessionKeeper(freshDir(), fakeBackend());
    expect(() => keeper.forget('../escape')).toThrow();
    expect(await keeper.restore('../escape', jar())).toBeNull();
  });
});
