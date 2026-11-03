// A saved client: the customer, their pincode and policy members, and optional quote preferences,
// kept so quotes can be fetched again without re-typing (M4 storage).
//
// Data minimisation (C-04, C-05): the customer has a name and optional contact details; members
// carry relationship and age. Fields are added only when an insurer's recorded quote form requires
// them (decision of 2 November 2026, United India's health calculator): each member's date of
// birth and gender, and the proposer's marital status, all optional and stored encrypted. Member
// names are still not stored. The good-health declaration is never stored: the advisor confirms
// it for each quote.
import { z } from 'zod';
import { positivePaiseSchema } from '../money';
import { entityIdSchema, isoDateTimeSchema } from './common';
import { coverTypeSchema, tenureYearsSchema } from './coverage';
import { customerSchema, memberSchema, type Member } from './customer';
import { MAX_CONTRACT_MEMBERS, pincodeSchema, type QuoteRequest } from './quote';

/** What the advisor usually quotes for this client. */
export const quotePreferencesSchema = z.strictObject({
  coverType: coverTypeSchema,
  /** Requested sum insured in paise; per member for individual cover, shared for floater. */
  sumInsuredPaise: positivePaiseSchema,
  tenureYears: tenureYearsSchema,
});

export type QuotePreferences = z.infer<typeof quotePreferencesSchema>;

export const GENDERS = ['male', 'female', 'transgender'] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;

export const MARITAL_STATUSES = ['married', 'unmarried', 'widowed', 'divorced'] as const;
export const maritalStatusSchema = z.enum(MARITAL_STATUSES);
export type MaritalStatus = z.infer<typeof maritalStatusSchema>;

/**
 * A real calendar date, YYYY-MM-DD, from 1900. Shared code does not read the clock: "not in the
 * future" is checked where clients are saved (src/main/clients/service.ts).
 */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return y >= 1900 && days !== undefined && d >= 1 && d <= days;
  }, 'a real date of birth');

/** Whether any member's date of birth is after `today` (local date). */
export function hasFutureDateOfBirth(
  client: { members: readonly { dateOfBirth?: string }[] },
  today: Date,
): boolean {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return client.members.some((m) => m.dateOfBirth !== undefined && m.dateOfBirth > iso);
}

/** Completed years on `on` for a date of birth (YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, on: Date): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [number, number, number];
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age -= 1;
  return age;
}

/** A policy member as saved with a client: relationship and age, optionally DOB and gender. */
export const clientMemberSchema = memberSchema.extend({
  dateOfBirth: dateOfBirthSchema.optional(),
  gender: genderSchema.optional(),
});

export type ClientMember = z.infer<typeof clientMemberSchema>;

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

/**
 * A client's vehicle, for motor quotes. Which of the optional details a quote needs depends on
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
});

export type Vehicle = z.infer<typeof vehicleSchema>;

export const clientInputSchema = z
  .strictObject({
    customer: customerSchema,
    pincode: pincodeSchema,
    /** Policy members for health quotes; empty for a vehicle-only (motor) client. */
    members: z.array(clientMemberSchema).max(MAX_CONTRACT_MEMBERS),
    /** The proposer's ("self") marital status. */
    proposerMaritalStatus: maritalStatusSchema.optional(),
    preferences: quotePreferencesSchema.optional(),
    /** The vehicle, for motor quotes. */
    vehicle: vehicleSchema.optional(),
  })
  .refine((c) => c.members.length > 0 || c.vehicle !== undefined, {
    message: 'members for health, or a vehicle for motor',
    path: ['members'],
  });

export type ClientInputRaw = z.input<typeof clientInputSchema>;
export type ClientInput = z.output<typeof clientInputSchema>;

export const clientRecordSchema = z.strictObject({
  id: entityIdSchema,
  client: clientInputSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ClientRecord = z.output<typeof clientRecordSchema>;

/** One row of the client list: enough to find a client, nothing more. */
export const clientSummarySchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().min(1).max(100),
  pincode: z.string().regex(/^\d{6}$/),
  memberCount: z.int().min(0).max(MAX_CONTRACT_MEMBERS),
  hasVehicle: z.boolean(),
  hasPreferences: z.boolean(),
  updatedAt: isoDateTimeSchema,
});

export type ClientSummary = z.infer<typeof clientSummarySchema>;

/** The quote request a saved client stands for, or null until its preferences are filled in. */
export function quoteRequestFor(client: ClientInput): QuoteRequest | null {
  if (!client.preferences || client.members.length === 0) return null;
  return {
    // The comparison contract carries relationship and age only.
    members: client.members.map((m): Member => ({ relationship: m.relationship, age: m.age })),
    coverType: client.preferences.coverType,
    sumInsuredPaise: client.preferences.sumInsuredPaise,
    tenureYears: client.preferences.tenureYears,
    pincode: client.pincode,
  };
}
