// The bridge the preload exposes (window.fqf) against API_SHAPE, as the packaged app's smoke test
// compares them (src/main/smoke.ts, "bridge.shape"): the same groups and methods, in the same
// order. Here so that a mismatch fails the unit tests, not only the release build (1.1.0's first
// build, 27 November 2026: iciciApi was listed after quotes, the bridge has it before).
import { describe, expect, it, vi } from 'vitest';

const exposed = vi.hoisted((): Record<string, unknown> => ({}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => {
      exposed[name] = api;
    },
  },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

describe('the preload bridge', () => {
  it('exposes exactly API_SHAPE, in its order', async () => {
    await import('../src/preload/index');
    const { API_SHAPE } = await import('../src/shared/ipc/api');
    const fqf = exposed['fqf'] as Record<string, object>;
    const shape = Object.fromEntries(Object.entries(fqf).map(([k, v]) => [k, Object.keys(v)]));
    expect(JSON.stringify(shape)).toBe(JSON.stringify(API_SHAPE));
  });
});
