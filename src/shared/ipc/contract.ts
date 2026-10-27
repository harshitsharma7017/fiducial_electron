// Request and response schemas for every IPC channel. The main process validates requests
// before any handler runs and validates responses before they leave. Schemas are strict:
// unexpected fields are rejected, not ignored.
import { z } from 'zod';
import { IPC_CHANNELS, type IpcChannel } from './channels';

const shortText = (max: number) => z.string().min(1).max(max);

export const appInfoSchema = z
  .object({
    name: shortText(100),
    version: shortText(40),
    platform: z.enum(['darwin', 'win32', 'linux']),
    arch: shortText(20),
    electron: shortText(40),
    isPackaged: z.boolean(),
  })
  .strict();

export type AppInfo = z.infer<typeof appInfoSchema>;

export const ipcContract = {
  [IPC_CHANNELS.appGetInfo]: {
    request: z.object({}).strict(),
    response: appInfoSchema,
  },
} as const satisfies Record<IpcChannel, { request: z.ZodType; response: z.ZodType }>;

export type IpcContract = typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;
