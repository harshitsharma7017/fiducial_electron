// When each insurer's saved session started, so it can be ended after SESSION_HOURS.
//
// The clock starts the first time a portal is opened with no session running, and the session is
// ended (its cookies and storage wiped) SESSION_HOURS later, whether or not the advisor signed in,
// so a session never lasts longer than that after it began. The file holds insurer ids and times
// only; it is written atomically so a crash leaves the old or the new version.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { INSURER_PORTALS } from '../../shared/insurers/portals';
import { SESSION_HOURS } from '../../shared/insurers/session';
import { atomicWrite } from '../secrets/vault/atomic-write';

export { SESSION_HOURS };
export const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

const fileSchema = z.strictObject({
  version: z.literal(1),
  started: z.record(z.string(), z.iso.datetime()),
});

export interface SessionClock {
  /** When the session for `id` started, or null if none is running. */
  startedAt(id: string): Date | null;
  /** When the session for `id` must end, or null if none is running. */
  endsAt(id: string): Date | null;
  /** Starts the clock for `id` unless one is already running. */
  start(id: string): void;
  stop(id: string): void;
  /** Ids whose session has run for SESSION_HOURS or more. */
  expired(): string[];
}

export function createSessionClock(file: string, now: () => Date = () => new Date()): SessionClock {
  const started = new Map<string, Date>();
  // Load what was saved. A missing or unreadable file means no session is trusted: every
  // insurer starts again from its login page (the caller wipes their saved sessions).
  try {
    const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (parsed.success) {
      for (const [id, iso] of Object.entries(parsed.data.started)) {
        if (INSURER_PORTALS.some((p) => p.id === id)) started.set(id, new Date(iso));
      }
    }
  } catch {
    // No file yet, or unreadable: start empty.
  }

  const save = (): void => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    atomicWrite(
      file,
      `${JSON.stringify({
        version: 1,
        started: Object.fromEntries([...started].map(([id, at]) => [id, at.toISOString()])),
      })}\n`,
    );
  };

  const clock: SessionClock = {
    startedAt: (id) => started.get(id) ?? null,
    endsAt: (id) => {
      const at = started.get(id);
      return at ? new Date(at.getTime() + SESSION_MS) : null;
    },
    start: (id) => {
      if (started.has(id)) return;
      started.set(id, now());
      save();
    },
    stop: (id) => {
      if (!started.delete(id)) return;
      save();
    },
    expired: () => {
      const t = now().getTime();
      // A start time in the future (clock moved back) is treated as expired too.
      return [...started]
        .filter(([, at]) => t - at.getTime() >= SESSION_MS || at.getTime() > t + 60_000)
        .map(([id]) => id);
    },
  };
  return clock;
}
