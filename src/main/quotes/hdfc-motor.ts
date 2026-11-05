// HDFC ERGO: PIE's motor quote forms (pie.hdfcergo.com/<Product>/CreateQuote), for a saved vehicle,
// to work the premium out. Built from the recording hdfc-ergo-2026-11-05T11-37-58-944Z, in which
// the Private Car form was filled through to Calculate Premium; the Two Wheeler (Blaze), GCV, PCV
// and Tractor forms were opened. They are one AngularJS form with fold-out sections (Vehicle
// Details, Cover Details, Additional Coverage, Discount Details, Personal Details):
// - product type buttons (#ProductType1-3 on Private Car, #TwPolicyType1-3 on Two Wheeler,
//   #ProductCode1-2 on GCV, PCV and Tractor: Comprehensive, Liability, Standalone OD);
// - customer type buttons (Individual, Corporate, Govt. Undertaking);
// - the transaction type (labels: "Buy Insurance for New Car" / "… New Vehicle", "Renew … Policy
//   from other Insurer");
// - the registration number in four boxes (#RegistrationNumber29-32), make, model and RTO city in
//   boxes suggesting PIE's lists (uib-typeahead: "ASHOK LEYLAND", "STILE - LX 7 STR ALLOY",
//   "ABOHAR - PUNJAB"), the first registration date (#Risk1, dd/mm/yyyy, with a calendar), the
//   year of manufacture, IDV (#IDV_SumInsured; PIE checks it against its range: "User Idv should
//   be in between 794295 - 1323825"), engine and chassis numbers;
// - for a renewal from another insurer: the previous policy's end date, type, NCB and claims;
// - Personal Details: the customer's name, email and mobile, which PIE asks before it works the
//   premium out;
// - Calculate Premium (#btnSubmit), and the premium in its Premium Details ("Total Payable Premium
//   Rs…", as PIE's MST form shows it).
// What the sibling forms were not recorded doing is taken from Private Car (same names); steps that
// may differ are optional and listed for the advisor if a form does not take them. The run never
// presses Generate Quote, Generate Proposal or anything after Calculate Premium.
import type { Vehicle } from '../../shared/contracts/vehicle';
import {
  HDFC_MOTOR_CLASSES as CLASSES,
  HDFC_MOTOR_NAMES,
  type HdfcMotorRun,
} from '../../shared/insurers/hdfc';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

export interface HdfcStep extends PlanStep {
  /** After this step, a PIE pop-up (an error or alert) stops the run. */
  popupAfter?: boolean;
}

export type HdfcPlan =
  { ok: true; steps: HdfcStep[]; byHand: string[] } | { ok: false; problems: string[] };

/** "MH01AB1234" in PIE's four boxes: state, RTO number, series, number. */
export function registrationParts(number: string): [string, string, string, string] | null {
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(number);
  return m ? [m[1]!, m[2]!.padStart(2, '0'), m[3]!, m[4]!] : null;
}

/** PIE's complaints about a form it will not work out (its own validation messages). */
export const PIE_COMPLAINTS =
  'should be in between|is required|is mandatory|is invalid|not valid|please (enter|select|fill)';

/** What the run reads at the end: the premium in Premium Details. */
export const PIE_PREMIUM_LABEL = 'Total Payable Premium';

const PRODUCT_TYPE_BUTTONS = '[id^="ProductType"], [id^="TwPolicyType"], [id^="ProductCode"]';
const COVER_TEXT = {
  comprehensive: 'Comprehensive',
  liability: 'Liability',
  'own-damage': 'Standalone OD',
} as const;

