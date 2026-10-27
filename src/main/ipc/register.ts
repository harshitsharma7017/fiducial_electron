// Connects the dispatcher to Electron. Only channels from the contract are registered, and the
// raw event is reduced to the sender facts the policy needs.
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ALL_CHANNELS } from '../../shared/ipc/channels';
import type { Dispatch } from './dispatcher';
import type { IpcSender } from './sender-policy';

export function senderOf(event: IpcMainInvokeEvent): IpcSender {
  const frame = event.senderFrame;
  return {
    webContentsId: event.sender.id,
    frameIsMain: frame !== null && frame.parent === null,
    frameUrl: frame?.url ?? null,
  };
}

export function registerIpc(dispatch: Dispatch): () => void {
  for (const channel of ALL_CHANNELS) {
    ipcMain.handle(channel, (event, payload: unknown) =>
      dispatch(senderOf(event), channel, payload),
    );
  }
  return () => {
    for (const channel of ALL_CHANNELS) ipcMain.removeHandler(channel);
  };
}
