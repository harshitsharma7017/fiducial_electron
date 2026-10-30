// Q-M1-01: deterministic tests for the authenticated secret vault. The fake OS backend mimics
// the measured macOS safeStorage behaviour: it does NOT authenticate, so tampering yields
// garbage instead of an error, and the vault's own checks must catch it.
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import type { SecretBackend } from '../src/shared/secret-store';
import type * as AtomicWrite from '../src/shared/vault/atomic-write';
import { listFiles } from '../src/shared/file-scan';
import { openEnvelope, parseEnvelope } from '../src/shared/vault/envelope';
import type { VaultErrorCode } from '../src/shared/vault/errors';
import {
  ENVELOPE_SUFFIX,
  KEYRING_FILE,
  QUARANTINE_DIR,
  RESET_CONFIRMATION,
  SecretVault,
} from '../src/shared/vault/vault';

// Fault injection for the vault's writes that works on every OS: while `faults.writes` is set,
// atomicWrite throws as a failing disk would. (Directory permissions are POSIX-only: on Windows a
// read-only directory still accepts new files, so they cannot make a write fail there.)
const faults = vi.hoisted(() => ({ writes: false }));
vi.mock('../src/shared/vault/atomic-write', async (importOriginal) => {
  const actual = await importOriginal<typeof AtomicWrite>();
  return {
    ...actual,
    atomicWrite: (target: string, data: Buffer | string) => {
      if (faults.writes) throw Object.assign(new Error('injected write failure'), { code: 'EIO' });
      actual.atomicWrite(target, data);
    },
  };
});

const root = mkdtempSync(join(tmpdir(), 'fqf-vault-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let counter = 0;
function freshDir(): string {
  counter += 1;
  return join(root, `v${counter}`);
}

/**
 * XOR "encryption" with a random IV and NO integrity, like the measured safeStorage v10
 * behaviour. The random IV makes every wrap unique, so an unexpected re-wrap write is visible.
 */
function fakeBackend(
  seed: string,
  opts: { available?: boolean; shouldReEncrypt?: boolean; throwOnDecrypt?: boolean } = {},
): SecretBackend {
  const stream = (iv: Buffer, n: number): Buffer => {
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i += 32) {
      createHash('sha256')
        .update(`${seed}:${iv.toString('hex')}:${i}`)
        .digest()
        .copy(out, i);
    }
    return out;
  };
  const xor = (iv: Buffer, b: Buffer): Buffer => {
    const s = stream(iv, b.length);
    return Buffer.from(b.map((v, i) => v ^ (s[i] ?? 0)));
  };
  return {
    isAsyncEncryptionAvailable: () => Promise.resolve(opts.available ?? true),
    encryptStringAsync: (plain) => {
      const iv = randomBytes(8);
      return Promise.resolve(
        Buffer.concat([Buffer.from('v10'), iv, xor(iv, Buffer.from(plain, 'utf8'))]),
      );
    },
    decryptStringAsync: (blob) => {
      if (
        opts.throwOnDecrypt ||
        blob.length < 11 ||
        !blob.subarray(0, 3).equals(Buffer.from('v10'))
      ) {
        return Promise.reject(new Error('decrypt failed'));
      }
      return Promise.resolve({
        shouldReEncrypt: opts.shouldReEncrypt ?? false,
        result: xor(blob.subarray(3, 11), blob.subarray(11)).toString('utf8'),
      });
    },
  };
}

const OS = fakeBackend('os-key-1');

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    listFiles(dir).map((f) => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]),
  );
}

async function openOk(dir: string, backend = OS): Promise<SecretVault> {
  const r = await SecretVault.open(dir, backend);
  if (!r.ok) throw new Error(`open failed: ${r.error.code}`);
  return r.data;
}

function envelopePath(dir: string, name: string): string {
  return join(dir, `${name}${ENVELOPE_SUFFIX}`);
}

const SECRET = 'portal-password: Tr0ub4dor&3 ₹ ✓';

let consoleSpies: MockInstance[] = [];
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  // Requirement 7: the vault never logs, on success or failure.
  for (const spy of consoleSpies) {
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }
});

