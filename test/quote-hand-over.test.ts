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
    expect(progress.left).toEqual([
      "Proposer's gender: fill it in yourself (the insurer's list does not offer the saved value).",
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
    const shown = { premium: false, pressed: [] as string[] };
    let opened = false;
    const wc = (id: number, url: string) => ({
      id,
      isDestroyed: () => false,
      getURL: () => url,
      executeJavaScriptInIsolatedWorld: (_world: number, scripts: { code: string }[]) => {
        const code = scripts[0]!.code;
        if (code.includes('"op":"clickLink"')) opened = true;
        const press = /"op":"clickButton","text":"([^"]+)"/.exec(code);
        if (press) shown.pressed.push(press[1]!);
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
    return { shown, windowsOf: () => (opened ? [home, calculator] : [home]) };
  };
  const setup = () => {
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
      } as never,
      windowsOf: windowsOf as never,
      logger: createLogger([]),
      now: () => AT,
      pdfs: { save, open: () => Promise.resolve(true) },
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
  }, 20_000);

  it('reads the premium once the advisor has it, and saves the PDF', async () => {
    const { shown, save, service, request } = setup();
    await service.run(request);
    expect((await service.finish({ waitMs: 0 })).outcome).toBe('handed-over');
    expect(save).not.toHaveBeenCalled();
    // The advisor fills the mobile and presses Check Premium on United India's page.
    setTimeout(() => (shown.premium = true), 300);
    const result = await service.finish({ waitMs: 10_000 });
    expect(result).toMatchObject({
      outcome: 'ready',
      plans: PLANS,
      premium: { amount: '11948' },
      pdf: { name: 'quote.pdf' },
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].members).toHaveLength(2);
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

  it('stops watching when asked, and the premium can still be typed', async () => {
    const { save, service, request } = setup();
    await service.run(request);
    const waiting = service.finish({ waitMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(service.cancel()).toBe(true);
    expect(await waiting).toMatchObject({ outcome: 'handed-over' });
    expect((await service.finish({ waitMs: 0, amount: '9000' })).outcome).toBe('ready');
    expect(save).toHaveBeenCalledTimes(1);
  }, 20_000);
});
