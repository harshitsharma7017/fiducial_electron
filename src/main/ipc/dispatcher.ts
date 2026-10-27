// IPC dispatcher: the single path from renderer requests to main-process handlers. Independent of
// Electron so it can be tested directly (TC-22). Order of checks:
//   known channel → trusted sender → strict request schema → handler → strict response schema.
// Errors are mapped to the AppError envelope with a correlation ID; handler exceptions never
// leak their messages, stacks or request values to the renderer or the log.
import { randomUUID } from 'node:crypto';
import { isIpcChannel, type IpcChannel } from '../../shared/ipc/channels';
import { ipcContract, type IpcRequest, type IpcResponse } from '../../shared/ipc/contract';
import type { AppErrorCode } from '../../shared/ipc/errors';
import { appError, type AppResult } from '../../shared/ipc/result';
import type { Logger } from '../logging/logger';
import type { IpcSender } from './sender-policy';

export interface HandlerContext {
  correlationId: string;
}

export type IpcHandlers = {
  [C in IpcChannel]: (
    request: IpcRequest<C>,
    context: HandlerContext,
  ) => IpcResponse<C> | Promise<IpcResponse<C>>;
};

/** Thrown by handlers to return a specific, safe error code. */
export class AppException extends Error {
  constructor(readonly code: AppErrorCode) {
    super(code);
    this.name = 'AppException';
  }
}

export interface DispatcherOptions {
  isTrustedSender(sender: IpcSender): boolean;
  logger: Logger;
  newCorrelationId?: () => string;
  now?: () => number;
}

export type Dispatch = (
  sender: IpcSender,
  channel: string,
  payload: unknown,
) => Promise<AppResult<unknown>>;

const MAX_REPORTED_ISSUES = 20;

export function createDispatcher(handlers: IpcHandlers, options: DispatcherOptions): Dispatch {
  const newId = options.newCorrelationId ?? randomUUID;
  const now = options.now ?? (() => performance.now());

  return async (sender, channel, payload) => {
    const correlationId = newId();
    const started = now();
    const finish = (result: AppResult<unknown>): AppResult<unknown> => {
      options.logger.log(result.ok ? 'info' : 'warn', 'ipc.call', {
        channel: isIpcChannel(channel) ? channel : 'unknown',
        correlationId,
        outcome: result.ok ? 'ok' : 'error',
        ...(result.ok ? {} : { errorCode: result.error.code }),
        durationMs: Math.max(0, Math.round(now() - started)),
      });
      return result;
    };

    if (!isIpcChannel(channel)) return finish(appError('VALIDATION_FAILED', { correlationId }));
    if (!options.isTrustedSender(sender)) {
      return finish(appError('FORBIDDEN_SENDER', { correlationId }));
    }

    const spec = ipcContract[channel];
    const request = spec.request.safeParse(payload);
    if (!request.success) {
      // Report where and why, never the rejected values or unexpected key names.
      const issues = request.error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({
        path: issue.path.map(String).join('.').slice(0, 100),
        code: issue.code,
      }));
      return finish(appError('VALIDATION_FAILED', { correlationId, details: { issues } }));
    }

    let data: unknown;
    try {
      const handler = handlers[channel] as (request: unknown, context: HandlerContext) => unknown;
      data = await handler(request.data, { correlationId });
    } catch (err) {
      const code = err instanceof AppException ? err.code : 'INTERNAL_ERROR';
      return finish(appError(code, { correlationId }));
    }

    const response = spec.response.safeParse(data);
    if (!response.success) return finish(appError('INTERNAL_ERROR', { correlationId }));
    return finish({ ok: true, data: response.data });
  };
}
