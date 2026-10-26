// S1: Electron launches, renders a locked-down window, exchanges one validated IPC call and
// shuts down. Platform facts are recorded by the caller.
import { once } from 'node:events';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { IpcResult, RendererState } from '../../shared/ipc-contract';
import { check, type Check } from '../../shared/result';
import { handleRendererState } from '../ipc';
import type { SpikeContext, SpikeOutcome } from '../spike-context';
import { waitFor, withTimeout } from '../util';
import { appWindowPreferences } from '../web-preferences';

export async function runS1(ctx: SpikeContext): Promise<SpikeOutcome> {
  const checks: Check[] = [];
  const consoleMessages: { level: string; message: string }[] = [];
  const ipcCalls: IpcResult<RendererState>[] = [];

  const win = new BrowserWindow({
    show: false,
    width: 640,
    height: 400,
    title: 'FQF M1 spike',
    webPreferences: appWindowPreferences(join(ctx.appRoot, 'dist/preload/index.js')),
  });
  win.webContents.on('console-message', (event) => {
    consoleMessages.push({ level: event.level, message: event.message.slice(0, 300) });
  });
  const removeHandler = handleRendererState(win.webContents, (r) => ipcCalls.push(r));

  const readyToShow = once(win, 'ready-to-show');
  await win.loadFile(join(ctx.appRoot, 'dist/renderer/index.html'));
  await withTimeout(readyToShow, 10_000, 'ready-to-show');
  const secondsToFirstPaint = Number(process.uptime().toFixed(3));
  checks.push(check('s1.window-rendered', 'Window reached ready-to-show', true, true, true));

  await waitFor(() => ipcCalls.length >= 2, 10_000, 'two renderer IPC calls');
  const [first, second] = ipcCalls;
  const state = first?.ok ? first.data : null;

  checks.push(
    check(
      's1.ipc-valid-accepted',
      'Valid renderer payload accepted',
      true,
      first?.ok ?? null,
      first?.ok === true,
    ),
    check(
      's1.ipc-invalid-rejected',
      'Payload with unexpected fields rejected by main-process Zod validation',
      'VALIDATION_FAILED',
      second && !second.ok ? second.error.code : 'accepted',
      second?.ok === false && second.error.code === 'VALIDATION_FAILED',
    ),
    check(
      's1.renderer-no-require',
      'typeof require in renderer',
      'undefined',
      state?.typeofRequire ?? null,
      state?.typeofRequire === 'undefined',
    ),
    check(
      's1.renderer-no-process',
      'typeof process in renderer',
      'undefined',
      state?.typeofProcess ?? null,
      state?.typeofProcess === 'undefined',
    ),
    check(
      's1.renderer-no-module',
      'typeof module in renderer',
      'undefined',
      state?.typeofModule ?? null,
      state?.typeofModule === 'undefined',
    ),
    check(
      's1.preload-bridge',
      'Narrow preload bridge is present',
      true,
      state?.hasSpikeBridge ?? null,
      state?.hasSpikeBridge === true,
    ),
    check(
      's1.csp-meta',
      'App page declares a Content-Security-Policy',
      true,
      state?.cspMeta ?? null,
      state?.cspMeta === true,
    ),
  );

  // Effective settings are measured, not read back from configuration:
  // isolation from the page's view of the preload world, sandboxing from OS process metrics.
  const rendererPid = win.webContents.getOSProcessId();
  const rendererMetric = app.getAppMetrics().find((m) => m.pid === rendererPid);
  checks.push(
    check(
      's1.context-isolation',
      "Page cannot see the preload world's globals",
      false,
      state?.preloadWorldVisible ?? null,
      state?.preloadWorldVisible === false,
    ),
    check(
      's1.renderer-sandboxed',
      'OS process metrics report the renderer as sandboxed',
      true,
      rendererMetric?.sandboxed ?? null,
      rendererMetric?.sandboxed === true,
    ),
  );

  const securityWarnings = consoleMessages.filter((m) => m.message.includes('Security Warning'));
  checks.push(
    check(
      's1.no-security-warnings',
      'No Electron security warnings in the renderer console',
      0,
      securityWarnings.length,
      securityWarnings.length === 0,
    ),
    check(
      's1.electron-line',
      'Running Electron 45.x',
      '45.x',
      process.versions.electron,
      process.versions.electron.startsWith('45.'),
    ),
  );

  const metrics = app.getAppMetrics();
  removeHandler();
  const closed = once(win, 'closed');
  win.close();
  await withTimeout(closed, 5_000, 'window close');
  checks.push(check('s1.window-closed', 'Window closed cleanly', true, true, true));

  return {
    checks,
    facts: {
      secondsToFirstPaint,
      processTypes: metrics.map((m) => m.type),
      totalWorkingSetKb: metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0),
      consoleMessages,
    },
  };
}
