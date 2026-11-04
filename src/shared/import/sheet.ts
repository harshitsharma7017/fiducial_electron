// From a sheet's cells (text) to rows keyed by column: the first non-blank row is the header,
// matched to the import's columns by name (case, spacing and punctuation aside, plus each
// column's other accepted names). Blank rows are skipped. Pure.
import { loose, type SheetRow } from './cells';

export interface Column<K extends string = string> {
  key: K;
  /** The header in the template, and in messages. */
  header: string;
  required?: boolean;
  /** For the template's "How to fill" sheet. */
  help: string;
  /** Other headers accepted for this column. */
  aliases?: readonly string[];
  /** Left out of the template (accepted when present: extra members, for example). */
  hidden?: boolean;
}

export type SheetLayout<K extends string> =
  | {
      ok: true;
      rows: SheetRow<K>[];
      /** Headers in the file that match no column (their cells are not imported). */
      ignored: string[];
    }
  | { ok: false; reason: string };

/** At most this many data rows per import. */
export const MAX_IMPORT_ROWS = 2000;

export function layoutSheet<K extends string>(
  data: readonly (readonly string[])[],
  columns: readonly Column<K>[],
): SheetLayout<K> {
  const blank = (row: readonly string[]) => row.every((c) => c.trim() === '');
  const headerAt = data.findIndex((row) => !blank(row));
  if (headerAt < 0) return { ok: false, reason: 'The file is empty.' };
  const header = data[headerAt]!;
  const byName = new Map<string, K>();
  for (const c of columns) {
    for (const name of [c.header, ...(c.aliases ?? [])]) byName.set(loose(name), c.key);
  }
  const index = new Map<number, K>();
  const seen = new Set<K>();
  const ignored: string[] = [];
  header.forEach((cell, i) => {
    if (cell.trim() === '') return;
    const key = byName.get(loose(cell));
    if (key === undefined) ignored.push(cell.trim().slice(0, 60));
    else if (seen.has(key)) ignored.push(`${cell.trim().slice(0, 60)} (repeated)`);
    else {
      index.set(i, key);
      seen.add(key);
    }
  });
  const missing = columns.filter((c) => c.required && !seen.has(c.key)).map((c) => c.header);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `The first row must name the columns. Missing: ${missing.join(', ')}. Start from the template.`,
    };
  }
  const rows: SheetRow<K>[] = [];
  for (let r = headerAt + 1; r < data.length; r += 1) {
    const row = data[r]!;
    if (blank(row)) continue;
    const cells: Partial<Record<K, string>> = {};
    index.forEach((key, i) => {
      const value = row[i]?.trim() ?? '';
      if (value) cells[key] = value;
    });
    rows.push({ line: r + 1, cells });
    if (rows.length > MAX_IMPORT_ROWS) {
      return {
        ok: false,
        reason: `The file has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files.`,
      };
    }
  }
  if (rows.length === 0) return { ok: false, reason: 'The file has no rows under the header.' };
  return { ok: true, rows, ignored };
}
