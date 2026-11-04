// New India: the Vehicle Details of the Private Car and Two Wheeler quote forms, for a new
// vehicle. Built from the recordings of 4 November 2026:
//   new-india-2026-11-04T07-28-34-221Z: every motor product's form opened, its fields and lists
//     (nothing typed, no premium);
//   new-india-2026-11-04T07-36-00-336Z: a Commercial Vehicle form filled field by field, which
//     gives the order and what the page loads between fields (the make loads its models; the
//     invoice value makes New India work out the IDV again, so the IDV is entered after it).
// The two forms share one model (detailQuote.detailQuoteTWPCObj); the Private Car form adds the
// type of private car, the body type and a required seating capacity.
//
// The form is opened from New India's dashboard by run-nia-motor.ts (MOTOR, then the product's
// tile, from the advisor's screenshots). What this does not do, because no recording shows it:
// renewals (they open New India's registration pop-ups), the Policy Holder, Policy Period and
// Coverage sections, and Calculate Premium. The run fills the vehicle details and stops; the
// advisor does the rest and presses Calculate Premium.
import type { Vehicle } from '../../shared/contracts/vehicle';
import {
  NIA_BODY_TYPES,
  NIA_COLOURS,
  NIA_FUEL,
  NIA_OTHER_COLOUR,
  NIA_TWO_WHEELER_FUELS,
  sameName,
} from '../../shared/insurers/nia-motor';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

const OBJ = 'detailQuote.detailQuoteTWPCObj';
/** A field by its AngularJS model, under any spelling AngularJS accepts. */
const byModel = (tag: string, name: string): string =>
  ['ng-model', 'data-ng-model', 'x-ng-model']
    .map((a) => `${tag}[${a}="${OBJ}.${name}"]`)
    .join(', ');

export const NIA_FORMS = {
  'private-car': { heading: 'Private Car Insurance', name: 'Private Car' },
  'two-wheeler': { heading: 'Two Wheeler Insurance', name: 'Two Wheeler' },
} as const;
export type NiaMotorForm = keyof typeof NIA_FORMS;

/** What the advisor still does on the form after the run. */
export const NIA_BY_HAND = [
  'Policy Holder Information: the vehicle owner (new or existing customer).',
  'Policy Period: check the start date.',
  'Coverage Details and Additional Coverage: choose the covers.',
  'Press Calculate Premium yourself, and check the premium New India shows.',
];

export type NiaMotorPlan =
  { ok: true; form: NiaMotorForm; steps: PlanStep[] } | { ok: false; problems: string[] };

