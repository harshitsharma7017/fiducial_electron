// Clients' Aadhaar numbers, kept apart from the client database (decision of 3 November 2026).
//
// UIDAI's rules ask that Aadhaar numbers be kept in a separately secured store. Here that is the
// secret vault (src/main/secrets/vault: AES-256-GCM, its key wrapped by the operating system), the
// same store as the insurers' sign-in details, with one entry per client:
// - the entry name is derived from the client id by a one-way hash, so the vault's file names do
//   not reveal which client has one;
// - the renderer can set or remove a number and learn whether one is saved and its last four
//   digits, never the whole number: only the main process reads it, to fill an insurer's form;
// - it is removed when the client is deleted;
// - nothing here logs, and errors carry codes only, never values.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { aadhaarSchema } from '../../shared/contracts/client';
import { AppException } from '../ipc/dispatcher';
import { VaultOpenError, type VaultOpener } from '../secrets/vault-opener';
import type { VaultErrorCode } from '../secrets/vault/errors';
import type { SecretVault } from '../secrets/vault/vault';

const storedSchema = z.strictObject({ v: z.literal(1), number: aadhaarSchema });

export interface AadhaarVault {
  set(clientId: string, aadhaar: string): Promise<void>;
  /** Removes it; returns whether one was saved. */
  clear(clientId: string): Promise<boolean>;
  /** The last four digits, or null if none is saved. */
  lastFour(clientId: string): Promise<string | null>;
  /** Main process only: the whole number, or null if none is saved. */
  read(clientId: string): Promise<string | null>;
}

const code = (c: VaultErrorCode) =>
  c === 'SECRET_STORE_UNAVAILABLE' || c === 'KEY_UNWRAP_FAILED'
    ? 'SECRET_STORE_UNAVAILABLE'
    : 'STORAGE_ERROR';

export function aadhaarEntryName(clientId: string): string {
  return `aadhaar.${createHash('sha256').update(`fqf-aadhaar:${clientId}`).digest('hex').slice(0, 40)}`;
}

export function createAadhaarVault(openVault: VaultOpener): AadhaarVault {
  const vault = async (): Promise<SecretVault> => {
    try {
      return await openVault();
    } catch (err) {
      throw new AppException(
        err instanceof VaultOpenError ? code(err.code) : 'SECRET_STORE_UNAVAILABLE',
      );
    }
  };
  const read = async (clientId: string): Promise<string | null> => {
    const result = await (await vault()).get(aadhaarEntryName(clientId));
    if (!result.ok) {
      if (result.error.code === 'SECRET_NOT_FOUND') return null;
      throw new AppException(code(result.error.code));
    }
    try {
      return storedSchema.parse(JSON.parse(result.data)).number;
    } catch {
      throw new AppException('STORAGE_ERROR');
    }
  };
  return {
    set: async (clientId, aadhaar) => {
      const value = JSON.stringify(storedSchema.parse({ v: 1, number: aadhaar }));
      const result = await (
        await vault()
      ).put(aadhaarEntryName(clientId), value, { overwriteUnreadable: true });
      if (!result.ok) throw new AppException(code(result.error.code));
    },
    clear: async (clientId) => {
      const result = await (await vault()).delete(aadhaarEntryName(clientId));
      if (!result.ok) throw new AppException(code(result.error.code));
      return result.data;
    },
    lastFour: async (clientId) => (await read(clientId))?.slice(-4) ?? null,
    read,
  };
}
