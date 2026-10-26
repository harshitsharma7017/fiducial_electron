import { describe, expect, it, vi } from 'vitest';
import { SecretStore, type SecretBackend } from '../src/shared/secret-store';

const encrypt = vi.fn((s: string) => Promise.resolve(Buffer.from(`enc:${s}`)));

function backend(available: boolean): SecretBackend {
  encrypt.mockClear();
  return {
    isAsyncEncryptionAvailable: vi.fn(() => Promise.resolve(available)),
    encryptStringAsync: encrypt,
    decryptStringAsync: vi.fn((b: Buffer) => {
      const text = b.toString();
      if (!text.startsWith('enc:'))
        return Promise.reject(new Error('bad ciphertext: key material'));
      return Promise.resolve({ shouldReEncrypt: false, result: text.slice(4) });
    }),
  };
}

describe('SecretStore (fail closed)', () => {
  it('never encrypts or falls back to plaintext when secure storage is unavailable', async () => {
    const store = new SecretStore(backend(false));
    await expect(store.seal('s3cret')).resolves.toEqual({
      ok: false,
      error: { code: 'SECRET_STORE_UNAVAILABLE', message: 'OS secure storage is unavailable' },
    });
    expect(encrypt).not.toHaveBeenCalled();
  });

  it('round-trips when available', async () => {
    const store = new SecretStore(backend(true));
    const sealed = await store.seal('s3cret');
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    await expect(store.open(sealed.data)).resolves.toEqual({
      ok: true,
      data: { value: 's3cret', shouldReEncrypt: false },
    });
  });

  it('maps decrypt failures to a code without leaking the backend message', async () => {
    const result = await new SecretStore(backend(true)).open(Buffer.from('tampered'));
    expect(result).toEqual({
      ok: false,
      error: { code: 'SECRET_DECRYPT_FAILED', message: 'Stored secret could not be decrypted' },
    });
  });
});
