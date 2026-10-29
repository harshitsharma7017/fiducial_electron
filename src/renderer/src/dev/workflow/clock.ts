// DEVELOPMENT-ONLY. Time for the demo workflow, injectable so tests can use fake timers. The
// only place in the workflow that reads the system clock.

export interface Clock {
  /** ISO 8601 timestamp with offset, as the contracts require. */
  now(): string;
}

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

export const systemTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => (globalThis.clearTimeout as (h: unknown) => void)(handle),
};

/** Raised when an abortable wait is cancelled. */
export class AbortedError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortedError';
  }
}

/** Waits `ms`, or rejects with AbortedError as soon as `signal` aborts. */
export function abortableDelay(timers: Timers, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new AbortedError());
      return;
    }
    const onAbort = (): void => {
      timers.clearTimeout(handle);
      reject(new AbortedError());
    };
    const handle = timers.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Never resolves; rejects with AbortedError when `signal` aborts (a simulated hang). */
export function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new AbortedError());
    else signal.addEventListener('abort', () => reject(new AbortedError()), { once: true });
  });
}

// ---- Display helpers: the workflow UI formats recorded timestamps here, never reads the clock.

const TIME = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A recorded timestamp as local time of day, for example `09:41:07`. */
export function formatTime(iso: string | null): string {
  if (iso === null) return '—';
  const date = parse(iso);
  return date ? TIME.format(date) : iso;
}

/** A recorded timestamp as local date and time, for example `28 Oct 2026, 09:41:07`. */
export function formatDateTime(iso: string | null): string {
  if (iso === null) return '—';
  const date = parse(iso);
  return date ? DATE_TIME.format(date) : iso;
}

/** Time between two recorded timestamps, for example `2.3 s`; null if either is missing. */
export function elapsedText(fromIso: string | null, toIso: string | null): string | null {
  const from = fromIso === null ? null : parse(fromIso);
  const to = toIso === null ? null : parse(toIso);
  if (!from || !to) return null;
  return `${(Math.max(0, to.getTime() - from.getTime()) / 1000).toFixed(1)} s`;
}
