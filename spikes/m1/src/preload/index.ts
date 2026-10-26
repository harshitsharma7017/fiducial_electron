// Narrow preload bridge for the app window only; insurer views never get a preload.
// Sandboxed preloads cannot require local files, so the channel name is repeated here
// (source of truth: src/shared/ipc-contract.ts).
import { contextBridge, ipcRenderer } from 'electron';

const RENDERER_STATE_CHANNEL = 'spike:renderer-state';

// Marker in the preload's own world. With contextIsolation on, the page must not see it.
(globalThis as Record<string, unknown>)['__fqfPreloadWorld'] = true;

contextBridge.exposeInMainWorld('fqfSpike', {
  reportRendererState: (state: unknown): Promise<unknown> =>
    ipcRenderer.invoke(RENDERER_STATE_CHANNEL, state),
});
