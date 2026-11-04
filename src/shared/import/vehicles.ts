// The vehicle import: one row per vehicle, with the details the app's own vehicle form saves
// (United India's calculator, and New India's Private Car and Two Wheeler forms). Pure.
import { PREVIOUS_NCB, vehicleInputSchema, type VehicleInputRaw } from '../contracts/vehicle';
import {
  readChoice,
  readDate,
  readInt,
  readYesNo,
  rowReader,
  loose,
  type Read,
  type SheetRow,
} from './cells';
import {
  BUS_CHOICES,
  CONDITION_CHOICES,
  FUEL_CHOICES,
  listOf,
  VEHICLE_CLASS_CHOICES,
  ZONE_CHOICES,
} from './choices';
import { schemaProblems, type ImportRow } from './result';
import type { Column } from './sheet';

export const VEHICLE_COLUMNS: readonly Column[] = [
  {
    key: 'name',
    header: 'Vehicle name',
    required: true,
    help: 'Required. For you to find it, for example "Swift - Ramesh".',
  },
  {
    key: 'vehicleClass',
    header: 'Vehicle class',
    required: true,
    help: `Required. ${listOf(VEHICLE_CLASS_CHOICES)}.`,
  },
  {
    key: 'condition',
    header: 'New or pre-owned',
    required: true,
    help: 'Required. New or Pre-owned.',
  },
  {
    key: 'registrationDate',
    header: 'Date of registration',
    required: true,
    help: 'Required. DD/MM/YYYY.',
  },
  { key: 'zone', header: 'Zone', required: true, help: 'Required. A, B or C.' },
  { key: 'idv', header: 'IDV (₹)', required: true, help: 'Required. Whole rupees.' },
  { key: 'odDiscount', header: 'OD discount (%)', help: '0 to 95. Blank is 0.' },
  { key: 'cc', header: 'Cubic capacity (CC)', help: 'Cars, two-wheelers, taxis, goods carriers.' },
  { key: 'hp', header: 'Horse power (HP)', help: 'Special vehicles.' },
  { key: 'seats', header: 'Seating capacity', help: 'Including the driver.' },
  { key: 'weight', header: 'Gross vehicle weight (kg)', help: 'Goods carriers.' },
  { key: 'busType', header: 'Type of bus', help: 'Buses: School bus or Other.' },
  {
    key: 'specialType',
    header: 'Special vehicle type',
    help: 'Special vehicles, as the insurer lists it (for example Agricultural Tractors).',
  },
  { key: 'battery', header: 'Battery operated', help: 'Cars and two-wheelers: Yes or No.' },
  {
    key: 'longTermOd',
    header: 'Long-term own damage',
    help: 'New cars (3 years) and two-wheelers (5 years): Yes or No.',
  },
  { key: 'claimLastYear', header: 'Claim last year', help: 'Pre-owned vehicles: Yes or No.' },
  {
    key: 'previousNcb',
    header: 'Previous NCB (%)',
    help: `Pre-owned vehicles: ${PREVIOUS_NCB.join(', ')}.`,
  },
  { key: 'make', header: 'Make', help: 'As the insurer lists it, for example MARUTI SUZUKI.' },
  { key: 'model', header: 'Model', help: '' },
  { key: 'variant', header: 'Variant', help: '' },
  { key: 'manufactureYear', header: 'Year of manufacture', help: 'For example 2026.' },
  { key: 'fuelType', header: 'Fuel type', help: listOf(FUEL_CHOICES) },
  { key: 'bodyType', header: 'Body type', help: 'Private cars, for example Hatch-Back or SUV.' },
  { key: 'colour', header: 'Colour', help: 'As in the RC book.' },
  { key: 'engineNumber', header: 'Engine number', help: '' },
  {
    key: 'chassisNumber',
    header: 'Chassis number',
    help: 'Also used to spot a vehicle already saved.',
  },
  { key: 'invoiceValue', header: 'Invoice value (₹)', help: 'Whole rupees.' },
];

const HEADERS = Object.fromEntries(VEHICLE_COLUMNS.map((c) => [c.key, c.header])) as Record<
  string,
  string
>;

/** Schema field → column. */
const FIELD_COLUMN: Record<string, string> = {
  vehicleClass: 'vehicleClass',
  condition: 'condition',
  registrationDate: 'registrationDate',
  zone: 'zone',
  idvRupees: 'idv',
  odDiscountPercent: 'odDiscount',
  cubicCapacityCc: 'cc',
  horsePower: 'hp',
  seatingCapacity: 'seats',
  grossWeightKg: 'weight',
  busType: 'busType',
  specialType: 'specialType',
  batteryOperated: 'battery',
  longTermOd: 'longTermOd',
  claimLastYear: 'claimLastYear',
  previousNcbPercent: 'previousNcb',
  make: 'make',
  model: 'model',
  variant: 'variant',
  manufactureYear: 'manufactureYear',
  fuelType: 'fuelType',
  bodyType: 'bodyType',
  colour: 'colour',
  engineNumber: 'engineNumber',
  chassisNumber: 'chassisNumber',
  invoiceValueRupees: 'invoiceValue',
};

