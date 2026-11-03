// United India motor calculator: which vehicles fit the recorded form, and the steps it runs.
import { describe, expect, it } from 'vitest';
import {
  capacityBand,
  planUiicMotorQuote,
  UIIC_VEHICLE_CLASS,
} from '../src/main/quotes/uiic-motor';
import type { PageOp } from '../src/main/quotes/page-ops';
import { VEHICLE_CLASSES, vehicleSchema, type Vehicle } from '../src/shared/contracts/vehicle';

const TODAY = new Date(2026, 10, 2);
const CAR: Vehicle = {
  vehicleClass: 'private-car',
  condition: 'new',
  registrationDate: '2026-11-01',
  zone: 'A',
  idvRupees: 650000,
  odDiscountPercent: 10,
  cubicCapacityCc: 1197,
  batteryOperated: false,
  longTermOd: false,
};

function plan(vehicle: Partial<Vehicle> & Pick<Vehicle, 'vehicleClass'>) {
  return planUiicMotorQuote(vehicleSchema.parse({ ...CAR, ...vehicle }), { today: TODAY });
}

function ops(vehicle: Partial<Vehicle> & Pick<Vehicle, 'vehicleClass'>): PageOp[] {
  const result = plan(vehicle);
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result.steps.map((s) => s.op);
}

const checkOf = (list: PageOp[], model: string) =>
  list.find((o) => o.op === 'check' && o.selector.includes(`input[ng-model="${model}"]`));
const setTo = (list: PageOp[], selector: string) =>
  list.find((o) => o.op === 'setField' && o.selector === selector);

