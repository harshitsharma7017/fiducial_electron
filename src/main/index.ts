// Main-process entry. Order matters: launch guard, single-instance lock and privileged scheme
// registration all happen before the app is ready.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, safeStorage, session } from 'electron';
import { createClientService } from './clients/service';
import { createInsurerCredentials } from './insurers/credentials';
import { createFormRecorder } from './insurers/form-recorder';
import { createPortalWindows } from './insurers/portal-windows';
import { createSessionClock } from './insurers/session-clock';
import { createQuoteService } from './quotes/service';
import { createVaultOpener } from './secrets/vault-opener';
import { openClientStore } from './storage/client-store';
import { createInsurerService, insurerPortalsEnabled } from './insurers/service';
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
    app.on('quit', () => {
      // On Windows the browser process still holds files in the profile at this point, so the
      // delete can fail; a throw here blocks on an error dialog and the app never exits. A
      // leftover scratch profile in the OS temp folder is acceptable.
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        // Left in the OS temp folder.
      }
    });
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
    // Automation features: insurer portals (sign-in autofill, 12-hour sessions) and saved
    // clients. Off unless FQF_INSURER_PORTALS=1. Secrets (sign-in details, the database key) are
    // kept only in the encrypted vault under <userData>/secrets; clients in the encrypted
    // database under <userData>/data.
    const userData = app.getPath('userData');
    const automation = insurerPortalsEnabled(process.env);
    const openVault = createVaultOpener(join(userData, 'secrets'), safeStorage);
    const credentials = createInsurerCredentials(openVault);
    const portalWindows = createPortalWindows({
      logger,
      credentials,
      clock: createSessionClock(join(userData, 'insurer-sessions.json')),
    });
    const insurers = createInsurerService({
      enabled: automation,
      credentials,
      windows: portalWindows,
      recorder: createFormRecorder({ dir: join(userData, 'recordings'), logger }),
      logger,
    });
    const clients = createClientService({
      enabled: automation,
      open: () =>
        openClientStore({
          dbPath: join(userData, 'data', 'fqf.db'),
          ledgerPath: join(userData, 'ledger', 'fqf.ledger'),
          openVault,
        }),
      logger,
    });
    app.on('will-quit', () => clients.close());
    const quotes = createQuoteService({
      enabled: automation,
      clients,
      windowsOf: (id) => portalWindows.windowsOf(id),
      logger,
    });
    registerIpc(
      createDispatcher(createHandlers({ insurers, clients, quotes }), {
        isTrustedSender: senderPolicy.isTrusted,
        logger,
      }),
    );
    // DEMO ONLY — temporary portal automation demo (src/demo/portal-automation/README.md), in
    // development builds only. `import.meta.env.DEV` is `false` in production builds, so this
    // branch and the demo's code are left out of them; a packaged app never loads it either. In
    // development it still does nothing unless ENABLE_PORTAL_AUTOMATION_DEMO is set.
    if (import.meta.env.DEV && !app.isPackaged) {
      try {
        const { registerPortalDemo } = await import('../demo/portal-automation/main/register');
        registerPortalDemo({
          env: process.env,
          isTrustedSender: senderPolicy.isTrusted,
          logger,
          dataDir: join(app.getPath('userData'), 'portal-automation'),
        });
      } catch {
        // Development only: the app runs without the demo.
      }
    }
    const win = createMainWindow({
      preloadPath: join(__dirname, '../preload/index.js'),
      entryUrl: devOrigin && devUrl ? devUrl : APP_ENTRY_URL,
      origin,
      senderPolicy,
      show: !smoke,
    });
    // Insurer windows hide instead of closing (their sessions stay), so closing the app window
    // must quit the app itself rather than wait for every window to close.
    win.on('closed', () => app.quit());
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
