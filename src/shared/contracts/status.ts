// Run and connection states (ARCH §3.4, 04 §3) and the progress event (16 §4). A manual result
// is `status: completed, source: manual`. These are contracts only: the orchestrator that emits
// events is M5, and no IPC channel carries them yet.
import { z } from 'zod';
import { APP_ERROR_CODES } from '../ipc/errors';
import { entityIdSchema, isoDateTimeSchema, singleLineText, slugSchema } from './common';
import { insurerIdSchema } from './insurer';

export const RUN_STATUSES = [
  'pending',
  'running',
  'login_required',
  'otp_required',
  'manual_action_required',
  'manual_required',
  'completed',
  'failed',
  'timed_out',
  'cancelled',
  'unsupported',
] as const;

export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  'completed',
  'failed',
  'timed_out',
  'cancelled',
  'unsupported',
  'manual_required',
];

export const CONNECTION_STATUSES = [
  'not_connected',
  'connecting',
  'connected',
  'login_required',
  'otp_required',
  'manual_action_required',
  'blocked',
] as const;

export const connectionStatusSchema = z.enum(CONNECTION_STATUSES);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const appErrorCodeSchema = z.enum(APP_ERROR_CODES);

export const RESULT_SOURCES = ['automated', 'manual'] as const;
export const resultSourceSchema = z.enum(RESULT_SOURCES);
export type ResultSource = z.infer<typeof resultSourceSchema>;

/**
 * Progress event (16 §4). Carries no credentials, member details, session tokens or screenshots;
 * `safeMessage` comes from a fixed catalogue, never from portal text.
 */
export const progressEventSchema = z.strictObject({
  runId: entityIdSchema,
  insurerId: insurerIdSchema,
  status: runStatusSchema,
  progressStep: slugSchema.optional(),
  safeMessage: singleLineText(200),
  errorCode: appErrorCodeSchema.optional(),
  occurredAt: isoDateTimeSchema,
});

export type ProgressEvent = z.infer<typeof progressEventSchema>;