function columnFor(path: readonly PropertyKey[]): string | null {
  const [top, second] = path;
  if (top === 'name') return HEADERS.name!;
  const key = FIELD_COLUMN[String(second)];
  return key ? HEADERS[key]! : null;
}

const readNumber =
  (max: number) =>
  (text: string): Read<number> => {
    const t = text.replace(/[,\s]/g, '');
    if (!/^\d+(\.\d+)?$/.test(t) || Number(t) <= 0 || Number(t) > max) {
      return { ok: false, reason: `a number from more than 0 to ${max}` };
    }
    return { ok: true, value: Number(t) };
  };

export function readVehicleRow(row: SheetRow, today: Date): ImportRow<VehicleInputRaw> {
  const r = rowReader(row, HEADERS);
  const name = r.text('name') ?? '';
  const vehicleClass = r.require('vehicleClass', (t) => readChoice(t, VEHICLE_CLASS_CHOICES));
  const condition = r.require('condition', (t) => readChoice(t, CONDITION_CHOICES));
  const registrationDate = r.require('registrationDate', readDate);
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (registrationDate !== undefined && registrationDate > iso) {
    r.problem('registrationDate', 'in the future');
  }
  const zone = r.require('zone', (t) => readChoice(t, ZONE_CHOICES));
  const idv = r.require('idv', (t) => readInt(t, 1, 1_000_000_000));
  const ints = {
    odDiscountPercent: r.read('odDiscount', (t) => readInt(t, 0, 95)),
    cubicCapacityCc: r.read('cc', (t) => readInt(t, 1, 100_000)),
    seatingCapacity: r.read('seats', (t) => readInt(t, 1, 500)),
    grossWeightKg: r.read('weight', (t) => readInt(t, 1, 1_000_000)),
    previousNcbPercent: r.read('previousNcb', (t) => {
      const n = readInt(t.replace('%', ''), 0, 50);
      return n.ok && !(PREVIOUS_NCB as readonly number[]).includes(n.value)
        ? { ok: false as const, reason: `one of ${PREVIOUS_NCB.join(', ')}` }
        : n;
    }),
    manufactureYear: r.read('manufactureYear', (t) => readInt(t, 1950, 2100)),
    invoiceValueRupees: r.read('invoiceValue', (t) => readInt(t, 1, 1_000_000_000)),
    horsePower: r.read('hp', readNumber(10_000)),
  };
  const choices = {
    busType: r.read('busType', (t) => readChoice(t, BUS_CHOICES)),
    fuelType: r.read('fuelType', (t) => readChoice(t, FUEL_CHOICES)),
  };
  const flags = {
    batteryOperated: r.read('battery', readYesNo),
    longTermOd: r.read('longTermOd', readYesNo),
    claimLastYear: r.read('claimLastYear', readYesNo),
  };
  const texts = Object.fromEntries(
    (
      [
        'specialType',
        'make',
        'model',
        'variant',
        'bodyType',
        'colour',
        'engineNumber',
        'chassisNumber',
      ] as const
    )
      .map((k) => [k, r.text(k)] as const)
      .filter(([, v]) => v !== undefined),
  );
  const defined = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const saved = {
    name,
    vehicle: {
      ...(vehicleClass ? { vehicleClass } : {}),
      ...(condition ? { condition } : {}),
      ...(registrationDate ? { registrationDate } : {}),
      ...(zone ? { zone } : {}),
      ...(idv !== undefined ? { idvRupees: idv } : {}),
      ...defined(ints),
      ...defined(choices),
      ...defined(flags),
      ...texts,
    },
  } as VehicleInputRaw;

  if (!name) r.problem('name', 'required');
  const checked = vehicleInputSchema.safeParse(saved);
  const problems = [
    ...r.problems,
    ...(checked.success ? [] : schemaProblems(checked.error.issues, columnFor, r.problems)),
  ];
  const detail = [
    ...(vehicleClass
      ? [VEHICLE_CLASS_CHOICES.find((c) => c.value === vehicleClass)!.names[0]]
      : []),
    ...(condition ? [condition === 'new' ? 'new' : 'pre-owned'] : []),
    ...(texts.make ? [[texts.make, texts.model].filter(Boolean).join(' ')] : []),
  ].join(' · ');
  if (problems.length > 0 || !checked.success) {
    return { ok: false, line: row.line, label: name || '(no name)', detail, problems };
  }
  const chassis = checked.data.vehicle.chassisNumber;
  return {
    ok: true,
    line: row.line,
    label: checked.data.name,
    detail,
    // Same vehicle: same chassis number, or (none given) same name.
    key: chassis ? `chassis|${loose(chassis)}` : `name|${loose(checked.data.name)}`,
    value: saved,
  };
}
