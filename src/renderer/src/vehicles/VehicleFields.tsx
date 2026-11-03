// The vehicle form's details, for motor quotes. Shows only the details the chosen vehicle class
// needs (as United India's Motor calculator asks for them).
import type { Vehicle, VehicleClass } from '../../../shared/contracts/vehicle';
import { PREVIOUS_NCB, VEHICLE_CLASSES } from '../../../shared/contracts/vehicle';

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  'private-car': 'Private car',
  'two-wheeler': 'Two-wheeler (motorcycle / scooter)',
  'taxi-upto-6': 'Taxi / passenger 4-wheeler (up to 6 passengers)',
  'bus-above-6': 'Bus / passenger vehicle (more than 6 passengers)',
  'passenger-2w': 'Passenger 2-wheeler',
  'passenger-3w-upto-6': 'Passenger 3-wheeler (up to 6)',
  'passenger-3w-7-to-17': 'Passenger 3-wheeler (7 to 17)',
  'goods-private': 'Goods carrier (other than 3-wheeler), private',
  'goods-public': 'Goods carrier (other than 3-wheeler), public',
  'goods-3w-private': 'Goods 3-wheeler / pedal cycle, private',
  'goods-3w-public': 'Goods 3-wheeler / pedal cycle, public',
  'e-cart-private': 'E-cart, private carrier',
  'e-cart-public': 'E-cart, public carrier',
  'e-rickshaw': 'E-rickshaw',
  special: 'Miscellaneous / special vehicle',
};

const NEEDS = {
  cc: [
    'private-car',
    'two-wheeler',
    'taxi-upto-6',
    'goods-private',
    'goods-public',
    'goods-3w-private',
  ],
  seats: [
    'taxi-upto-6',
    'bus-above-6',
    'passenger-2w',
    'passenger-3w-upto-6',
    'passenger-3w-7-to-17',
    'e-rickshaw',
  ],
  weight: ['goods-private', 'goods-public', 'goods-3w-private', 'goods-3w-public'],
  battery: ['private-car', 'two-wheeler'],
} as const satisfies Record<string, readonly VehicleClass[]>;
const has = (list: readonly VehicleClass[], c: VehicleClass) => list.includes(c);

export interface VehicleDraft {
  vehicleClass: VehicleClass;
  condition: 'new' | 'pre-owned';
  registrationDate: string;
  zone: 'A' | 'B' | 'C';
  idvRupees: string;
  odDiscountPercent: string;
  cubicCapacityCc: string;
  horsePower: string;
  seatingCapacity: string;
  grossWeightKg: string;
  busType: '' | 'school' | 'other';
  specialType: string;
  batteryOperated: boolean;
  longTermOd: boolean;
  claimLastYear: boolean;
  previousNcbPercent: string;
}

export const EMPTY_VEHICLE: VehicleDraft = {
  vehicleClass: 'private-car',
  condition: 'new',
  registrationDate: '',
  zone: 'A',
  idvRupees: '',
  odDiscountPercent: '0',
  cubicCapacityCc: '',
  horsePower: '',
  seatingCapacity: '',
  grossWeightKg: '',
  busType: '',
  specialType: '',
  batteryOperated: false,
  longTermOd: false,
  claimLastYear: false,
  previousNcbPercent: '',
};

const num = (value: string) => (value.trim() === '' ? undefined : Number(value));

/** The vehicle as saved: only the details its class uses. */
export function vehicleToInput(d: VehicleDraft): Record<string, unknown> {
  const c = d.vehicleClass;
  return {
    vehicleClass: c,
    condition: d.condition,
    registrationDate: d.registrationDate,
    zone: d.zone,
    idvRupees: num(d.idvRupees),
    odDiscountPercent: num(d.odDiscountPercent) ?? 0,
    ...(has(NEEDS.cc, c) && num(d.cubicCapacityCc) !== undefined
      ? { cubicCapacityCc: num(d.cubicCapacityCc) }
      : {}),
    ...(c === 'special' && num(d.horsePower) !== undefined
      ? { horsePower: num(d.horsePower) }
      : {}),
    ...(has(NEEDS.seats, c) && num(d.seatingCapacity) !== undefined
      ? { seatingCapacity: num(d.seatingCapacity) }
      : {}),
    ...(has(NEEDS.weight, c) && num(d.grossWeightKg) !== undefined
      ? { grossWeightKg: num(d.grossWeightKg) }
      : {}),
    ...(c === 'bus-above-6' && d.busType ? { busType: d.busType } : {}),
    ...(c === 'special' && d.specialType.trim() ? { specialType: d.specialType.trim() } : {}),
    ...(has(NEEDS.battery, c) ? { batteryOperated: d.batteryOperated } : {}),
    ...(has(NEEDS.battery, c) && d.condition === 'new' ? { longTermOd: d.longTermOd } : {}),
    ...(d.condition === 'pre-owned'
      ? {
          claimLastYear: d.claimLastYear,
          ...(d.previousNcbPercent !== ''
            ? { previousNcbPercent: Number(d.previousNcbPercent) }
            : {}),
        }
      : {}),
  };
}

