// DEVELOPMENT-ONLY persistence for the demo workflow: an IN-MEMORY store. The product has no
// approved storage yet (M4 is gated on DM-02 and Q-M1-01), so nothing is written to disk or
// to any browser storage API. All demo data is lost when the window reloads or the app
// restarts. The interface is small so an approved store can replace it later.
import type { DemoState } from './types';

export interface DemoStateStore {
  readonly kind: 'in-memory-demo';
  // Function properties, not methods: React calls `read` and `subscribe` unbound.
  readonly read: () => DemoState;
  readonly write: (next: DemoState) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createInMemoryStore(initial: DemoState): DemoStateStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    kind: 'in-memory-demo',
    read: () => state,
    write: (next) => {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const SEEDED_CLIENT_ID = 'CL-001';

/** The demo's starting point: one synthetic company with no census loaded yet. */
export function seedState(now: string): DemoState {
  return {
    clients: [
      {
        id: SEEDED_CLIENT_ID,
        name: 'Synthetic Demo Industries Pvt Ltd (synthetic)',
        email: 'benefits.desk@example.com',
        notes: 'Fictitious company for the demonstration. Contact details are not deliverable.',
        seeded: true,
        createdAt: now,
      },
    ],
    census: [],
    employees: [],
    members: [],
    quoteRequests: [],
    jobs: [],
    comparisons: [],
    reports: [],
    activity: [
      {
        id: 'ACT-0001',
        at: now,
        type: 'demo.reset',
        message: 'Demo data set loaded: 1 synthetic client, no census, no quote requests.',
        refs: { clientId: SEEDED_CLIENT_ID },
      },
    ],
    counters: { CL: 1, ACT: 1 },
  };
}
