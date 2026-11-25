// Run traces for support (25 November 2026: to find out why a step fails on an insurer's live
// page): a quote run may save what it did and how the page was built, as a JSON file in the app's
// data folder (<userData>/diagnostics), readable by the user only. The traces hold no client data:
// steps, their results, and the page's structure (a box's value only as its length). Only the
// latest 20 are kept.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KEEP = 20;

export function createDiagnostics(dir: string): (name: string, data: unknown) => string | null {
  return (name, data) => {
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const safe = name.replace(/[^a-z0-9-]/gi, '-').slice(0, 40);
      const file = `${safe}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      writeFileSync(join(dir, file), JSON.stringify(data, null, 1), { mode: 0o600 });
      const all = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort();
      for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
        rmSync(join(dir, old), { force: true });
      }
      return file;
    } catch {
      return null;
    }
  };
}
