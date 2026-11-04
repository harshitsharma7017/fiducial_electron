// Reads an .xlsx or .csv file into rows of cell text, for the client imports. Size limits stop a
// huge or crafted file before it is unpacked: the file itself, and (for .xlsx, which is a zip) the
// unpacked size its directory declares. Errors are returned as short codes; a library's own
// message (which may quote the file) is never passed on.
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { unzipSync } from 'fflate';
import readXlsxFile from 'read-excel-file/node';
import { readCsv } from '../../shared/import/csv';
import { loose } from '../../shared/import/cells';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;

export type FileRead =
  | { ok: true; rows: string[][] }
  | {
      ok: false;
      reason: 'too-large' | 'unsupported' | 'unreadable' | 'xls' | 'unclosed-quote' | 'no-sheet';
    };

const pad = (n: number) => String(n).padStart(2, '0');

/** A cell as text: Excel dates as YYYY-MM-DD, whole numbers without exponent, Yes/No. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    // Excel dates carry no time zone: read-excel-file gives them as UTC midnight.
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'string' ? value : '';
}

/** The unpacked size an .xlsx (zip) declares, without unpacking it. */
function declaredUnpackedBytes(data: Uint8Array): number | null {
  let total = 0;
  try {
    unzipSync(data, {
      filter: (file) => {
        total += file.originalSize;
        return false;
      },
    });
  } catch {
    return null;
  }
  return total;
}

export async function readSpreadsheet(path: string, preferredSheet: string): Promise<FileRead> {
  const ext = extname(path).toLowerCase();
  if (ext === '.xls') return { ok: false, reason: 'xls' };
  if (ext !== '.xlsx' && ext !== '.csv') return { ok: false, reason: 'unsupported' };
  try {
    if ((await stat(path)).size > MAX_FILE_BYTES) return { ok: false, reason: 'too-large' };
    const data = await readFile(path);
    if (ext === '.csv') {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      } catch {
        // Excel's plain "CSV" (not "CSV UTF-8") on Windows writes the Windows code page.
        text = new TextDecoder('windows-1252').decode(data);
      }
      const csv = readCsv(text);
      return csv.ok ? { ok: true, rows: csv.rows } : { ok: false, reason: 'unclosed-quote' };
    }
    const unpacked = declaredUnpackedBytes(data);
    if (unpacked === null) return { ok: false, reason: 'unreadable' };
    if (unpacked > MAX_UNPACKED_BYTES) return { ok: false, reason: 'too-large' };
    const sheets = await readXlsxFile(data);
    const sheet =
      sheets.find((s) => loose(s.sheet) === loose(preferredSheet)) ??
      sheets.find((s) => s.data.length > 0);
    if (!sheet) return { ok: false, reason: 'no-sheet' };
    return { ok: true, rows: sheet.data.map((row) => row.map(cellText)) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

export const FILE_PROBLEMS: Record<Exclude<FileRead, { ok: true }>['reason'], string> = {
  'too-large': 'The file is too large. Split it into smaller files.',
  unsupported: 'Choose an Excel workbook (.xlsx) or a CSV file (.csv).',
  xls: 'This is an old Excel file (.xls). Open it in Excel and save it as .xlsx, then try again.',
  unreadable: 'The file could not be read. Check that it opens in Excel, then try again.',
  'unclosed-quote':
    'The CSV file has a quote (") that is never closed. Check it in Excel and save it again.',
  'no-sheet': 'The workbook has no sheet with data.',
};
