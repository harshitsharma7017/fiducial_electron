// The project's ESLint config enforces the M1-derived security rules (AR-17, renderer isolation).
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

// The config lints with type information (`projectService`), so the first file linted under each
// tsconfig builds a TypeScript program. On the Windows CI runner that took 4.9–7.6 s, beyond the
// 5 s default (run 40513427765).
describe('security lint rules', { timeout: 30_000 }, () => {
  it('rejects the synchronous safeStorage API in app code (AR-17)', async () => {
    const code = `import { safeStorage } from 'electron';\nexport const x = safeStorage.encryptString('a');\n`;
    expect(await ruleIds(code, 'src/main/security/csp.ts')).toContain('no-restricted-properties');
  });

  it('rejects Electron and Node imports in the renderer', async () => {
    const electron = `import { ipcRenderer } from 'electron';\nexport const x = ipcRenderer;\n`;
    const node = `import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n`;
    expect(await ruleIds(electron, 'src/renderer/src/App.tsx')).toContain('no-restricted-imports');
    expect(await ruleIds(node, 'src/renderer/src/App.tsx')).toContain('no-restricted-imports');
  });

  it('keeps shared code free of Electron, Node, I/O, the clock and randomness (M3)', async () => {
    const file = 'src/shared/comparison/compare.ts';
    expect(
      await ruleIds(`import { app } from 'electron';\nexport const x = app;\n`, file),
    ).toContain('no-restricted-imports');
    expect(await ruleIds(`import fs from 'node:fs';\nexport const x = fs;\n`, file)).toContain(
      'no-restricted-imports',
    );
    expect(await ruleIds(`export const x = fetch;\n`, file)).toContain('no-restricted-globals');
    for (const code of [
      'export const x = Date.now();\n',
      'export const x = new Date();\n',
      'export const x = Math.random();\n',
      "export const x = 'a'.localeCompare('b');\n",
    ]) {
      expect(await ruleIds(code, file)).toContain('no-restricted-syntax');
    }
  });

  it('accepts the async safeStorage API', async () => {
    const code = `import { safeStorage } from 'electron';\nexport const x = safeStorage.encryptStringAsync('a');\n`;
    expect(await ruleIds(code, 'src/main/security/csp.ts')).not.toContain(
      'no-restricted-properties',
    );
  });
});
