// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the portal window keeps remote content
// apart from Node.js and the app. Locked-down preferences, no preload, an in-memory session of its
// own, navigation limited to the portal, the agent in an isolated world, and the creation permit
// and cookie names offered to the full workflow only.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const webContents = {
    on: vi.fn(),
    getURL: vi.fn(() => ''),
    executeJavaScriptInIsolatedWorld: vi.fn(() => Promise.resolve({ ok: true })),
  };
  const window = {
    webContents,
    on: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(() => Promise.resolve()),
  };
  const ses = {
    webRequest: {
      onBeforeRequest: vi.fn(),
      onBeforeSendHeaders: vi.fn(),
      onCompleted: vi.fn(),
      onErrorOccurred: vi.fn(),
    },
    cookies: { get: vi.fn(() => Promise.resolve([{ name: 'erp_session', value: 'secret' }])) },
  };
  return {
    webContents,
    window,
    ses,
    BrowserWindow: vi.fn(function () {
      return window;
    }),
    fromPartition: vi.fn(() => ses),
    allowOrigins: vi.fn(),
    hardenSession: vi.fn(),
  };
});
vi.mock('electron', () => ({
  BrowserWindow: fake.BrowserWindow,
  session: { fromPartition: fake.fromPartition },
}));
vi.mock('../../src/main/security/navigation-policy', () => ({
  allowOrigins: fake.allowOrigins,
  hardenSession: fake.hardenSession,
}));

import { LOCKED_DOWN } from '../../src/main/security/web-preferences';

const LOCAL = 'http://localhost:3100';
const LIVE = 'https://fiducial.spirezen.tech';
const logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

async function freshWindowModule() {
  vi.resetModules();
  return import('../../src/demo/portal-automation/main/portal-window');
}

type WindowOptions = { title: string; webPreferences: Record<string, unknown> };

function windowOptions(): WindowOptions {
  const calls = fake.BrowserWindow.mock.calls as unknown as [WindowOptions][];
  return calls.at(-1)![0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the portal window', () => {
  it('uses the locked-down preferences with no preload, in an in-memory session of its own', async () => {
    const { openPortalPage } = await freshWindowModule();
    openPortalPage(LOCAL, logger);
    const { webPreferences } = windowOptions();
    expect(webPreferences).toEqual({ ...LOCKED_DOWN, partition: 'portal-automation-demo' });
    expect(webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
    expect(webPreferences).not.toHaveProperty('preload');
    expect(String(webPreferences['partition'])).not.toMatch(/^persist:/);
    expect(fake.fromPartition).toHaveBeenCalledWith('portal-automation-demo');
    expect(fake.hardenSession).toHaveBeenCalledWith(fake.ses, logger);
  });

  it('may navigate only within the portal’s own origin, and runs the agent in an isolated world', async () => {
    const { openPortalPage } = await freshWindowModule();
    const page = openPortalPage(LOCAL, logger);
    expect(fake.allowOrigins).toHaveBeenCalledWith(fake.webContents, [LOCAL]);
    await page.run({ op: 'snapshot' });
    const [world, scripts] = fake.webContents.executeJavaScriptInIsolatedWorld.mock
      .calls[0] as unknown as [number, { code: string }[]];
    expect(world).toBeGreaterThan(0);
    expect(scripts[0]!.code).toContain('"op":"snapshot"');
  });

  it('offers the creation permit and cookie names to the full workflow only, never cookie values', async () => {
    const fillOnly = (await freshWindowModule()).openPortalPage(LOCAL, logger, 'fill-only');
    expect('armCreation' in fillOnly).toBe(false);
    expect('sessionCookieNames' in fillOnly).toBe(false);

    const full = (await freshWindowModule()).openPortalPage(LOCAL, logger, 'full');
    expect(await full.sessionCookieNames?.()).toEqual(['erp_session']);
    expect('armCreation' in full).toBe(true);
  });

  it('names the environment in the window title', async () => {
    (await freshWindowModule()).openPortalPage(LIVE, logger, 'full');
    expect(windowOptions().title).toMatch(/^LIVE PORTAL/);
    (await freshWindowModule()).openPortalPage(LOCAL, logger, 'full');
    expect(windowOptions().title).toMatch(/^TEST ENVIRONMENT/);
    (await freshWindowModule()).openPortalPage(LIVE, logger, 'fill-only');
    expect(windowOptions().title).toMatch(/nothing is saved/);
  });
});
