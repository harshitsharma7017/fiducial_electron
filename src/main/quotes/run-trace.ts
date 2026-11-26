// A quote run's trace, for support (26 November 2026: "why does HDFC only open Private Car", "why
// does ICICI's Health tile not lead to Elevate"): each move with the time it happened, and every
// address the insurer's tabs went through (origin and path only: never a query or fragment, which
// can carry a sign-in token). Saved with the run (diagnostics: the app's data folder, readable by
// the user only) and named in its result. Never client data.
import type { PortalPage } from '../insurers/portal-host';
import type { QuoteRunResult } from './run-uiic-health';

/** A tab's address without its query or fragment. */
export const addressOf = (w: PortalPage): string => {
  try {
    const u = new URL(w.webContents.getURL());
    return `${u.origin}${u.pathname}`;
  } catch {
    return '';
  }
};

export class RunTrace {
  readonly entries: Record<string, unknown>[] = [];
  private readonly started = Date.now();
  private seen = new Map<number, string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  note(what: string, detail: Record<string, unknown> = {}): void {
    this.entries.push({ ms: Date.now() - this.started, what, ...detail });
  }

  /** Notes each tab's address whenever it changes, until `stop`. */
  watch(windows: () => PortalPage[]): void {
    const look = () => {
      for (const [i, w] of windows().entries()) {
        if (w.isDestroyed()) continue;
        const at = addressOf(w);
        if (this.seen.get(i) !== at) {
          this.seen.set(i, at);
          this.note('address', { tab: i, at });
        }
      }
    };
    look();
    this.timer = setInterval(look, 250);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/**
 * Runs `work` with a trace watching `windows`, saves the trace (diagnostics) whatever the
 * outcome, and names it in the result (`what`: what the trace tells, for the advisor).
 */
export async function traced(
  diagnose: ((name: string, data: unknown) => string | null) | undefined,
  insurer: string,
  product: string,
  windows: () => PortalPage[],
  what: string,
  work: (trace: RunTrace) => Promise<QuoteRunResult>,
): Promise<QuoteRunResult> {
  const trace = new RunTrace();
  const started = new Date();
  trace.watch(windows);
  let result: QuoteRunResult;
  try {
    result = await work(trace);
  } finally {
    trace.stop();
  }
  const file = diagnose?.(insurer, {
    at: started.toISOString(),
    product,
    outcome: result.outcome,
    step: result.step,
    message: result.message,
    trace: trace.entries,
  });
  return file
    ? {
        ...result,
        toDo: [...(result.toDo ?? []), `${what} (for support): the trace is saved as ${file}.`],
      }
    : result;
}
