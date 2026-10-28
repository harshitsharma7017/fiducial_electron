export const MAX_EXCEPTION_CHARS: number;
export const NO_MESSAGE: string;
export const SANITISER_FAILED: string;
export interface SanitiseContext {
  /** Known roots, replaced before any other path rule. */
  roots: { spike?: string; tmp?: string; home?: string };
  /** Host and user names to redact. */
  names: readonly string[];
  /** Environment whose values of eight or more characters are redacted. */
  env: Readonly<Record<string, string | undefined>>;
}
export function defaultSanitiseContext(): SanitiseContext;
export function sanitiseException(value: unknown, context?: SanitiseContext): string;
