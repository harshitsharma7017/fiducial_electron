// Registers the spike's single IPC handler. Every call is checked for the expected sender
// (the app window's own top-level file:// page) and validated against a strict Zod schema.
import { ipcMain, type WebContents } from 'electron';
import {
  RENDERER_STATE_CHANNEL,
  rendererStateSchema,
  type IpcResult,
  type RendererState,
} from '../shared/ipc-contract';

export function handleRendererState(
  appContents: WebContents,
  onCall: (result: IpcResult<RendererState>) => void,
): () => void {
  ipcMain.handle(RENDERER_STATE_CHANNEL, (event, payload: unknown): IpcResult<null> => {
    const frame = event.senderFrame;
    if (
      event.sender.id !== appContents.id ||
      !frame ||
      frame.parent !== null ||
      !frame.url.startsWith('file://')
    ) {
      const result = {
        ok: false as const,
        error: { code: 'FORBIDDEN_SENDER' as const, message: 'Unexpected sender' },
      };
      onCall(result);
      return result;
    }
    const parsed = rendererStateSchema.safeParse(payload);
    if (!parsed.success) {
      // The rejected payload is not echoed back or logged.
      const result = {
        ok: false as const,
        error: { code: 'VALIDATION_FAILED' as const, message: 'Payload rejected' },
      };
      onCall(result);
      return result;
    }
    onCall({ ok: true, data: parsed.data });
    return { ok: true, data: null };
  });
  return () => ipcMain.removeHandler(RENDERER_STATE_CHANNEL);
}
