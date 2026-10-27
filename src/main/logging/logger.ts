// Allowlist structured logger (LOG-01, 06_SECURITY §6). Only pre-approved event names and fields
// with constrained values are recorded. Anything else is dropped and counted, never written:
// there is no free-text field, so secrets, OTPs, cookies, URLs with queries or personal data
// cannot reach a log through this API.
import { z } from 'zod';
import { isIpcChannel } from '../../shared/ipc/channels';
import { APP_ERROR_CODES } from '../../shared/ipc/errors';

export const LOG_EVENTS = [
  'app.start',
  'app.ready',
  'app.launch-refused',
  'app.second-instance',
  'ipc.call',
  'security.navigation-blocked',
  'security.redirect-blocked',
  'security.popup-blocked',
  'security.permission-denied',
  'security.download-blocked',
  'security.webview-blocked',
  'protocol.request-rejected',
  'renderer.gone',
  'smoke.result',
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const token = (pattern: RegExp) => z.string().regex(pattern);

/** Every loggable field, with the only values it may hold. */
const FIELD_SCHEMAS = {
  correlationId: token(/^[0-9a-f-]{8,64}$/),
  channel: z.string().refine((value) => value === 'unknown' || isIpcChannel(value)),
  outcome: z.enum(['ok', 'error']),
  errorCode: z.enum(APP_ERROR_CODES),
  durationMs: z.number().int().min(0).max(3_600_000),
  permission: token(/^[a-z][a-z-]{0,39}$/),
  /** URL scheme only (for example "https"); full URLs are never logged. */
  targetScheme: token(/^[a-z][a-z0-9+.-]{0,19}$/),
  reason: z.enum([
    'crashed',
    'killed',
    'oom',
    'launch-failed',
    'integrity-failure',
    'abnormal-exit',
    'clean-exit',
    'memory-eviction',
  ]),
  unsafeOptions: z.array(token(/^(--[a-z-]{1,40}|NODE_OPTIONS\(--inspect\*\))$/)).max(10),
  appVersion: token(/^[0-9A-Za-z.+-]{1,40}$/),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: token(/^[a-z0-9_]{1,12}$/),
  packaged: z.boolean(),
  passed: z.boolean(),
  failedChecks: z.array(token(/^[a-z0-9.-]{1,60}$/)).max(50),
} as const;

export type LogFields = { [K in keyof typeof FIELD_SCHEMAS]?: z.infer<(typeof FIELD_SCHEMAS)[K]> };

export interface LogRecord {
  ts: string;
  level: LogLevel;
  event: LogEvent | 'log.invalid-event';
  droppedFields?: number;
  [field: string]: unknown;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  log(level: LogLevel, event: LogEvent, fields?: LogFields): void;
  info(event: LogEvent, fields?: LogFields): void;
  warn(event: LogEvent, fields?: LogFields): void;
  error(event: LogEvent, fields?: LogFields): void;
}

export function createLogger(
  sinks: readonly LogSink[],
  now: () => Date = () => new Date(),
): Logger {
  const log = (level: LogLevel, event: LogEvent, fields: LogFields = {}): void => {
    const record: LogRecord = {
      ts: now().toISOString(),
      level,
      event: (LOG_EVENTS as readonly string[]).includes(event) ? event : 'log.invalid-event',
    };
    let dropped = 0;
    // Runtime check as well: callers in plain JS or with casts must not bypass the allowlist.
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      const schema = (FIELD_SCHEMAS as Record<string, z.ZodType>)[key];
      if (schema?.safeParse(value).success) record[key] = value;
      else dropped += 1;
    }
    if (dropped > 0) record.droppedFields = dropped;
    for (const sink of sinks) {
      try {
        sink(record);
      } catch {
        // A failing sink must never break the caller or leak data through an error.
      }
    }
  };
  return {
    log,
    info: (event, fields) => log('info', event, fields),
    warn: (event, fields) => log('warn', event, fields),
    error: (event, fields) => log('error', event, fields),
  };
}