describe('planUiicMotorQuote', () => {
  it('plans a new private car: package policy, class fields, dates, then the premium', () => {
    const list = ops({ vehicleClass: 'private-car' });
    expect(list[0]).toEqual({ op: 'waitForDialog', text: 'Choose Cover Type', timeoutMs: 30_000 });
    expect(list[1]).toMatchObject({ op: 'check', checked: true });
    expect(JSON.stringify(list[1])).toContain('value=\\"1\\"');
    expect(setTo(list, '#vehicleType')).toMatchObject({ value: '18' });
    expect(setTo(list, '#lonTermCoverTypeProp')).toMatchObject({ value: '1' });
    expect(setTo(list, '#cubicCapacity')).toMatchObject({ value: '1500' });
    expect(list).toContainEqual(
      expect.objectContaining({
        op: 'pickDate',
        input: 'input#dateOfIssueOfPolicyString',
        date: '2026-11-02',
      }),
    );
    expect(list).toContainEqual(
      expect.objectContaining({
        op: 'pickDate',
        input: 'input#dateOfPurchaseString',
        date: '2026-11-01',
      }),
    );
    expect(setTo(list, '#vehicleZone')).toMatchObject({ value: 'Zone-A' });
    expect(setTo(list, '#iibAutoRiskIdv, #autoRiskIdv')).toMatchObject({ value: '650000' });
    expect(setTo(list, '#odDisc')).toMatchObject({ value: '10' });
    expect(list.slice(-3)).toEqual([
      { op: 'clickButton', text: 'Click To See Premium', timeoutMs: 10_000 },
      { op: 'clickButton', text: 'YES', within: 'Personal Accident Covers', timeoutMs: 20_000 },
      { op: 'readTable', within: 'Premium Details', column: 'Premium', timeoutMs: 30_000 },
    ]);
    // The battery box sits outside the policy form, as recorded.
    expect(checkOf(list, 'motorPolicyData.fuelcheck')).toMatchObject({ checked: false });
    // New vehicles: no claim or NCB questions.
    expect(setTo(list, '#selectPrevNCB')).toBeUndefined();
  });

  it('plans a pre-owned car with claim and NCB, and no cover period', () => {
    const list = ops({
      vehicleClass: 'private-car',
      condition: 'pre-owned',
      claimLastYear: false,
      previousNcbPercent: 25,
    });
    expect(setTo(list, '#selectPrevNCB')).toMatchObject({ value: '25' });
    expect(checkOf(list, 'motorPolicyData.claimCheck')).toMatchObject({ checked: false });
    expect(setTo(list, '#lonTermCoverTypeProp')).toBeUndefined();
  });

  it('uses the long-term cover period when asked (3 years car, 5 years two-wheeler)', () => {
    expect(
      setTo(ops({ vehicleClass: 'private-car', longTermOd: true }), '#lonTermCoverTypeProp'),
    ).toMatchObject({ value: '3' });
    expect(
      setTo(
        ops({ vehicleClass: 'two-wheeler', cubicCapacityCc: 125, longTermOd: true }),
        '#lonTermCoverTypeProp',
      ),
    ).toMatchObject({ value: '5' });
  });

  it('fills each class with its own fields', () => {
    expect(
      setTo(
        ops({ vehicleClass: 'bus-above-6', seatingCapacity: 40, busType: 'school' }),
        '#busCategory',
      ),
    ).toMatchObject({ value: 'School Bus' });
    expect(
      setTo(ops({ vehicleClass: 'passenger-3w-upto-6', seatingCapacity: 3 }), '#seatingCapacity'),
    ).toMatchObject({ value: '3' });
    expect(
      setTo(ops({ vehicleClass: 'goods-3w-public', grossWeightKg: 1200 }), '#grossWeight'),
    ).toMatchObject({ value: '1200' });
    const special = ops({
      vehicleClass: 'special',
      specialType: 'Agricultural Tractors',
      horsePower: 35,
    });
    expect(setTo(special, '#mvehicleType')).toMatchObject({ value: 'Agricultural Tractors' });
    expect(setTo(special, '#cubicCapacity')).toMatchObject({ value: '10' });
    expect(setTo(ops({ vehicleClass: 'e-cart-private' }), '#cubicCapacity')).toBeUndefined();
  });

  it('maps engine sizes to the calculator bands', () => {
    const v = (cc: number) => ({ ...CAR, cubicCapacityCc: cc });
    expect(
      ['999', '1000', '1001', '1500', '1501'].map((c) => capacityBand('car', v(Number(c)))),
    ).toEqual(['1000', '1000', '1500', '1500', '2000']);
    expect([74, 75, 150, 151, 350, 351].map((c) => capacityBand('bike', v(c)))).toEqual([
      '70',
      '150',
      '150',
      '350',
      '350',
      '400',
    ]);
    expect(capacityBand('hp', { ...CAR, horsePower: 6 })).toBe('6');
    expect(capacityBand('hp', { ...CAR, horsePower: 6.5 })).toBe('10');
  });

  it.each([
    [
      'no cubic capacity',
      { vehicleClass: 'private-car', cubicCapacityCc: undefined },
      'cubic capacity',
    ],
    ['no horse power', { vehicleClass: 'special', specialType: 'Cranes' }, 'horse power'],
    ['no special type', { vehicleClass: 'special', horsePower: 10 }, 'special vehicle'],
    ['no seats', { vehicleClass: 'taxi-upto-6' }, 'seating capacity'],
    ['too many seats', { vehicleClass: 'taxi-upto-6', seatingCapacity: 9 }, '1 to 6'],
    ['no weight', { vehicleClass: 'goods-public' }, 'gross vehicle weight'],
    ['no bus type', { vehicleClass: 'bus-above-6', seatingCapacity: 30 }, 'type of bus'],
    [
      'no NCB for a pre-owned vehicle',
      { vehicleClass: 'private-car', condition: 'pre-owned' },
      'no-claim bonus',
    ],
    [
      'a future registration date',
      { vehicleClass: 'private-car', registrationDate: '2026-12-01' },
      'future',
    ],
  ] as const)('refuses %s, saying why', (_label, change, reason) => {
    const result = plan(change);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toContain(reason);
  });

  it('knows United India’s value for every vehicle class', () => {
    expect(Object.keys(UIIC_VEHICLE_CLASS).sort()).toEqual([...VEHICLE_CLASSES].sort());
  });
});
