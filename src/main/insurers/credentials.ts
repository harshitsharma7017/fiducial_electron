// Saved insurer sign-in details, kept in the encrypted vault (src/main/secrets/vault).
//
// - One vault entry per insurer, holding the user ID and password together, so a save is all or
//   nothing.
// - The renderer can save and forget details, and ask whether some are saved. It can never read
//   them back: only the portal window code in the main process reads them, to fill the
//   insurer's own sign-in form.
// - Nothing here logs, and errors carry codes only, never values.
// - The vault (shared, src/main/secrets/vault-opener.ts) opens on first use. If OS secure storage
//   is unavailable, saving fails with SECRET_STORE_UNAVAILABLE; nothing is written in plain text.
import { z } from 'zod';
import type { InsurerId } from '../../shared/contracts/insurer';
import type { AppErrorCode } from '../../shared/ipc/errors';
import { VaultOpenError, type VaultOpener } from '../secrets/vault-opener';
import type { VaultErrorCode } from '../secrets/vault/errors';
import type { SecretVault } from '../secrets/vault/vault';

export interface InsurerLogin {
  username: string;
  password: string;
}

const storedLoginSchema = z.strictObject({
  v: z.literal(1),
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(256),
});

/** Thrown with an application error code; carries no secret values. */
export class CredentialError extends Error {
  constructor(readonly code: AppErrorCode) {
    super(code);
    this.name = 'CredentialError';
  }
}

function appCode(code: VaultErrorCode): AppErrorCode {
  return code === 'SECRET_STORE_UNAVAILABLE' || code === 'KEY_UNWRAP_FAILED'
    ? 'SECRET_STORE_UNAVAILABLE'
    : 'STORAGE_ERROR';
}

function entryName(id: InsurerId): string {
  return `insurer-login.${id}`;
}

export interface InsurerCredentials {
  /** Insurer ids with saved details (whether or not they can still be read). */
  saved(): Promise<ReadonlySet<string>>;
  save(id: InsurerId, login: InsurerLogin): Promise<void>;
  /** Removes saved details; returns whether any were saved. */
  forget(id: InsurerId): Promise<boolean>;
  /** Main process only: the saved details, or null if none are saved. */
  read(id: InsurerId): Promise<InsurerLogin | null>;
}

export function createInsurerCredentials(openVault: VaultOpener): InsurerCredentials {
  const vault = async (): Promise<SecretVault> => {
    try {
      return await openVault();
    } catch (err) {
      throw new CredentialError(
        err instanceof VaultOpenError ? appCode(err.code) : 'SECRET_STORE_UNAVAILABLE',
      );
    }
  };

  return {
    saved: async () => {
      const names = (await vault()).list();
      const prefix = 'insurer-login.';
      return new Set(names.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length)));
    },

    save: async (id, login) => {
      const value = JSON.stringify(storedLoginSchema.parse({ v: 1, ...login }));
      // Replacing details the vault can no longer read is what "save" means here: the advisor
      // is entering them again.
      const result = await (
        await vault()
      ).put(entryName(id), value, {
        overwriteUnreadable: true,
      });
      if (!result.ok) throw new CredentialError(appCode(result.error.code));
    },

    forget: async (id) => {
      const result = await (await vault()).delete(entryName(id));
      if (!result.ok) throw new CredentialError(appCode(result.error.code));
      return result.data;
    },

    read: async (id) => {
      const result = await (await vault()).get(entryName(id));
      if (!result.ok) {
        if (result.error.code === 'SECRET_NOT_FOUND') return null;
        throw new CredentialError(appCode(result.error.code));
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.data);
      } catch {
        throw new CredentialError('STORAGE_ERROR');
      }
      const login = storedLoginSchema.safeParse(parsed);
      if (!login.success) throw new CredentialError('STORAGE_ERROR');
      return { username: login.data.username, password: login.data.password };
    },
  };
}
