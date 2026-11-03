// Clients' Aadhaar numbers, and travel clients' passport numbers, kept apart from the client
// database (decisions of 3 November 2026).
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
// Passport numbers are kept the same way, in entries of their own ("passport.<hash>").
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { aadhaarSchema } from '../../shared/contracts/client';
import { passportNumberSchema } from '../../shared/contracts/travel';
import { AppException } from '../ipc/dispatcher';
import { VaultOpenError, type VaultOpener } from '../secrets/vault-opener';
import type { VaultErrorCode } from '../secrets/vault/errors';
import type { SecretVault } from '../secrets/vault/vault';

/** One identity number per client, in the secret vault. */
export interface IdNumberVault {
  set(clientId: string, number: string): Promise<void>;
  /** Removes it; returns whether one was saved. */
  clear(clientId: string): Promise<boolean>;
  /** The last four characters, or null if none is saved. */
  lastFour(clientId: string): Promise<string | null>;
  /** Main process only: the whole number, or null if none is saved. */
  read(clientId: string): Promise<string | null>;
}
export type AadhaarVault = IdNumberVault;
export type PassportVault = IdNumberVault;

const code = (c: VaultErrorCode) =>
  c === 'SECRET_STORE_UNAVAILABLE' || c === 'KEY_UNWRAP_FAILED'
    ? 'SECRET_STORE_UNAVAILABLE'
    : 'STORAGE_ERROR';

const entryName = (kind: 'aadhaar' | 'passport', clientId: string): string =>
  `${kind}.${createHash('sha256').update(`fqf-${kind}:${clientId}`).digest('hex').slice(0, 40)}`;

export function aadhaarEntryName(clientId: string): string {
  return entryName('aadhaar', clientId);
}

export function passportEntryName(clientId: string): string {
  return entryName('passport', clientId);
}

export function createAadhaarVault(openVault: VaultOpener): AadhaarVault {
  return createIdNumberVault(openVault, aadhaarEntryName, aadhaarSchema);
}

export function createPassportVault(openVault: VaultOpener): PassportVault {
  return createIdNumberVault(openVault, passportEntryName, passportNumberSchema);
}

function createIdNumberVault(
  openVault: VaultOpener,
  nameOf: (clientId: string) => string,
  numberSchema: z.ZodType<string, string>,
): IdNumberVault {
  const storedSchema = z.strictObject({ v: z.literal(1), number: numberSchema });
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
    const result = await (await vault()).get(nameOf(clientId));
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
    set: async (clientId, number) => {
      const value = JSON.stringify(storedSchema.parse({ v: 1, number }));
      const result = await (
        await vault()
      ).put(nameOf(clientId), value, { overwriteUnreadable: true });
      if (!result.ok) throw new AppException(code(result.error.code));
    },
    clear: async (clientId) => {
      const result = await (await vault()).delete(nameOf(clientId));
      if (!result.ok) throw new AppException(code(result.error.code));
      return result.data;
    },
    lastFour: async (clientId) => (await read(clientId))?.slice(-4) ?? null,
    read,
  };
}
