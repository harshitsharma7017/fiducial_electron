// What reading one row gives: the value to save (with its label, a short description and the key
// that finds the same record again), or the row's problems. Pure.

export type ImportRow<T> =
  | { ok: true; line: number; label: string; detail: string; key: string; value: T }
  | { ok: false; line: number; label: string; detail: string; problems: string[] };

/**
 * Schema problems as "Column: problem", without repeating what a column already reported (a
 * cell the row reader rejected is also missing from the record the schema checks).
 */
export function schemaProblems(
  issues: readonly { path: readonly PropertyKey[]; code: string }[],
  columnFor: (path: readonly PropertyKey[]) => string | null,
  already: readonly string[],
): string[] {
  const out: string[] = [];
  for (const issue of issues) {
    const column = columnFor(issue.path);
    if (column && already.some((p) => p.startsWith(`${column}:`))) continue;
    const what = issue.code === 'invalid_type' ? 'required' : 'not valid';
    const text = column ? `${column}: ${what}` : 'Some details are not valid';
    if (!out.includes(text)) out.push(text);
  }
  return out;
}