describe('round trip and restart', () => {
  it('stores and reads secrets, including empty and unicode, across a reopen', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    expect((await v.put('portal.icici', SECRET)).ok).toBe(true);
    expect((await v.put('empty', '')).ok).toBe(true);
    v.close();
    const reopened = await openOk(dir);
    expect(await reopened.get('portal.icici')).toEqual({ ok: true, data: SECRET });
    expect(await reopened.get('empty')).toEqual({ ok: true, data: '' });
    expect(reopened.list()).toEqual(['empty', 'portal.icici']);
  });

  it('writes no plaintext secret or raw data key to disk', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('a', SECRET);
    const all = listFiles(dir).map((f) => readFileSync(f));
    expect(all.some((b) => b.includes(Buffer.from(SECRET, 'utf8')))).toBe(false);
  });
});

describe('envelope tampering (every byte, two bit patterns)', () => {
  it('rejects every single-byte modification and never returns plaintext', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('target', SECRET);
    const path = envelopePath(dir, 'target');
    const original = readFileSync(path);
    const codes = new Map<VaultErrorCode, number>();
    for (const mask of [0x01, 0x80]) {
      for (let i = 0; i < original.length; i++) {
        const tampered = Buffer.from(original);
        tampered[i] = (tampered[i] ?? 0) ^ mask;
        writeFileSync(path, tampered);
        const r = await v.get('target');
        expect(r.ok, `byte ${i} mask ${mask}`).toBe(false);
        if (!r.ok) codes.set(r.error.code, (codes.get(r.error.code) ?? 0) + 1);
      }
    }
    writeFileSync(path, original);
    expect(await v.get('target')).toEqual({ ok: true, data: SECRET });
    expect([...codes.keys()].every((c) => c !== 'SECRET_NOT_FOUND')).toBe(true);
  });

  it('maps each field to the expected failure', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('t', SECRET);
    const path = envelopePath(dir, 't');
    const original = readFileSync(path);
    const L = original[6]!;
    const nonceStart = 7 + L;
    const ctStart = nonceStart + 12;
    const tagStart = original.length - 16;
    const edit = async (fn: (b: Buffer) => Buffer): Promise<VaultErrorCode | 'OK'> => {
      writeFileSync(path, fn(Buffer.from(original)));
      const r = await v.get('t');
      return r.ok ? 'OK' : r.error.code;
    };
    const flip = (i: number) => (b: Buffer) => ((b[i] = b[i]! ^ 0x01), b);
    const set = (i: number, value: number) => (b: Buffer) => ((b[i] = value), b);

    expect(await edit(flip(0))).toBe('ENVELOPE_MALFORMED'); // magic
    expect(await edit(set(4, 2))).toBe('ENVELOPE_UNSUPPORTED_VERSION');
    expect(await edit(set(4, 0))).toBe('ENVELOPE_UNSUPPORTED_VERSION');
    expect(await edit(set(5, 2))).toBe('ENVELOPE_UNSUPPORTED_ALGORITHM');
    expect(await edit(set(6, 0))).toBe('ENVELOPE_MALFORMED'); // key id length
    expect(await edit(set(6, 200))).toBe('ENVELOPE_MALFORMED');
    expect(await edit(set(7, original[7] === 0x61 ? 0x62 : 0x61))).toBe('KEY_NOT_FOUND'); // key id
    expect(await edit(set(7, 0x2e))).toBe('ENVELOPE_MALFORMED'); // key id with an invalid char
    expect(await edit(flip(nonceStart))).toBe('SECRET_AUTH_FAILED'); // nonce
    expect(await edit(flip(ctStart))).toBe('SECRET_AUTH_FAILED'); // ciphertext
    expect(await edit(flip(tagStart))).toBe('SECRET_AUTH_FAILED'); // tag (first byte)
    expect(await edit(flip(original.length - 1))).toBe('SECRET_AUTH_FAILED'); // tag (last byte)
    expect(await edit((b) => Buffer.concat([b, Buffer.from([0])]))).toBe('SECRET_AUTH_FAILED'); // extended
    writeFileSync(path, original);
  });

  it('rejects every truncation, empty input, random bytes and a legacy raw safeStorage blob', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('t', SECRET);
    const path = envelopePath(dir, 't');
    const original = readFileSync(path);
    for (let len = 0; len < original.length; len++) {
      writeFileSync(path, original.subarray(0, len));
      expect((await v.get('t')).ok, `length ${len}`).toBe(false);
    }
    for (const junk of [
      Buffer.alloc(0),
      randomBytes(80),
      Buffer.concat([Buffer.from('v10'), randomBytes(48)]),
    ]) {
      writeFileSync(path, junk);
      const r = await v.get('t');
      expect(r.ok ? 'OK' : r.error.code).toBe('ENVELOPE_MALFORMED');
    }
  });

  it('rejects an envelope moved to another secret name (context binding)', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('alpha', SECRET);
    copyFileSync(envelopePath(dir, 'alpha'), envelopePath(dir, 'beta'));
    const r = await v.get('beta');
    expect(r.ok ? 'OK' : r.error.code).toBe('SECRET_AUTH_FAILED');
  });

  it('rejects decryption with a wrong data key', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('t', SECRET);
    const parsed = parseEnvelope(readFileSync(envelopePath(dir, 't')));
    expect(() => openEnvelope(randomBytes(32), parsed, 'fqf-secret:v1:t')).toThrow(
      /failed authentication/,
    );
  });
});

