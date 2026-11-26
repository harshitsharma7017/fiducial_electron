// Travel clients: kept apart from health clients (decision of 3 November 2026), as vehicles are.
// A travel client is one traveller, the proposer and insured of United India's travel
// e-proposals (Overseas Travel Insurance, Overseas Mediclaim B&H, SCHENGEN, Studies): who they
// are, how to reach them, their proposal details and passport. Stored encrypted with the clients,
// until the advisor deletes them. The passport number and the Aadhaar number are kept apart, in
// the secret vault (only their last characters are ever shown).
import { z } from 'zod';
import {
  dateOfBirthSchema,
  genderSchema,
  maritalStatusSchema,
  proposalDetailsSchema,
} from './client';
import { entityIdSchema, isoDateTimeSchema, singleLineText } from './common';
import { customerSchema } from './customer';
import { pincodeSchema } from './quote';
import { TRAVEL_OCCUPATIONS } from './travel';

/** The proposal details travel forms ask (the health forms' occupation list does not apply). */
export const travellerProposalSchema = proposalDetailsSchema.omit({ occupation: true });

/** The passport, apart from its number (kept in the secret vault). */
export const passportDetailsSchema = z.strictObject({
  /** For example "Passport Office, Bengaluru". */
  issuingAuthority: singleLineText(80).optional(),
  issueDate: dateOfBirthSchema.optional(),
  expiryDate: dateOfBirthSchema.optional(),
});

/** Where the trip goes, as ICICI's travel form groups countries (the other forms follow from it). */
export const TRIP_DESTINATIONS = ['usa-canada', 'schengen', 'asia', 'other'] as const;
export type TripDestination = (typeof TRIP_DESTINATIONS)[number];

const tripDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * The trip saved with a travel client (its Additional details, request of 26 November 2026: the
 * travel compare asks only the plan): every travel quote and Compare quotes start from it.
 */
export const travellerTripSchema = z
  .strictObject({
    departureDate: tripDay,
    returnDate: tripDay,
    destination: z.enum(TRIP_DESTINATIONS),
    /** Travelling to study (ICICI's Student Medical Travel, United India's Studies). */
    student: z.boolean().optional(),
  })
  .refine((t) => t.departureDate <= t.returnDate, {
    message: 'the return is after the departure',
    path: ['returnDate'],
  });
export type TravellerTrip = z.output<typeof travellerTripSchema>;

export const travellerSchema = z
  .strictObject({
    customer: customerSchema,
    pincode: pincodeSchema,
    /** Needed: the forms price plans by age and ask it of the insured. */
    dateOfBirth: dateOfBirthSchema,
    gender: genderSchema.optional(),
    maritalStatus: maritalStatusSchema.optional(),
    /** As the travel forms list it. */
    occupation: z.enum(TRAVEL_OCCUPATIONS).optional(),
    proposal: travellerProposalSchema.optional(),
    passport: passportDetailsSchema.optional(),
    trip: travellerTripSchema.optional(),
  })
  .refine(
    (t) =>
      !t.passport?.issueDate ||
      !t.passport.expiryDate ||
      t.passport.issueDate < t.passport.expiryDate,
    { message: 'the passport expires after it was issued', path: ['passport', 'expiryDate'] },
  );

export type TravellerRaw = z.input<typeof travellerSchema>;
export type Traveller = z.output<typeof travellerSchema>;

export const travellerRecordSchema = z.strictObject({
  id: entityIdSchema,
  traveller: travellerSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TravellerRecord = z.output<typeof travellerRecordSchema>;

/** One row of the travel client list. */
export const travellerSummarySchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().min(1).max(100),
  pincode: z.string().max(6),
  dateOfBirth: dateOfBirthSchema,
  updatedAt: isoDateTimeSchema,
});
export type TravellerSummary = z.infer<typeof travellerSummarySchema>;
