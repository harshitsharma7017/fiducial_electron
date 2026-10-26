// Minimal TrueType reader: enough to check that a bundled font maps a code point to a real glyph
// and to read the licence fields from its `name` table. Avoids a font-parsing dependency.

interface TableRecord {
  offset: number;
  length: number;
}

function tables(font: Buffer): Map<string, TableRecord> {
  const numTables = font.readUInt16BE(4);
  const map = new Map<string, TableRecord>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    map.set(font.toString('latin1', rec, rec + 4), {
      offset: font.readUInt32BE(rec + 8),
      length: font.readUInt32BE(rec + 12),
    });
  }
  return map;
}

function requireTable(font: Buffer, tag: string): TableRecord {
  const table = tables(font).get(tag);
  if (!table) throw new Error(`font has no '${tag}' table`);
  return table;
}

function lookupFormat4(font: Buffer, sub: number, codePoint: number): number {
  if (codePoint > 0xffff) return 0;
  const segCount = font.readUInt16BE(sub + 6) / 2;
  const endCodes = sub + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  for (let i = 0; i < segCount; i++) {
    if (font.readUInt16BE(endCodes + i * 2) < codePoint) continue;
    const start = font.readUInt16BE(startCodes + i * 2);
    if (start > codePoint) return 0;
    const delta = font.readInt16BE(idDeltas + i * 2);
    const rangeOffsetPos = idRangeOffsets + i * 2;
    const rangeOffset = font.readUInt16BE(rangeOffsetPos);
    if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
    const glyph = font.readUInt16BE(rangeOffsetPos + rangeOffset + 2 * (codePoint - start));
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
  }
  return 0;
}

function lookupFormat12(font: Buffer, sub: number, codePoint: number): number {
  const numGroups = font.readUInt32BE(sub + 12);
  for (let i = 0; i < numGroups; i++) {
    const group = sub + 16 + i * 12;
    const start = font.readUInt32BE(group);
    const end = font.readUInt32BE(group + 4);
    if (codePoint >= start && codePoint <= end) {
      return font.readUInt32BE(group + 8) + (codePoint - start);
    }
  }
  return 0;
}

/** Glyph id for a code point using the font's Unicode cmap; 0 means "missing glyph". */
export function glyphIdFor(font: Buffer, codePoint: number): number {
  const cmap = requireTable(font, 'cmap').offset;
  const numSubtables = font.readUInt16BE(cmap + 2);
  let fallback = 0;
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = font.readUInt16BE(rec);
    const encoding = font.readUInt16BE(rec + 2);
    const sub = cmap + font.readUInt32BE(rec + 4);
    const format = font.readUInt16BE(sub);
    // Prefer the full-repertoire Windows subtable (3,10) when present.
    if (platform === 3 && encoding === 10 && format === 12) {
      return lookupFormat12(font, sub, codePoint);
    }
    if (fallback === 0 && (platform === 0 || (platform === 3 && encoding === 1)) && format === 4) {
      fallback = sub;
    }
  }
  return fallback === 0 ? 0 : lookupFormat4(font, fallback, codePoint);
}

/** English (Windows platform) name-table strings, keyed by name id. */
export function nameTable(font: Buffer): Map<number, string> {
  const name = requireTable(font, 'name').offset;
  const count = font.readUInt16BE(name + 2);
  const storage = name + font.readUInt16BE(name + 4);
  const out = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const rec = name + 6 + i * 12;
    const platform = font.readUInt16BE(rec);
    const language = font.readUInt16BE(rec + 4);
    if (platform !== 3 || language !== 0x0409) continue;
    const nameId = font.readUInt16BE(rec + 6);
    const length = font.readUInt16BE(rec + 8);
    const start = storage + font.readUInt16BE(rec + 10);
    // Windows-platform strings are UTF-16BE; swap to little-endian for Node's decoder.
    const bytes = Buffer.from(font.subarray(start, start + length));
    out.set(nameId, bytes.swap16().toString('utf16le'));
  }
  return out;
}

export const NAME_ID = {
  copyright: 0,
  family: 1,
  fullName: 4,
  version: 5,
  licenseDescription: 13,
  licenseUrl: 14,
} as const;