describe('keyring failures fail closed and change nothing', () => {
  async function prepared(): Promise<{ dir: string; before: Record<string, string> }> {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('t', SECRET);
    v.close();
    return { dir, before: snapshot(dir) };
  }

  it('detects every single-byte tamper of the wrapped data key (unauthenticated OS wrapper)', async () => {
    const { dir } = await prepared();
    const keyringPath = join(dir, KEYRING_FILE);
    const original = readFileSync(keyringPath, 'utf8');
    const keyring = JSON.parse(original) as { keys: { wrapped: string }[] };
    const wrapped = Buffer.from(keyring.keys[0]!.wrapped, 'base64');
    for (let i = 3; i < wrapped.length; i++) {
      const tampered = Buffer.from(wrapped);
      tampered[i] = tampered[i]! ^ 0x01;
      keyring.keys[0]!.wrapped = tampered.toString('base64');
      writeFileSync(keyringPath, JSON.stringify(keyring));
      const before = snapshot(dir);
      const r = await SecretVault.open(dir, OS);
      expect(r.ok, `wrapped byte ${i}`).toBe(false);
      if (!r.ok) expect(['KEY_CHECK_FAILED', 'KEY_UNWRAP_FAILED']).toContain(r.error.code);
      expect(snapshot(dir)).toEqual(before);
    }
    writeFileSync(keyringPath, original);
    expect(await (await openOk(dir)).get('t')).toEqual({ ok: true, data: SECRET });
  });

  it('rejects a tampered key-check value', async () => {
    const { dir, before } = await prepared();
    const keyringPath = join(dir, KEYRING_FILE);
    const keyring = JSON.parse(readFileSync(keyringPath, 'utf8')) as { keys: { check: string }[] };
    const check = Buffer.from(keyring.keys[0]!.check, 'base64');
    check[0] = check[0]! ^ 0x01;
    keyring.keys[0]!.check = check.toString('base64');
    writeFileSync(keyringPath, JSON.stringify(keyring));
    const r = await SecretVault.open(dir, OS);
    expect(r.ok ? 'OK' : r.error.code).toBe('KEY_CHECK_FAILED');
    expect(snapshot(dir)[envelopePath(dir, 't')]).toBe(before[envelopePath(dir, 't')]);
  });

  it('rejects a different OS key (garbage unwrap) and an OS store that refuses to decrypt', async () => {
    const { dir, before } = await prepared();
    const foreign = await SecretVault.open(dir, fakeBackend('os-key-2'));
    expect(foreign.ok ? 'OK' : foreign.error.code).toBe('KEY_CHECK_FAILED');
    const refusing = await SecretVault.open(dir, fakeBackend('os-key-1', { throwOnDecrypt: true }));
    expect(refusing.ok ? 'OK' : refusing.error.code).toBe('KEY_UNWRAP_FAILED');
    expect(snapshot(dir)).toEqual(before);
  });

  it('refuses to start a new keyring when secrets exist but the keyring is missing', async () => {
    const { dir } = await prepared();
    rmSync(join(dir, KEYRING_FILE));
    const before = snapshot(dir);
    const r = await SecretVault.open(dir, OS);
    expect(r.ok ? 'OK' : r.error.code).toBe('KEYRING_MISSING');
    expect(snapshot(dir)).toEqual(before);
    expect(existsSync(join(dir, KEYRING_FILE))).toBe(false);
  });

  it.each([
    ['invalid JSON', '{ not json'],
    ['wrong format', JSON.stringify({ format: 'other', version: 1, activeKeyId: 'a', keys: [] })],
    ['unsupported version', 'VERSION2'],
    ['two active keys', 'TWO_ACTIVE'],
  ])('rejects a malformed keyring (%s)', async (_label, content) => {
    const { dir } = await prepared();
    const keyringPath = join(dir, KEYRING_FILE);
    const keyring = JSON.parse(readFileSync(keyringPath, 'utf8')) as Record<string, unknown> & {
      keys: Record<string, unknown>[];
    };
    let text = content;
    if (content === 'VERSION2') text = JSON.stringify({ ...keyring, version: 2 });
    if (content === 'TWO_ACTIVE') {
      text = JSON.stringify({
        ...keyring,
        keys: [...keyring.keys, { ...keyring.keys[0], id: 'kz-1' }],
      });
    }
    writeFileSync(keyringPath, text);
    const before = snapshot(dir);
    const r = await SecretVault.open(dir, OS);
    expect(r.ok ? 'OK' : r.error.code).toBe('KEYRING_MALFORMED');
    expect(snapshot(dir)).toEqual(before);
  });

  it('reports a missing key for an envelope whose key was removed from the keyring', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('old', SECRET);
    const oldKey = v.activeKeyId;
    await v.rotateKey();
    const keyringPath = join(dir, KEYRING_FILE);
    const keyring = JSON.parse(readFileSync(keyringPath, 'utf8')) as { keys: { id: string }[] };
    keyring.keys = keyring.keys.filter((k) => k.id !== oldKey);
    writeFileSync(keyringPath, JSON.stringify(keyring));
    const r = await (await openOk(dir)).get('old');
    expect(r.ok ? 'OK' : r.error.code).toBe('KEY_NOT_FOUND');
  });

  it('does nothing at all when OS secure storage is unavailable', async () => {
    const dir = freshDir();
    const r = await SecretVault.open(dir, fakeBackend('os-key-1', { available: false }));
    expect(r.ok ? 'OK' : r.error.code).toBe('SECRET_STORE_UNAVAILABLE');
    expect(existsSync(dir)).toBe(false);
  });
});

