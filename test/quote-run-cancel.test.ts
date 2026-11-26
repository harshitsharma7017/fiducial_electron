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
  const sentHome: string[] = [];
  const portal = {
    isDestroyed: () => false,
    focus: () => undefined,
    webContents: {
      id: 1,
      isDestroyed: () => false,
      getURL: () => 'https://www.uiic.in/GCWebPortal/login/HomeAction.do',
      loadURL: (to: string) => {
        sentHome.push(to);
        return Promise.resolve();
      },
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
    // A second quote while this one runs is refused as busy, and its tab is not sent home.
    const homeBefore = sentHome.length;
    await expect(service.run(request)).resolves.toMatchObject({ outcome: 'refused' });
    expect(sentHome.length).toBe(homeBefore);
    expect(service.cancel()).toBe(true);
    await expect(run).resolves.toMatchObject({
      outcome: 'cancelled',
      step: null,
      message: expect.stringContaining('nothing was submitted') as string,
    });
    expect(service.cancel()).toBe(false);
    // The quote started from United India's home page, and its tab goes back there once cancelled.
    expect(sentHome).toEqual([
      'https://www.uiic.in/GCWebPortal/login/HomeAction.do',
      'https://www.uiic.in/GCWebPortal/login/HomeAction.do',
    ]);

    const again = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const next = service.run(request);
    await again;
    service.cancel();
    await expect(next).resolves.toMatchObject({ outcome: 'cancelled' });
  });
});

describe('several insurers at once (request of 25 November 2026)', () => {
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
  /** Where each tab was sent (its home page, before and after a quote), by tab. */
  const loaded = new Map<number, string[]>();
  /** An insurer's tab whose run stops (never answers) at `blockOn`, telling `reached`. */
  const tab = (id: number, url: string, blockOn: string, reached: () => void) => ({
    isDestroyed: () => false,
    focus: () => undefined,
    webContents: {
      id,
      isDestroyed: () => false,
      isLoading: () => false,
      getURL: () => url,
      loadURL: (to: string) => {
        loaded.set(id, [...(loaded.get(id) ?? []), to]);
        return Promise.resolve();
      },
      reload: () => undefined,
      executeJavaScriptInIsolatedWorld: (_world: number, scripts: { code: string }[]) => {
        const code = scripts[0]!.code;
        if (code === 'window.__fqfStop = true') return Promise.resolve();
        if (code.includes(blockOn)) {
          reached();
          return never();
        }
        return Promise.resolve({ ok: false, detail: 'not-found' });
      },
    },
  });

  it('runs each insurer in its own tab together, one quote per insurer, cancelled one by one', async () => {
    let uiicAt: () => void = () => undefined;
    let hdfcAt: () => void = () => undefined;
    const uiicReached = new Promise<void>((resolve) => (uiicAt = resolve));
    const hdfcReached = new Promise<void>((resolve) => (hdfcAt = resolve));
    const uiic = tab(
      1,
      'https://www.uiic.in/GCWebPortal/login/HomeAction.do',
      '"op":"clickLink"',
      () => uiicAt(),
    );
    // HDFC ERGO's PIE, already on the MST form: the run waits for the form's boxes.
    const hdfc = tab(2, 'https://pie.hdfcergo.com/MST/CreateQuote', '"op":"waitFor"', () =>
      hdfcAt(),
    );
    const unused = () => Promise.reject(new Error('not used'));
    const service = createQuoteService({
      enabled: true,
      clients: {
        get: () => Promise.resolve(record),
        aadhaarFor: () => Promise.resolve(null),
        getVehicle: unused,
      } as never,
      windowsOf: ((id: string) =>
        id === 'united-india' ? [uiic] : id === 'hdfc-ergo' ? [hdfc] : []) as never,
      logger: createLogger([]),
      now: () => new Date(2026, 10, 2),
    });
    const uiicRun = service.run({
      clientId: 'c1',
      insurerId: 'united-india',
      product: 'health',
      goodHealthConfirmed: true,
    });
    const hdfcRun = service.run({
      clientId: 'c1',
      insurerId: 'hdfc-ergo',
      product: 'hdfc-mst',
      run: { cover: 'family-floater', years: 1 },
    });
    await Promise.all([uiicReached, hdfcReached]);
    // Both running, each shown with its product.
    const now = await service.progress(0);
    expect(now.items.map((i) => [i.insurerId, i.state, i.product]).sort()).toEqual([
      ['hdfc-ergo', 'running', 'hdfc-mst'],
      ['united-india', 'running', 'health'],
    ]);
    // A second quote for the same insurer is refused; the other insurer is not held up.
    await expect(
      service.run({
        clientId: 'c1',
        insurerId: 'united-india',
        product: 'health',
        goodHealthConfirmed: true,
      }),
    ).resolves.toMatchObject({
      outcome: 'refused',
      message: expect.stringContaining('this insurer') as string,
    });
    // Cancelling one stops that one only.
    expect(service.cancel('hdfc-ergo')).toBe(true);
    await expect(hdfcRun).resolves.toMatchObject({ outcome: 'cancelled' });
    // HDFC's tab was on PIE: it goes to PIE's dashboard, staying signed in there (not 1up).
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(loaded.get(2)).toEqual([
      'https://pie.hdfcergo.com/Dashboard/Details',
      'https://pie.hdfcergo.com/Dashboard/Details',
    ]);
    expect(
      (await service.progress(0)).items.find((i) => i.insurerId === 'united-india')?.state,
    ).toBe('running');
    expect(service.cancel('united-india')).toBe(true);
    await expect(uiicRun).resolves.toMatchObject({ outcome: 'cancelled' });
    const after = await service.progress(0);
    expect(after.items.map((i) => i.state)).toEqual(['cancelled', 'cancelled']);
    // Progress answers at once when it changed since; else it waits (here: nothing pending).
    expect(after.version).toBeGreaterThan(now.version);
  }, 20_000);
});
