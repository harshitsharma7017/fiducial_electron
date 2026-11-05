// Property clients (decision of 4 November 2026): kept apart from the other clients. A property
// client is the owner of a home or business premises (a person or a business, as a marine client)
// and that property: what New India's nine fire forms ask about it (recording
// new-india-2026-11-04T10-59-31-695Z): where it is, how it is built, its sums insured and the
// answers to the forms' risk questions. Stored encrypted with the clients, until the advisor
// deletes them.
import { z } from 'zod';
import { entityIdSchema, isoDateTimeSchema, singleLineText } from './common';
import { marineClientSchema } from './marine';
import { pincodeSchema } from './quote';

export const PROPERTY_USES = ['home', 'business'] as const;
export const CONSTRUCTIONS = ['pucca', 'kutcha'] as const;
/** Past three years' claims ratio, as New India lists it. */
export const CLAIM_RATIOS = ['0-30', '30-70', '0-70', '70-100', '100-200', 'Above 200'] as const;

const rupees = z.int().min(0).max(100_000_000_000);
const yesNo = z.boolean().optional();

/** Answers to the fire forms' risk questions (yes or no; absent: left to the advisor). */
export const riskAnswersSchema = z.strictObject({
  lift: yesNo,
  /** The insured risk is in the basement. */
  inBasement: yesNo,
  /** Operational fire hydrant, sprinkler, water spray, fire alarm or smoke detectors. */
  fireProtection: yesNo,
  electricalWellMaintained: yesNo,
  stormWaterDrain: yesNo,
  security24x7: yesNo,
  basementUsedForOperations: yesNo,
  /** Within 1 km of a water body (sea, river, lake). */
  nearWaterBody: yesNo,
  /** Thickly populated area with no access for the fire brigade. */
  noFireBrigadeAccess: yesNo,
  centralAC: yesNo,
  /** Unoccupied for more than 30 days. */
  unoccupied30Days: yesNo,
  mortgaged: yesNo,
  /** Losses from fire or allied perils in the past. */
  pastFireLoss: yesNo,
  /** Had a fire policy before. */
  insuredBefore: yesNo,
});
export type RiskAnswers = z.infer<typeof riskAnswersSchema>;

export const propertySchema = z.strictObject({
  use: z.enum(PROPERTY_USES),
  buildingName: singleLineText(100).optional(),
  landmark: singleLineText(100).optional(),
  address: singleLineText(200),
  pincode: pincodeSchema,
  walls: z.enum(CONSTRUCTIONS).optional(),
  floor: z.enum(CONSTRUCTIONS).optional(),
  roof: z.enum(CONSTRUCTIONS).optional(),
  yearOfConstruction: z.int().min(1900).max(2100).optional(),
  /** Number of floors in the occupancy. */
  floors: z.int().min(1).max(200).optional(),
  /** The floor the insured occupancy is on (0: ground floor). */
  occupancyFloor: z.int().min(0).max(200).optional(),
  heightMeters: z.number().min(0).max(1000).optional(),
  /** Homes: New India works the building's sum insured out from these. */
  carpetAreaSqm: z.number().min(1).max(1_000_000).optional(),
  constructionRatePerSqm: rupees.optional(),
  buildingSumInsured: rupees.optional(),
  furnitureSumInsured: rupees.optional(),
  electricalSumInsured: rupees.optional(),
  otherContentsSumInsured: rupees.optional(),
  otherContentsDescription: singleLineText(200).optional(),
  plantMachinerySumInsured: rupees.optional(),
  stocksSumInsured: rupees.optional(),
  stocksDescription: singleLineText(200).optional(),
  /** Type of industry or occupation, as New India lists it (Offices, Shops, Hotels…). */
  industry: singleLineText(120).optional(),
  claimRatio: z.enum(CLAIM_RATIOS).optional(),
  /** Maximum incurred claims ratio in the last three years, as a percentage. */
  maxClaimRatioPercent: z.number().min(0).max(10_000).optional(),
  fireProtectionDetails: singleLineText(200).optional(),
  fireBrigadeDistanceKm: z.number().min(0).max(1000).optional(),
  fireBrigadeMinutes: z.int().min(0).max(1000).optional(),
  risks: riskAnswersSchema,
});
export type Property = z.infer<typeof propertySchema>;

export const propertyClientSchema = z.strictObject({
  /** The owner: a person or a business (as a marine client). */
  holder: marineClientSchema,
  property: propertySchema,
});
export type PropertyClientRaw = z.input<typeof propertyClientSchema>;
export type PropertyClient = z.output<typeof propertyClientSchema>;

export const propertyRecordSchema = z.strictObject({
  id: entityIdSchema,
  property: propertyClientSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PropertyRecord = z.output<typeof propertyRecordSchema>;

export const propertySummarySchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().min(1).max(100),
  pincode: z.string().max(6),
  use: z.enum(PROPERTY_USES),
  updatedAt: isoDateTimeSchema,
});
export type PropertySummary = z.infer<typeof propertySummarySchema>;
