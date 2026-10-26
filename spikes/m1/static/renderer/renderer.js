// Reports what the renderer can see of its own environment through the narrow preload bridge,
// then sends a deliberately invalid payload that the main process must reject.
'use strict';

(async () => {
  const bridge = window.fqfSpike;
  const state = {
    typeofRequire: typeof require,
    typeofProcess: typeof process,
    typeofModule: typeof module,
    hasSpikeBridge: typeof bridge === 'object' && bridge !== null,
    preloadWorldVisible: typeof window.__fqfPreloadWorld !== 'undefined',
    cspMeta: document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null,
  };
  if (!state.hasSpikeBridge) return;
  await bridge.reportRendererState(state);
  await bridge.reportRendererState({ ...state, unexpectedField: true });
})();
