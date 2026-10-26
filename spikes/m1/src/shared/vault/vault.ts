// Secret vault (Q-M1-01): application secrets encrypted with AES-256-GCM under data keys that
// are wrapped by OS-backed storage. Invariants:
// - Reads (open of an existing vault, get, list) never write. A re-wrap requested by the OS is
//   held in memory and saved with the next explicit write.
// - Every keyring change is staged on a copy, schema-validated, checked against the version on
//   disk (another instance may have changed it) and only then committed; on any failure the
//   live vault is unchanged.
// - put() refuses to replace an unreadable secret unless explicitly told to.
// - A keyring is only ever created with an exclusive (non-replacing) create, and never while
//   stored secrets exist. Recovery is an explicit, confirmed quarantine that moves files into a
//   new, unique folder; nothing is deleted or overwritten.
// - Nothing in this module logs.
// Single writer: the product must open one vault instance per folder (Electron single-instance
// lock). The keyring conflict check narrows, but cannot fully close, cross-process races.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SecretStore, type SecretBackend } from '../secret-store';
import { atomicCreate, atomicWrite, fsyncDirectory } from './atomic-write';
import { MAX_PLAINTEXT_BYTES, openEnvelope, parseEnvelope, sealEnvelope } from './envelope';
import { fail, VaultError, type VaultResult } from './errors';
import {
  createKeyEntry,
  keyringSchema,
  MAX_KEYS,
  unwrapKeyEntry,
  type KeyEntry,
  type Keyring,
} from './keyring';

export const KEYRING_FILE = 'keyring.json';
export const ENVELOPE_SUFFIX = '.fqse';
export const QUARANTINE_DIR = 'quarantine';
export const RESET_CONFIRMATION = 'DISCARD-UNREADABLE-SECRETS';
/** Rotate well before the 2^32 random-nonce limit for AES-GCM (NIST SP 800-38D). */
export const DEFAULT_MAX_ENCRYPTIONS_PER_KEY = 2 ** 20;

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** A lone UTF-16 surrogate would be silently replaced by U+FFFD when encoded as UTF-8. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export interface VaultOptions {
  maxEncryptionsPerKey?: number;
  now?: () => Date;
}

function contextFor(name: string): string {
  return `fqf-secret:v1:${name}`;
}

function serialise(keyring: Keyring): string {
  return `${JSON.stringify(keyring, null, 2)}\n`;
}

function errorCode(err: unknown): VaultResult<never> {
  return fail(err instanceof VaultError ? err.code : 'STORAGE_ERROR');
}

function envelopeNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(ENVELOPE_SUFFIX))
    .map((f) => f.slice(0, -ENVELOPE_SUFFIX.length))
    .filter((n) => NAME_PATTERN.test(n))
    .sort();
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

