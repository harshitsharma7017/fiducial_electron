// Main-process entry. Order matters: launch guard, single-instance lock and privileged scheme
// registration all happen before the app is ready.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, session } from 'electron';
import { createDispatcher } from './ipc/dispatcher';
import { createHandlers } from './ipc/handlers';
import { registerIpc } from './ipc/register';
import { createSenderPolicy } from './ipc/sender-policy';
import { consoleSink } from './logging/console-sink';
import { createLogger } from './logging/logger';
import { installAppProtocol, registerAppScheme } from './security/app-protocol';
import { developmentCsp } from './security/csp';
import {
  findUnsafeLaunchOptions,
  shouldEnforceLaunchGuard,
  SMOKE_TEST_FLAG,
} from './security/launch-guard';
import { hardenSession, installNavigationPolicy } from './security/navigation-policy';
import { APP_ENTRY_URL, APP_ORIGIN, devServerOrigin } from './security/origins';
import { runSmokeChecks } from './smoke';
import { createMainWindow } from './windows/main-window';

const EXIT_UNSAFE_LAUNCH = 78;
const logger = createLogger([consoleSink]);
const smoke = process.argv.includes(SMOKE_TEST_FLAG);

function start(): void {
  if (shouldEnforceLaunchGuard(app.isPackaged, process.argv)) {
    const unsafe = findUnsafeLaunchOptions(process.argv, process.env, process.platform);
    if (unsafe.length > 0) {
      logger.error('app.launch-refused', { unsafeOptions: unsafe });
      process.exit(EXIT_UNSAFE_LAUNCH);
    }
  }

  if (smoke) {
    // Smoke runs never touch the user's real profile.
    const scratch = mkdtempSync(join(tmpdir(), 'fqf-smoke-'));
    app.setPath('userData', scratch);
    app.on('quit', () => rmSync(scratch, { recursive: true, force: true }));
  } else if (!app.requestSingleInstanceLock()) {
    logger.info('app.second-instance');
    app.quit();
    return;
  }

  registerAppScheme();
  installNavigationPolicy(logger);
  const devUrl = app.isPackaged || smoke ? undefined : process.env['ELECTRON_RENDERER_URL'];
  const devOrigin = devServerOrigin(devUrl);
  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(async () => {
    logger.info('app.start', {
      appVersion: app.getVersion(),
      platform: process.platform as 'darwin' | 'win32' | 'linux',
      arch: process.arch,
      packaged: app.isPackaged,
    });
    const ses = session.defaultSession;
    hardenSession(ses, logger);
    installAppProtocol(ses, join(__dirname, '../renderer'), logger);
    if (devOrigin) {
      ses.webRequest.onHeadersReceived({ urls: [`${devOrigin}/*`] }, (details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [developmentCsp(devOrigin)],
          },
        });
      });
    }

    const origin = devOrigin ?? APP_ORIGIN;
    const senderPolicy = createSenderPolicy(origin);
    registerIpc(
      createDispatcher(createHandlers(), { isTrustedSender: senderPolicy.isTrusted, logger }),
    );
    const win = createMainWindow({
      preloadPath: join(__dirname, '../preload/index.js'),
      entryUrl: devOrigin && devUrl ? devUrl : APP_ENTRY_URL,
      origin,
      senderPolicy,
      show: !smoke,
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      logger.error('renderer.gone', { reason: details.reason });
    });
    app.on('second-instance', () => {
      if (win.isMinimized()) win.restore();
      win.focus();
    });

    if (smoke) {
      await new Promise<void>((resolve) =>
        win.webContents.once('did-finish-load', () => resolve()),
      );
      const checks = await runSmokeChecks(win);
      const failed = checks.filter((c) => !c.pass).map((c) => c.id);
      logger.info('smoke.result', { passed: failed.length === 0, failedChecks: failed });
      process.stdout.write(
        `FQF_SMOKE_RESULT ${JSON.stringify({ passed: failed.length === 0, checks })}\n`,
      );
      app.exit(failed.length === 0 ? 0 : 1);
      return;
    }
    logger.info('app.ready');
  });
}

start();
