// Rural clients (decision of 4 November 2026): kept apart from health and travel clients, as
// travel clients are. A rural client is a farmer: who they are, how to reach them, their nominee,
// their animals (New India's cattle and livestock forms) and their farm house and its contents
// (New India's Farmers Package). Fields follow New India's rural quote forms as recorded on
// 4 November 2026 (new-india-2026-11-04T09-57-52-227Z). Stored encrypted with the clients, until
// the advisor deletes them.
import { z } from 'zod';
import { dateOfBirthSchema, genderSchema, maritalStatusSchema } from './client';
import { entityIdSchema, isoDateTimeSchema, singleLineText } from './common';
import { customerSchema } from './customer';
import { pincodeSchema } from './quote';

/** Animals, as New India's livestock form lists them (rabbits are kept in batches: not here). */
export const ANIMAL_KINDS = [
  'cattle',
  'horse',
  'donkey',
  'pony',
  'mule',
  'yak',
  'camel',
  'pig',
  'sheep',
  'goat',
] as const;
export type AnimalKind = (typeof ANIMAL_KINDS)[number];

/** Types of cattle, across New India's two cattle lists. */
export const CATTLE_TYPES = [
  'buffalo',
  'bullock',
  'bull',
  'calf-heifer',
  'milch-buffalo',
  'milch-cow',
  'mithun',
  'stud-bull',
] as const;
export type CattleType = (typeof CATTLE_TYPES)[number];

export const ANIMAL_ORIGINS = ['indigenous', 'cross-breed', 'exotic'] as const;
export type AnimalOrigin = (typeof ANIMAL_ORIGINS)[number];

/** Nominee relationships, as the Farmers Package lists them (in part). */
export const RURAL_NOMINEE_RELATIONSHIPS = [
  'spouse',
  'son',
  'daughter',
  'father',
  'mother',
  'brother',
  'sister',
  'other',
] as const;

const rupees = z.int().min(1).max(1_000_000_000);

export const animalSchema = z
  .strictObject({
    kind: z.enum(ANIMAL_KINDS),
    /** For cattle. */
    cattleType: z.enum(CATTLE_TYPES).optional(),
    origin: z.enum(ANIMAL_ORIGINS),
    gender: z.enum(['male', 'female']),
    /** Breed, colour and other marks. */
    breed: singleLineText(100),
    ageYears: z.int().min(0).max(40),
    ageMonths: z.int().min(0).max(11),
    tagNumber: singleLineText(40).optional(),
    /** Purpose of use (milk, draught, breeding…). */
    purpose: singleLineText(100).optional(),
    marketValueRupees: rupees,
    /** Asked by the livestock form; the cattle form works it out from the market value. */
    sumInsuredRupees: rupees.optional(),
    fitnessCertificateDate: dateOfBirthSchema.optional(),
    locationOfStable: singleLineText(200).optional(),
  })
  .refine((a) => (a.kind === 'cattle') === (a.cattleType !== undefined), {
    message: 'a type of cattle for cattle only',
    path: ['cattleType'],
  });
export type Animal = z.infer<typeof animalSchema>;

/** The farm house and its contents, for the Farmers Package. */
export const farmSchema = z.strictObject({
  dwellingSumInsuredRupees: rupees.optional(),
  contentsSumInsuredRupees: rupees.optional(),
  /** Identification number of the dwelling unit or house. */
  dwellingId: singleLineText(60).optional(),
  dwellingLocation: singleLineText(200).optional(),
  dwellingDescription: singleLineText(200).optional(),
  contentsDescription: singleLineText(200).optional(),
  /** Katcha (not pucca) construction. */
  katcha: z.boolean().optional(),
  /** Existing physical disabilities of the insured ("None" if none). */
  disabilities: singleLineText(200).optional(),
});
export type Farm = z.infer<typeof farmSchema>;

export const ruralClientSchema = z.strictObject({
  customer: customerSchema,
  pincode: pincodeSchema,
  dateOfBirth: dateOfBirthSchema.optional(),
  gender: genderSchema.optional(),
  maritalStatus: maritalStatusSchema.optional(),
  address: singleLineText(200).optional(),
  nomineeName: singleLineText(100).optional(),
  nomineeRelationship: z.enum(RURAL_NOMINEE_RELATIONSHIPS).optional(),
  nomineeAddress: singleLineText(200).optional(),
  animals: z.array(animalSchema).max(20),
  farm: farmSchema.optional(),
});
export type RuralClientRaw = z.input<typeof ruralClientSchema>;
export type RuralClient = z.output<typeof ruralClientSchema>;

export const ruralRecordSchema = z.strictObject({
  id: entityIdSchema,
  rural: ruralClientSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type RuralRecord = z.output<typeof ruralRecordSchema>;

/** One row of the rural client list. */
export const ruralSummarySchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().min(1).max(100),
  pincode: z.string().max(6),
  animalCount: z.int().min(0).max(20),
  hasFarm: z.boolean(),
  updatedAt: isoDateTimeSchema,
});
export type RuralSummary = z.infer<typeof ruralSummarySchema>;