export class SecretVault {
  private readonly dataKeys = new Map<string, Buffer>();
  /** Re-wraps requested by the OS during reads, saved with the next explicit write. */
  private readonly pendingRewraps = new Map<string, string>();
  /** Serialises mutating operations on this instance. */
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly dir: string,
    private readonly store: SecretStore,
    private keyring: Keyring,
    /** The keyring text this instance last read or wrote; used to detect other writers. */
    private keyringText: string,
    private readonly maxEncryptions: number,
    private readonly now: () => Date,
  ) {}

  static async open(
    dir: string,
    backend: SecretBackend,
    options: VaultOptions = {},
  ): Promise<VaultResult<SecretVault>> {
    const store = new SecretStore(backend);
    const now = options.now ?? (() => new Date());
    const max = options.maxEncryptionsPerKey ?? DEFAULT_MAX_ENCRYPTIONS_PER_KEY;
    if (!(await backend.isAsyncEncryptionAvailable())) return fail('SECRET_STORE_UNAVAILABLE');

    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      return fail('STORAGE_ERROR');
    }
    const keyringPath = join(dir, KEYRING_FILE);
    if (!statSync(keyringPath, { throwIfNoEntry: false })) {
      // Never start a fresh keyring over existing secrets: they would be stranded silently.
      if (envelopeNames(dir).length > 0) return fail('KEYRING_MISSING');
      const created = await createKeyEntry(store, now());
      if (!created.ok) return created;
      const keyring: Keyring = {
        format: 'fqf-keyring',
        version: 1,
        activeKeyId: created.data.entry.id,
        keys: [created.data.entry],
      };
      const text = serialise(keyring);
      try {
        // Exclusive create: if another instance initialised meanwhile, its keyring is kept.
        atomicCreate(keyringPath, text);
      } catch (err) {
        created.data.dataKey.fill(0);
        return fail(
          (err as NodeJS.ErrnoException).code === 'EEXIST' ? 'KEYRING_CONFLICT' : 'STORAGE_ERROR',
        );
      }
      const vault = new SecretVault(dir, store, keyring, text, max, now);
      vault.dataKeys.set(created.data.entry.id, created.data.dataKey);
      return { ok: true, data: vault };
    }

    let text: string;
    let parsed: Keyring;
    try {
      text = readFileSync(keyringPath, 'utf8');
      const result = keyringSchema.safeParse(JSON.parse(text));
      if (!result.success) return fail('KEYRING_MALFORMED');
      parsed = result.data;
    } catch {
      return fail('KEYRING_MALFORMED');
    }
    const vault = new SecretVault(dir, store, parsed, text, max, now);
    // Fail fast: the active key must unwrap and verify before the vault is usable.
    const active = await vault.dataKey(parsed.activeKeyId);
    return active.ok ? { ok: true, data: vault } : active;
  }

  /**
   * Explicit, confirmed recovery: moves every vault file into a new, uniquely named folder
   * under quarantine/. Nothing is deleted or overwritten; moving the files back restores the
   * previous vault (it is only readable again if its OS key is available).
   */
  static quarantineAndReset(
    dir: string,
    confirmation: string,
    now = new Date(),
  ): VaultResult<string> {
    if (confirmation !== RESET_CONFIRMATION) return fail('RESET_NOT_CONFIRMED');
    try {
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const target = join(QUARANTINE_DIR, `${stamp}-${randomBytes(4).toString('hex')}`);
      mkdirSync(join(dir, QUARANTINE_DIR), { recursive: true, mode: 0o700 });
      mkdirSync(join(dir, target), { mode: 0o700 }); // fails rather than reuse an existing folder
      for (const entry of readdirSync(dir)) {
        if (entry !== QUARANTINE_DIR) renameSync(join(dir, entry), join(dir, target, entry));
      }
      fsyncDirectory(dir);
      return { ok: true, data: target };
    } catch (err) {
      return errorCode(err);
    }
  }

  get activeKeyId(): string {
    return this.keyring.activeKeyId;
  }

  keyIds(): string[] {
    return this.keyring.keys.map((k) => k.id);
  }

  list(): string[] {
    return envelopeNames(this.dir);
  }

  async get(name: string): Promise<VaultResult<string>> {
    if (!NAME_PATTERN.test(name)) return fail('INVALID_NAME');
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(this.dir, `${name}${ENVELOPE_SUFFIX}`));
    } catch (err) {
      return fail(
        (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'SECRET_NOT_FOUND' : 'STORAGE_ERROR',
      );
    }
    let parsed;
    try {
      parsed = parseEnvelope(bytes);
    } catch (err) {
      return fail(err instanceof VaultError ? err.code : 'ENVELOPE_MALFORMED');
    }
    const key = await this.dataKey(parsed.keyId);
    if (!key.ok) return key;
    let plain: Buffer;
    try {
      plain = openEnvelope(key.data, parsed, contextFor(name));
    } catch {
      return fail('SECRET_AUTH_FAILED');
    }
    try {
      return { ok: true, data: utf8.decode(plain) };
    } catch {
      return fail('ENVELOPE_MALFORMED');
    } finally {
      plain.fill(0);
    }
  }

  put(
    name: string,
    value: string,
    options: { overwriteUnreadable?: boolean } = {},
  ): Promise<VaultResult<null>> {
    return this.exclusive(() => this.putUnlocked(name, value, options));
  }

  /** Adds a new active key; existing keys become retired but still decrypt. */
  rotateKey(): Promise<VaultResult<string>> {
    return this.exclusive(() => this.rotateUnlocked());
  }

  /** Re-encrypts every readable secret under the active key. Unreadable secrets are left untouched. */
  reencryptAll(): Promise<
    VaultResult<{ reencrypted: string[]; skipped: { name: string; code: string }[] }>
  > {
    return this.exclusive(async () => {
      const reencrypted: string[] = [];
      const skipped: { name: string; code: string }[] = [];
      for (const name of this.list()) {
        const current = await this.get(name);
        if (!current.ok) {
          skipped.push({ name, code: current.error.code });
          continue;
        }
        const keyId = parseEnvelope(
          readFileSync(join(this.dir, `${name}${ENVELOPE_SUFFIX}`)),
        ).keyId;
        if (keyId === this.keyring.activeKeyId) continue;
        const written = await this.putUnlocked(name, current.data, {});
        if (!written.ok) return written;
        reencrypted.push(name);
      }
      return { ok: true, data: { reencrypted, skipped } };
    });
  }

  /**
   * Removes retired keys that no envelope references. If any envelope cannot be parsed, nothing
   * is removed, because that envelope might depend on a retired key.
   */
  pruneRetiredKeys(): Promise<VaultResult<string[]>> {
    return this.exclusive(() => Promise.resolve(this.pruneUnlocked()));
  }

  /** Wipes cached data keys from memory (best effort; see evidence for JS memory limits). */
  close(): void {
    for (const key of this.dataKeys.values()) key.fill(0);
    this.dataKeys.clear();
    this.pendingRewraps.clear();
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async putUnlocked(
    name: string,
    value: string,
    options: { overwriteUnreadable?: boolean },
  ): Promise<VaultResult<null>> {
    if (!NAME_PATTERN.test(name)) return fail('INVALID_NAME');
    if (
      typeof value !== 'string' ||
      LONE_SURROGATE.test(value) ||
      Buffer.byteLength(value, 'utf8') > MAX_PLAINTEXT_BYTES
    ) {
      return fail('INVALID_VALUE');
    }
    const path = join(this.dir, `${name}${ENVELOPE_SUFFIX}`);
    if (statSync(path, { throwIfNoEntry: false })) {
      const current = await this.get(name);
      if (!current.ok && !options.overwriteUnreadable) return fail('SECRET_UNREADABLE_EXISTS');
    }
    if (this.activeEntry().encryptions >= this.maxEncryptions) {
      const rotated = await this.rotateUnlocked();
      if (!rotated.ok) return rotated;
    }
    const activeId = this.keyring.activeKeyId;
    const key = await this.dataKey(activeId);
    if (!key.ok) return key;
    // Count the encryption (and persist it) before using the key, so it is never under-counted.
    const candidate = structuredClone(this.keyring);
    const entry = candidate.keys.find((k) => k.id === activeId);
    if (!entry) return fail('KEYRING_MALFORMED');
    entry.encryptions += 1;
    const committed = this.commit(candidate);
    if (!committed.ok) return committed;
    const plaintext = Buffer.from(value, 'utf8');
    try {
      atomicWrite(path, sealEnvelope(key.data, activeId, contextFor(name), plaintext));
      return { ok: true, data: null };
    } catch (err) {
      return errorCode(err);
    } finally {
      plaintext.fill(0);
    }
  }

  private pruneUnlocked(): VaultResult<string[]> {
    const referenced = new Set<string>();
    for (const name of this.list()) {
      try {
        referenced.add(
          parseEnvelope(readFileSync(join(this.dir, `${name}${ENVELOPE_SUFFIX}`))).keyId,
        );
      } catch {
        return { ok: true, data: [] };
      }
    }
    const removed = this.keyring.keys
      .filter((k) => k.status === 'retired' && !referenced.has(k.id))
      .map((k) => k.id);
    if (removed.length === 0) return { ok: true, data: [] };
    const candidate = structuredClone(this.keyring);
    candidate.keys = candidate.keys.filter((k) => !removed.includes(k.id));
    const committed = this.commit(candidate);
    if (!committed.ok) return committed;
    for (const id of removed) {
      this.dataKeys.get(id)?.fill(0);
      this.dataKeys.delete(id);
      this.pendingRewraps.delete(id);
    }
    return { ok: true, data: removed };
  }

  private async rotateUnlocked(): Promise<VaultResult<string>> {
    if (this.keyring.keys.length >= MAX_KEYS) return fail('KEYRING_FULL');
    const created = await createKeyEntry(this.store, this.now());
    if (!created.ok) return created;
    const candidate = structuredClone(this.keyring);
    for (const k of candidate.keys) k.status = 'retired';
    candidate.keys.push(created.data.entry);
    candidate.activeKeyId = created.data.entry.id;
    const committed = this.commit(candidate);
    if (!committed.ok) {
      created.data.dataKey.fill(0);
      return committed;
    }
    this.dataKeys.set(created.data.entry.id, created.data.dataKey);
    return { ok: true, data: created.data.entry.id };
  }

  /**
   * The only path that writes the keyring after creation. Applies pending re-wraps, validates
   * the candidate, refuses if another writer changed the file, then writes it atomically.
   * The live keyring is replaced only after the write succeeded.
   */
  private commit(candidate: Keyring): VaultResult<null> {
    for (const entry of candidate.keys) {
      const rewrapped = this.pendingRewraps.get(entry.id);
      if (rewrapped) entry.wrapped = rewrapped;
    }
    if (!keyringSchema.safeParse(candidate).success) return fail('KEYRING_MALFORMED');
    const path = join(this.dir, KEYRING_FILE);
    try {
      if (readFileSync(path, 'utf8') !== this.keyringText) return fail('KEYRING_CONFLICT');
    } catch {
      return fail('KEYRING_CONFLICT');
    }
    const text = serialise(candidate);
    try {
      atomicWrite(path, text);
    } catch (err) {
      return errorCode(err);
    }
    this.keyring = candidate;
    this.keyringText = text;
    this.pendingRewraps.clear();
    return { ok: true, data: null };
  }

  private activeEntry(): KeyEntry {
    const entry = this.keyring.keys.find((k) => k.id === this.keyring.activeKeyId);
    if (!entry) throw new VaultError('KEYRING_MALFORMED');
    return entry;
  }

  /** Unwraps and verifies a data key. Never writes: a requested re-wrap is only queued. */
  private async dataKey(keyId: string): Promise<VaultResult<Buffer>> {
    const cached = this.dataKeys.get(keyId);
    if (cached) return { ok: true, data: cached };
    const entry = this.keyring.keys.find((k) => k.id === keyId);
    if (!entry) return fail('KEY_NOT_FOUND');
    const unwrapped = await unwrapKeyEntry(this.store, entry);
    if (!unwrapped.ok) return unwrapped;
    if (unwrapped.data.rewrapped) this.pendingRewraps.set(keyId, unwrapped.data.rewrapped);
    this.dataKeys.set(keyId, unwrapped.data.dataKey);
    return { ok: true, data: unwrapped.data.dataKey };
  }
}
