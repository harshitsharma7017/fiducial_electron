// The project's ESLint config enforces the M1-derived security rules (AR-17, renderer isolation).
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('security lint rules', () => {
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

  it('accepts the async safeStorage API', async () => {
    const code = `import { safeStorage } from 'electron';\nexport const x = safeStorage.encryptStringAsync('a');\n`;
    expect(await ruleIds(code, 'src/main/security/csp.ts')).not.toContain(
      'no-restricted-properties',
    );
  });
});
