// New India's rural quote forms the app fills for a rural client (recording
// new-india-2026-11-04T09-57-52-227Z: four forms opened, their sections and lists; nothing typed,
// no premium). What the advisor chooses for each run (scheme, claim ratio, start date…) is entered
// for that run and never saved. Shared by the request contract and the rural client screen; what is
// filled is in src/main/quotes/nia-rural.ts.
import { z } from 'zod';
import { dateOfBirthSchema } from '../contracts/client';

export const NIA_RURAL_FORMS = [
  'cattle',
  'farmers-package',
  'livestock-blda',
  'cattle-non-scheme',
] as const;
export type NiaRuralForm = (typeof NIA_RURAL_FORMS)[number];

export const NIA_RURAL_FORM_NAMES: Record<NiaRuralForm, string> = {
  cattle: 'Cattle Insurance',
  'farmers-package': 'Farmers Package',
  'livestock-blda': 'Livestock (BLDA scheme)',
  'cattle-non-scheme': 'Cattle (Non-scheme)',
};

/** Cattle Insurance's schemes, as New India lists them. */
export const NIA_CATTLE_SCHEMES = {
  'bank-financed': 'Bank Financed',
  dairies: 'Corporate/Co-operative Dairies',
  'individual-owner': 'Individual Owner',
} as const;
/** The non-scheme cattle form's schemes, as New India lists them (its spelling). */
export const NIA_NON_SCHEME_SCHEMES = {
  'bank-financed': 'Bank Financed',
  'cooperative-dairies': 'Cooperative Diaries',
  'corporate-dairies': 'Corporate Diaries',
  'private-dairies': 'Private Diaries',
  others: 'Others',
} as const;
export const NIA_BLDA_BENEFICIARIES = ['GEN', 'OBC', 'BPL', 'SC', 'ST'] as const;
export const NIA_FARMERS_EXCESS = ['0', '1', '3', '5', '10', '15', '20', '25', '30'] as const;

const keys = <T extends Record<string, string>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
/** A claim ratio as typed (a percentage or ratio, digits and one point). */
const claimRatio = z
  .string()
  .max(10)
  .regex(/^\d{1,4}(\.\d{1,2})?$/)
  .optional();

export const niaRuralRunSchema = z.discriminatedUnion('form', [
  z.strictObject({
    form: z.literal('cattle'),
    scheme: z.enum(keys(NIA_CATTLE_SCHEMES)),
    claimRatio,
  }),
  z.strictObject({
    form: z.literal('farmers-package'),
    /** The policy start date, YYYY-MM-DD (not before today: checked by the plan). */
    startDate: dateOfBirthSchema,
    excess: z.enum(NIA_FARMERS_EXCESS),
  }),
  z.strictObject({
    form: z.literal('livestock-blda'),
    beneficiary: z.enum(NIA_BLDA_BENEFICIARIES),
    claimRatio,
  }),
  z.strictObject({
    form: z.literal('cattle-non-scheme'),
    scheme: z.enum(keys(NIA_NON_SCHEME_SCHEMES)),
  }),
]);
export type NiaRuralRun = z.output<typeof niaRuralRunSchema>;
