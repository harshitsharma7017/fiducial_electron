// IPC sender verification: only the top-level frame of a registered app window, showing the
// app's own origin, may call the main process.
import { originOf } from '../security/origins';

export interface IpcSender {
  webContentsId: number;
  frameIsMain: boolean;
  frameUrl: string | null;
}

export interface SenderPolicy {
  trust: (webContentsId: number) => void;
  forget: (webContentsId: number) => void;
  isTrusted: (sender: IpcSender) => boolean;
}

export function createSenderPolicy(allowedOrigin: string): SenderPolicy {
  const trusted = new Set<number>();
  return {
    trust: (id) => void trusted.add(id),
    forget: (id) => void trusted.delete(id),
    isTrusted: (sender) =>
      trusted.has(sender.webContentsId) &&
      sender.frameIsMain &&
      sender.frameUrl !== null &&
      originOf(sender.frameUrl) === allowedOrigin,
  };
}
