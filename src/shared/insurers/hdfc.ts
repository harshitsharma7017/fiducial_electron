// HDFC ERGO's PIE forms (pie.hdfcergo.com, opened from the 1up portal) the app fills to work out a
// premium. Built from the recordings hdfc-ergo-2026-11-05T11-37-58-944Z (motor: Private Car filled
// through to Calculate Premium; Two Wheeler, Tractor, GCV and PCV opened) and
// hdfc-ergo-2026-11-05T11-50-09-251Z (MST, Medisure Super Top-up, filled to its premium). Shared by
// the request contract and the screens; what is filled is in src/main/quotes/hdfc-*.ts.
import { z } from 'zod';
import type { VehicleClass } from '../contracts/vehicle';

/** PIE's motor forms: the app's name for each, and its address on PIE. */
export const HDFC_MOTOR_PRODUCTS = ['private-car', 'two-wheeler', 'gcv', 'pcv', 'tractor'] as const;
export type HdfcMotorProduct = (typeof HDFC_MOTOR_PRODUCTS)[number];

export const HDFC_MOTOR_NAMES: Record<HdfcMotorProduct, string> = {
  'private-car': 'Private Car',
  'two-wheeler': 'Two Wheeler',
  gcv: 'Goods Carrying Vehicle (GCV)',
  pcv: 'Passenger Carrying Vehicle (PCV)',
  tractor: 'Tractor (Misc. D)',
};

/** The path of the form's page on PIE (pie.hdfcergo.com), as recorded. */
export const HDFC_MOTOR_PATHS: Record<HdfcMotorProduct, string> = {
  'private-car': '/PrivateCar/CreateQuote',
  // PIE's /TwoWheeler/CreateQuote answers "404 Page Not Found": the Blaze form is the live one.
  'two-wheeler': '/TwoWheelerBlaze/CreateQuote',
  gcv: '/GCV/CreateQuote',
  pcv: '/PCV/CreateQuote',
  tractor: '/Tractor/CreateQuote',
};

/** The vehicle classes each PIE form takes. */
export const HDFC_MOTOR_CLASSES: Record<HdfcMotorProduct, readonly VehicleClass[]> = {
  'private-car': ['private-car'],
  'two-wheeler': ['two-wheeler'],
  gcv: [
    'goods-private',
    'goods-public',
    'goods-3w-private',
    'goods-3w-public',
    'e-cart-private',
    'e-cart-public',
  ],
  pcv: [
    'taxi-upto-6',
    'bus-above-6',
    'passenger-2w',
    'passenger-3w-upto-6',
    'passenger-3w-7-to-17',
    'e-rickshaw',
  ],
  tractor: ['special'],
};

/** The PIE form for a vehicle class. */
export function hdfcProductFor(vehicleClass: VehicleClass): HdfcMotorProduct | null {
  for (const [product, classes] of Object.entries(HDFC_MOTOR_CLASSES)) {
    if (classes.includes(vehicleClass)) return product as HdfcMotorProduct;
  }
  return null;
}

export const HDFC_MST_PATH = '/MST/CreateQuote';

/** Previous insurers, as PIE's list names them (recorded). */
export const HDFC_PREVIOUS_INSURERS = [
  'ACKO GENERAL INSURANCE LIMITED',
  'BAJAJ ALLIANZ GENERAL INSURANCE CO.LTD',
  'BHARTI AXA GENERAL INSURANCE COMPANY LIMITED',
  'CHOLAMANDALAM MS GENERAL INSURANCE CO.LTD',
  'DHFL GENERAL INSURANCE LIMITED',
  'EDELWEISS GENERAL INSURANCE COMPANY LIMITED',
  'FUTURE GENERALI INDIA INSURANCE COMPANY LIMITED-21',
  'GO DIGIT GENERAL INSURANCE LIMITED',
  'HDFC ERGO',
  'ICICI LOMBARD',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A registration number as written on the vehicle: MH01AB1234 (spaces and hyphens allowed). */
const registrationNumber = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(
    z.string().regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/, 'a registration number like MH01AB1234'),
  );

/** The customer PIE asks for before it works a motor premium out (not kept by the app). */
export const hdfcCustomerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().max(254).pipe(z.email()),
    mobile: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, 'a 10-digit mobile number'),
  })
  .strict();
export type HdfcCustomer = z.infer<typeof hdfcCustomerSchema>;

