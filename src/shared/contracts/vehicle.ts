// Saved vehicles, for motor quotes. Kept on their own, not as part of a client (decision of
// 3 November 2026): a vehicle has a name the advisor chooses (for example "Swift - Ramesh") and
// the details United India's Motor calculator asks for. Stored encrypted with the clients, until
// the advisor deletes it.
import { z } from 'zod';
import { dateOfBirthSchema } from './client';
import { entityIdSchema, isoDateTimeSchema, singleLineText } from './common';

/**
 * Vehicle classes for motor quotes (decision of 2 November 2026: all classes of United India's
 * Motor calculator). Named for what they are, not for an insurer's codes.
 */
export const VEHICLE_CLASSES = [
  'private-car',
  'two-wheeler',
  'taxi-upto-6',
  'bus-above-6',
  'passenger-2w',
  'passenger-3w-upto-6',
  'passenger-3w-7-to-17',
  'goods-private',
  'goods-public',
  'goods-3w-private',
  'goods-3w-public',
  'e-cart-private',
  'e-cart-public',
  'e-rickshaw',
  'special',
] as const;
export const vehicleClassSchema = z.enum(VEHICLE_CLASSES);
export type VehicleClass = z.infer<typeof vehicleClassSchema>;

export const PREVIOUS_NCB = [0, 20, 25, 35, 45, 50] as const;

/** Fuel types, named for what they are (New India's Private Car and Two Wheeler forms). */
export const FUEL_TYPES = [
  'petrol',
  'diesel',
  'cng',
  'lpg',
  'lng',
  'electric',
  'hybrid',
  'mild-hybrid',
  'bifuel',
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

/**
 * A vehicle's details, for motor quotes. Which of the optional details a quote needs depends on
 * the class (the insurer's form says; see src/main/quotes/uiic-motor.ts).
 */
export const vehicleSchema = z.strictObject({
  vehicleClass: vehicleClassSchema,
  condition: z.enum(['new', 'pre-owned']),
  registrationDate: dateOfBirthSchema,
  zone: z.enum(['A', 'B', 'C']),
  idvRupees: z.int().positive().max(1_000_000_000),
  odDiscountPercent: z.int().min(0).max(95).optional(),
  cubicCapacityCc: z.int().positive().max(100_000).optional(),
  horsePower: z.number().positive().max(10_000).optional(),
  seatingCapacity: z.int().min(1).max(500).optional(),
  grossWeightKg: z.int().positive().max(1_000_000).optional(),
  busType: z.enum(['school', 'other']).optional(),
  /** Special vehicles: the type as the insurer lists it (for example "Agricultural Tractors"). */
  specialType: z.string().trim().min(1).max(100).optional(),
  batteryOperated: z.boolean().optional(),
  /** New vehicles: own damage cover for the whole liability period (3 years car, 5 years bike). */
  longTermOd: z.boolean().optional(),
  /** Pre-owned vehicles. */
  claimLastYear: z.boolean().optional(),
  previousNcbPercent: z
    .int()
    .refine((v) => (PREVIOUS_NCB as readonly number[]).includes(v), 'a no-claim bonus step')
    .optional(),
  // New India's Private Car and Two Wheeler forms ask for these as well (recordings of
  // 4 November 2026; src/main/quotes/nia-motor.ts). Make, colour and body type are matched
  // against New India's lists by their visible text.
  make: singleLineText(60).optional(),
  model: singleLineText(80).optional(),
  variant: singleLineText(80).optional(),
  manufactureYear: z.int().min(1950).max(2100).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  /** Private cars: as New India lists it (for example "Hatch-Back"). */
  bodyType: singleLineText(40).optional(),
  colour: singleLineText(40).optional(),
  engineNumber: singleLineText(30).optional(),
  chassisNumber: singleLineText(30).optional(),
  invoiceValueRupees: z.int().positive().max(1_000_000_000).optional(),
});

export type Vehicle = z.infer<typeof vehicleSchema>;

/** A vehicle as saved: the advisor's name for it, and its details. */
export const vehicleInputSchema = z.strictObject({
  name: singleLineText(100),
  vehicle: vehicleSchema,
});
export type VehicleInputRaw = z.input<typeof vehicleInputSchema>;
export type VehicleInput = z.output<typeof vehicleInputSchema>;

export const vehicleRecordSchema = z.strictObject({
  id: entityIdSchema,
  saved: vehicleInputSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type VehicleRecord = z.output<typeof vehicleRecordSchema>;

/** One row of the vehicle list. */
export const vehicleSummarySchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().min(1).max(100),
  vehicleClass: vehicleClassSchema,
  condition: z.enum(['new', 'pre-owned']),
  updatedAt: isoDateTimeSchema,
});
export type VehicleSummary = z.infer<typeof vehicleSummarySchema>;
