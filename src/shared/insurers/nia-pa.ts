// New India's Personal Accident quote forms the app fills for a health client's proposer ("Self")
// (recording new-india-2026-11-04T10-41-14-769Z: three forms opened from the dashboard, Personal
// Accident, their sections and lists; nothing typed, no premium). What the advisor chooses for the
// run is entered for that run and never saved. Shared by the request contract and the client
// screen; what is filled is in src/main/quotes/nia-pa.ts.
import { z } from 'zod';
import { singleLineText } from '../contracts/common';

export const NIA_PA_FORMS = ['sukshma', 'janta', 'pension'] as const;
export type NiaPaForm = (typeof NIA_PA_FORMS)[number];

export const NIA_PA_FORM_NAMES: Record<NiaPaForm, string> = {
  sukshma: 'Janata PA Sukshma Bima',
  janta: 'Personal Janta',
  pension: 'Pension Protect Personal Accident',
};

/** Sum insured, as the Janata forms list it. */
export const NIA_PA_SUMS = ['25000', '50000', '75000', '100000'] as const;
export const NIA_PA_STATUSES = {
  earning: 'Earning Member',
  'non-earning': 'Non Earning Member',
  minor: 'Minor',
} as const;
export const NIA_PA_EXCESS = ['0', '1', '3', '5', '10', '15', '20', '25', '30'] as const;

const janata = {
  sumInsured: z.enum(NIA_PA_SUMS),
  status: z.enum(Object.keys(NIA_PA_STATUSES) as ['earning', 'non-earning', 'minor']),
  /** Policy duration in years. */
  term: z.int().min(1).max(3),
};

export const niaPaRunSchema = z.discriminatedUnion('form', [
  z.strictObject({ form: z.literal('sukshma'), ...janata }),
  z.strictObject({ form: z.literal('janta'), ...janata, excess: z.enum(NIA_PA_EXCESS) }),
  z.strictObject({
    form: z.literal('pension'),
    monthlyPensionRupees: z.int().min(1).max(10_000_000),
    /** Where the insured worked immediately before retiring. */
    organisation: singleLineText(30),
  }),
]);
export type NiaPaRun = z.output<typeof niaPaRunSchema>;
