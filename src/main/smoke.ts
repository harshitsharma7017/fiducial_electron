// Smoke self-test (P1-05 subset; M2 verification of SEC-01..06, TC-22 surface, TC-23).
// Started with --smoke-test. Checks run against the real window, preload, IPC dispatcher and
// app:// protocol. Results are booleans and short codes only; no page content is reported.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, net } from 'electron';
import { API_SHAPE } from '../shared/ipc/api';
import { PRODUCTION_CSP } from './security/csp';
import { APP_ORIGIN, originOf } from './security/origins';
import { cipherName, openEncrypted } from './storage/encrypted-db';

export interface SmokeCheck {
  id: string;
  pass: boolean;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function inPage<T>(win: BrowserWindow, script: string): Promise<T> {
  return (await win.webContents.executeJavaScript(script)) as T;
}

export async function runSmokeChecks(win: BrowserWindow): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];
  const add = (id: string, pass: boolean): void => void checks.push({ id, pass });

  // Real round trip: page → preload bridge → ipcMain → dispatcher (trusted sender) → handler.
  const info = await inPage<{ ok: boolean; data?: { electron?: string } }>(
    win,
    'window.fqf.app.getInfo()',
  );
  add('ipc.round-trip', info.ok && info.data?.electron === process.versions.electron);

  // The bridge exposes exactly the documented surface and no raw IPC (SEC-03).
  const shape = await inPage<string>(
    win,
    'JSON.stringify(Object.fromEntries(Object.entries(window.fqf).map(([k, v]) => [k, Object.keys(v)])))',
  );
  add('bridge.shape', shape === JSON.stringify(API_SHAPE));

  // No Node.js or Electron in the page (SEC-01, SEC-02).
  const exposure = await inPage<string[]>(
    win,
    '[typeof require, typeof process, typeof module, typeof window.ipcRenderer, typeof window.electron]',
  );
  add(
    'renderer.no-node',
    exposure.every((t) => t === 'undefined'),
  );

  const pid = win.webContents.getOSProcessId();
  add('renderer.sandboxed', app.getAppMetrics().find((m) => m.pid === pid)?.sandboxed === true);

  // CSP is effective in the page: an injected inline script must not run (SEC-06).
  const inlineRan = await inPage<boolean>(
    win,
    `(() => { const s = document.createElement('script'); s.textContent = 'window.__fqfInline = true'; document.head.appendChild(s); return window.__fqfInline === true; })()`,
  );
  add('csp.inline-script-blocked', !inlineRan);

  // TC-23: popups and navigation away from the app are blocked (SEC-05).
  const windowsBefore = BrowserWindow.getAllWindows().length;
  const popup = await inPage<string>(win, `String(window.open('https://example.invalid/'))`);
  await delay(300);
  add(
    'tc23.popup-blocked',
    popup === 'null' && BrowserWindow.getAllWindows().length === windowsBefore,
  );
  for (const [id, target] of [
    ['tc23.https-navigation-blocked', 'https://example.invalid/'],
    ['tc23.file-navigation-blocked', 'file:///etc/hosts'],
  ] as const) {
    await inPage<boolean>(win, `location.href = ${JSON.stringify(target)}; true`);
    await delay(500);
    add(id, originOf(win.webContents.getURL()) === APP_ORIGIN);
  }

  // app:// serves the renderer with the production CSP header and nothing outside it.
  const entry = await net.fetch(`${APP_ORIGIN}/index.html`);
  add(
    'protocol.csp-header',
    entry.status === 200 && entry.headers.get('content-security-policy') === PRODUCTION_CSP,
  );
  for (const [id, url] of [
    ['protocol.encoded-traversal', `${APP_ORIGIN}/..%2f..%2fpackage.json`],
    ['protocol.encoded-dot-segments', `${APP_ORIGIN}/%2e%2e/%2e%2e/package.json`],
    ['protocol.main-bundle-unreachable', `${APP_ORIGIN}/../main/index.js`],
    ['protocol.other-host', 'app://other/index.html'],
  ] as const) {
    add(id, (await net.fetch(url)).status === 404);
  }

  // The encrypted database module loads in this build (packaged: from app.asar.unpacked) and
  // encrypts: a throwaway database with a random key, in a fresh temporary folder that is
  // deleted again, whose file must not carry the plain SQLite header.
  const scratch = mkdtempSync(join(tmpdir(), 'fqf-smoke-db-'));
  try {
    const file = join(scratch, 'check.db');
    const db = openEncrypted(file, randomBytes(32));
    db.exec('CREATE TABLE t (x TEXT); INSERT INTO t VALUES (1);');
    const cipher = cipherName(db);
    db.close();
    const header = readFileSync(file).subarray(0, 16).toString('latin1');
    add('storage.encrypted-db', cipher === 'sqlcipher' && header !== 'SQLite format 3\0');
  } catch {
    add('storage.encrypted-db', false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  // The temporary portal demo is not in production builds. scripts/smoke.mjs sets its variables:
  // still no demo IPC handler (registering a channel that has one throws) and no bridge but fqf.
  const demoHandlers = ['start', 'report', 'cancel', 'confirm', 'reconcile', 'resolve'].filter(
    (name) => {
      const channel = `portal-demo:${name}`;
      try {
        ipcMain.handle(channel, () => undefined);
        ipcMain.removeHandler(channel);
        return false;
      } catch {
        return true;
      }
    },
  );
  add('demo.no-ipc-handlers', demoHandlers.length === 0);
  const bridges = await inPage<string[]>(
    win,
    'Object.getOwnPropertyNames(window).filter((key) => /^fqf/i.test(key))',
  );
  add('demo.no-bridge', JSON.stringify(bridges) === '["fqf"]');

  return checks;
}
