// Shared primitives for the M3 domain contracts. Contract status: DRAFT until the M3 contract
// review (IMPLEMENTATION_PLAN §4 M3 definition of done); changes after the freeze need a version bump.
import { z } from 'zod';

export const CONTRACTS_VERSION = '0.1.0';
export const CONTRACTS_STATUS = 'draft' as const;

/** True if the text contains a C0 or C1 control character other than those allowed. */
function hasControlChars(value: string, allowed: readonly string[] = []): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code < 0x20 || (code >= 0x7f && code <= 0x9f)) && !allowed.includes(char)) return true;
  }
  return false;
}

/** Single-line text: trimmed, internal whitespace collapsed, no control characters. */
export const singleLineText = (max: number) =>
  z
    .string()
    .max(max * 4)
    .refine((value) => !hasControlChars(value))
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(max));

/** Multi-line text such as notes: trimmed; newlines and tabs allowed; other controls rejected. */
export const multiLineText = (max: number) =>
  z
    .string()
    .max(max * 4)
    .refine((value) => !hasControlChars(value, ['\n', '\r', '\t']))
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(max));

/** Opaque identifiers (result, run and quote IDs). */
export const entityIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** Lower-case slugs for insurer, adapter and add-on identifiers. */
export const slugSchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);

export const isoDateTimeSchema = z.iso.datetime({ offset: true });
