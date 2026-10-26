// Error codes for the secret vault. Messages are fixed strings: they never include secret
// values, key material, envelope bytes or underlying library messages.

export type VaultErrorCode =
  | 'SECRET_STORE_UNAVAILABLE'
  | 'KEYRING_MISSING'
  | 'KEYRING_MALFORMED'
  | 'KEYRING_CONFLICT'
  | 'KEYRING_FULL'
  | 'KEY_NOT_FOUND'
  | 'KEY_UNWRAP_FAILED'
  | 'KEY_CHECK_FAILED'
  | 'ENVELOPE_MALFORMED'
  | 'ENVELOPE_UNSUPPORTED_VERSION'
  | 'ENVELOPE_UNSUPPORTED_ALGORITHM'
  | 'SECRET_AUTH_FAILED'
  | 'SECRET_NOT_FOUND'
  | 'SECRET_UNREADABLE_EXISTS'
  | 'INVALID_NAME'
  | 'INVALID_VALUE'
  | 'RESET_NOT_CONFIRMED'
  | 'STORAGE_ERROR';

const MESSAGES: Record<VaultErrorCode, string> = {
  SECRET_STORE_UNAVAILABLE: 'OS secure storage is unavailable',
  KEYRING_MISSING: 'Stored secrets exist but their keyring is missing',
  KEYRING_MALFORMED: 'The keyring file is not valid',
  KEYRING_CONFLICT: 'The keyring was changed by another vault instance; reopen the vault',
  KEYRING_FULL: 'The keyring holds the maximum number of keys; re-encrypt and prune first',
  KEY_NOT_FOUND: 'The key for this secret is not in the keyring',
  KEY_UNWRAP_FAILED: 'OS secure storage could not unwrap the data key',
  KEY_CHECK_FAILED: 'The unwrapped data key failed its integrity check',
  ENVELOPE_MALFORMED: 'The stored secret is not a valid envelope',
  ENVELOPE_UNSUPPORTED_VERSION: 'The stored secret uses an unsupported format version',
  ENVELOPE_UNSUPPORTED_ALGORITHM: 'The stored secret uses an unsupported algorithm',
  SECRET_AUTH_FAILED: 'The stored secret failed authentication',
  SECRET_NOT_FOUND: 'No secret is stored under this name',
  SECRET_UNREADABLE_EXISTS:
    'An unreadable secret exists under this name; explicit overwrite required',
  INVALID_NAME: 'Invalid secret name',
  INVALID_VALUE: 'Invalid secret value',
  RESET_NOT_CONFIRMED: 'Vault reset requires explicit confirmation',
  STORAGE_ERROR: 'Secret storage could not be written',
};

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode) {
    super(MESSAGES[code]);
    this.name = 'VaultError';
  }
}

export type VaultResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: VaultErrorCode; message: string } };

export function fail(code: VaultErrorCode): {
  ok: false;
  error: { code: VaultErrorCode; message: string };
} {
  return { ok: false, error: { code, message: MESSAGES[code] } };
}