describe('no silent overwrite or reset', () => {
  it('refuses to replace an unreadable secret unless explicitly told to', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('t', SECRET);
    const path = envelopePath(dir, 't');
    const corrupted = readFileSync(path);
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0x01;
    writeFileSync(path, corrupted);
    const refused = await v.put('t', 'replacement');
    expect(refused.ok ? 'OK' : refused.error.code).toBe('SECRET_UNREADABLE_EXISTS');
    expect(readFileSync(path).equals(corrupted)).toBe(true);
    expect((await v.put('t', 'replacement', { overwriteUnreadable: true })).ok).toBe(true);
    expect(await v.get('t')).toEqual({ ok: true, data: 'replacement' });
  });

  it('a failed read leaves every file byte-identical', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('t', SECRET);
    const path = envelopePath(dir, 't');
    const tampered = readFileSync(path);
    tampered[20] = tampered[20]! ^ 0x01;
    writeFileSync(path, tampered);
    const before = snapshot(dir);
    for (let i = 0; i < 3; i++) expect((await v.get('t')).ok).toBe(false);
    expect(snapshot(dir)).toEqual(before);
  });

  it('reset requires the confirmation token and quarantines rather than deletes', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('t', SECRET);
    rmSync(join(dir, KEYRING_FILE));
    const before = snapshot(dir);
    const refused = SecretVault.quarantineAndReset(dir, 'yes');
    expect(refused.ok ? 'OK' : refused.error.code).toBe('RESET_NOT_CONFIRMED');
    expect(snapshot(dir)).toEqual(before);
    const reset = SecretVault.quarantineAndReset(
      dir,
      RESET_CONFIRMATION,
      new Date('2026-10-26T00:00:00Z'),
    );
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(existsSync(join(dir, reset.data, 't.fqse'))).toBe(true);
    expect(readdirSync(dir)).toEqual([QUARANTINE_DIR]);
    const fresh = await openOk(dir);
    expect(fresh.list()).toEqual([]);
  });
});

