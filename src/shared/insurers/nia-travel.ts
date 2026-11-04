// New India's overseas travel quote forms the app fills for a travel client (recording
// new-india-2026-11-04T09-43-08-482Z: the three forms opened from the dashboard, their trip
// choices, sections and lists; nothing typed, no premium). The trip is entered for each run and
// never saved. Shared by the request contract and the travel client screen; what is filled is in
// src/main/quotes/nia-travel.ts.
import { z } from 'zod';
import { dateOfBirthSchema } from '../contracts/client';
import { TRAVEL_DESTINATIONS } from '../contracts/travel';

export const NIA_TRAVEL_FORMS = ['studies-employment', 'business-holiday', 'travel-ease'] as const;
export type NiaTravelForm = (typeof NIA_TRAVEL_FORMS)[number];

export const NIA_TRAVEL_FORM_NAMES: Record<NiaTravelForm, string> = {
  'studies-employment': 'Overseas Mediclaim (Employment & Studies)',
  'business-holiday': 'Overseas Mediclaim (Business & Holiday)',
  'travel-ease': 'Overseas Travel Ease (Business & Holiday)',
};

/** Overseas Travel Ease's plans, by their sum insured in US dollars. */
export const NIA_TRAVEL_EASE_PLANS = ['25000', '50000', '100000', '250000', '500000'] as const;
export const NIA_TRAVEL_EASE_PLAN_NAMES: Record<(typeof NIA_TRAVEL_EASE_PLANS)[number], string> = {
  '25000': 'Basic ($25,000)',
  '50000': 'Economy ($50,000)',
  '100000': 'Advanced ($1,00,000)',
  '250000': 'Elite ($2,50,000)',
  '500000': 'Supreme ($5,00,000)',
};

/** Overseas Mediclaim (Business & Holiday)'s destinations, as New India lists them. */
export const NIA_CFT_DESTINATIONS = ['E1', 'E2'] as const;
export const NIA_CFT_DESTINATION_NAMES: Record<(typeof NIA_CFT_DESTINATIONS)[number], string> = {
  E1: 'E - 1 CFT (Worldwide including USA / Canada)',
  E2: 'E - 2 CFT (Worldwide including USA / Canada)',
};

/** A day, YYYY-MM-DD (not before today, and in order: checked by the plan). */
const day = dateOfBirthSchema;

export const niaTripSchema = z.discriminatedUnion('form', [
  z.strictObject({
    form: z.literal('studies-employment'),
    destination: z.enum(TRAVEL_DESTINATIONS),
    purpose: z.enum(['studies', 'employment']),
    leavingDate: day,
    /** Travel duration in months, as New India lists it. */
    months: z.int().min(1).max(12),
    /** The plan's place among those New India offers for the trip, 1 for the first. */
    plan: z.int().min(1).max(8),
  }),
  z.strictObject({
    form: z.literal('business-holiday'),
    destination: z.enum(NIA_CFT_DESTINATIONS),
    purpose: z.enum(['business', 'holiday']),
    leavingDate: day,
  }),
  z.strictObject({
    form: z.literal('travel-ease'),
    destination: z.enum(TRAVEL_DESTINATIONS),
    purpose: z.enum(['business', 'holiday']),
    leavingDate: day,
    returnDate: day,
    plan: z.enum(NIA_TRAVEL_EASE_PLANS),
  }),
]);
export type NiaTrip = z.output<typeof niaTripSchema>;
