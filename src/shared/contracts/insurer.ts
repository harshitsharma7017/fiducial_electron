// Insurer identity and plan contracts. Whether an insurer contributes one plan or several to a
// comparison is undecided (Q-B16); the contracts allow several and the engine treats an exact
// duplicate (same insurer and plan label) as ambiguous.
import { z } from 'zod';
import { singleLineText, slugSchema } from './common';

export const insurerIdSchema = slugSchema;
export type InsurerId = z.infer<typeof insurerIdSchema>;

export const insurerSchema = z.strictObject({
  id: insurerIdSchema,
  displayName: singleLineText(80),
});

export type Insurer = z.infer<typeof insurerSchema>;

/** A product or plan label as shown by the insurer or entered manually. */
export const planLabelSchema = singleLineText(120);

export const planSchema = z.strictObject({
  insurerId: insurerIdSchema,
  label: planLabelSchema,
});

export type Plan = z.infer<typeof planSchema>;

/** Case- and whitespace-insensitive plan identity, used only to detect duplicates. */
export function planIdentity(insurerId: InsurerId, label: string): string {
  return `${insurerId}\u0000${label.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}