/** One motor run's choices, besides the saved vehicle. */
export const hdfcMotorRunSchema = z
  .object({
    product: z.enum(HDFC_MOTOR_PRODUCTS),
    /** Comprehensive, liability only, or own damage only (Private Car and Two Wheeler). */
    cover: z.enum(['comprehensive', 'liability', 'own-damage']),
    customerType: z.enum(['individual', 'corporate']),
    /** The RTO / registration city as PIE lists it (its list reads "CITY - STATE"). */
    rtoCity: z.string().trim().min(2).max(60),
    /** Pre-owned vehicles; a new vehicle is registered later. */
    registrationNumber: registrationNumber.optional(),
    /** Renewal from another insurer (pre-owned vehicles). */
    previous: z
      .object({
        insurer: z.string().trim().min(2).max(80).optional(),
        endDate: isoDate,
        policyType: z.enum(['comprehensive', 'tp']),
      })
      .strict()
      .optional(),
    customer: hdfcCustomerSchema,
  })
  .strict();
export type HdfcMotorRun = z.infer<typeof hdfcMotorRunSchema>;

/** MST (Medisure Super Top-up): the cover type and policy term of one run. */
export const hdfcMstRunSchema = z
  .object({
    cover: z.enum(['individual', 'family-floater']),
    years: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();
export type HdfcMstRun = z.infer<typeof hdfcMstRunSchema>;

/**
 * PIE's retail health forms (Energy, Optima Secure, Optima Restore): one layout, a questionnaire
 * then PRODUCT DETAILS and BASIC DETAILS, with boxes that open lists (recording
 * hdfc-ergo-2026-11-05T11-50-09-251Z; Optima Restore was opened for renewals only).
 */
export const HDFC_RETAIL_PRODUCTS = ['optima-secure', 'optima-restore', 'energy'] as const;
export type HdfcRetailProduct = (typeof HDFC_RETAIL_PRODUCTS)[number];

export const HDFC_RETAIL_NAMES: Record<HdfcRetailProduct, string> = {
  'optima-secure': 'Optima Secure',
  'optima-restore': 'Optima Restore',
  energy: 'Energy',
};

export const HDFC_RETAIL_PATHS: Record<HdfcRetailProduct, string> = {
  'optima-secure': '/OptimaSecure/CreateQuote',
  'optima-restore': '/OptimaRestore/CreateQuote',
  energy: '/Energy/CreateQuote',
};

/** "I stay in", as PIE lists it (Energy, recorded). */
export const HDFC_CITIES = [
  'Mumbai',
  'Delhi',
  'Kolkata',
  'Chennai',
  'Bangalore',
  'Ahmedabad',
  'Hyderabad',
  'Pune',
  'Any other city',
] as const;

/** Plans as PIE lists them (recorded). */
export const HDFC_OPTIMA_SECURE_PLANS = [
  'Optima Secure',
  'Optima Super Secure',
  'Optima Secure Global',
  'Optima Secure Global Plus',
] as const;
export const HDFC_ENERGY_PLANS = [
  'SILVER WITH NO COPYAMENT',
  'SILVER WITH 20% COPAYMENT',
  'GOLD WITH NO COPYAMENT',
  'GOLD WITH 20% COPAYMENT',
] as const;

export const hdfcRetailRunSchema = z
  .object({
    product: z.enum(HDFC_RETAIL_PRODUCTS),
    cover: z.enum(['individual', 'family']),
    years: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Optima Secure / Optima Restore: sum insured in lakh, as PIE's list writes it ("5"). */
    sumInsuredLacs: z.int().min(1).max(500).optional(),
    /** The plan, as PIE lists it (Optima Secure's variants, Energy's plans). */
    plan: z.string().trim().min(2).max(60).optional(),
    city: z.enum(HDFC_CITIES),
    /** Energy: the sum insured of an existing health policy, if any (rupees). */
    existingSumInsured: z.int().positive().max(100_000_000).optional(),
    /** The SP / POSP name or code PIE asks of the intermediary. */
    posp: z.string().trim().min(2).max(80),
  })
  .strict();
export type HdfcRetailRun = z.infer<typeof hdfcRetailRunSchema>;

export const HDFC_TRAVEL_PATH = '/Travel/CreateQuote';

/** PIE's Retail Travel form, for a travel client (one traveller). */
export const hdfcTravelRunSchema = z
  .object({
    departureDate: isoDate,
    returnDate: isoDate,
    /** The plan, as PIE's list names it (it suggests as you type: "Gold"). */
    plan: z.string().trim().min(2).max(60),
  })
  .strict()
  .refine((t) => t.departureDate <= t.returnDate, {
    message: 'the return is after the departure',
    path: ['returnDate'],
  });
export type HdfcTravelRun = z.infer<typeof hdfcTravelRunSchema>;
