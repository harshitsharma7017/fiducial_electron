// DEVELOPMENT-ONLY. A small CSV parser for the demo census: comma separated, optional double
// quotes with "" as an escaped quote, CRLF or LF line endings. Pure; never throws.

export interface CsvRecord {
  /** 1-based line number where the record starts. */
  line: number;
  cells: string[];
}

export type CsvParse = { ok: true; records: CsvRecord[] } | { ok: false; error: string };

export const MAX_CSV_CHARS = 200_000;
export const MAX_CSV_RECORDS = 2_000;

export function parseCsv(text: string): CsvParse {
  if (text.length > MAX_CSV_CHARS)
    return { ok: false, error: 'The file is too large for the demo.' };
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let quotedCell = false;

  const endCell = (): void => {
    cells.push(quotedCell ? cell : cell.trim());
    cell = '';
    quotedCell = false;
  };
  const endRecord = (): void => {
    endCell();
    if (!(cells.length === 1 && cells[0] === '')) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      inQuotes = true;
      quotedCell = true;
      cell = '';
    } else if (ch === ',') endCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      endRecord();
      line += 1;
      recordLine = line;
      if (records.length > MAX_CSV_RECORDS) {
        return { ok: false, error: 'The file has too many rows for the demo.' };
      }
    } else cell += ch;
  }
  if (inQuotes)
    return { ok: false, error: `A quoted value starting on line ${recordLine} is not closed.` };
  endRecord();
  return { ok: true, records };
}
