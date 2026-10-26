// The spike's only IPC channel: the renderer reports what it can see of its own environment.
// The schema is strict so unexpected fields are rejected rather than ignored.
import { z } from 'zod';

export const RENDERER_STATE_CHANNEL = 'spike:renderer-state';

const typeofResult = z.enum([
  'undefined',
  'object',
  'boolean',
  'number',
  'bigint',
  'string',
  'symbol',
  'function',
]);

export const rendererStateSchema = z
  .object({
    typeofRequire: typeofResult,
    typeofProcess: typeofResult,
    typeofModule: typeofResult,
    hasSpikeBridge: z.boolean(),
    /** True would mean the preload's isolated world leaks into the page (contextIsolation off). */
    preloadWorldVisible: z.boolean(),
    cspMeta: z.boolean(),
  })
  .strict();

export type RendererState = z.infer<typeof rendererStateSchema>;

export type IpcErrorCode = 'VALIDATION_FAILED' | 'FORBIDDEN_SENDER';

export type IpcResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode; message: string } };