export function vehicleFromRecord(v: Vehicle): VehicleDraft {
  const text = (n: number | undefined) => (n === undefined ? '' : String(n));
  return {
    vehicleClass: v.vehicleClass,
    condition: v.condition,
    registrationDate: v.registrationDate,
    zone: v.zone,
    idvRupees: String(v.idvRupees),
    odDiscountPercent: text(v.odDiscountPercent ?? 0),
    cubicCapacityCc: text(v.cubicCapacityCc),
    horsePower: text(v.horsePower),
    seatingCapacity: text(v.seatingCapacity),
    grossWeightKg: text(v.grossWeightKg),
    busType: v.busType ?? '',
    specialType: v.specialType ?? '',
    batteryOperated: v.batteryOperated ?? false,
    longTermOd: v.longTermOd ?? false,
    claimLastYear: v.claimLastYear ?? false,
    previousNcbPercent: text(v.previousNcbPercent),
  };
}

export function VehicleFields(props: {
  value: VehicleDraft;
  onChange: (value: VehicleDraft) => void;
}): React.JSX.Element {
  const v = props.value;
  const set = (patch: Partial<VehicleDraft>) => props.onChange({ ...v, ...patch });
  const c = v.vehicleClass;
  return (
    <fieldset>
      <legend>Vehicle details</legend>
      <label>
        Vehicle class
        <select value={c} onChange={(e) => set({ vehicleClass: e.target.value as VehicleClass })}>
          {VEHICLE_CLASSES.map((k) => (
            <option key={k} value={k}>
              {VEHICLE_CLASS_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        New or pre-owned
        <select
          value={v.condition}
          onChange={(e) => set({ condition: e.target.value as VehicleDraft['condition'] })}
        >
          <option value="new">New</option>
          <option value="pre-owned">Pre-owned</option>
        </select>
      </label>
      <label>
        Date of registration
        <input
          type="date"
          value={v.registrationDate}
          min="1950-01-01"
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => set({ registrationDate: e.target.value })}
          required
        />
      </label>
      <label>
        Vehicle zone
        <select
          value={v.zone}
          onChange={(e) => set({ zone: e.target.value as VehicleDraft['zone'] })}
        >
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </label>
      <label>
        IDV (₹)
        <input
          value={v.idvRupees}
          onChange={(e) => set({ idvRupees: e.target.value.replace(/[,\s]/g, '') })}
          inputMode="numeric"
          required
        />
      </label>
      <label>
        OD discount (%)
        <input
          value={v.odDiscountPercent}
          onChange={(e) => set({ odDiscountPercent: e.target.value })}
          inputMode="numeric"
        />
      </label>
      {has(NEEDS.cc, c) && (
        <label>
          Cubic capacity (CC)
          <input
            value={v.cubicCapacityCc}
            onChange={(e) => set({ cubicCapacityCc: e.target.value })}
            inputMode="numeric"
            placeholder="for example 1197"
            required
          />
        </label>
      )}
      {c === 'special' && (
        <>
          <label>
            Special vehicle type (as the insurer lists it)
            <input
              value={v.specialType}
              onChange={(e) => set({ specialType: e.target.value })}
              placeholder="for example Agricultural Tractors"
              required
            />
          </label>
          <label>
            Horse power (HP)
            <input
              value={v.horsePower}
              onChange={(e) => set({ horsePower: e.target.value })}
              inputMode="decimal"
              required
            />
          </label>
        </>
      )}
      {has(NEEDS.seats, c) && (
        <label>
          Seating capacity
          <input
            value={v.seatingCapacity}
            onChange={(e) => set({ seatingCapacity: e.target.value })}
            inputMode="numeric"
            required
          />
        </label>
      )}
      {c === 'bus-above-6' && (
        <label>
          Type of bus
          <select
            value={v.busType}
            onChange={(e) => set({ busType: e.target.value as VehicleDraft['busType'] })}
            required
          >
            <option value="">Select</option>
            <option value="school">School bus</option>
            <option value="other">Other</option>
          </select>
        </label>
      )}
      {has(NEEDS.weight, c) && (
        <label>
          Gross vehicle weight (kg)
          <input
            value={v.grossWeightKg}
            onChange={(e) => set({ grossWeightKg: e.target.value })}
            inputMode="numeric"
            required
          />
        </label>
      )}
      {has(NEEDS.battery, c) && (
        <label className="check">
          <input
            type="checkbox"
            checked={v.batteryOperated}
            onChange={(e) => set({ batteryOperated: e.target.checked })}
          />
          Battery operated (electric)
        </label>
      )}
      {has(NEEDS.battery, c) && v.condition === 'new' && (
        <label className="check">
          <input
            type="checkbox"
            checked={v.longTermOd}
            onChange={(e) => set({ longTermOd: e.target.checked })}
          />
          Own damage for the whole liability period ({c === 'private-car' ? '3' : '5'} years)
        </label>
      )}
      {v.condition === 'pre-owned' && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={v.claimLastYear}
              onChange={(e) => set({ claimLastYear: e.target.checked })}
            />
            Claim made in the previous policy year
          </label>
          <label>
            Previous no-claim bonus (NCB)
            <select
              value={v.previousNcbPercent}
              onChange={(e) => set({ previousNcbPercent: e.target.value })}
              required
            >
              <option value="">Select</option>
              {PREVIOUS_NCB.map((n) => (
                <option key={n} value={String(n)}>
                  {n}%
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </fieldset>
  );
}
