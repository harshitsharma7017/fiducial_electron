// Cancelling a quote run: every step goes through exec, so stopping there stops all insurers' runs,
// optional steps included, and abandons a step that is still waiting on the page.
import type { WebContents } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/main/logging/logger';
import { createQuoteService } from '../src/main/quotes/service';
import {
  beginRun,
  endRun,
  exec,
  QuoteRunStopped,
  runPause,
  stopRun,
} from '../src/main/quotes/run-uiic-health';

vi.mock('electron', () => ({}));

const page = (run: (code: string) => Promise<unknown>) =>
  ({
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: (_world: number, scripts: { code: string }[]) =>
      run(scripts[0]!.code),
  }) as unknown as WebContents;

const never = () => new Promise<never>(() => undefined);
const op = { op: 'pause', ms: 1 } as const;

afterEach(() => {
  endRun();
});

describe('cancelling a quote run', () => {
  it('has nothing to stop outside a run', async () => {
    expect(stopRun()).toBe(false);
    await expect(
      exec(
        page(() => Promise.resolve({ ok: true })),
        op,
      ),
    ).resolves.toEqual({
      ok: true,
    });
  });

  it('runs steps as usual until it is cancelled', async () => {
    beginRun();
    await expect(
      exec(
        page(() => Promise.resolve({ ok: true })),
        op,
      ),
    ).resolves.toEqual({
      ok: true,
    });
  });

  it('runs no further step once cancelled', async () => {
    const run = vi.fn(() => Promise.resolve({ ok: true }));
    beginRun();
    expect(stopRun()).toBe(true);
    await expect(exec(page(run), op)).rejects.toBeInstanceOf(QuoteRunStopped);
    expect(run).not.toHaveBeenCalled();
  });

  it('abandons a step still waiting, and tells the page to end the wait', async () => {
    const codes: string[] = [];
    const wc = page((code) => {
      codes.push(code);
      return code === 'window.__fqfStop = true' ? Promise.resolve() : never();
    });
    beginRun();
    const step = exec(wc, op);
    stopRun();
    await expect(step).rejects.toBeInstanceOf(QuoteRunStopped);
    expect(codes.at(-1)).toBe('window.__fqfStop = true');
  });

  it("clears the page's stop with each step, so that a later run works there", async () => {
    const codes: string[] = [];
    const wc = page((code) => {
      codes.push(code);
      return Promise.resolve({ ok: true });
    });
    await exec(wc, op);
    expect(codes[0]).toMatch(/^\(window\.__fqfStop = false, /);
  });

  it('survives a page that went away while stopping', async () => {
    const wc = page((code) =>
      code === 'window.__fqfStop = true' ? Promise.reject(new Error('gone')) : never(),
    );
    beginRun();
    const step = exec(wc, op);
    stopRun();
    await expect(step).rejects.toBeInstanceOf(QuoteRunStopped);
  });

  it('cuts short a wait in the run itself', async () => {
    beginRun();
    const wait = runPause(60_000);
    stopRun();
    await expect(wait).rejects.toBeInstanceOf(QuoteRunStopped);
  });

  it('asks once: a second press has nothing more to stop', () => {
    beginRun();
    expect(stopRun()).toBe(true);
    expect(stopRun()).toBe(false);
  });

  it('does not carry a cancel over to the next run', async () => {
    beginRun();
    stopRun();
    endRun();
    beginRun();
    await expect(
      exec(
        page(() => Promise.resolve({ ok: true })),
        op,
      ),
    ).resolves.toEqual({
      ok: true,
    });
  });
});

describe('the quote service', () => {
  const record = {
    id: 'c1',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    client: {
      customer: { name: 'Synthetic Couple', phone: '9876543210', email: 'couple@example.test' },
      pincode: '560001',
      proposerMaritalStatus: 'married',
      members: [
        { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
        { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02', gender: 'female' },
      ],
      preferences: { coverType: 'floater', sumInsuredPaise: 500000_00, tenureYears: 1 },
    },
  };
  const unused = () => Promise.reject(new Error('not used'));
  // United India's home page, signed in; opening the calculator never finishes.
  let opened: () => void = () => undefined;
  const portal = {
    isDestroyed: () => false,
    focus: () => undefined,
    webContents: {
      id: 1,
      isDestroyed: () => false,
      getURL: () => 'https://www.uiic.in/GCWebPortal/login/HomeAction.do',
      executeJavaScriptInIsolatedWorld: (_world: number, scripts: { code: string }[]) => {
        if (scripts[0]!.code === 'window.__fqfStop = true') return Promise.resolve();
        if (scripts[0]!.code.includes('"op":"clickLink"')) {
          opened();
          return never();
        }
        return Promise.resolve({ ok: false, detail: 'not-found' });
      },
    },
  };
  const service = createQuoteService({
    enabled: true,
    clients: {
      get: () => Promise.resolve(record),
      aadhaarFor: () => Promise.resolve(null),
      getVehicle: unused,
      getTraveller: unused,
      passportFor: () => Promise.resolve(null),
      getRural: unused,
      getMarine: unused,
      getProperty: unused,
    } as never,
    windowsOf: () => [portal] as never,
    logger: createLogger([]),
    now: () => new Date(2026, 10, 2),
  });
  const request = {
    clientId: 'c1',
    insurerId: 'united-india',
    product: 'health' as const,
    goodHealthConfirmed: true,
  };

  it('has nothing to cancel when idle', () => {
    expect(service.cancel()).toBe(false);
  });

  it('ends a cancelled run as cancelled, and takes the next run', async () => {
    const reached = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const run = service.run(request);
    await reached;
    expect(service.cancel()).toBe(true);
    await expect(run).resolves.toMatchObject({
      outcome: 'cancelled',
      step: null,
      message: expect.stringContaining('nothing was submitted') as string,
    });
    expect(service.cancel()).toBe(false);

    const again = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const next = service.run(request);
    await again;
    service.cancel();
    await expect(next).resolves.toMatchObject({ outcome: 'cancelled' });
  });
});
