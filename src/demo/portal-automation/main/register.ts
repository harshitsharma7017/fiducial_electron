// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The demo's only entry point in the main process. Does nothing unless the flag is set; then it
// opens the creation-attempt store and the audit log in `dataDir`, restores attempts that were in
// flight when the app last stopped (they need reconciliation; nothing is resubmitted), and
// registers the demo's six IPC channels, each answering only the app's own trusted window (the
// application's sender policy) and validating its payload before anything happens. The mode
// (fill-only, or the full workflow where the portal's profile allows it) is decided once, here.
import { join } from 'node:path';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { senderOf } from '../../../main/ipc/register';
import type { IpcSender } from '../../../main/ipc/sender-policy';
import type { Logger } from '../../../main/logging/logger';
import { appError, type AppResult } from '../../../shared/ipc/result';
import { PORTAL_DEMO_CHANNELS } from '../shared/contract';
import { DemoProposalSchema } from '../shared/demo-data';
import { decideMode } from '../shared/environment';
import { isPortalDemoEnabled, portalOrigin } from '../shared/flag';
import type { RunReport } from '../shared/protocol';
import { ensurePrivateDir } from './atomic-file';
import { AttemptStore, STORE_FILE } from './attempt-store';
import { AUDIT_FILE, FileAuditLog, type AuditTrail } from './audit-log';
import { openPortalPage } from './portal-window';
import { PortalDemoRunner, type ConfirmResult } from './runner';

const ConfirmSchema = z.strictObject({
  token: z.string().min(1).max(64),
  acknowledgeDuplicates: z.boolean().optional(),
});
const AttemptIdSchema = z.uuid();
const ReconcileSchema = z.strictObject({ attemptId: AttemptIdSchema });
const ResolveSchema = z.discriminatedUnion('resolution', [
  z.strictObject({ attemptId: AttemptIdSchema, resolution: z.literal('not-created') }),
  z.strictObject({
    attemptId: AttemptIdSchema,
    resolution: z.literal('created'),
    proposalId: z.string().regex(/^[0-9a-f]{24}$/i),
  }),
]);

export interface PortalDemoOptions {
  env: Readonly<Record<string, string | undefined>>;
  isTrustedSender(sender: IpcSender): boolean;
  logger: Logger;
  /** Where the attempt store and the audit log live (<userData>/portal-automation). */
  dataDir: string;
}

/**
 * Opens the store and the audit log, and records what a restart changed. Exported for the tests,
 * which simulate a restart by calling it again on the same folder.
 */
export function openRecords(dataDir: string): { store: AttemptStore; audit: AuditTrail } {
  ensurePrivateDir(dataDir);
  const audit = new FileAuditLog(join(dataDir, AUDIT_FILE));
  const store = new AttemptStore({ file: join(dataDir, STORE_FILE) });
  if (store.problem) audit.record('store.unreadable', { reason: 'unreadable' });
  for (const attempt of store.restoreAfterRestart()) {
    audit.record('recovery.restored', {
      attemptId: attempt.id,
      from: attempt.history.at(-2)?.state,
      state: attempt.state,
      reason: 'app-restarted',
    });
  }
  return { store, audit };
}

/** Registers the demo when its flag is on. Returns whether it did. */
export function registerPortalDemo(options: PortalDemoOptions): boolean {
  if (!isPortalDemoEnabled(options.env)) return false;
  const origin = portalOrigin(options.env);
  const mode = decideMode(options.env, origin);
  const { store, audit } = openRecords(options.dataDir);
  const runner = new PortalDemoRunner({
    portalOrigin: origin,
    mode,
    store,
    audit,
    openPage: () => openPortalPage(origin, options.logger, mode.mode),
  });

  const handle = (
    channel: string,
    answer: (payload: unknown) => AppResult<RunReport> | Promise<AppResult<RunReport>>,
  ) => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, payload: unknown) => {
      if (!options.isTrustedSender(senderOf(event))) return appError('FORBIDDEN_SENDER');
      try {
        return await answer(payload);
      } catch {
        return appError('INTERNAL_ERROR');
      }
    });
  };
  const answerWith = (result: ConfirmResult): AppResult<RunReport> =>
    result.ok
      ? { ok: true, data: runner.current() }
      : appError('VALIDATION_FAILED', { details: { reason: result.reason } });

  handle(PORTAL_DEMO_CHANNELS.start, (payload) => {
    const data = DemoProposalSchema.safeParse(payload);
    if (!data.success) return appError('VALIDATION_FAILED');
    // The run goes on in the background; the demo screen polls the report.
    if (!runner.isRunning()) void runner.start(data.data);
    return { ok: true, data: runner.current() };
  });
  handle(PORTAL_DEMO_CHANNELS.report, () => ({ ok: true, data: runner.current() }));
  handle(PORTAL_DEMO_CHANNELS.cancel, () => {
    runner.cancel();
    return { ok: true, data: runner.current() };
  });
  handle(PORTAL_DEMO_CHANNELS.confirm, (payload) => {
    const confirmation = ConfirmSchema.safeParse(payload);
    if (!confirmation.success) return appError('VALIDATION_FAILED');
    const { token, acknowledgeDuplicates } = confirmation.data;
    return answerWith(runner.confirm(token, acknowledgeDuplicates ?? false));
  });
  handle(PORTAL_DEMO_CHANNELS.reconcile, (payload) => {
    const request = ReconcileSchema.safeParse(payload);
    if (!request.success) return appError('VALIDATION_FAILED');
    return answerWith(runner.reconcile(request.data.attemptId));
  });
  handle(PORTAL_DEMO_CHANNELS.resolve, (payload) => {
    const request = ResolveSchema.safeParse(payload);
    if (!request.success) return appError('VALIDATION_FAILED');
    const { attemptId } = request.data;
    return answerWith(
      request.data.resolution === 'not-created'
        ? runner.markNotCreated(attemptId)
        : runner.adopt(attemptId, request.data.proposalId),
    );
  });
  return true;
}
