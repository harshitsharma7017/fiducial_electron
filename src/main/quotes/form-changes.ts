// What the advisor changed on a form the app filled and handed over, before its PDF (request of
// 25 November 2026: "let me change it before the PDF"). The form's values are read by caption when
// the app hands it over and again when the advisor presses Generate PDF (page-ops formValues); the
// boxes whose value differs are the changes the PDF names. A caption shown more than once is told
// apart by its order on the page. Boxes that only appeared, or went away, are not counted: the form
// may have moved on to another step.

/** The form's values, as page-ops formValues gives them (JSON pairs [caption, value]). */
export function parseFormValues(json: string | undefined): [string, string][] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (p): p is [string, string] =>
        Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string',
    );
  } catch {
    return null;
  }
}

const keyed = (pairs: readonly [string, string][]): Map<string, [string, string]> => {
  const seen = new Map<string, number>();
  const out = new Map<string, [string, string]>();
  for (const [caption, value] of pairs) {
    const n = (seen.get(caption) ?? 0) + 1;
    seen.set(caption, n);
    out.set(`${caption}\u0000${n}`, [caption, value]);
  }
  return out;
};

/** Each change as "Caption: before → after", in the page's order, at most `limit`. */
export function formChanges(
  before: readonly [string, string][],
  after: readonly [string, string][],
  limit = 12,
): string[] {
  const was = keyed(before);
  const changes: string[] = [];
  for (const [key, [caption, value]] of keyed(after)) {
    const old = was.get(key);
    if (!old || old[1] === value) continue;
    changes.push(`${caption}: ${old[1] || '(empty)'} → ${value || '(empty)'}`);
    if (changes.length >= limit) break;
  }
  return changes;
}
