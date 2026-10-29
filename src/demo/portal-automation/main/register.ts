// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The demo's only entry point in the main process. Does nothing unless the flag is set; then it
// registers the demo's four IPC channels, each answering only the app's own trusted window (the
// application's sender policy) and validating its payload before anything happens. The mode
// (fill-only, or the full workflow where the portal's profile allows it) is decided once, here.
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
import { openPortalPage } from './portal-window';
import { PortalDemoRunner } from './runner';

const ConfirmSchema = z.strictObject({ token: z.string().min(1).max(64) });

export interface PortalDemoOptions {
  env: Readonly<Record<string, string | undefined>>;
  isTrustedSender(sender: IpcSender): boolean;
  logger: Logger;
}

/** Registers the demo when its flag is on. Returns whether it did. */
export function registerPortalDemo(options: PortalDemoOptions): boolean {
  if (!isPortalDemoEnabled(options.env)) return false;
  const origin = portalOrigin(options.env);
  const mode = decideMode(options.env, origin);
  const runner = new PortalDemoRunner({
    portalOrigin: origin,
    mode,
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
    const result = runner.confirm(confirmation.data.token);
    if (!result.ok) return appError('VALIDATION_FAILED', { details: { reason: result.reason } });
    return { ok: true, data: runner.current() };
  });
  return true;
}
