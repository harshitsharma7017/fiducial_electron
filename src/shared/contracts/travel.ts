// A trip, for United India's Overseas Travel Insurance e-proposal (recording of 3 November 2026).
// Entered by the advisor for each run and never saved: the trip and the passport number belong to
// one proposal, not to the client. The insured is the proposer ("Self").
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
    occupation: z.enum(TRAVEL_OCCUPATIONS).optional(),
    /** For this proposal only: never saved or logged. */
    passportNumber: passportNumberSchema.optional(),
  })
  .refine(
    (trip) =>
      !(trip.destination === 'worldwide-excluding-usa-canada' && trip.sumInsured === '500000'),
    { message: 'Worldwide excluding USA and Canada goes up to 250000', path: ['sumInsured'] },
  );

export type TravelTrip = z.output<typeof travelTripSchema>;
