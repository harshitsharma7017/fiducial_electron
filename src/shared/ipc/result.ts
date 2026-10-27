// AppResult / AppError envelope (16_IPC_ERROR_AND_EVENT_CONTRACTS §3).
import { ERROR_INFO, type AppErrorCode } from './errors';

export interface AppError {
  code: AppErrorCode;
  /** Safe, user-facing message. */
  message: string;
  retryable: boolean;
  /** Reference for support; matches the correlation ID in the main-process log. */
  correlationId?: string;
  /** Sanitised details only (for example field paths); never request values. */
  details?: Record<string, unknown>;
}

export type AppResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function appError(
  code: AppErrorCode,
  extras: { correlationId?: string; details?: Record<string, unknown> } = {},
): { ok: false; error: AppError } {
  const info = ERROR_INFO[code];
  return {
    ok: false,
    error: { code, message: info.message, retryable: info.retryable, ...extras },
  };
}
