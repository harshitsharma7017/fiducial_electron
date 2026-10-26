// Keyring: random 256-bit data keys, each wrapped by OS-backed storage (Electron safeStorage).
// safeStorage ciphertext is not integrity-protected on macOS (M1 S5), so every unwrapped key is
// checked against a stored key-check value before use; a mismatch fails closed.
import { hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { SecretStore } from '../secret-store';
import { KEY_BYTES, KEY_ID_PATTERN } from './envelope';
import { fail, type VaultResult } from './errors';

const CHECK_BYTES = 16;
/** Upper bound on keys in one keyring (current plus retired ones still in use). */
export const MAX_KEYS = 16;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Canonical base64 of exactly 32 bytes. */
const KEY_B64 = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

const keyEntrySchema = z
  .object({
    id: z.string().regex(KEY_ID_PATTERN),
    wrapped: z.string().min(4).max(4096).regex(BASE64),
    check: z.string().length(24).regex(BASE64),
    createdAt: z.string().max(40),
    encryptions: z.number().int().min(0),
    status: z.enum(['active', 'retired']),
  })
  .strict();

export const keyringSchema = z
  .object({
    format: z.literal('fqf-keyring'),
    version: z.literal(1),
    activeKeyId: z.string().regex(KEY_ID_PATTERN),
    keys: z.array(keyEntrySchema).min(1).max(MAX_KEYS),
  })
  .strict()
  .refine((k) => new Set(k.keys.map((e) => e.id)).size === k.keys.length, 'duplicate key ids')
  .refine(
    (k) =>
      k.keys.filter((e) => e.status === 'active').length === 1 &&
      k.keys.find((e) => e.id === k.activeKeyId)?.status === 'active',
    'exactly one active key, matching activeKeyId',
  );

export type Keyring = z.infer<typeof keyringSchema>;
export type KeyEntry = Keyring['keys'][number];

export function keyCheck(dataKey: Buffer, keyId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', dataKey, Buffer.alloc(0), `fqf-vault:v1:key-check:${keyId}`, CHECK_BYTES),
  );
}

export function newKeyId(now: Date): string {
  return `k${now.getTime().toString(36)}-${randomBytes(4).toString('hex')}`;
}

/** Generates and wraps a new data key. */
export async function createKeyEntry(
  store: SecretStore,
  now: Date,
): Promise<VaultResult<{ entry: KeyEntry; dataKey: Buffer }>> {
  const dataKey = randomBytes(KEY_BYTES);
  const id = newKeyId(now);
  const sealed = await store.seal(dataKey.toString('base64'));
  if (!sealed.ok) return fail('SECRET_STORE_UNAVAILABLE');
  return {
    ok: true,
    data: {
      dataKey,
      entry: {
        id,
        wrapped: sealed.data.toString('base64'),
        check: keyCheck(dataKey, id).toString('base64'),
        createdAt: now.toISOString(),
        encryptions: 0,
        status: 'active',
      },
    },
  };
}

/**
 * Unwraps and verifies a data key. `rewrapped` is set when the OS key changed
 * (safeStorage shouldReEncrypt) and the verified key was wrapped again.
 */
export async function unwrapKeyEntry(
  store: SecretStore,
  entry: KeyEntry,
): Promise<VaultResult<{ dataKey: Buffer; rewrapped: string | null }>> {
  const opened = await store.open(Buffer.from(entry.wrapped, 'base64'));
  if (!opened.ok) {
    return fail(
      opened.error.code === 'SECRET_STORE_UNAVAILABLE'
        ? 'SECRET_STORE_UNAVAILABLE'
        : 'KEY_UNWRAP_FAILED',
    );
  }
  // safeStorage may return garbage for a corrupted blob instead of an error.
  if (!KEY_B64.test(opened.data.value)) return fail('KEY_CHECK_FAILED');
  const dataKey = Buffer.from(opened.data.value, 'base64');
  const expected = Buffer.from(entry.check, 'base64');
  const actual = keyCheck(dataKey, entry.id);
  if (
    dataKey.length !== KEY_BYTES ||
    expected.length !== CHECK_BYTES ||
    !timingSafeEqual(expected, actual)
  ) {
    dataKey.fill(0);
    return fail('KEY_CHECK_FAILED');
  }
  let rewrapped: string | null = null;
  if (opened.data.shouldReEncrypt) {
    const sealed = await store.seal(dataKey.toString('base64'));
    if (sealed.ok) rewrapped = sealed.data.toString('base64');
  }
  return { ok: true, data: { dataKey, rewrapped } };
}
