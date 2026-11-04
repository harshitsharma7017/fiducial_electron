// Reading spreadsheet cells for the client imports: every cell arrives as text (the main process
// turns Excel numbers, dates and booleans into text first), and each reader either returns the
// value or a short reason. Reasons never repeat the cell's value: a mistyped Aadhaar or passport
// number must not be echoed back.
//
// Pure: no clock (today is passed in), no I/O.

/** One data row: the text of each known column, by key ('' when blank), and its line number. */
export interface SheetRow<K extends string = string> {
  /** The spreadsheet's own row number (the header is row 1). */
  line: number;
  cells: Partial<Record<K, string>>;
}

export type Read<T> = { ok: true; value: T } | { ok: false; reason: string };
export const ok = <T>(value: T): Read<T> => ({ ok: true, value });
export const bad = (reason: string): Read<never> => ({ ok: false, reason });

/** Compares names and labels as people type them: case, spacing and punctuation aside. */
export const loose = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

const pad = (n: number) => String(n).padStart(2, '0');

const realDate = (y: number, m: number, d: number): boolean => {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return y >= 1900 && y <= 2100 && days !== undefined && d >= 1 && d <= days;
};

/**
 * A date as YYYY-MM-DD. Accepts what the main process makes of an Excel date (YYYY-MM-DD), and
 * text as Indian spreadsheets write it: DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY (day first, never
 * month first), with a one-digit day or month allowed.
 */
export function readDate(text: string): Read<string> {
  const t = text.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let y: number, m: number, d: number;
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
    if (!match) return bad('write the date as DD/MM/YYYY');
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  if (!realDate(y, m, d)) return bad('not a real date (DD/MM/YYYY)');
  return ok(`${y}-${pad(m)}-${pad(d)}`);
}

/** Yes or no: Yes/No, Y/N, True/False, 1/0. */
export function readYesNo(text: string): Read<boolean> {
  const t = loose(text);
  if (['yes', 'y', 'true', '1'].includes(t)) return ok(true);
  if (['no', 'n', 'false', '0'].includes(t)) return ok(false);
  return bad('write Yes or No');
}

/** A whole number within bounds (thousands separators and spaces allowed). */
export function readInt(text: string, min: number, max: number): Read<number> {
  const t = text.replace(/[,\s]/g, '');
  if (!/^-?\d+(\.0+)?$/.test(t)) return bad('a whole number');
  const n = Number(t);
  if (n < min || n > max) return bad(`a whole number from ${min} to ${max}`);
  return ok(n);
}

/** A positive number of rupees, up to two decimals ("₹", "Rs" and separators allowed). */
export function readRupees(text: string, max: number): Read<number> {
  const t = text.replace(/₹|rs\.?|inr|[,\s]/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return bad('an amount in rupees');
  const n = Number(t);
  if (n <= 0 || n > max) return bad(`an amount from 1 to ${max} rupees`);
  return ok(n);
}

/** One of a list, by any of its accepted spellings (compared loosely). */
export function readChoice<V extends string>(
  text: string,
  choices: readonly { value: V; names: readonly string[] }[],
): Read<V> {
  const t = loose(text);
  const found = choices.find((c) => c.names.some((n) => loose(n) === t));
  if (found) return ok(found.value);
  const shown = choices.map((c) => c.names[0]).join(', ');
  return bad(choices.length <= 12 ? `use one of: ${shown}` : 'not one of the accepted values');
}

/**
 * Reads the cells of a row with a field reader per column, collecting "Column: reason" problems.
 * `get` returns undefined for a blank cell, so optional fields can be left out.
 */
export function rowReader<K extends string>(
  row: SheetRow<K>,
  headers: Record<K, string>,
): {
  text: (key: K) => string | undefined;
  read: <T>(key: K, reader: (text: string) => Read<T>) => T | undefined;
  require: <T>(key: K, reader: (text: string) => Read<T>) => T | undefined;
  problem: (key: K | null, reason: string) => void;
  problems: string[];
} {
  const problems: string[] = [];
  const text = (key: K): string | undefined => {
    const value = row.cells[key]?.trim();
    return value ? value : undefined;
  };
  const problem = (key: K | null, reason: string) =>
    problems.push(key ? `${headers[key]}: ${reason}` : reason);
  const read = <T>(key: K, reader: (text: string) => Read<T>): T | undefined => {
    const value = text(key);
    if (value === undefined) return undefined;
    const result = reader(value);
    if (result.ok) return result.value;
    problem(key, result.reason);
    return undefined;
  };
  const require = <T>(key: K, reader: (text: string) => Read<T>): T | undefined => {
    if (text(key) === undefined) {
      problem(key, 'required');
      return undefined;
    }
    return read(key, reader);
  };
  return { text, read, require, problem, problems };
}
