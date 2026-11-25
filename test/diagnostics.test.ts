// Run traces for support (src/main/support/diagnostics.ts): one JSON file per run in the app's data
// folder, readable by the user only, the latest 20 kept.
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDiagnostics } from '../src/main/support/diagnostics';

describe('run traces for support', () => {
  it('saves one file per run, readable by the user only, and keeps the latest 20', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'fqf-diag-')), 'diagnostics');
    const save = createDiagnostics(dir);
    const first = save('niva-bupa', { outcome: 'ready', trace: [] });
    expect(first).toMatch(/^niva-bupa-\d{4}-\d{2}-\d{2}T.*\.json$/);
    expect(JSON.parse(readFileSync(join(dir, first!), 'utf8'))).toEqual({
      outcome: 'ready',
      trace: [],
    });
    if (process.platform !== 'win32') {
      expect(statSync(join(dir, first!)).mode & 0o777).toBe(0o600);
    }
    for (let i = 0; i < 25; i += 1) save(`run-${String(i).padStart(2, '0')}`, { i });
    expect(readdirSync(dir)).toHaveLength(20);
    // A name is the app's own (no path).
    expect(save('../../etc/x', {})).toMatch(/^------etc-x-/);
  });
});
