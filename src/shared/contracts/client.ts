// A saved client: the customer, their pincode and policy members, and optional quote preferences,
// kept so quotes can be fetched again without re-typing (M4 storage).
//
// Data minimisation (C-04, C-05) applies unchanged: the customer has a name and optional contact
// details; members carry relationship and age only, with no names, gender or date of birth.
// Further fields are added per insurer only when that insurer's recorded quote form requires them.
import { z } from 'zod';
import { positivePaiseSchema } from '../money';
import { entityIdSchema, isoDateTimeSchema } from './common';
import { coverTypeSchema, tenureYearsSchema } from './coverage';
import { customerSchema, memberSchema } from './customer';
import { MAX_CONTRACT_MEMBERS, pincodeSchema, type QuoteRequest } from './quote';

/** What the advisor usually quotes for this client. */
export const quotePreferencesSchema = z.strictObject({
  coverType: coverTypeSchema,
  /** Requested sum insured in paise; per member for individual cover, shared for floater. */
  sumInsuredPaise: positivePaiseSchema,
  tenureYears: tenureYearsSchema,
});

export type QuotePreferences = z.infer<typeof quotePreferencesSchema>;

export const clientInputSchema = z.strictObject({
  customer: customerSchema,
  pincode: pincodeSchema,
  members: z.array(memberSchema).min(1).max(MAX_CONTRACT_MEMBERS),
  preferences: quotePreferencesSchema.optional(),
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
  memberCount: z.int().min(1).max(MAX_CONTRACT_MEMBERS),
  hasPreferences: z.boolean(),
  updatedAt: isoDateTimeSchema,
});

export type ClientSummary = z.infer<typeof clientSummarySchema>;

/** The quote request a saved client stands for, or null until its preferences are filled in. */
export function quoteRequestFor(client: ClientInput): QuoteRequest | null {
  if (!client.preferences) return null;
  return {
    members: client.members.map((m) => ({ ...m })),
    coverType: client.preferences.coverType,
    sumInsuredPaise: client.preferences.sumInsuredPaise,
    tenureYears: client.preferences.tenureYears,
    pincode: client.pincode,
  };
}
