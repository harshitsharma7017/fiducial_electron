// A CSV reader for the client imports: what Excel writes with "Save as CSV (UTF-8)" or plain CSV.
// Comma separated (or semicolon, as some Excel locales write it: decided by the header line),
// double quotes with "" for a quote, CRLF or LF line endings, an optional byte-order mark.
// Pure; never throws.

export type CsvRead = { ok: true; rows: string[][] } | { ok: false; reason: 'unclosed-quote' };

export function readCsv(text: string): CsvRead {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const separator =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) return { ok: false, reason: 'unclosed-quote' };
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return { ok: true, rows };
}
