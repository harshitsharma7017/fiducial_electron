// United India: Motor Premium Calculator, automated from the recordings of 2 November 2026
// (united-india-2026-11-02T14-12-00-901Z: the flow to the premium; …T15-02-55-718Z: every
// vehicle class, new and pre-owned) and the advisor's screenshot of "Premium Details":
//   home page tile → calculator pop-up → "Choose Cover Type": Package Policy → Ok →
//   Type of Vehicle (New / Pre-Owned) → Vehicle Class → the class's own fields →
//   Risk Start Date and Date of Registration (calendars) → Zone → IDV → OD Discount →
//   Click To See Premium → "continue without Personal Accident Covers?" YES →
//   "Premium Details": the premium (including GST) is read and returned.
// Only Package Policy is automated (the other cover types were not recorded). A vehicle missing
// a detail its class needs is refused with the reason, before anything is touched.
import type { ClientInput, Vehicle, VehicleClass } from '../../shared/contracts/client';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

const FORM = 'motorPolicyData.mtrInitData.NewMotorPolicyForm';
/** A field by its AngularJS model, given in full. */
const byFullModel = (tag: string, model: string): string =>
  ['ng-model', 'data-ng-model', 'x-ng-model'].map((a) => `${tag}[${a}="${model}"]`).join(', ');
/** A field of the policy form (most of them). */
const byModel = (tag: string, name: string): string => byFullModel(tag, `${FORM}.${name}`);

/** United India's Vehicle Class values (from the recording). */
export const UIIC_VEHICLE_CLASS: Record<VehicleClass, string> = {
  'private-car': '18',
  'two-wheeler': '3',
  'taxi-upto-6': '9',
  'bus-above-6': '11',
  'passenger-2w': '23',
  'passenger-3w-upto-6': '8',
  'passenger-3w-7-to-17': '16',
  'goods-private': '20',
  'goods-public': '19',
  'goods-3w-private': '22',
  'goods-3w-public': '21',
  'e-cart-private': '26',
  'e-cart-public': '25',
  'e-rickshaw': '24',
  special: '12',
};

type CcBands = 'car' | 'bike' | 'hp';
/** What each class's form asks for, beyond the fields every class has (from the recording). */
const CLASS_FIELDS: Record<
  VehicleClass,
  {
    cc?: CcBands;
    seats?: { min: number; max: number };
    weight?: boolean;
    bus?: boolean;
    special?: boolean;
    battery?: boolean;
    longTerm?: { years: number };
  }
> = {
  'private-car': { cc: 'car', battery: true, longTerm: { years: 3 } },
  'two-wheeler': { cc: 'bike', battery: true, longTerm: { years: 5 } },
  'taxi-upto-6': { cc: 'car', seats: { min: 1, max: 6 } },
  'bus-above-6': { seats: { min: 7, max: 500 }, bus: true },
  'passenger-2w': { seats: { min: 1, max: 2 } },
  'passenger-3w-upto-6': { seats: { min: 1, max: 6 } },
  'passenger-3w-7-to-17': { seats: { min: 7, max: 17 } },
  'goods-private': { cc: 'bike', weight: true },
  'goods-public': { cc: 'bike', weight: true },
  'goods-3w-private': { cc: 'bike', weight: true },
  'goods-3w-public': { weight: true },
  'e-cart-private': {},
  'e-cart-public': {},
  'e-rickshaw': { seats: { min: 2, max: 50 } },
  special: { cc: 'hp', special: true },
};

/** The calculator's band for an engine size (values from the recording). */
export function capacityBand(bands: CcBands, vehicle: Vehicle): string | null {
  if (bands === 'hp') {
    return vehicle.horsePower === undefined ? null : vehicle.horsePower <= 6 ? '6' : '10';
  }
  const cc = vehicle.cubicCapacityCc;
  if (cc === undefined) return null;
  if (bands === 'car') return cc <= 1000 ? '1000' : cc <= 1500 ? '1500' : '2000';
  return cc < 75 ? '70' : cc <= 150 ? '150' : cc <= 350 ? '350' : '400';
}

const isoToday = (today: Date): string =>
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

export type UiicMotorPlan = { ok: true; steps: PlanStep[] } | { ok: false; problems: string[] };

