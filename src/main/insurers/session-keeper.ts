// Keeps an insurer's sign-in across app restarts, for the rest of its 12-hour session.
//
// Most portals keep the sign-in in session cookies (no expiry), which Electron never writes to
// disk: without this, every restart of the app (an update, a reboot, a crash) would sign the
// advisor out, and portals that ask for an OTP would need the client's OTP again.
//
// What is kept, per insurer: its session cookies and the address of the page the portal window
// was on (so it reopens there, not on the login page). It is
// - encrypted with the operating system's key (Electron safeStorage, the same key that protects
//   the saved sign-in details), in <userData>/insurer-sessions/<insurer>.session, owner-only;
// - written only while the insurer's 12-hour session is running, and deleted when the session
//   ends (sign-out, the 12 hours, or a session wiped at start-up); a file that cannot be read
//   is deleted and ignored.
// Cookies with an expiry date are not kept here: the saved partition already keeps those.
// The insurer's own server may still have ended the session (for example after inactivity):
// the portal then shows its login page and the app fills it as usual.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Cookie, CookiesSetDetails } from 'electron';
import { z } from 'zod';
import type { SecretBackend } from '../secrets/secret-store';
import { atomicWrite } from '../secrets/vault/atomic-write';

const SAME_SITE = ['unspecified', 'no_restriction', 'lax', 'strict'] as const;

const keptCookieSchema = z.strictObject({
  name: z.string().max(4096),
  value: z.string().max(16_384),
  domain: z.string().min(1).max(253),
  hostOnly: z.boolean(),
  path: z.string().max(4096),
  secure: z.boolean(),
  httpOnly: z.boolean(),
  sameSite: z.enum(SAME_SITE),
});
type KeptCookie = z.infer<typeof keptCookieSchema>;

const fileSchema = z.strictObject({
  version: z.literal(1),
  lastUrl: z.string().max(8192).nullable(),
  cookies: z.array(keptCookieSchema).max(500),
});

/** The part of an Electron session's cookie jar this uses. */
export interface CookieJar {
  get(filter: Record<string, never>): Promise<Cookie[]>;
  set(details: CookiesSetDetails): Promise<void>;
}

export interface SessionKeeper {
  /** Saves the insurer's session cookies and the page its window is on. */
  save(id: string, jar: CookieJar, lastUrl: string | null): Promise<void>;
  /** Puts the saved session cookies back; returns the saved page, or null if nothing was kept. */
  restore(id: string, jar: CookieJar): Promise<{ lastUrl: string | null } | null>;
  /** Deletes what was kept for the insurer. */
  forget(id: string): void;
}

/** The session-only cookies of a jar, as kept. */
export function sessionCookies(cookies: Cookie[]): KeptCookie[] {
  return cookies
    .filter((c) => c.session === true && !!c.domain)
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain!,
      hostOnly: c.hostOnly ?? !c.domain!.startsWith('.'),
      path: c.path ?? '/',
      secure: c.secure ?? false,
      httpOnly: c.httpOnly ?? false,
      sameSite: c.sameSite ?? 'unspecified',
    }));
}

/** How a kept cookie is set again: as a session cookie (no expiry), for its own host. */
export function toSetDetails(c: KeptCookie): CookiesSetDetails {
  const host = c.domain.replace(/^\./, '');
  return {
    url: `${c.secure ? 'https' : 'http'}://${host}${c.path.startsWith('/') ? c.path : '/'}`,
    name: c.name,
    value: c.value,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    // A host-only cookie must not be widened to sub-domains: no domain for those.
    ...(c.hostOnly ? {} : { domain: c.domain }),
  };
}

const ID = /^[a-z0-9-]{1,64}$/;

export function createSessionKeeper(dir: string, backend: SecretBackend): SessionKeeper {
  const fileOf = (id: string): string => {
    if (!ID.test(id)) throw new Error('bad insurer id');
    return join(dir, `${id}.session`);
  };
  // Writes for one insurer happen in order (a later save never lands before an earlier one).
  const queue = new Map<string, Promise<void>>();
  const forgotten = new Set<string>();

  const keeper: SessionKeeper = {
    save: (id, jar, lastUrl) => {
      forgotten.delete(id);
      const run = (queue.get(id) ?? Promise.resolve()).then(async () => {
        if (forgotten.has(id)) return;
        if (!(await backend.isAsyncEncryptionAvailable())) return; // never written in the clear
        const cookies = sessionCookies(await jar.get({}));
        const text = JSON.stringify({ version: 1, lastUrl, cookies });
        const sealed = await backend.encryptStringAsync(text);
        if (forgotten.has(id)) return; // signed out while this was being sealed
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        atomicWrite(fileOf(id), sealed);
      });
      const settled = run.catch(() => undefined);
      queue.set(id, settled);
      return settled;
    },
    restore: async (id, jar) => {
      let sealed: Buffer;
      try {
        sealed = readFileSync(fileOf(id));
      } catch {
        return null; // nothing kept
      }
      try {
        if (!(await backend.isAsyncEncryptionAvailable())) return null;
        const { result } = await backend.decryptStringAsync(sealed);
        const parsed = fileSchema.safeParse(JSON.parse(result));
        if (!parsed.success) throw new Error('unreadable');
        for (const cookie of parsed.data.cookies) {
          await jar.set(toSetDetails(cookie)).catch(() => undefined);
        }
        return { lastUrl: parsed.data.lastUrl };
      } catch {
        keeper.forget(id);
        return null;
      }
    },
    forget: (id) => {
      forgotten.add(id);
      rmSync(fileOf(id), { force: true });
    },
  };
  return keeper;
}
