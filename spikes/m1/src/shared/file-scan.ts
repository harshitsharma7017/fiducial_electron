// Searches files for byte sequences. Used to prove secrets and markers are NOT stored in plaintext.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Every file under `root`, except under the `exclude` folders (exact folder paths). */
export function listFiles(root: string, exclude: readonly string[] = []): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!exclude.includes(full)) walk(full);
      } else if (entry.isFile()) out.push(full);
    }
  };
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) walk(root);
  return out;
}

/** Returns the files (under any of the roots) that contain any of the needles. */
export function filesContaining(roots: readonly string[], needles: readonly Buffer[]): string[] {
  const hits: string[] = [];
  for (const root of roots) {
    for (const file of listFiles(root)) {
      const bytes = readFileSync(file);
      if (needles.some((n) => n.length > 0 && bytes.includes(n))) hits.push(file);
    }
  }
  return hits;
}

export interface NeedleScan {
  /** Files that contain a needle. */
  hits: string[];
  /** Files that could not be read, with the error code (for example EBUSY: on Windows, another
   * process holds the file open without read sharing). Never treated as clean. */
  unreadable: { file: string; code: string }[];
}

/**
 * Like filesContaining, but reports files it cannot read instead of stopping at the first. Folders
 * in `exclude` are not walked; the caller must cover them some other way.
 */
export function scanFiles(
  roots: readonly string[],
  needles: readonly Buffer[],
  exclude: readonly string[] = [],
): NeedleScan {
  const scan: NeedleScan = { hits: [], unreadable: [] };
  const seen = new Set<string>();
  for (const root of roots) {
    for (const file of listFiles(root, exclude)) {
      // Roots may nest (user-data lies inside the output folder): read each file once.
      if (seen.has(file)) continue;
      seen.add(file);
      let bytes: Buffer;
      try {
        bytes = readFileSync(file);
      } catch (err) {
        const code = (err as { code?: unknown }).code;
        scan.unreadable.push({ file, code: typeof code === 'string' ? code : 'UNKNOWN' });
        continue;
      }
      if (needles.some((n) => n.length > 0 && bytes.includes(n))) scan.hits.push(file);
    }
  }
  return scan;
}

/** SHA-256 of every file under `root`, keyed by path relative to `root`. */
export function snapshotFiles(root: string): Record<string, string> {
  return Object.fromEntries(
    listFiles(root).map((f) => [
      relative(root, f),
      createHash('sha256').update(readFileSync(f)).digest('hex'),
    ]),
  );
}
