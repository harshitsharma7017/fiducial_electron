// HDFC ERGO's PIE forms: the motor forms for a saved vehicle (new, or renewed from another insurer)
// and MST for a health client. What is filled, what is refused, that Calculate Premium is pressed
// and the premium read, and that Generate Quote / Generate Proposal are never pressed.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { planHdfcMotorQuote, registrationParts } from '../src/main/quotes/hdfc-motor';
import { planHdfcMstQuote } from '../src/main/quotes/hdfc-mst';
import { planHdfcRetailQuote } from '../src/main/quotes/hdfc-retail';
import { planHdfcTravelQuote } from '../src/main/quotes/hdfc-travel';
import { travellerSchema } from '../src/shared/contracts/traveller';
import { clientInputSchema } from '../src/shared/contracts/client';
import { vehicleSchema, type Vehicle } from '../src/shared/contracts/vehicle';
import {
  hdfcMotorRunSchema,
  hdfcProductFor,
  hdfcRetailRunSchema,
  hdfcTravelRunSchema,
  type HdfcMotorRun,
} from '../src/shared/insurers/hdfc';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const CAR: Vehicle = vehicleSchema.parse({
  vehicleClass: 'private-car',
  condition: 'new',
  registrationDate: '2026-11-03',
  zone: 'A',
  idvRupees: 900000,
  make: 'Maruti',
  model: 'Swift',
  variant: 'VXI',
  manufactureYear: 2026,
  engineNumber: 'ENG12345',
});
const USED: Vehicle = vehicleSchema.parse({
  ...CAR,
  condition: 'pre-owned',
  registrationDate: '2022-04-10',
  manufactureYear: 2022,
  claimLastYear: false,
  previousNcbPercent: 25,
});
const RUN: HdfcMotorRun = hdfcMotorRunSchema.parse({
  product: 'private-car',
  cover: 'comprehensive',
  customerType: 'individual',
  rtoCity: 'Ahmedabad',
  customer: { name: 'Synthetic Insured', email: 'synthetic@example.test', mobile: '9876543210' },
});
const RENEWAL: HdfcMotorRun = hdfcMotorRunSchema.parse({
  ...RUN,
  registrationNumber: 'gj-01 ab 1234',
  previous: { endDate: '2026-11-20', policyType: 'tp', insurer: 'ICICI LOMBARD' },
});
const steps = (vehicle: Vehicle, run: HdfcMotorRun) => {
  const r = planHdfcMotorQuote(vehicle, run);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const ops = (vehicle: Vehicle, run: HdfcMotorRun): PageOp[] =>
  steps(vehicle, run).steps.map((s) => s.op);
const byLabel = (vehicle: Vehicle, run: HdfcMotorRun, label: string) =>
  steps(vehicle, run)
    .steps.filter((s) => s.label === label)
    .map((s) => s.op);
const neverSaves = (list: PageOp[]) =>
  expect(list.some((o) => /generate|proposal|save/i.test(JSON.stringify(o)))).toBe(false);

describe('HDFC ERGO PIE motor forms', () => {
  it('requests name the vehicle or client, HDFC ERGO and the run', () => {
    expect(
      quoteRunRequestSchema.safeParse({
        product: 'hdfc-motor',
        vehicleId: '018f2b8e-7c1a-7b3e-9d4f-1a2b3c4d5e6f',
        insurerId: 'hdfc-ergo',
        run: RENEWAL,
      }).success,
    ).toBe(true);
    expect(
      quoteRunRequestSchema.safeParse({
        product: 'hdfc-mst',
        clientId: '018f2b8e-7c1a-7b3e-9d4f-1a2b3c4d5e6f',
        insurerId: 'hdfc-ergo',
        run: { cover: 'family-floater', years: 2 },
      }).success,
    ).toBe(true);
    expect(
      hdfcMotorRunSchema.safeParse({ ...RUN, customer: { ...RUN.customer, mobile: '12345' } })
        .success,
    ).toBe(false);
    expect(RENEWAL.registrationNumber).toBe('GJ01AB1234');
  });

  it('picks the form for the vehicle class', () => {
    expect(hdfcProductFor('private-car')).toBe('private-car');
    expect(hdfcProductFor('two-wheeler')).toBe('two-wheeler');
    expect(hdfcProductFor('goods-public')).toBe('gcv');
    expect(hdfcProductFor('bus-above-6')).toBe('pcv');
    expect(hdfcProductFor('special')).toBe('tractor');
    expect(registrationParts('GJ1AB1234')).toEqual(['GJ', '01', 'AB', '1234']);
    expect(registrationParts('nonsense')).toBeNull();
  });

  it('a new car: product and transaction type, make, model, RTO, dates, IDV, customer, then premium', () => {
    const list = ops(CAR, RUN);
    expect(list[0]).toMatchObject({ op: 'clickSelector', text: 'Comprehensive' });
    expect(byLabel(CAR, RUN, 'Transaction type')[0]).toMatchObject({
      pattern: '^buy insurance for new',
    });
    expect(byLabel(CAR, RUN, 'Model')[0]).toMatchObject({
      op: 'pickOption',
      type: 'Swift',
      options: ['Swift - VXI', 'Swift'],
      startsWith: true,
    });
    expect(byLabel(CAR, RUN, 'RTO city')[0]).toMatchObject({
      options: ['Ahmedabad - ', 'Ahmedabad'],
    });
    expect(byLabel(CAR, RUN, 'First registration date')[0]).toEqual({
      op: 'typeDate',
      input: '#Risk1',
      date: '2026-11-03',
    });
    expect(byLabel(CAR, RUN, 'IDV')[0]).toMatchObject({ value: '900000' });
    expect(byLabel(CAR, RUN, 'Customer mobile')[0]).toMatchObject({ value: '9876543210' });
    expect(list.some((o) => JSON.stringify(o).includes('Prev'))).toBe(false);
    expect(byLabel(CAR, RUN, 'Calculate Premium')[0]).toMatchObject({
      pattern: '^calculate premium',
    });
    expect(list.at(-1)).toMatchObject({ op: 'readAmount', label: 'Total Payable Premium' });
    neverSaves(list);
  });

  it('a renewal from another insurer: registration number, previous policy, claims and NCB', () => {
    expect(byLabel(USED, RENEWAL, 'Transaction type')[0]).toMatchObject({
      pattern: 'from other insurer$',
    });
    expect(
      byLabel(USED, RENEWAL, 'Registration number').map((o) => (o as { value: string }).value),
    ).toEqual(['GJ', '01', 'AB', '1234']);
    expect(byLabel(USED, RENEWAL, 'Previous policy end date')[0]).toMatchObject({
      input: '#PolicyEffectiveFromDate',
      date: '2026-11-20',
    });
    expect(byLabel(USED, RENEWAL, 'Previous policy type')[0]).toMatchObject({ value: 'TP' });
    expect(byLabel(USED, RENEWAL, 'Previous claims')[0]).toMatchObject({ text: 'No' });
    expect(byLabel(USED, RENEWAL, 'Previous NCB')[0]).toMatchObject({ value: '25' });
    expect(byLabel(USED, RENEWAL, 'Previous insurer')[0]).toMatchObject({ value: 'ICICI LOMBARD' });
    neverSaves(ops(USED, RENEWAL));
  });

  it('liability only: no IDV; GCV: IDV and weight from PIE’s own boxes', () => {
    expect(byLabel(CAR, { ...RUN, cover: 'liability' }, 'IDV')).toEqual([]);
    const truck = vehicleSchema.parse({
      ...CAR,
      vehicleClass: 'goods-public',
      grossWeightKg: 12000,
    });
    const gcv = steps(truck, { ...RUN, product: 'gcv' });
    expect(gcv.steps.some((s) => s.label === 'IDV')).toBe(false);
    expect(gcv.byHand[0]).toContain('body and chassis IDV');
    expect(gcv.steps.find((s) => s.label === 'Gross vehicle weight')?.op).toMatchObject({
      value: '12000',
    });
  });

  it('refuses what the form cannot take', () => {
    const refused = (vehicle: Vehicle, run: HdfcMotorRun) => {
      const r = planHdfcMotorQuote(vehicle, run);
      return r.ok ? [] : r.problems;
    };
    expect(refused(CAR, { ...RUN, product: 'two-wheeler' })[0]).toContain('not for this vehicle');
    expect(refused(USED, RUN)[0]).toContain("previous policy's end date");
    expect(refused(CAR, { ...RUN, cover: 'own-damage' })[0]).toContain('pre-owned');
    expect(refused(vehicleSchema.parse({ ...CAR, make: undefined }), RUN)[0]).toContain('make');
  });
});

describe('HDFC ERGO PIE MST (Medisure Super Top-up)', () => {
  const FAMILY = clientInputSchema.parse({
    customer: { name: 'Synthetic Insured' },
    pincode: '380001',
    members: [
      { relationship: 'son', age: 8, dateOfBirth: '2018-03-14' },
      { relationship: 'self', age: 40, dateOfBirth: '1986-01-25' },
      { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02' },
    ],
  });

  it('cover, term, members adults first (tab, date of birth, relation), Cover Detail, premium', () => {
    const r = planHdfcMstQuote(FAMILY, { cover: 'family-floater', years: 2 });
    if (!r.ok) throw new Error(r.problems.join('; '));
    const list = r.steps.map((s) => s.op);
    expect(list.slice(1, 6)).toEqual([
      expect.objectContaining({ selector: 'label[name="Risk101"]', text: 'Family Floater' }),
      expect.objectContaining({ selector: 'label[name="Risk102"]', pattern: '^2 years?$' }),
      expect.objectContaining({ text: 'Member Detail' }),
      { op: 'stepper', index: 0, count: 2, timeoutMs: 10000 },
      { op: 'stepper', index: 1, count: 1, timeoutMs: 5000 },
    ]);
    expect(list.slice(6, 15)).toEqual([
      expect.objectContaining({ selector: '#Adult1' }),
      { op: 'typeDate', input: '#Info02_0', date: '1986-01-25' },
      { op: 'setField', selector: '#Info12_0', value: 'Self' },
      expect.objectContaining({ selector: '#Adult2' }),
      { op: 'typeDate', input: '#Info02_1', date: '1988-07-02' },
      { op: 'setField', selector: '#Info12_1', value: 'Spouse' },
      expect.objectContaining({ selector: '#Child1' }),
      { op: 'typeDate', input: '#Info02_2', date: '2018-03-14' },
      { op: 'setField', selector: '#Info12_2', value: 'Dependent Son' },
    ]);
    expect(list.at(-2)).toMatchObject({ text: 'Cover Detail' });
    expect(list.at(-1)).toMatchObject({ op: 'readAmount', label: 'Total Payable Premium' });
    neverSaves(list);
  });

  it('refuses an individual cover for several members, or a member without a date of birth', () => {
    expect(planHdfcMstQuote(FAMILY, { cover: 'individual', years: 1 }).ok).toBe(false);
    const noDob = clientInputSchema.parse({
      ...FAMILY,
      members: [{ relationship: 'self', age: 40 }],
    });
    expect(planHdfcMstQuote(noDob, { cover: 'individual', years: 1 })).toEqual({
      ok: false,
      problems: ["Add the proposer (self)'s date of birth."],
    });
  });
});

describe('HDFC ERGO PIE retail health (Energy, Optima Secure, Optima Restore) and Retail Travel', () => {
  const TODAY = new Date(2026, 10, 5);
  const FAMILY = clientInputSchema.parse({
    customer: { name: 'Synthetic Insured' },
    pincode: '380001',
    members: [
      { relationship: 'son', age: 8, dateOfBirth: '2018-03-14' },
      { relationship: 'self', age: 40, dateOfBirth: '1986-01-25' },
      { relationship: 'spouse', age: 38, dateOfBirth: '1988-07-02' },
    ],
  });
  const SINGLE = clientInputSchema.parse({ ...FAMILY, members: [FAMILY.members[1]] });
  const SECURE = hdfcRetailRunSchema.parse({
    product: 'optima-secure',
    cover: 'family',
    years: 2,
    sumInsuredLacs: 10,
    city: 'Mumbai',
    posp: 'Synthetic POSP',
  });
  const opsOf = (r: ReturnType<typeof planHdfcRetailQuote>) => {
    if (!r.ok) throw new Error(r.problems.join('; '));
    return r.steps;
  };

  it('Optima Secure for a family: new business, plan, eldest age, period, lakh, members, POSP, premium', () => {
    const list = opsOf(planHdfcRetailQuote(FAMILY, SECURE, { today: TODAY }));
    const op = (label: string) => list.filter((s) => s.label === label).map((s) => s.op);
    expect(op('I would like to Insure')[0]).toMatchObject({ selector: '#ProductType_Family' });
    expect(op('Business type')[0]).toMatchObject({ op: 'pickFromList', option: 'New Business' });
    expect(op('Plan type')[0]).toMatchObject({ option: 'Optima Secure' });
    expect(op('Age')[0]).toMatchObject({ value: '40' });
    expect(op('Policy period')[0]).toMatchObject({ option: '2 Year' });
    expect(op('Sum insured')[0]).toMatchObject({ option: '10' });
    expect(op('Members')[0]).toMatchObject({ option: '2Adult+1Child' });
    expect(op('SP/POSP name or code')[0]).toMatchObject({
      op: 'pickOption',
      type: 'Synthetic POSP',
    });
    expect(op('BASIC DETAILS')[0]).toMatchObject({ text: 'BASIC DETAILS' });
    expect(list.at(-1)?.op).toMatchObject({ op: 'readAmount', label: 'Total Payable Premium' });
    neverSaves(list.map((s) => s.op));
  });

  it('Energy: individual only, its city, existing cover and plan after PRODUCT DETAILS', () => {
    const energy = hdfcRetailRunSchema.parse({
      ...SECURE,
      product: 'energy',
      cover: 'individual',
      plan: 'GOLD WITH NO COPYAMENT',
      existingSumInsured: 500000,
    });
    const list = opsOf(planHdfcRetailQuote(SINGLE, energy, { today: TODAY }));
    const labels = list.map((s) => s.label);
    expect(labels.indexOf('Plan type')).toBeGreaterThan(labels.indexOf('PRODUCT DETAILS'));
    expect(list.find((s) => s.label === 'I stay in')?.op).toMatchObject({ option: 'Mumbai' });
    expect(list.find((s) => s.label === 'Existing health insurance')?.op).toMatchObject({
      text: 'Yes',
    });
    expect(planHdfcRetailQuote(FAMILY, { ...energy, cover: 'family' }, { today: TODAY }).ok).toBe(
      false,
    );
  });

  it('refuses an individual cover for several members', () => {
    expect(
      planHdfcRetailQuote(FAMILY, { ...SECURE, cover: 'individual' }, { today: TODAY }).ok,
    ).toBe(false);
  });

  it('Retail Travel: new, individual, dates, plan, traveller, Calculate Premium, premium', () => {
    const traveller = travellerSchema.parse({
      customer: { name: 'Synthetic Traveller' },
      pincode: '380001',
      dateOfBirth: '1990-05-06',
    });
    const r = planHdfcTravelQuote(
      traveller,
      hdfcTravelRunSchema.parse({
        departureDate: '2026-12-01',
        returnDate: '2026-12-10',
        plan: 'Gold',
      }),
      { today: TODAY },
    );
    const list = opsOf(r);
    expect(list.map((s) => s.op)).toEqual(
      expect.arrayContaining([
        { op: 'typeDate', input: '#PolicyEffectiveFromDate', date: '2026-12-01' },
        { op: 'typeDate', input: '#PolicyEffectiveToDate', date: '2026-12-10' },
        expect.objectContaining({ op: 'pickOption', selector: '#Risk103', type: 'Gold' }),
        { op: 'typeDate', input: '#Info02_0', date: '1990-05-06' },
      ]),
    );
    neverSaves(list.map((s) => s.op));
    const past = planHdfcTravelQuote(
      traveller,
      hdfcTravelRunSchema.parse({
        departureDate: '2026-11-01',
        returnDate: '2026-11-10',
        plan: 'Gold',
      }),
      { today: TODAY },
    );
    expect(past.ok).toBe(false);
    expect(
      hdfcTravelRunSchema.safeParse({
        departureDate: '2026-12-10',
        returnDate: '2026-12-01',
        plan: 'Gold',
      }).success,
    ).toBe(false);
  });
});