export function planUiicMotorQuote(client: ClientInput, options: { today: Date }): UiicMotorPlan {
  const v = client.vehicle;
  if (!v) return { ok: false, problems: ['Add the vehicle details to this client.'] };
  const need = CLASS_FIELDS[v.vehicleClass];
  const problems: string[] = [];
  if (v.registrationDate > isoToday(options.today)) {
    problems.push('The registration date is in the future.');
  }
  if (need.cc && capacityBand(need.cc, v) === null) {
    problems.push(need.cc === 'hp' ? 'Add the horse power (HP).' : 'Add the cubic capacity (CC).');
  }
  if (need.seats) {
    const seats = v.seatingCapacity;
    if (seats === undefined) problems.push('Add the seating capacity.');
    else if (seats < need.seats.min || seats > need.seats.max) {
      problems.push(
        `For this vehicle class the seating capacity must be ${need.seats.min} to ${need.seats.max}.`,
      );
    }
  }
  if (need.weight && v.grossWeightKg === undefined)
    problems.push('Add the gross vehicle weight (kg).');
  if (need.bus && !v.busType) problems.push('Add the type of bus (school or other).');
  if (need.special && !v.specialType) problems.push('Add the type of special vehicle.');
  if (v.condition === 'pre-owned' && v.previousNcbPercent === undefined) {
    problems.push('Add the previous no-claim bonus (NCB).');
  }
  if (problems.length > 0) return { ok: false, problems };

  const steps: PlanStep[] = [
    {
      label: 'Choose cover type',
      op: { op: 'waitForDialog', text: 'Choose Cover Type', timeoutMs: 30_000 },
    },
    // Cover type radios: 1 Package, 2 Liability Only, 21 StandAlone OD (recorded values).
    {
      label: 'Package Policy',
      op: { op: 'check', selector: byModel('input[value="1"]', 'policyType'), checked: true },
    },
    {
      label: 'Package Policy',
      op: { op: 'clickButton', text: 'Ok', within: 'Choose Cover Type', timeoutMs: 10_000 },
    },
    {
      label: 'Type of vehicle',
      op: {
        op: 'setField',
        selector: byModel('select', 'businessType'),
        value: v.condition === 'new' ? 'New' : 'Renewal',
      },
    },
    {
      label: 'Vehicle class',
      op: { op: 'setField', selector: '#vehicleType', value: UIIC_VEHICLE_CLASS[v.vehicleClass] },
    },
    // Choosing the class fetches and shows its own fields.
    { label: 'Vehicle class', op: { op: 'pause', ms: 1500 } },
  ];
  const add = (label: string, op: PageOp) => steps.push({ label, op });

  if (need.longTerm && v.condition === 'new') {
    add('Cover period', {
      op: 'setField',
      selector: '#lonTermCoverTypeProp',
      value: v.longTermOd ? String(need.longTerm.years) : '1',
    });
  }
  if (need.battery) {
    add('Battery operated', {
      op: 'check',
      selector: byFullModel('input', 'motorPolicyData.fuelcheck'),
      checked: v.batteryOperated ?? false,
    });
  }
  if (need.special)
    add('Special vehicle type', {
      op: 'setField',
      selector: '#mvehicleType',
      value: v.specialType!,
    });
  if (need.seats)
    add('Seating capacity', {
      op: 'setField',
      selector: '#seatingCapacity',
      value: String(v.seatingCapacity),
    });
  if (need.bus)
    add('Type of bus', {
      op: 'setField',
      selector: '#busCategory',
      value: v.busType === 'school' ? 'School Bus' : 'Others',
    });
  if (need.weight)
    add('Gross vehicle weight', {
      op: 'setField',
      selector: '#grossWeight',
      value: String(v.grossWeightKg),
    });
  if (need.cc) {
    add(need.cc === 'hp' ? 'Horse power' : 'Cubic capacity', {
      op: 'setField',
      selector: '#cubicCapacity',
      value: capacityBand(need.cc, v)!,
    });
  }
  if (v.condition === 'pre-owned') {
    add('Claim last year', {
      op: 'check',
      selector: byFullModel('input', 'motorPolicyData.claimCheck'),
      checked: v.claimLastYear ?? false,
    });
    add('Previous NCB', {
      op: 'setField',
      selector: '#selectPrevNCB',
      value: String(v.previousNcbPercent),
    });
  }
  // The date boxes are gijgo date pickers: the box, with the calendar icon as an add-on next to it
  // (found from the box). "input#" in case the id is also on a wrapper, as on the health page.
  add('Risk start date', {
    op: 'pickDate',
    input: 'input#dateOfIssueOfPolicyString',
    date: isoToday(options.today),
  });
  add('Date of registration', {
    op: 'pickDate',
    input: 'input#dateOfPurchaseString',
    date: v.registrationDate,
  });
  add('Vehicle zone', { op: 'setField', selector: '#vehicleZone', value: `Zone-${v.zone}` });
  // Private cars have their own IDV box (iibAutoRiskIdv); the other classes autoRiskIdv.
  add('IDV', {
    op: 'setField',
    selector: '#iibAutoRiskIdv, #autoRiskIdv',
    value: String(v.idvRupees),
  });
  add('OD discount', {
    op: 'setField',
    selector: '#odDisc',
    value: String(v.odDiscountPercent ?? 0),
  });
  add('Click To See Premium', {
    op: 'clickButton',
    text: 'Click To See Premium',
    timeoutMs: 10_000,
  });
  // Recorded: continue without the optional Personal Accident covers.
  add('Personal accident covers', {
    op: 'clickButton',
    text: 'YES',
    within: 'Personal Accident Covers',
    timeoutMs: 20_000,
  });
  add('Premium details', {
    op: 'readTable',
    within: 'Premium Details',
    column: 'Premium',
    timeoutMs: 30_000,
  });
  return { ok: true, steps };
}
