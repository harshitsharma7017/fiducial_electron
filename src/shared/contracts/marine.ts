// Marine clients (decision of 4 November 2026): kept apart from health, travel and rural clients.
// A marine client is the policy holder of New India's Specific Voyage form: a business (most
// often) or an individual, with what that form's Policy Holder Information asks (recording
// new-india-2026-11-04T10-22-36-040Z). The shipment is entered for each quote, never saved (see
// ../insurers/nia-marine.ts). Stored encrypted with the clients, until the advisor deletes them.
import { z } from 'zod';
import { dateOfBirthSchema, genderSchema, maritalStatusSchema, panSchema } from './client';
import { entityIdSchema, isoDateTimeSchema, singleLineText } from './common';
import { customerSchema } from './customer';
import { pincodeSchema } from './quote';

export const MARINE_HOLDER_KINDS = ['organization', 'individual'] as const;

/** Types of organisation, as New India lists them. */
export const NIA_ORGANISATION_TYPES = [
  'Board/Authority set up by Govt/Act/State Legislature',
  'Central Govt',
  'Consular Offices',
  'Educational Institution',
  'Firm',
  'Government Agencies',
  'Local Authority',
  'MSME',
  'Non Resident',
  'Others',
  'Private Limited Company',
  'PSU(Public Sector Undertaking)',
  'Public Limited Company',
  'Society',
  'State Govt',
] as const;

export const marineClientSchema = z
  .strictObject({
    kind: z.enum(MARINE_HOLDER_KINDS),
    /** The business name, or the person's name. */
    customer: customerSchema,
    pincode: pincodeSchema,
    /** Building no., street (business address 1). */
    address: singleLineText(100).optional(),
    pan: panSchema.optional(),
    // An individual.
    dateOfBirth: dateOfBirthSchema.optional(),
    gender: genderSchema.optional(),
    maritalStatus: maritalStatusSchema.optional(),
    // An organisation.
    registrationNo: singleLineText(40).optional(),
    registrationDate: dateOfBirthSchema.optional(),
    msme: z.boolean().optional(),
    organisationType: z.enum(NIA_ORGANISATION_TYPES).optional(),
  })
  .refine(
    (c) =>
      c.kind === 'organization'
        ? !c.dateOfBirth && !c.gender && !c.maritalStatus
        : !c.registrationNo && !c.registrationDate && c.msme === undefined && !c.organisationType,
    { message: 'details of the other kind of policy holder', path: ['kind'] },
  );
export type MarineClientRaw = z.input<typeof marineClientSchema>;
export type MarineClient = z.output<typeof marineClientSchema>;

export const marineRecordSchema = z.strictObject({
  id: entityIdSchema,
  marine: marineClientSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type MarineRecord = z.output<typeof marineRecordSchema>;

/** One row of the marine client list. */
export const marineSummarySchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().min(1).max(100),
  pincode: z.string().max(6),
  kind: z.enum(MARINE_HOLDER_KINDS),
  updatedAt: isoDateTimeSchema,
});
export type MarineSummary = z.infer<typeof marineSummarySchema>;
