// IPC channel names. Kept free of runtime dependencies so the sandboxed preload can bundle it.
// Every channel must have a request/response schema in contract.ts and a handler in main.

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  insurersList: 'insurers:list',
  insurersSaveLogin: 'insurers:save-login',
  insurersForgetLogin: 'insurers:forget-login',
  insurersOpenPortal: 'insurers:open-portal',
  insurersSignOut: 'insurers:sign-out',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const ALL_CHANNELS: readonly IpcChannel[] = Object.values(IPC_CHANNELS);

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && (ALL_CHANNELS as readonly string[]).includes(value);
}
