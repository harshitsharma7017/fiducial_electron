// Structured validation issues. An issue names where and why, never the rejected value or an
// unexpected key name, so issues can be logged, shown and sent over IPC without leaking input.
// Same shape as the IPC dispatcher's VALIDATION_FAILED details (M2).
import type { z } from 'zod';

export interface ValidationIssue {
  /** Dot-separated schema path, for example `members.1.age`. Never contains input values. */
  path: string;
  /** A Zod issue code or one of this project's rule codes. */
  code: string;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

export const MAX_REPORTED_ISSUES = 20;

export function joinPath(path: readonly PropertyKey[]): string {
  return path.map(String).join('.').slice(0, 100);
}

export function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => ({ path: joinPath(issue.path), code: issue.code }));
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): Validated<z.output<S>> {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, issues: issuesFromZod(result.error) };
}
