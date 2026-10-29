// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the network guard, the in-page agent's
// source, and the feature being unavailable without its flag.
import { Script } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  handle: vi.fn(),
  exposeInMainWorld: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: electron.handle },
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: vi.fn() },
  BrowserWindow: vi.fn(),
  session: { fromPartition: vi.fn() },
}));

import { isRequestAllowed } from '../../src/demo/portal-automation/main/network-guard';
import { registerPortalDemo } from '../../src/demo/portal-automation/main/register';
import { portalPageAgent } from '../../src/demo/portal-automation/page/page-agent';
import { exposePortalDemo } from '../../src/demo/portal-automation/preload/expose';
import { SYNTHETIC_DEMO_PROPOSAL } from '../../src/demo/portal-automation/shared/demo-data';

const PORTAL = 'https://fiducial.spirezen.tech';
const logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('the demo window’s network guard', () => {
  it('lets the portal be read and lets the user sign in and out', () => {
    expect(isRequestAllowed('GET', `${PORTAL}/proposals/new`, PORTAL)).toBe(true);
    expect(isRequestAllowed('GET', `${PORTAL}/api/proxy/clients?limit=20`, PORTAL)).toBe(true);
    expect(isRequestAllowed('HEAD', `${PORTAL}/`, PORTAL)).toBe(true);
    expect(isRequestAllowed('POST', `${PORTAL}/api/auth/login`, PORTAL)).toBe(true);
    expect(isRequestAllowed('POST', `${PORTAL}/api/auth/logout`, PORTAL)).toBe(true);
  });

  it.each([
    ['POST', `${PORTAL}/api/proxy/proposals`],
    ['POST', `${PORTAL}/api/proxy/clients`],
    ['PUT', `${PORTAL}/api/proxy/proposals/abc/data-sheet`],
    ['PATCH', `${PORTAL}/api/proxy/proposals/abc`],
    ['DELETE', `${PORTAL}/api/proxy/proposals/abc`],
    ['POST', 'https://elsewhere.example.test/api/auth/login'],
    ['POST', 'not a url'],
  ])('blocks %s %s', (method, url) => {
    expect(isRequestAllowed(method, url, PORTAL)).toBe(false);
  });
});

describe('the in-page agent', () => {
  const source = portalPageAgent.toString();

  it('is self-contained, so its source can run in the page on its own', () => {
    // Compiled and evaluated in an empty context: no outside reference survives the trip.
    const agent: unknown = new Script(`(${source})`).runInNewContext({});
    expect(typeof agent).toBe('function');
  });

  // Changed for the full workflow: the agent can now press the form's final action, but only
  // through its `create` command (sent once, after the user's confirmation, on an approved test
  // environment; full-workflow.test.ts). Fill-only runs never send that command (runner.test.ts).
  it('submits only through the create command: one allowance, on the New proposal form', () => {
    expect(source).not.toMatch(/requestSubmit|\.submit\(/);
    // It blocks submit events in the window, except the sign-in form and one allowed submit.
    expect(source).toMatch(/addEventListener\(\s*["']submit["']/);
    // The compiled source may quote either way.
    const start = source.search(/case ["']create["']/);
    const end = source.search(/case ["']read-proposal["']/);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const create = source.slice(start, end);
    expect(create).toMatch(/location\.pathname !== ['"]\/proposals\/new['"]/);
    expect(create).toMatch(/=== command\.action/);
    expect(create).toMatch(/buttons\.length !== 1/);
    // The one-time allowance is set only in the create command and used up by the submit.
    expect(source.match(/__fqfPortalDemoCreateOnce/g)).toHaveLength(2);
    expect(source).toMatch(/scope\[allowance\] = false/);
    // Outside the create command, nothing clicks a submit button.
    const rest = source.replace(create, '');
    expect(rest).not.toMatch(/type === ['"]submit['"]/);
  });
});

describe('without its flag', () => {
  beforeEach(() => {
    electron.handle.mockClear();
    electron.exposeInMainWorld.mockClear();
  });

  it('registers no IPC handler and exposes no bridge', () => {
    expect(registerPortalDemo({ env: {}, isTrustedSender: () => true, logger })).toBe(false);
    exposePortalDemo({});
    exposePortalDemo({ ENABLE_PORTAL_AUTOMATION_DEMO: '0' });
    expect(electron.handle).not.toHaveBeenCalled();
    expect(electron.exposeInMainWorld).not.toHaveBeenCalled();
  });

  it('with the flag, registers its four channels and its bridge only', () => {
    const env = { ENABLE_PORTAL_AUTOMATION_DEMO: '1' };
    expect(registerPortalDemo({ env, isTrustedSender: () => true, logger })).toBe(true);
    expect(electron.handle.mock.calls.map((call) => call[0] as string)).toEqual([
      'portal-demo:start',
      'portal-demo:report',
      'portal-demo:cancel',
      'portal-demo:confirm',
    ]);
    exposePortalDemo(env);
    expect(electron.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(electron.exposeInMainWorld.mock.calls[0]![0]).toBe('fqfPortalDemo');
  });

  it('answers only the app’s trusted window, and only with synthetic data', async () => {
    let trusted = false;
    registerPortalDemo({
      env: { ENABLE_PORTAL_AUTOMATION_DEMO: '1' },
      isTrustedSender: () => trusted,
      logger,
    });
    const start = electron.handle.mock.calls.find(
      ([channel]) => channel === 'portal-demo:start',
    )![1] as (
      event: unknown,
      payload: unknown,
    ) => Promise<{ ok: boolean; error?: { code: string } }>;
    const event = { sender: { id: 1 }, senderFrame: { parent: null, url: 'app://fqf/index.html' } };

    expect((await start(event, SYNTHETIC_DEMO_PROPOSAL)).error?.code).toBe('FORBIDDEN_SENDER');
    trusted = true;
    expect(
      (await start(event, { ...SYNTHETIC_DEMO_PROPOSAL, insuredName: 'Real Client Ltd' })).error
        ?.code,
    ).toBe('VALIDATION_FAILED');
  });
});
