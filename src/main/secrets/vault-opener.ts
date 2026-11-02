// One vault per folder (the vault is single-writer): every user of <userData>/secrets (insurer
// sign-in details, the database key) shares this opener. It opens on first use and, if opening
// fails (for example OS secure storage is locked), tries again on the next call.
import type { SecretBackend } from './secret-store';
import type { VaultErrorCode } from './vault/errors';
import { SecretVault } from './vault/vault';

export class VaultOpenError extends Error {
  constructor(readonly code: VaultErrorCode) {
    super(code);
    this.name = 'VaultOpenError';
  }
}

export type VaultOpener = () => Promise<SecretVault>;

export function createVaultOpener(dir: string, backend: SecretBackend): VaultOpener {
  let opening: Promise<SecretVault> | null = null;
  return () => {
    opening ??= SecretVault.open(dir, backend).then((result) => {
      if (!result.ok) {
        opening = null;
        throw new VaultOpenError(result.error.code);
      }
      return result.data;
    });
    return opening;
  };
}