const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function planNiaMotorQuote(v: Vehicle, options: { today: Date }): NiaMotorPlan {
  if (v.vehicleClass !== 'private-car' && v.vehicleClass !== 'two-wheeler') {
    return {
      ok: false,
      problems: ['New India is automated for private cars and two-wheelers only so far.'],
    };
  }
  const form: NiaMotorForm = v.vehicleClass;
  const car = form === 'private-car';
  const problems: string[] = [];
  if (v.condition !== 'new') {
    problems.push(
      'New India is automated for new vehicles only so far (renewals open pop-ups that were not recorded).',
    );
  }
  if (v.zone === 'C') {
    problems.push(
      'New India has zones A and B only for this vehicle (A: Ahmedabad, Bengaluru, Chennai, Hyderabad, Kolkata, Mumbai, New Delhi, Pune; B: rest of India). Change the zone to A or B.',
    );
  }
  if (v.registrationDate > isoDate(options.today)) {
    problems.push('The registration date is in the future.');
  }
  // A new vehicle: New India lists this year and last year only (recorded: 2026, 2025).
  const year = options.today.getFullYear();
  if (v.manufactureYear === undefined) problems.push('Add the year of manufacture.');
  else if (v.manufactureYear !== year && v.manufactureYear !== year - 1) {
    problems.push(`For a new vehicle New India lists the years ${year} and ${year - 1} only.`);
  }
  if (!v.make) problems.push('Add the make.');
  if (!v.model) problems.push('Add the model.');
  if (!v.variant) problems.push('Add the variant.');
  if (!v.engineNumber) problems.push('Add the engine number.');
  if (!v.chassisNumber) problems.push('Add the chassis number.');
  if (!v.colour) problems.push('Add the colour (as in the RC book).');
  if (v.invoiceValueRupees === undefined) problems.push('Add the vehicle invoice value.');
  if (!v.fuelType) problems.push('Add the type of fuel.');
  else if (!car && !NIA_TWO_WHEELER_FUELS.includes(v.fuelType)) {
    problems.push(`New India's Two Wheeler form does not offer ${NIA_FUEL[v.fuelType]} as a fuel.`);
  }
  if (v.batteryOperated && v.fuelType && v.fuelType !== 'electric') {
    problems.push('The vehicle is marked battery operated, but its fuel is not Electric.');
  }
  if (car) {
    if (v.seatingCapacity === undefined) problems.push('Add the seating capacity.');
    if (!v.bodyType) problems.push('Add the type of body.');
    else if (!NIA_BODY_TYPES.some((b) => sameName(b, v.bodyType!))) {
      problems.push(`New India does not list the body type "${v.bodyType}".`);
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const listedColour = NIA_COLOURS.find((c) => sameName(c, v.colour!)) ?? NIA_OTHER_COLOUR;
  const steps: PlanStep[] = [];
  const add = (label: string, op: PageOp) => steps.push({ label, op });

  // The radios by their recorded ids (the same on both forms), or by model and value. The form
  // draws its body after its heading, while its lists load: wait for the radio first.
  const newVehicle = `#newVehicle1, ${byModel('input[value="Y"]', 'newVehicle')}`;
  add('Buy insurance for a new vehicle', {
    op: 'waitFor',
    selector: newVehicle,
    timeoutMs: 30_000,
  });
  add('Buy insurance for a new vehicle', { op: 'check', selector: newVehicle, checked: true });
  add('Vehicle Details', {
    op: 'waitFor',
    selector: byModel('select', 'vehicleMake'),
    timeoutMs: 10_000,
  });
  add('Year of manufacture', {
    op: 'setField',
    selector: byModel('select', 'manufactureYear'),
    value: String(v.manufactureYear),
  });
  add('Make', { op: 'setField', selector: byModel('select', 'vehicleMake'), value: v.make! });
  // The make loads its models; the Model box is enabled once they are in.
  add('Model', { op: 'typeahead', selector: '#vehicleModel', value: v.model!, timeoutMs: 15_000 });
  add('Variant', { op: 'typeahead', selector: '#variant', value: v.variant!, timeoutMs: 15_000 });
  add('Engine no.', {
    op: 'setField',
    selector: byModel('input', 'engineNo'),
    value: v.engineNumber!,
  });
  add('Chassis no.', {
    op: 'setField',
    selector: byModel('input', 'chasisNo'),
    value: v.chassisNumber!,
  });
  if (v.seatingCapacity !== undefined) {
    add('Seating capacity', {
      op: 'setField',
      selector: byModel('input', 'seatingCapacity'),
      value: String(v.seatingCapacity),
    });
  }
  if (car) {
    add('Type of Private Car', {
      op: 'setField',
      selector: byModel('select', 'typePC'),
      value: 'Private',
    });
  }
  // For a new vehicle the first purchase is when it was bought and registered.
  add('Date of first purchase', {
    op: 'pickDate',
    input: 'input#datefield2',
    date: v.registrationDate,
  });
  add('Vehicle zone', { op: 'setField', selector: '#Zone', value: v.zone });
  add('Vehicle invoice value', {
    op: 'setField',
    selector: byModel('input', 'vehInvoiceVal'),
    value: String(v.invoiceValueRupees),
  });
  // New India works the IDV out from the invoice value: let it, then enter the advisor's IDV.
  add('Vehicle invoice value', { op: 'pause', ms: 2000 });
  add('IDV', {
    op: 'setField',
    selector: byModel('input', 'vehicleIDV'),
    value: String(v.idvRupees),
  });
  add('Colour of vehicle', {
    op: 'setField',
    selector: byModel('select', 'vehicleColor'),
    value: listedColour,
  });
  add('Colour as per RC book', {
    op: 'setField',
    selector: byModel('input', 'colorAsPerRCbook'),
    value: v.colour!,
  });
  if (car) {
    add('Type of body', {
      op: 'setField',
      selector: byModel('select', 'bodyType'),
      value: NIA_BODY_TYPES.find((b) => sameName(b, v.bodyType!))!,
    });
  }
  // A new vehicle has no previous policy, so no no-claim bonus.
  add('Previous NCB', {
    op: 'check',
    selector: `#preNCB1, ${byModel('input[value="N"]', 'previousNCB')}`,
    checked: true,
  });
  add('Type of fuel', {
    op: 'setField',
    selector: byModel('select', 'fuelType'),
    value: NIA_FUEL[v.fuelType!],
  });
  return { ok: true, form, steps };
}
