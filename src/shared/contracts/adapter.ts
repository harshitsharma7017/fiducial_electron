// Adapter interface and registry types (ARCH §3.6, 04 §1). TYPES ONLY in M3: no adapter, driver,
// portal automation or registry implementation exists yet (M6). `parse` is pure and returns the
// same insurer result input that manual entry produces, so both go through one normaliser.
import { z } from 'zod';
import { singleLineText } from './common';
import type { Customer } from './customer';
import { insurerIdSchema } from './insurer';
import type { InsurerResultInput, QuoteRequest } from './quote';

export const ADAPTER_MODES = ['automated', 'assisted', 'manual'] as const;

/**
 * Fields an adapter may declare as required before a run starts (FR-04, TC-04). Members have
 * no date of birth in the M3 contracts (C-05), so an adapter that requires one is always blocked
 * until DOB capture is approved and added.
 */
export const REQUIRED_FIELDS = [
  'customer.phone',
  'customer.email',
  'request.pincode',
  'members.dateOfBirth',
] as const;

export const requiredFieldSchema = z.enum(REQUIRED_FIELDS);
export type RequiredField = z.infer<typeof requiredFieldSchema>;

/** An HTTPS origin with no path, query or credentials, for example `https://portal.example`. */
export const httpsOriginSchema = z
  .string()
  .max(200)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.origin === value;
    } catch {
      return false;
    }
  });

export const adapterMetadataSchema = z.strictObject({
  id: insurerIdSchema,
  displayName: singleLineText(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  mode: z.enum(ADAPTER_MODES),
  allowedOrigins: z.array(httpsOriginSchema).max(10),
  requiredFields: z.array(requiredFieldSchema).max(REQUIRED_FIELDS.length),
});

export type AdapterMetadata = z.infer<typeof adapterMetadataSchema>;

/** Sanitised page content handed to `parse`; never cookies, tokens or raw screenshots. */
export interface AdapterSnapshot {
  kind: 'dom_text' | 'json' | 'ocr_text';
  content: string;
}

/** What a run receives. Contact fields are present only if the adapter declared them. */
export interface AdapterRunContext {
  runId: string;
  request: QuoteRequest;
  contact: Partial<Pick<Customer, 'phone' | 'email'>>;
  signal: AbortSignal;
  reportProgress(step: string): void;
}

export interface InsurerAdapter extends AdapterMetadata {
  run(context: AdapterRunContext): Promise<InsurerResultInput>;
  parse(snapshot: AdapterSnapshot): InsurerResultInput;
}

export interface AdapterRegistry {
  list(): readonly AdapterMetadata[];
  get(id: string): InsurerAdapter | undefined;
}