describe('nonces, usage limits and rotation', () => {
  it('uses a distinct random nonce for every encryption', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    const nonces = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      await v.put('n', `value-${i}`);
      nonces.add(parseEnvelope(readFileSync(envelopePath(dir, 'n'))).nonce.toString('hex'));
    }
    expect(nonces.size).toBe(1000);
    const keyring = JSON.parse(readFileSync(join(dir, KEYRING_FILE), 'utf8')) as {
      keys: { encryptions: number }[];
    };
    expect(keyring.keys[0]!.encryptions).toBe(1000);
  });

  it('rotates automatically at the per-key limit and old secrets stay readable', async () => {
    const dir = freshDir();
    const r = await SecretVault.open(dir, OS, { maxEncryptionsPerKey: 3 });
    if (!r.ok) throw new Error(r.error.code);
    const v = r.data;
    const first = v.activeKeyId;
    for (const n of ['a', 'b', 'c']) await v.put(n, `${n}-secret`);
    expect(v.activeKeyId).toBe(first);
    await v.put('d', 'd-secret'); // 4th encryption under the first key would exceed the limit
    expect(v.activeKeyId).not.toBe(first);
    expect(parseEnvelope(readFileSync(envelopePath(dir, 'd'))).keyId).toBe(v.activeKeyId);
    expect(await v.get('a')).toEqual({ ok: true, data: 'a-secret' });
  });

  it('explicit rotation, re-encryption and pruning keep every secret readable', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    const first = v.activeKeyId;
    for (const n of ['a', 'b']) await v.put(n, `${n}-secret`);
    const rotated = await v.rotateKey();
    expect(rotated.ok && rotated.data).toBe(v.activeKeyId);
    await v.put('c', 'c-secret');
    expect(await v.pruneRetiredKeys()).toEqual({ ok: true, data: [] }); // first key still referenced
    const re = await v.reencryptAll();
    expect(re.ok && re.data.reencrypted).toEqual(['a', 'b']);
    for (const n of ['a', 'b', 'c']) {
      expect(parseEnvelope(readFileSync(envelopePath(dir, n))).keyId).toBe(v.activeKeyId);
    }
    expect(await v.pruneRetiredKeys()).toEqual({ ok: true, data: [first] });
    expect(v.keyIds()).toEqual([v.activeKeyId]);
    const reopened = await openOk(dir);
    for (const n of ['a', 'b', 'c']) {
      expect(await reopened.get(n)).toEqual({ ok: true, data: `${n}-secret` });
    }
  });

  it('re-wraps the data key when the OS reports a key change, without touching secrets', async () => {
    const dir = freshDir();
    await (await openOk(dir)).put('t', SECRET);
    const envelopeBefore = readFileSync(envelopePath(dir, 't'));
    const rewrap = await openOk(dir, fakeBackend('os-key-1', { shouldReEncrypt: true }));
    expect(await rewrap.get('t')).toEqual({ ok: true, data: SECRET });
    expect(readFileSync(envelopePath(dir, 't')).equals(envelopeBefore)).toBe(true);
  });
});

describe('input validation', () => {
  it('rejects unsafe names and oversized values', async () => {
    const v = await openOk(freshDir());
    for (const name of ['', '../x', 'A', '.hidden', 'a/b', 'x'.repeat(65)]) {
      const r = await v.put(name, 'v');
      expect(r.ok ? 'OK' : r.error.code).toBe('INVALID_NAME');
    }
    const big = await v.put('big', 'x'.repeat(16 * 1024 + 1));
    expect(big.ok ? 'OK' : big.error.code).toBe('INVALID_VALUE');
    const missing = await v.get('missing');
    expect(missing.ok ? 'OK' : missing.error.code).toBe('SECRET_NOT_FOUND');
  });
});

