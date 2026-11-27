// A form the app cannot fill completely (request of 20 November 2026): it fills what it can, leaves
// the rest for the advisor, never presses the insurer's premium button itself, and once the advisor
// has the premium (read from the insurer's page, or typed) saves the quote as a PDF.
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/main/logging/logger';
import {
  FillProgress,
  finishStart,
  GUESSED_READING,
  handedOver,
  premiumButton,
  premiumReading,
} from '../src/main/quotes/hand-over';
import type { QuoteDocument } from '../src/main/quotes/quote-document';
import { createQuoteService } from '../src/main/quotes/service';
import { planUiicHealthQuote } from '../src/main/quotes/uiic-health';
import { clientInputSchema } from '../src/shared/contracts/client';

vi.mock('electron', () => ({}));

const AT = new Date(2026, 10, 20, 12, 0);
const CLIENT = {
  customer: { name: 'Synthetic Couple', email: 'couple@example.test' },
  pincode: '247776',
  proposerMaritalStatus: 'married',
  members: [
    { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
    { relationship: 'spouse', age: 40, dateOfBirth: '1986-11-04', gender: 'female' },
  ],
  preferences: { coverType: 'floater', sumInsuredPaise: 300000_00, tenureYears: 1 },
} as const;
const plan = planUiicHealthQuote(clientInputSchema.parse(CLIENT), { goodHealth: true, today: AT });
if (!plan.ok) throw new Error(plan.problems.join('; '));
const STEPS = plan.steps;

describe("a plan's finish steps", () => {
  it('start at the button that works the premium out, which the advisor is told to press', () => {
    expect(STEPS[finishStart(STEPS)]!.label).toBe('Check Premium');
    expect(premiumButton(STEPS)).toBe('Check Premium');
    expect(premiumReading(STEPS)!.op.op).toBe('readPlans');
  });

  it('are the premium reading alone, for a form whose reading ends it without a button', () => {
    const steps = [
      { label: 'Name', op: { op: 'type', selector: '#n', value: 'x' } },
      { label: 'Read the premium', op: { op: 'readValue', selector: '#p', timeoutMs: 1 } },
    ] as const;
    expect(finishStart([...steps])).toBe(1);
    expect(premiumButton([...steps])).toBeNull();
  });

  it('are none on a form the app only fills (its premium is read by common captions)', () => {
    const steps = [{ label: 'Name', op: { op: 'type', selector: '#n', value: 'x' } }] as const;
    expect(finishStart([...steps])).toBe(1);
    expect(new FillProgress([...steps]).reading()).toEqual({
      read: GUESSED_READING,
      known: false,
    });
  });
});

describe('filling what can be filled', () => {
  const at = (label: string) => STEPS.findIndex((s) => s.label === label);

  it('leaves a box the form does not take for the advisor, and goes on', () => {
    const progress = new FillProgress(STEPS);
    const gender = at("Proposer's gender");
    expect(
      progress.skip(STEPS[gender]!, gender, { ok: false, detail: 'option-missing (offered: M)' }),
    ).toBe(true);
    // What the list offered instead is kept for the advisor.
    expect(progress.left).toEqual([
      "Proposer's gender: fill it in yourself (the insurer's list does not offer the saved value; it offers: M).",
    ]);
  });

  it('stops at a step that moves the form along, and before the premium once anything is left', () => {
    const progress = new FillProgress(STEPS);
    const getQuote = at('Get Quote');
    expect(progress.skip(STEPS[getQuote]!, getQuote, { ok: false, detail: 'not-found' })).toBe(
      false,
    );
    expect(progress.stopBefore(at('Check Premium'))).toBe(false);
    const left = new FillProgress(STEPS, ['E-mail: fill it in yourself.']);
    expect(left.stopBefore(at('Mobile (User Details)'))).toBe(false);
    expect(left.stopBefore(at('Check Premium'))).toBe(true);
  });

  it('hands the form over: what is left, the button to press, and how the app reads the premium', () => {
    const progress = new FillProgress(STEPS, ['Mobile (User Details): fill it in yourself.']);
    const page = {} as never;
    const result = handedOver({
      insurer: 'United India',
      page,
      progress,
      toDo: ['Check every section.'],
      compose: () => ({ outcome: 'ready', step: null, message: '', problems: [] }),
    });
    expect(result).toMatchObject({
      outcome: 'handed-over',
      step: null,
      toDo: ['Mobile (User Details): fill it in yourself.', 'Check every section.'],
      finish: { button: 'Check Premium', guessed: false },
    });
    expect(result.message).toContain('press "Check Premium" yourself');
    expect(result.handOver?.read.op).toBe('readPlans');
  });
});

describe('finishing a handed-over form', () => {
  const PLANS = [
    { name: 'Individual Family Medicare Policy', amount: '11948' },
    { name: 'Arogya Sanjeevani Policy', amount: '14605' },
  ];
  /** United India's home page and calculator; the quotes table shows once `shown.premium`. */
  const portal = () => {
    const shown = {
      premium: false,
      pressed: [] as string[],
      sentHome: [] as number[],
      // What the form's Sum Insured box shows (the advisor may change it).
      sumInsured: '5 Lakh',
      // The page stops answering (a run still filling when Reset is pressed).
      hang: false,
    };
    let opened = false;
    const wc = (id: number, url: string) => ({
      id,
      isDestroyed: () => false,
      getURL: () => url,
      // The tab sent back to United India's home page (a quote cancelled or completed).
      loadURL: (to: string) => {
        if (to === 'https://www.uiic.in/GCWebPortal/login/HomeAction.do') shown.sentHome.push(id);
        return Promise.resolve();
      },
      executeJavaScriptInIsolatedWorld: (_world: number, scripts: { code: string }[]) => {
        const code = scripts[0]!.code;
        if (shown.hang && code !== 'window.__fqfStop = true') {
          return new Promise(() => undefined);
        }
        if (code.includes('"op":"clickLink"')) opened = true;
        const press = /"op":"clickButton","text":"([^"]+)"/.exec(code);
        if (press) shown.pressed.push(press[1]!);
        if (code.includes('"op":"formValues"')) {
          return Promise.resolve({
            ok: true,
            value: JSON.stringify([
              ['Sum Insured', shown.sumInsured],
              ['Policy Period', '1 Year'],
            ]),
          });
        }
        if (code.includes('"op":"readPlans"')) {
          return Promise.resolve(
            shown.premium ? { ok: true, plans: PLANS } : { ok: false, detail: 'not-shown' },
          );
        }
        return Promise.resolve({ ok: true });
      },
    });
    const home = {
      isDestroyed: () => false,
      focus: () => undefined,
      webContents: wc(1, 'https://www.uiic.in/GCWebPortal/login/HomeAction.do'),
    };
    const calculator = {
      isDestroyed: () => false,
      focus: () => undefined,
      webContents: wc(2, 'https://www.uiic.in/CustomerAppLive/data/HealthPolicyNewQuote.html'),
    };
    // United India's pages only: no other insurer is open.
    return {
      shown,
      windowsOf: (insurerId: string) =>
        insurerId !== 'united-india' ? [] : opened ? [home, calculator] : [home],
    };
  };
  const setup = (extra: Partial<Parameters<typeof createQuoteService>[0]> = {}) => {
    const { shown, windowsOf } = portal();
    const save = vi.fn((_doc: QuoteDocument, _title: string) => Promise.resolve('quote.pdf'));
    const service = createQuoteService({
      enabled: true,
      clients: {
        // No mobile: the run leaves it, and stops before Check Premium.
        get: () =>
          Promise.resolve({
            id: 'c1',
            createdAt: '2026-11-01T00:00:00.000Z',
            updatedAt: '2026-11-01T00:00:00.000Z',
            client: clientInputSchema.parse(CLIENT),
          }),
        aadhaarFor: () => Promise.resolve(null),
        getTraveller: () =>
          Promise.resolve({
            id: 't1',
            traveller: {
              customer: { name: 'Synthetic Traveller' },
              pincode: '560001',
              dateOfBirth: '1986-04-12',
              trip: {
                departureDate: '2026-12-10',
                returnDate: '2026-12-24',
                destination: 'schengen',
              },
            },
          }),
      } as never,
      windowsOf: windowsOf as never,
      logger: createLogger([]),
      now: () => AT,
      pdfs: { save, open: () => Promise.resolve(true) },
      ...extra,
    });
    const request = {
      clientId: 'c1',
      insurerId: 'united-india',
      product: 'health' as const,
      goodHealthConfirmed: true,
    };
    return { shown, save, service, request };
  };

  it('fills what it can, never presses Check Premium, and hands the form over', async () => {
    const { shown, save, service, request } = setup();
    const result = await service.run(request);
    expect(result).toMatchObject({
      outcome: 'handed-over',
      finish: { button: 'Check Premium', guessed: false },
    });
    expect(result.toDo).toContain(
      'Mobile (User Details): fill it in yourself (the client record does not have it).',
    );
    expect(result).not.toHaveProperty('handOver');
    expect(shown.pressed).toContain('Get Quote');
    expect(shown.pressed).not.toContain('Check Premium');
    expect(save).not.toHaveBeenCalled();
    // The quote started from United India's home page (its tab sent home first); the form is then
    // the advisor's to finish: its tab is left as it is.
    expect(shown.sentHome).toEqual([1]);
  }, 20_000);

  it('reads the premium once the advisor has it, and saves the PDF', async () => {
    const { shown, save, service, request } = setup();
    await service.run(request);
    expect((await service.finish({ waitMs: 0 })).outcome).toBe('handed-over');
    expect(save).not.toHaveBeenCalled();
    // The advisor fills the mobile and presses Check Premium on United India's page.
    setTimeout(() => (shown.premium = true), 300);
    const result = await service.finish({ waitMs: 10_000, plans: PLANS.map((p) => p.name) });
    expect(result).toMatchObject({
      outcome: 'ready',
      plans: PLANS,
      premium: { amount: '11948' },
      pdf: { name: 'quote.pdf' },
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].members).toHaveLength(2);
    // Completed: the calculator's tab goes back to United India's home page.
    expect(shown.sentHome).toEqual([1, 2]);
    // Finished: nothing is waiting any more.
    expect((await service.finish({ waitMs: 0 })).outcome).toBe('refused');
  }, 20_000);

  it('takes the premium the advisor typed, and says so in the PDF', async () => {
    const { save, service, request } = setup();
    await service.run(request);
    const result = await service.finish({ waitMs: 0, amount: '12345' });
    expect(result).toMatchObject({ outcome: 'ready', premium: { amount: '12345' } });
    expect(save.mock.calls[0]![0]).toMatchObject({
      amountLabel: 'Premium (as read by the advisor)',
      plans: [{ name: 'United India premium', amount: '12345' }],
    });
  }, 20_000);

  it('compares the insurers quoted in one PDF, noting those without a premium', async () => {
    const { save, service, request } = setup();
    await service.run(request);
    expect(await service.compare({ clientId: 'c1', insurerIds: ['united-india'] })).toEqual({
      ok: false,
      message: 'No insurer has a premium yet: nothing to compare.',
    });
    await service.finish({ waitMs: 0, amount: '12345', insurerId: 'united-india' });
    const compared = await service.compare({
      clientId: 'c1',
      insurerIds: ['united-india', 'hdfc-ergo'],
    });
    expect(compared).toMatchObject({ ok: true, insurers: 1, pdf: { name: 'quote.pdf' } });
    const doc = save.mock.calls.at(-1)![0];
    expect(doc).toMatchObject({
      title: 'Health insurance quotes compared',
      product: 'Comparison',
      plans: [{ name: 'United India: United India premium', amount: '12345' }],
    });
    expect(doc.members).toHaveLength(2);
    expect(doc.notes.at(-1)).toBe('Not compared (no premium yet): HDFC ERGO.');
  }, 20_000);

  it('compares the quotes for a travel client in one PDF (Compare quotes, a travel client)', async () => {
    const { save, service, request } = setup();
    await service.run(request);
    await service.finish({ waitMs: 0, amount: '4321', insurerId: 'united-india' });
    const compared = await service.compare({ travellerId: 't1', insurerIds: ['united-india'] });
    expect(compared).toMatchObject({ ok: true, insurers: 1 });
    const doc = save.mock.calls.at(-1)![0];
    expect(doc).toMatchObject({
      title: 'Travel insurance quotes compared',
      product: 'Comparison',
      clientName: 'Synthetic Traveller',
    });
    expect(doc.notes[0]).toContain('saved with the travel client');
  }, 20_000);

  it('Reset puts a kept form away (no PDF), closes the pop-ups and sends the insurer home', async () => {
    const closePopups = vi.fn(() => 2);
    const { shown, save, service, request } = setup({
      portals: { setWorking: () => undefined, closePopups },
    });
    expect((await service.run(request)).outcome).toBe('handed-over');
    shown.sentHome.length = 0;
    expect(await service.resetAll()).toEqual({
      stopped: 0,
      discarded: 1,
      closedTabs: 2,
      sentHome: 1,
    });
    expect(closePopups).toHaveBeenCalledTimes(1);
    expect(shown.sentHome.length).toBeGreaterThan(0);
    expect((await service.progress(0)).items[0]).toMatchObject({ state: 'cancelled' });
    // Nothing is left to finish, and no PDF was made.
    expect(await service.finish({ waitMs: 0, insurerId: 'united-india' })).toMatchObject({
      outcome: 'refused',
    });
    expect(save).not.toHaveBeenCalled();
  }, 20_000);

  it('Reset stops a quote still being filled', async () => {
    const { shown, service, request } = setup({ portals: { setWorking: () => undefined } });
    shown.hang = true;
    const running = service.run(request);
    await new Promise((r) => setTimeout(r, 300));
    shown.hang = false;
    const done = await service.resetAll();
    expect(done.stopped).toBe(1);
    expect((await running).outcome).toBe('cancelled');
    // A new quote can start at once (nothing is left running).
    expect((await service.run(request)).outcome).toBe('handed-over');
  }, 20_000);

  it('lets the advisor change the form first: Generate PDF takes the premium shown then', async () => {
    const { shown, save, service, request } = setup();
    const result = await service.run({ ...request, adjust: true });
    expect(result.outcome).toBe('handed-over');
    expect((await service.progress(0)).items[0]).toMatchObject({
      state: 'handed-over',
      adjust: true,
    });
    // The advisor changes the sum insured and gets the premium on United India's page.
    shown.sumInsured = '10 Lakh';
    shown.premium = true;
    const done = await service.finish({
      waitMs: 0,
      insurerId: 'united-india',
      plans: PLANS.map((p) => p.name),
    });
    expect(done).toMatchObject({ outcome: 'ready', premium: { amount: '11948' } });
    expect(save.mock.calls[0]![0].notes).toContain(
      "Changed by the advisor on United India's page before this premium: Sum Insured: 5 Lakh → 10 Lakh. The other details are as saved with the client.",
    );
    expect((await service.progress(0)).items[0]).toMatchObject({ state: 'ready', adjust: false });
  }, 20_000);

  it('keeps a premium the run read for the advisor to change, and takes it unchanged', async () => {
    const { shown, save, service, request } = setup();
    // The premium shows before the advisor touches anything: it is not the quote yet.
    shown.premium = true;
    const result = await service.run({ ...request, adjust: true });
    expect(result.outcome).toBe('handed-over');
    expect(save).not.toHaveBeenCalled();
    // Generate PDF with nothing changed: the premium shown is taken (no baseline to differ from).
    const done = await service.finish({
      waitMs: 0,
      insurerId: 'united-india',
      plans: PLANS.map((p) => p.name),
    });
    expect(done.outcome).toBe('ready');
    expect(save.mock.calls[0]![0].notes).toContain(
      "Checked by the advisor on United India's page before this premium (no change to the form was found).",
    );
  }, 20_000);

  it('Discard puts away a form the advisor was changing, without a PDF', async () => {
    const { save, service, request } = setup();
    await service.run({ ...request, adjust: true });
    expect(service.cancel('united-india')).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect((await service.progress(0)).items[0]).toMatchObject({ state: 'cancelled' });
    expect((await service.finish({ waitMs: 0, insurerId: 'united-india' })).outcome).toBe(
      'refused',
    );
  }, 20_000);

  it('Discard puts the kept form away: no PDF, the tab sent home, nothing left to finish', async () => {
    const { shown, save, service, request } = setup();
    await service.run(request);
    expect(service.cancel('united-india')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Discarded: the tab goes back to United India's home page (after the start's).
    expect(shown.sentHome.length).toBe(2);
    expect((await service.progress(0)).items[0]).toMatchObject({ state: 'cancelled' });
    expect((await service.finish({ waitMs: 0, amount: '9000' })).outcome).toBe('refused');
    expect(save).not.toHaveBeenCalled();
  }, 20_000);
});
