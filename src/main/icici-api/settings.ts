// ICICI Lombard partner API settings: which environment premiums come from (UAT or production, or
// none) and the partner login for each, kept in the encrypted vault (src/main/secrets/vault),
// like insurer sign-in details. The screens can save, forget and see whether a login is saved;
// they never read one back. Nothing here logs, and errors carry codes only.
import { z } from 'zod';
import {
  ICICI_API_MODES,
  iciciApiLoginSchema,
  type IciciApiLogin,
  type IciciApiMode,
  type IciciApiStatus,
} from '../../shared/insurers/icici-api';
import { CredentialError } from '../insurers/credentials';
import { VaultOpenError, type VaultOpener } from '../secrets/vault-opener';
import type { SecretVault } from '../secrets/vault/vault';

const MODE_ENTRY = 'icici-api.mode';
const loginEntry = (mode: IciciApiMode) => `icici-api.login.${mode}`;
const storedLoginSchema = iciciApiLoginSchema.extend({ v: z.literal(1) });

export interface IciciApiSettings {
  status(): Promise<IciciApiStatus>;
  /** Chooses the environment (null: the API is not used). */
  setMode(mode: IciciApiMode | null): Promise<void>;
  saveLogin(mode: IciciApiMode, login: IciciApiLogin): Promise<void>;
  /** Removes a saved login; returns whether one was saved. */
  forgetLogin(mode: IciciApiMode): Promise<boolean>;
  /** Main process only: the environment in use and its login, or null if not set up. */
  active(): Promise<{ mode: IciciApiMode; login: IciciApiLogin } | null>;
}

export function createIciciApiSettings(openVault: VaultOpener): IciciApiSettings {
  const vault = async (): Promise<SecretVault> => {
    try {
      return await openVault();
    } catch (err) {
      throw new CredentialError(
        err instanceof VaultOpenError && err.code !== 'SECRET_STORE_UNAVAILABLE'
          ? 'STORAGE_ERROR'
          : 'SECRET_STORE_UNAVAILABLE',
      );
    }
  };
  const read = async (name: string): Promise<string | null> => {
    const result = await (await vault()).get(name);
    if (result.ok) return result.data;
    if (result.error.code === 'SECRET_NOT_FOUND') return null;
    throw new CredentialError('STORAGE_ERROR');
  };
  const write = async (name: string, value: string) => {
    const result = await (await vault()).put(name, value, { overwriteUnreadable: true });
    if (!result.ok) throw new CredentialError('STORAGE_ERROR');
  };
  const mode = async (): Promise<IciciApiMode | null> => {
    const value = await read(MODE_ENTRY);
    return (ICICI_API_MODES as readonly string[]).includes(value ?? '')
      ? (value as IciciApiMode)
      : null;
  };
  const login = async (m: IciciApiMode): Promise<IciciApiLogin | null> => {
    const value = await read(loginEntry(m));
    if (value === null) return null;
    try {
      const { v: _v, ...stored } = storedLoginSchema.parse(JSON.parse(value));
      return stored;
    } catch {
      throw new CredentialError('STORAGE_ERROR');
    }
  };

  return {
    status: async () => {
      const names = new Set((await vault()).list());
      return {
        mode: await mode(),
        saved: {
          uat: names.has(loginEntry('uat')),
          production: names.has(loginEntry('production')),
        },
      };
    },
    setMode: async (m) => {
      if (m === null) {
        const result = await (await vault()).delete(MODE_ENTRY);
        if (!result.ok) throw new CredentialError('STORAGE_ERROR');
        return;
      }
      await write(MODE_ENTRY, m);
    },
    saveLogin: async (m, l) =>
      write(loginEntry(m), JSON.stringify(storedLoginSchema.parse({ v: 1, ...l }))),
    forgetLogin: async (m) => {
      const result = await (await vault()).delete(loginEntry(m));
      if (!result.ok) throw new CredentialError('STORAGE_ERROR');
      return result.data;
    },
    active: async () => {
      const m = await mode();
      if (!m) return null;
      const l = await login(m);
      return l ? { mode: m, login: l } : null;
    },
  };
}