describe('review findings (regression tests)', () => {
  it('R1: a second instance cannot overwrite a keyring another instance changed', async () => {
    const dir = freshDir();
    const a = await openOk(dir);
    await a.put('x', 'one');
    const b = await openOk(dir);
    await a.rotateKey();
    await a.put('y', 'two'); // encrypted under the new key
    const bPut = await b.put('z', 'three');
    expect(bPut.ok ? 'OK' : bPut.error.code).toBe('KEYRING_CONFLICT');
    const c = await openOk(dir);
    expect(await c.get('x')).toEqual({ ok: true, data: 'one' });
    expect(await c.get('y')).toEqual({ ok: true, data: 'two' });
  });

  it('R2: keyring initialisation never overwrites a keyring created concurrently', async () => {
    const other = freshDir();
    await (await openOk(other)).put('t', SECRET);
    const foreignKeyring = readFileSync(join(other, KEYRING_FILE));
    const dir = freshDir();
    // Simulates another process finishing initialisation while this one is wrapping its key.
    const racing: SecretBackend = {
      ...OS,
      encryptStringAsync: async (plain) => {
        writeFileSync(join(dir, KEYRING_FILE), foreignKeyring);
        return OS.encryptStringAsync(plain);
      },
    };
    const r = await SecretVault.open(dir, racing);
    expect(r.ok ? 'OK' : r.error.code).toBe('KEYRING_CONFLICT');
    expect(readFileSync(join(dir, KEYRING_FILE)).equals(foreignKeyring)).toBe(true);
  });

  it('R3: get() writes nothing even when the OS asks for a re-wrap', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('old', 'old-secret');
    await v.rotateKey();
    await v.put('new', 'new-secret');
    v.close();
    const w = await openOk(dir, fakeBackend('os-key-1', { shouldReEncrypt: true }));
    const before = snapshot(dir);
    expect(await w.get('old')).toEqual({ ok: true, data: 'old-secret' });
    expect(snapshot(dir)).toEqual(before);
    // The queued re-wrap is saved by the next explicit write, and the secret stays readable.
    const wrappedBefore = (
      JSON.parse(readFileSync(join(dir, KEYRING_FILE), 'utf8')) as { keys: { wrapped: string }[] }
    ).keys.map((k) => k.wrapped);
    expect((await w.put('another', 'x')).ok).toBe(true);
    const wrappedAfter = (
      JSON.parse(readFileSync(join(dir, KEYRING_FILE), 'utf8')) as { keys: { wrapped: string }[] }
    ).keys.map((k) => k.wrapped);
    expect(wrappedAfter).not.toEqual(wrappedBefore);
    const reopened = await openOk(dir);
    expect(await reopened.get('old')).toEqual({ ok: true, data: 'old-secret' });
  });

  it('R4: rotation refuses to exceed the keyring size limit instead of bricking the vault', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    let last: Awaited<ReturnType<SecretVault['rotateKey']>> | undefined;
    for (let i = 0; i < 16; i++) last = await v.rotateKey();
    expect(last && !last.ok ? last.error.code : 'OK').toBe('KEYRING_FULL');
    expect(v.keyIds()).toHaveLength(16);
    expect((await SecretVault.open(dir, OS)).ok).toBe(true);
  });

  it('R5: rejects ill-formed Unicode instead of silently altering the value', async () => {
    const v = await openOk(freshDir());
    const r = await v.put('s', 'abc\uD800def');
    expect(r.ok ? 'OK' : r.error.code).toBe('INVALID_VALUE');
  });

  it('R6: two resets at the same instant never overwrite an earlier quarantine', async () => {
    const dir = freshDir();
    const at = new Date('2026-10-26T00:00:00Z');
    await (await openOk(dir)).put('t', 'first');
    const r1 = SecretVault.quarantineAndReset(dir, RESET_CONFIRMATION, at);
    await (await openOk(dir)).put('t', 'second');
    const r2 = SecretVault.quarantineAndReset(dir, RESET_CONFIRMATION, at);
    expect(r1.ok && r2.ok && r1.data !== r2.data).toBe(true);
    if (!r1.ok || !r2.ok) return;
    const restored = freshDir();
    cpSync(join(dir, r1.data), restored, { recursive: true });
    expect(await (await openOk(restored)).get('t')).toEqual({ ok: true, data: 'first' });
  });

  it('R7: a failed rotation leaves the live vault unchanged (injected write failure, every OS)', async () => {
    const dir = freshDir();
    const v = await openOk(dir);
    await v.put('t', SECRET);
    const before = { active: v.activeKeyId, ids: v.keyIds(), files: snapshot(dir) };
    faults.writes = true;
    try {
      const r = await v.rotateKey();
      expect(r.ok ? 'OK' : r.error.code).toBe('STORAGE_ERROR');
    } finally {
      faults.writes = false;
    }
    expect({ active: v.activeKeyId, ids: v.keyIds(), files: snapshot(dir) }).toEqual(before);
    expect(await v.get('t')).toEqual({ ok: true, data: SECRET });
    // Control: the same rotation succeeds once writes work again.
    expect((await v.rotateKey()).ok).toBe(true);
  });

  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')(
    'R7: a failed rotation leaves the live vault unchanged (read-only directory, POSIX)',
    async () => {
      const dir = freshDir();
      const v = await openOk(dir);
      await v.put('t', SECRET);
      const before = { active: v.activeKeyId, ids: v.keyIds() };
      chmodSync(dir, 0o500);
      try {
        const r = await v.rotateKey();
        expect(r.ok ? 'OK' : r.error.code).toBe('STORAGE_ERROR');
      } finally {
        chmodSync(dir, 0o700);
      }
      expect({ active: v.activeKeyId, ids: v.keyIds() }).toEqual(before);
      expect(await v.get('t')).toEqual({ ok: true, data: SECRET });
    },
  );
});
