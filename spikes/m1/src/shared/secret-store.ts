// Fail-closed wrapper around an OS-backed encryption backend (Electron safeStorage in the app).
// Uses the asynchronous safeStorage API: the synchronous methods are deprecated in Electron 45
// and scheduled for removal in Electron 46. There is deliberately no plaintext fallback.

export interface SecretBackend {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ shouldReEncrypt: boolean; result: string }>;
}

export type SecretErrorCode = 'SECRET_STORE_UNAVAILABLE' | 'SECRET_DECRYPT_FAILED';

export type SecretResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: SecretErrorCode; message: string } };

export interface OpenedSecret {
  value: string;
  /** The OS key was rotated or upgraded: the caller should re-seal and store the secret again. */
  shouldReEncrypt: boolean;
}

const UNAVAILABLE = {
  ok: false,
  error: { code: 'SECRET_STORE_UNAVAILABLE', message: 'OS secure storage is unavailable' },
} as const;

export class SecretStore {
  constructor(private readonly backend: SecretBackend) {}

  async seal(plainText: string): Promise<SecretResult<Buffer>> {
    if (!(await this.backend.isAsyncEncryptionAvailable())) return UNAVAILABLE;
    return { ok: true, data: await this.backend.encryptStringAsync(plainText) };
  }

  async open(sealed: Buffer): Promise<SecretResult<OpenedSecret>> {
    if (!(await this.backend.isAsyncEncryptionAvailable())) return UNAVAILABLE;
    try {
      const { result, shouldReEncrypt } = await this.backend.decryptStringAsync(sealed);
      return { ok: true, data: { value: result, shouldReEncrypt } };
    } catch {
      // The backend's message is not passed on: it is not needed and may describe key material.
      return {
        ok: false,
        error: { code: 'SECRET_DECRYPT_FAILED', message: 'Stored secret could not be decrypted' },
      };
    }
  }
}
