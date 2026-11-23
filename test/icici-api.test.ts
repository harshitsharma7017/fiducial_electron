// ICICI Lombard premiums by its partner API (request of 21 November 2026): the sign-in and its token,
// the motor and health premium requests built as ICICI's kits describe them, the settings kept in
// the vault, and the quote service end to end against a fake ICICI. Contacts no one.
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createIciciApiClient, IciciApiError } from '../src/main/icici-api/client';
import { iciciDob, planIciciHealthPremium } from '../src/main/icici-api/health';
import { iciciDate, planIciciMotorPremium } from '../src/main/icici-api/motor';
import { createIciciApiService } from '../src/main/icici-api/service';
import { createIciciApiSettings } from '../src/main/icici-api/settings';
import { createLogger, type LogRecord } from '../src/main/logging/logger';
import type { QuoteDocument } from '../src/main/quotes/quote-document';
import { createQuoteService } from '../src/main/quotes/service';
import type { SecretBackend } from '../src/main/secrets/secret-store';
import { createVaultOpener } from '../src/main/secrets/vault-opener';
import { clientInputSchema } from '../src/shared/contracts/client';
import {
  iciciApiHealthRunSchema,
  iciciMotorProductCode,
  type IciciApiMotorRun,
} from '../src/shared/insurers/icici-api';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

vi.mock('electron', () => ({}));

const LOGIN = { login: 'partner-uat', encryptedPassword: 'ENC==secret' };
const NOW = Date.parse('2026-11-21T06:00:00Z');

/** A fake ICICI: answers the token and premium endpoints; records what it was sent. */
function fakeIcici(premium: (path: string, body: Record<string, unknown>) => unknown) {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  let tokens = 0;
  const fetch = vi.fn((url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const auth = (init.headers as Record<string, string>).Authorization ?? null;
    calls.push({ url, body, auth });
    const json = (status: number, data: unknown) =>
      Promise.resolve(new Response(JSON.stringify(data), { status }));
    if (url.endsWith('/auth-api/access/token')) {
      if (body.Password !== LOGIN.encryptedPassword) {
        return json(200, { success: false, errorMessage: 'Invalid credentials' });
      }
      tokens += 1;
      return json(200, {
        token: `jwt-${tokens}`,
        expiry: new Date(NOW + 20 * 60_000).toISOString(),
        success: true,
      });
    }
    if (auth !== `Bearer jwt-${tokens}`) return json(401, {});
    return json(200, premium(url, body));
  });
  return { fetch, calls, tokens: () => tokens };
}

const MOTOR_ANSWER = {
  BaseOdPremium: 13408,
  BaseTPPremium: 3416,
  NcbAmount: 6034,
  NcbPercentage: 45,
  OdPremium: 6637,
  GST: 1810,
  Premium: 10053,
  FinalPremium: 11863,
  TransactionId: 'epn_4kmbJzdvQtrANuxnme',
  IDV: 510498,
  MinIDV: 456761,
  MaxIDV: 564235,
  IsInspectionRequire: false,
  MotorPremium: { MotorOwnDamage: { ZeroDepreciationPremium: 2100, RsaPremium: 199 } },
  Success: true,
};
const HEALTH_ANSWER = {
  BasicPremium: 5988,
  TotalPremium: 7065,
  ZoneName: 'Zone B',
  TotalTax: 1078,
  TransactionId: 'epn_4n1KxHJqaKM8C',
  Success: true,
  Premium: { Loading: [{ CoverName: 'NH', CoverPremium: 714 }], Discount: [] },
};

const CAR = {
  vehicleClass: 'private-car',
  condition: 'pre-owned',
  registrationDate: '2021-04-01',
  zone: 'A',
  idvRupees: 500000,
  previousNcbPercent: 45,
  claimLastYear: false,
} as const;
const RUN: IciciApiMotorRun = {
  cover: 'package',
  years: 1,
  used: false,
  makeCode: 10,
  modelCode: 11846,
  rtoCode: 12621,
  registrationNumber: 'MH01AB1234',
  previous: { expiryDate: '2026-11-30', type: 'comprehensive' },
  idv: 'avg',
  addOns: ['ZD', 'RSA'],
  hasExistingPaCover: false,
};

