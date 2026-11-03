// A trip, for United India's travel e-proposals (recordings of 3 November 2026). Entered by the
// advisor for each run and never saved: the trip belongs to one proposal. The traveller (a travel
// client, ./traveller.ts) is the proposer and insured ("Self"), with their passport.
import { z } from 'zod';
import { dateOfBirthSchema } from './client';

/** Travel Destination, as the form lists it. */
export const TRAVEL_DESTINATIONS = ['worldwide', 'worldwide-excluding-usa-canada'] as const;
export type TravelDestination = (typeof TRAVEL_DESTINATIONS)[number];

/**
 * Sum insured, as the form's Plan Type lists it: plans B1-B4 for Worldwide, A1-A3 (no 500000) for
 * Worldwide excluding USA and Canada.
 */
export const TRAVEL_SUMS_INSURED = ['50000', '100000', '250000', '500000'] as const;
export type TravelSumInsured = (typeof TRAVEL_SUMS_INSURED)[number];

/** The insured's occupation, as the form lists it. */
export const TRAVEL_OCCUPATIONS = [
  'SelfEmployed',
  'Unemployed',
  'Salaried',
  'Service',
  'Professional',
] as const;
export type TravelOccupation = (typeof TRAVEL_OCCUPATIONS)[number];

/** Passport number: letters and digits (an Indian passport is a letter and seven digits). */
export const passportNumberSchema = z
  .string()
  .max(20)
  .transform((value) => value.replace(/\s/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{6,12}$/));

export const travelTripSchema = z
  .strictObject({
    destination: z.enum(TRAVEL_DESTINATIONS),
    sumInsured: z.enum(TRAVEL_SUMS_INSURED),
    /** The first day of travel, YYYY-MM-DD (not before today: checked by the plan). */
    startDate: dateOfBirthSchema,
    /** Days of travel, counting the first. */
    days: z.int().min(1).max(365),
  })
  .refine(
    (trip) =>
      !(trip.destination === 'worldwide-excluding-usa-canada' && trip.sumInsured === '500000'),
    { message: 'Worldwide excluding USA and Canada goes up to 250000', path: ['sumInsured'] },
  );

export type TravelTrip = z.output<typeof travelTripSchema>;

/**
 * United India's Overseas Mediclaim e-proposals (recording of 3 November 2026: B&H; the advisor
 * says SCHENGEN and Studies have the same fields). Their plans are offered after the trip and the
 * insured's date of birth are entered, by code (A-1, A-2…) with their premiums: the advisor picks
 * one by its place in the list, lowest first.
 */
export const OMP_FORMS = ['business-holiday', 'schengen', 'studies'] as const;
export type OmpForm = (typeof OMP_FORMS)[number];

export const ompTripSchema = z.strictObject({
  form: z.enum(OMP_FORMS),
  destination: z.enum(TRAVEL_DESTINATIONS),
  /** The first day of travel, YYYY-MM-DD (not before today: checked by the plan). */
  startDate: dateOfBirthSchema,
  days: z.int().min(1).max(365),
  /** The plan's place among those United India offers, 1 for the first (lowest). */
  plan: z.int().min(1).max(8),
});

export type OmpTrip = z.output<typeof ompTripSchema>;
