// The IPC contract, the preload bridge and the API surface stay consistent; the preload's
// imports stay free of runtime dependencies so the sandboxed bundle is small and self-contained.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { API_SHAPE } from '../src/shared/ipc/api';
import { ALL_CHANNELS } from '../src/shared/ipc/channels';
import { ipcContract } from '../src/shared/ipc/contract';
import { APP_ERROR_CODES, ERROR_INFO } from '../src/shared/ipc/errors';

describe('IPC contract', () => {
  it('defines strict request and response schemas for every channel', () => {
    for (const channel of ALL_CHANNELS) {
      const spec = ipcContract[channel];
      expect(spec.request.safeParse({ unexpected: true }).success).toBe(false);
      expect(spec.response).toBeDefined();
    }
  });

  it('exposes one bridge method per channel', () => {
    const methods = Object.values(API_SHAPE).flat();
    expect(methods).toHaveLength(ALL_CHANNELS.length);
  });

  it('has a safe message for every error code, without placeholders for request data', () => {
    for (const code of APP_ERROR_CODES) {
      expect(ERROR_INFO[code].message.length).toBeGreaterThan(5);
      expect(ERROR_INFO[code].message).not.toMatch(/\$\{|%s|\{\w+\}/);
    }
  });

  it('keeps zod out of the modules the preload imports at runtime', () => {
    const preload = readFileSync('src/preload/index.ts', 'utf8');
    const channels = readFileSync('src/shared/ipc/channels.ts', 'utf8');
    expect(channels).not.toMatch(/from 'zod'/);
    expect(preload).not.toMatch(/from 'zod'/);
    expect(preload).toMatch(/import type \{ AppInfo \} from '..\/shared\/ipc\/contract'/);
    expect(preload).not.toMatch(/ipcRenderer\.(on|send|sendSync|postMessage)\b/);
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer/);
  });
});