/** Checks the vehicle and the run against the form and lists every step. */
export function planHdfcMotorQuote(vehicle: Vehicle, run: HdfcMotorRun): HdfcPlan {
  const name = HDFC_MOTOR_NAMES[run.product];
  const problems: string[] = [];
  if (!CLASSES[run.product].includes(vehicle.vehicleClass)) {
    problems.push(`PIE's ${name} form is not for this vehicle's class.`);
  }
  const twoOrCar = run.product === 'private-car' || run.product === 'two-wheeler';
  if (run.cover === 'own-damage' && !twoOrCar) {
    problems.push(`PIE's ${name} form offers Comprehensive and Liability only.`);
  }
  const renewal = vehicle.condition === 'pre-owned';
  if (renewal && !run.previous) {
    problems.push(
      "A pre-owned vehicle is renewed from its current insurer: add the previous policy's end date and type.",
    );
  }
  if (renewal && !run.registrationNumber) problems.push('Add the registration number.');
  if (run.cover === 'own-damage' && !renewal) {
    problems.push(
      'Own damage only needs a running third-party policy: it is for a pre-owned vehicle.',
    );
  }
  if (!vehicle.make) problems.push('Add the make (as PIE lists it, for example "MARUTI").');
  if (!vehicle.model) problems.push('Add the model.');
  if (problems.length > 0) return { ok: false, problems };

  const steps: HdfcStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, more: Partial<HdfcStep> = {}) =>
    steps.push({ label, op, ...more });
  const optional = (ifMissed: string): Partial<HdfcStep> => ({ optional: true, ifMissed });

  // Vehicle Details: the form loads its lists again after each of these (PIE asks its server).
  add('Product type', {
    op: 'clickSelector',
    selector: PRODUCT_TYPE_BUTTONS,
    text: COVER_TEXT[run.cover],
    timeoutMs: 15000,
  });
  add('Product type', { op: 'pause', ms: 1500 });
  add(
    'Customer type',
    {
      op: 'clickSelector',
      selector: '[name="CustomerType"]',
      text: run.customerType === 'corporate' ? 'Corporate' : 'Individual',
      timeoutMs: 5000,
    },
    optional(`customer type (${run.customerType === 'corporate' ? 'Corporate' : 'Individual'})`),
  );
  add(
    'Transaction type',
    {
      op: 'clickSelector',
      selector: '[name="TransactionType"]',
      pattern: renewal ? 'from other insurer$' : '^buy insurance for new',
      timeoutMs: 8000,
    },
    { popupAfter: true },
  );
  add('Transaction type', { op: 'pause', ms: 1500 });

  if (run.registrationNumber) {
    const parts = registrationParts(run.registrationNumber);
    parts?.forEach((part, i) => {
      if (!part) return;
      add(
        'Registration number',
        { op: 'setField', selector: `#RegistrationNumber${29 + i}:not([disabled])`, value: part },
        optional(`registration number (${run.registrationNumber})`),
      );
    });
  }
  add(
    'Make',
    {
      op: 'pickOption',
      selector: '#ManufacturerName',
      type: vehicle.make!,
      options: [vehicle.make!],
      startsWith: true,
      timeoutMs: 10000,
    },
    { keep: 'make' },
  );
  add(
    'Model',
    {
      op: 'pickOption',
      selector: '[name="ModelName"]',
      type: vehicle.model!,
      options: [
        ...(vehicle.variant ? [`${vehicle.model} - ${vehicle.variant}`] : []),
        vehicle.model!,
      ],
      startsWith: true,
      timeoutMs: 10000,
    },
    { keep: 'model' },
  );
  add(
    'RTO city',
    {
      op: 'pickOption',
      selector: '[name="RtoLocation"]',
      type: run.rtoCity,
      options: [`${run.rtoCity} - `, run.rtoCity],
      startsWith: true,
      timeoutMs: 10000,
    },
    { keep: 'rto', popupAfter: true },
  );
  add('First registration date', {
    op: 'typeDate',
    input: '#Risk1',
    date: vehicle.registrationDate,
  });
  add('Year of manufacture', { op: 'pause', ms: 1500 });
  add('Year of manufacture', {
    op: 'setField',
    selector: '[name="YearOfManufacturer"]',
    value: String(vehicle.manufactureYear ?? Number(vehicle.registrationDate.slice(0, 4))),
  });
  if (run.cover !== 'liability') {
    if (run.product === 'gcv' || run.product === 'pcv') {
      byHand.push('body and chassis IDV (PIE works the IDV out from them)');
    } else {
      add(
        'IDV',
        { op: 'setField', selector: '#IDV_SumInsured', value: String(vehicle.idvRupees) },
        optional(`IDV (₹${vehicle.idvRupees.toLocaleString('en-IN')})`),
      );
    }
  }
  if (run.product === 'gcv') {
    if (vehicle.grossWeightKg) {
      add(
        'Gross vehicle weight',
        { op: 'setField', selector: '#GVW', value: String(vehicle.grossWeightKg) },
        optional('gross vehicle weight (GVW)'),
      );
    } else byHand.push('gross vehicle weight (GVW)');
  }
  if (run.product === 'pcv' && vehicle.busType) {
    add(
      'Bus type',
      {
        op: 'setField',
        selector: '[name="Risk110"]',
        value: vehicle.busType === 'school' ? 'School Bus' : 'Others',
      },
      optional('PCV bus type'),
    );
  }
  for (const [label, selector, value] of [
    ['Engine number', '#EngineNumber', vehicle.engineNumber],
    ['Chassis number', '#ChassisNumber', vehicle.chassisNumber],
  ] as const) {
    if (value) add(label, { op: 'setField', selector, value }, optional(label.toLowerCase()));
  }

  // The previous policy (renewal from another insurer).
  if (renewal && run.previous) {
    const previous = run.previous;
    if (previous.insurer) {
      add(
        'Previous insurer',
        { op: 'setField', selector: '#Company', value: previous.insurer },
        optional(`previous insurer (${previous.insurer})`),
      );
    }
    add('Previous policy end date', {
      op: 'typeDate',
      input: '#PolicyEffectiveFromDate',
      date: previous.endDate,
    });
    add('Previous policy type', {
      op: 'setField',
      selector: '[name="PrevPolicyType"]',
      value: previous.policyType === 'tp' ? 'TP' : 'Comprehensive Policy',
    });
    if (vehicle.claimLastYear === undefined) byHand.push('claims in the previous policy');
    else {
      add('Previous claims', {
        op: 'clickSelector',
        selector: 'label[name="PrevClaims"]',
        text: vehicle.claimLastYear ? 'Yes' : 'No',
        timeoutMs: 5000,
      });
    }
    if (vehicle.previousNcbPercent === undefined) byHand.push('previous NCB percentage');
    else if (!vehicle.claimLastYear) {
      add(
        'Previous NCB',
        {
          op: 'setField',
          selector: '[name="PrevNcbPercentage"]',
          value: String(vehicle.previousNcbPercent),
        },
        optional(`previous NCB (${vehicle.previousNcbPercent}%)`),
      );
    }
  }

  // Personal Details: PIE asks the customer before it works the premium out.
  add(
    'Personal Details',
    { op: 'reveal', show: '#CustomerName', by: '#headingFive', timeoutMs: 5000 },
    optional('Personal Details (open the section)'),
  );
  add('Customer name', { op: 'setField', selector: '#CustomerName', value: run.customer.name });
  add('Customer email', {
    op: 'setField',
    selector: '#CustomerEmailMask',
    value: run.customer.email,
  });
  add('Customer mobile', {
    op: 'setField',
    selector: '#CustomerMobileMask',
    value: run.customer.mobile,
  });

  add(
    'Calculate Premium',
    {
      op: 'clickSelector',
      selector: '#btnSubmit, button[name="name"]',
      pattern: '^calculate premium',
      timeoutMs: 5000,
    },
    { popupAfter: true },
  );
  add('Premium', { op: 'pause', ms: 2500 });
  add(
    'Premium',
    { op: 'readAmount', label: PIE_PREMIUM_LABEL, errorPattern: PIE_COMPLAINTS, timeoutMs: 30000 },
    { keep: 'premium', popupAfter: true },
  );
  byHand.push(
    `the ${name} covers and add-ons (left as PIE sets them), then Calculate Premium again if you change any`,
  );
  return { ok: true, steps, byHand };
}
