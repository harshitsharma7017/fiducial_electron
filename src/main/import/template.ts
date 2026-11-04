// The import templates: an Excel workbook with the data sheet (the column headers) and a "How to
// fill" sheet, or a CSV file with the header line (UTF-8 with a byte-order mark, so Excel shows ₹
// and other characters correctly).
import { writeFile } from 'node:fs/promises';
import writeXlsxFile from 'write-excel-file/node';
import { IMPORT_SPECS, type ImportKind } from '../../shared/import/kinds';

const csvCell = (text: string) => (/[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

export async function writeTemplate(
  kind: ImportKind,
  format: 'xlsx' | 'csv',
  path: string,
): Promise<void> {
  const spec = IMPORT_SPECS[kind];
  const columns = spec.columns.filter((c) => !c.hidden);
  if (format === 'csv') {
    await writeFile(path, `\uFEFF${columns.map((c) => csvCell(c.header)).join(',')}\r\n`, 'utf8');
    return;
  }
  const bold = { fontWeight: 'bold' as const };
  const buffer = await writeXlsxFile(
    [
      {
        sheet: spec.sheet,
        data: [columns.map((c) => ({ value: c.header, ...bold }))],
        columns: columns.map((c) => ({ width: Math.max(14, Math.min(32, c.header.length + 4)) })),
        stickyRowsCount: 1,
      },
      {
        sheet: 'How to fill',
        data: [
          [
            { value: 'Column', ...bold },
            { value: 'Required', ...bold },
            { value: 'How to fill', ...bold },
          ],
          ...columns.map((c) => [c.header, c.required ? 'Yes' : '', c.help]),
          [],
          [
            `One row per ${kind === 'clients' ? 'client' : kind === 'travellers' ? 'traveller' : 'vehicle'}. Keep the header row as it is; columns may be in any order, and columns the app does not know are ignored.`,
          ],
          [
            'Dates as DD/MM/YYYY. Rows are checked before anything is saved; Aadhaar and passport numbers go to the encrypted vault.',
          ],
          ...(kind === 'clients'
            ? [
                [
                  'Members: Member 1 is usually Self. Up to 12 members: add columns "Member 7 relationship" and so on if needed.',
                ],
              ]
            : []),
        ],
        columns: [{ width: 34 }, { width: 10 }, { width: 90 }],
      },
    ],
    {},
  ).toBuffer();
  await writeFile(path, buffer);
}
