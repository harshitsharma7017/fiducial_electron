// Searches files for byte sequences. Used to prove secrets and markers are NOT stored in plaintext.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
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

/** SHA-256 of every file under `root`, keyed by path relative to `root`. */
export function snapshotFiles(root: string): Record<string, string> {
  return Object.fromEntries(
    listFiles(root).map((f) => [
      relative(root, f),
      createHash('sha256').update(readFileSync(f)).digest('hex'),
    ]),
  );
}