describe('signing in to ICICI Lombard', () => {
  it('reuses the token until shortly before it expires, and signs in again on a 401', async () => {
    const icici = fakeIcici(() => MOTOR_ANSWER);
    let now = NOW;
    const api = createIciciApiClient({
      mode: 'uat',
      login: LOGIN,
      fetch: icici.fetch,
      now: () => now,
    });
    await api.post('/generic/motor-fw/generic/premium', {});
    await api.post('/generic/motor-fw/generic/premium', {});
    expect(icici.tokens()).toBe(1);
    expect(icici.calls[0]).toMatchObject({
      url: 'https://ilesbapigee.insurancearticlez.com/auth-api/access/token',
      body: { Login: 'partner-uat', Password: 'ENC==secret', LoginType: 'App' },
      auth: null,
    });
    expect(icici.calls[1]!.auth).toBe('Bearer jwt-1');
    now += 19.5 * 60_000; // within a minute of expiry
    await api.post('/generic/motor-fw/generic/premium', {});
    expect(icici.tokens()).toBe(2);
  });

  it('uses the production address in production', async () => {
    const icici = fakeIcici(() => MOTOR_ANSWER);
    const api = createIciciApiClient({ mode: 'production', login: LOGIN, fetch: icici.fetch });
    await api.signIn();
    expect(icici.calls[0]!.url).toBe('https://janus.icicilombard.com/auth-api/access/token');
  });

  it('says plainly when the login is wrong, the IP is not allowed, or ICICI is busy', async () => {
    const bad = createIciciApiClient({
      mode: 'uat',
      login: { ...LOGIN, encryptedPassword: 'wrong' },
      fetch: fakeIcici(() => ({})).fetch,
    });
    await expect(bad.signIn()).rejects.toMatchObject({
      kind: 'sign-in',
      message: expect.stringContaining('ICICI says: Invalid credentials') as string,
    });
    for (const [status, kind] of [
      [403, 'forbidden'],
      [429, 'rate-limited'],
      [502, 'insurer'],
    ] as const) {
      const api = createIciciApiClient({
        mode: 'uat',
        login: LOGIN,
        fetch: (url) =>
          Promise.resolve(
            url.endsWith('/token')
              ? new Response(JSON.stringify({ token: 't', success: true }), { status: 200 })
              : new Response('{}', { status }),
          ),
      });
      const err = await api.post('/x', {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(IciciApiError);
      expect((err as IciciApiError).kind).toBe(kind);
    }
    const offline = createIciciApiClient({
      mode: 'production',
      login: LOGIN,
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(offline.signIn()).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('allow-listed') as string,
    });
  });
});

describe('the motor premium request', () => {
  it("uses the kits' product codes", () => {
    expect(iciciMotorProductCode('4w', 'rollover', 'package', 1)).toBe(21);
    expect(iciciMotorProductCode('4w', 'rollover', 'package', 3)).toBe(53);
    expect(iciciMotorProductCode('4w', 'new', 'package', 1)).toBe(20);
    expect(iciciMotorProductCode('4w', 'rollover', 'own-damage', 1)).toBe(22);
    expect(iciciMotorProductCode('2w', 'rollover', 'liability', 1)).toBe(24);
    expect(iciciMotorProductCode('2w', 'used', 'package', 1)).toBe(26);
    expect(iciciMotorProductCode('2w', 'new', 'package', 3)).toBeNull();
  });

  it('sends dates as midnight in India, as the samples do', () => {
    expect(iciciDate('2017-04-01')).toBe('2017-03-31T18:30:00Z');
  });

  it('builds a car rollover from the vehicle and the run', () => {
    const plan = planIciciMotorPremium(CAR, RUN);
    if (!plan.ok) throw new Error(plan.problems.join('; '));
    expect(plan.vehicle).toBe('4w');
    expect(plan.body).toMatchObject({
      ProductCode: 21,
      MakeCode: 10,
      ModelCode: 11846,
      RTOCode: 12621,
      RegistrationNo: 'MH01AB1234',
      RegistrationDate: '2021-03-31T18:30:00Z',
      IDVType: 3,
      PreviousPolicyNcbPercentage: 45,
      PreviousPolicyClaimed: false,
      PreviousPolicyExpiryDate: '2026-11-29T18:30:00Z',
      PreviousPolicyType: 1,
      AddOns: ['ZD', 'RSA'],
      IsLive: true,
    });
    expect(plan.body).not.toHaveProperty('IDV');
    expect(typeof plan.body.RequestId).toBe('string');
  });

  it('asks by the registration number alone when no codes are given, and needs one or the other', () => {
    const { makeCode: _m, modelCode: _o, rtoCode: _r, ...noCodes } = RUN;
    const plan = planIciciMotorPremium(CAR, noCodes);
    if (!plan.ok) throw new Error(plan.problems.join('; '));
    expect(plan.body).toMatchObject({ RegistrationNo: 'MH01AB1234', ProductCode: 21 });
    for (const key of ['MakeCode', 'ModelCode', 'RTOCode'])
      expect(plan.body).not.toHaveProperty(key);
    const bare = planIciciMotorPremium(
      { ...CAR, condition: 'new' },
      { ...noCodes, registrationNumber: undefined, previous: undefined },
    );
    expect(!bare.ok && bare.problems).toContain(
      "Add the registration number, or ICICI's make, model and RTO codes.",
    );
  });

  it("sends the vehicle's own IDV when asked", () => {
    const plan = planIciciMotorPremium(CAR, { ...RUN, idv: 'vehicle' });
    expect(plan.ok && plan.body).toMatchObject({ IDV: 500000 });
    expect(plan.ok && plan.body).not.toHaveProperty('IDVType');
  });

  it('refuses what the kits do not offer, saying why', () => {
    const problems = (v: object, r: Partial<IciciApiMotorRun>) => {
      const plan = planIciciMotorPremium({ ...CAR, ...v }, { ...RUN, ...r });
      return plan.ok ? [] : plan.problems.join(' ');
    };
    expect(problems({ vehicleClass: 'goods-public' }, {})).toContain(
      'private cars and two-wheelers',
    );
    expect(problems({}, { previous: undefined })).toContain("previous policy's expiry");
    expect(problems({}, { cover: 'own-damage' })).toContain('third-party policy');
    expect(problems({}, { cover: 'liability', years: 3 })).toContain('one year only');
    expect(problems({ vehicleClass: 'two-wheeler' }, { addOns: ['GC'] })).toContain('GC');
    expect(problems({ condition: 'new' }, { registrationNumber: undefined, years: 2 })).toContain(
      'one-year package',
    );
  });
});

describe('the health premium request', () => {
  const FAMILY = clientInputSchema.parse({
    customer: { name: 'Synthetic Couple' },
    pincode: '400069',
    members: [
      { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
      { relationship: 'spouse', age: 40, dateOfBirth: '1986-11-04', gender: 'female' },
      { relationship: 'son', age: 8, dateOfBirth: '2018-08-30', gender: 'male' },
    ],
  });
  const today = new Date(2026, 10, 21);

  it("builds Elevate from the client's members, in the kit's words", () => {
    const run = iciciApiHealthRunSchema.parse({
      product: 'elevate',
      sumInsured: 1000000,
      tenure: 2,
      preExistingDisease: false,
      paymentOption: 'annual',
    });
    const plan = planIciciHealthPremium(FAMILY, run, { today, imidCode: 'IM-1' });
    if (!plan.ok) throw new Error(plan.problems.join('; '));
    expect(plan.body).toMatchObject({
      ProductCode: 18,
      SumInsured: 1000000,
      Tenure: 2,
      PinCode: '400069',
      PaymentOption: 0,
      ImidCode: 'IM-1',
    });
    expect(plan.body.Insured).toEqual([
      expect.objectContaining({
        InsuredType: 'Adult',
        Name: 'Synthetic Couple',
        DateOfBirth: '14-Mar-1985',
        Gender: 'Male',
        IsPED: false,
        RelationshipWithApplicant: 'SELF',
      }),
      expect.objectContaining({ Name: 'Spouse Couple', RelationshipWithApplicant: 'SPOUSE' }),
      expect.objectContaining({ InsuredType: 'Kid', RelationshipWithApplicant: 'SON' }),
    ]);
    expect(plan.body).not.toHaveProperty('VoluntaryDeductible');
  });

  it('builds Activate Booster with its deductible', () => {
    const run = iciciApiHealthRunSchema.parse({
      product: 'activate-booster',
      sumInsured: 2000000,
      deductible: 500000,
      tenure: 1,
      preExistingDisease: true,
      paymentOption: 'monthly',
    });
    const plan = planIciciHealthPremium(FAMILY, run, { today });
    expect(plan.ok && plan.body).toMatchObject({
      ProductCode: 19,
      VoluntaryDeductible: 500000,
      IsCombo: false,
      PaymentOption: 1,
    });
    expect(plan.ok && (plan.body.Insured as { IsPED: boolean }[])[0]!.IsPED).toBe(true);
  });

  it("refuses Elevate sums and booster deductibles ICICI's kit does not list", () => {
    const base = { tenure: 1, preExistingDisease: false, paymentOption: 'annual' };
    expect(
      iciciApiHealthRunSchema.safeParse({ ...base, product: 'elevate', sumInsured: 300000 })
        .success,
    ).toBe(false);
    expect(
      iciciApiHealthRunSchema.safeParse({
        ...base,
        product: 'activate-booster',
        sumInsured: 1000000,
      }).success,
    ).toBe(false);
  });

  it('asks for what the record lacks', () => {
    const plan = planIciciHealthPremium(
      { ...FAMILY, members: [{ relationship: 'self', age: 41 }] },
      iciciApiHealthRunSchema.parse({
        product: 'elevate',
        sumInsured: 500000,
        tenure: 1,
        preExistingDisease: false,
        paymentOption: 'annual',
      }),
      { today },
    );
    expect(!plan.ok && plan.problems).toEqual([
      "Add the proposer's date of birth.",
      "Add the proposer's gender.",
    ]);
    expect(iciciDob('1989-08-30')).toBe('30-Aug-1989');
  });
});

// A fake OS secret store (as in insurer-login.test.ts): XOR, no integrity.
function fakeBackend(): SecretBackend {
  const stream = (iv: Buffer, n: number): Buffer => {
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i += 32) {
      createHash('sha256')
        .update(`seed:${iv.toString('hex')}:${i}`)
        .digest()
        .copy(out, i);
    }
    return out;
  };
  return {
    isAsyncEncryptionAvailable: () => Promise.resolve(true),
    encryptStringAsync: (plain) => {
      const iv = randomBytes(16);
      const data = Buffer.from(plain, 'utf8');
      const key = stream(iv, data.length);
      return Promise.resolve(Buffer.concat([iv, data.map((b, i) => b ^ key[i]!)]));
    },
    decryptStringAsync: (sealed) => {
      const iv = sealed.subarray(0, 16);
      const data = sealed.subarray(16);
      const key = stream(iv, data.length);
      return Promise.resolve({
        shouldReEncrypt: false,
        result: Buffer.from(data.map((b, i) => b ^ key[i]!)).toString('utf8'),
      });
    },
  };
}
const root = mkdtempSync(join(tmpdir(), 'fqf-icici-api-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let dirs = 0;
const settings = () =>
  createIciciApiSettings(createVaultOpener(join(root, `v${++dirs}`), fakeBackend()));

describe('ICICI Lombard API settings', () => {
  it('keeps a login per environment and the chosen environment; shows only what is saved', async () => {
    const s = settings();
    expect(await s.status()).toEqual({ mode: null, saved: { uat: false, production: false } });
    await s.saveLogin('uat', { ...LOGIN, imidCode: 'IM-1' });
    await s.setMode('uat');
    expect(await s.status()).toEqual({ mode: 'uat', saved: { uat: true, production: false } });
    expect(await s.active()).toEqual({ mode: 'uat', login: { ...LOGIN, imidCode: 'IM-1' } });
    await s.setMode('production');
    // Production chosen without its login: not set up.
    expect(await s.active()).toBeNull();
    expect(await s.forgetLogin('uat')).toBe(true);
    await s.setMode(null);
    expect(await s.status()).toEqual({ mode: null, saved: { uat: false, production: false } });
  });
});

describe('ICICI Lombard premiums through the quote service', () => {
  const vehicle = {
    id: 'v1',
    saved: { name: 'Swift', vehicle: CAR },
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
  const setup = async (answer: unknown, saved = true) => {
    const s = settings();
    if (saved) {
      await s.saveLogin('uat', LOGIN);
      await s.setMode('uat');
    }
    const icici = fakeIcici(() => answer);
    const records: LogRecord[] = [];
    const api = createIciciApiService({
      enabled: true,
      settings: s,
      logger: createLogger([(r) => records.push(r)]),
      fetch: icici.fetch,
    });
    const save = vi.fn((_doc: QuoteDocument, _title: string) => Promise.resolve('icici.pdf'));
    const service = createQuoteService({
      enabled: true,
      clients: {
        getVehicle: () => Promise.resolve(vehicle),
        get: () =>
          Promise.resolve({
            id: 'c1',
            createdAt: '2026-11-01T00:00:00.000Z',
            updatedAt: '2026-11-01T00:00:00.000Z',
            client: clientInputSchema.parse({
              customer: { name: 'Synthetic Couple' },
              pincode: '400069',
              members: [
                { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
                { relationship: 'spouse', age: 40, dateOfBirth: '1986-11-04', gender: 'female' },
              ],
            }),
          }),
      } as never,
      // No portal is open: the API needs none.
      windowsOf: () => [],
      logger: createLogger([(r) => records.push(r)]),
      now: () => new Date(NOW),
      pdfs: { save, open: () => Promise.resolve(true) },
      iciciApi: () => api.connect(),
    });
    return { service, api, save, icici, records };
  };
  const request = quoteRunRequestSchema.parse({
    product: 'icici-api-motor',
    vehicleId: 'v1',
    insurerId: 'icici-lombard',
    run: { ...RUN, registrationNumber: 'mh 01 ab 1234' },
  });

  it('quotes a car without any portal open, and saves a PDF with the breakdown', async () => {
    const { service, save, icici, records } = await setup(MOTOR_ANSWER);
    const result = await service.run(request);
    expect(result).toMatchObject({
      outcome: 'ready',
      premium: {
        amount: '11863',
        label: 'ICICI Lombard car, package (comprehensive), IDV ₹5,10,498',
      },
      pdf: { name: 'icici.pdf' },
    });
    expect(result.message).toContain('(UAT)');
    expect(result.breakdown).toContainEqual({ label: 'IDV range', value: '₹4,56,761 – ₹5,64,235' });
    expect(result.breakdown).toContainEqual({
      label: 'Add-on: Zero depreciation',
      value: '₹2,100',
    });
    expect(icici.calls.at(-1)!.url).toBe(
      'https://ilesbapigee.insurancearticlez.com/generic/motor-fw/generic/premium',
    );
    const doc = save.mock.calls[0]![0];
    expect(doc.details).toContainEqual(['Registration number', 'MH01AB1234']);
    expect(doc.details).toContainEqual(['GST', '₹1,810']);
    expect(doc.details).toContainEqual(['Environment', 'ICICI UAT (test) — not a live premium']);
    // Nothing ICICI was sent or answered is logged.
    expect(JSON.stringify(records)).not.toMatch(/ENC==secret|partner-uat|MH01AB1234|jwt-/);
  });

  it("gives ICICI's own reason when it does not quote", async () => {
    const { service, save } = await setup({
      Success: false,
      ErrorMessage: 'Model not mapped for RTO',
    });
    const result = await service.run(request);
    expect(result).toMatchObject({ outcome: 'failed' });
    expect(result.message).toContain('Model not mapped for RTO');
    expect(save).not.toHaveBeenCalled();
  });

  it('says how to set the API up when it is not', async () => {
    const { service, icici } = await setup(MOTOR_ANSWER, false);
    const result = await service.run(request);
    expect(result.outcome).toBe('refused');
    expect(result.message).toContain('Partner');
    expect(icici.fetch).not.toHaveBeenCalled();
  });

  it('quotes Elevate for a health client, with the zone and tax in the PDF', async () => {
    const { service, save, icici } = await setup(HEALTH_ANSWER);
    const result = await service.run(
      quoteRunRequestSchema.parse({
        product: 'icici-api-health',
        clientId: 'c1',
        insurerId: 'icici-lombard',
        run: {
          product: 'elevate',
          sumInsured: 500000,
          tenure: 1,
          preExistingDisease: false,
          paymentOption: 'annual',
        },
      }),
    );
    expect(result).toMatchObject({
      outcome: 'ready',
      premium: { amount: '7065', label: 'ICICI Lombard Elevate, ₹5,00,000, 1 year' },
      pdf: { name: 'icici.pdf' },
    });
    expect(icici.calls.at(-1)!.url).toBe(
      'https://ilesbapigee.insurancearticlez.com/health-fresh/elevate/generic/premium',
    );
    const doc = save.mock.calls[0]![0];
    expect(doc.title).toBe('Health insurance quote');
    expect(doc.members).toHaveLength(2);
    expect(doc.details).toContainEqual(['Zone', 'Zone B']);
    expect(doc.details).toContainEqual(['Tax', '₹1,078']);
  });

  it('checks the sign-in from the settings', async () => {
    const { api } = await setup(MOTOR_ANSWER);
    expect(await api.test()).toEqual({ ok: true, message: 'Signed in to ICICI Lombard UAT.' });
  });
});
