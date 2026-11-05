// Keeping insurer portals signed in while the advisor is away (src/main/insurers/session-alive.ts):
// when it nudges the pages, when it fetches the portal's page again (and when it must not), and
// that the advisor's own activity, a quiet-free session or a login page hold it back.
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { WebContents } from 'electron';
import {
  CHECK_MS,
  createSessionAlive,
  NUDGE_MS,
  safeToRepeat,
  type KeepAliveCommand,
  type RequestSource,
} from '../src/main/insurers/session-alive';
import type { PortalPage } from '../src/main/insurers/portal-host';
import { createLogger, type LogRecord } from '../src/main/logging/logger';

const HOME = 'https://portal.example/app/HomeAction.do';

function fakePage(id: number, url: string) {
  const wc = Object.assign(new EventEmitter(), {
    id,
    isDestroyed: () => false,
    getURL: () => url,
  });
  const page: PortalPage = {
    webContents: wc as unknown as WebContents,
    isDestroyed: () => false,
    focus: () => undefined,
  };
  return { page, wc };
}

function setup(options: { signedIn?: boolean; answered?: boolean } = {}) {
  let t = 1_000_000;
  const portal = fakePage(1, HOME);
  const popup = fakePage(2, 'https://portal.example/app/Calculator.do');
  const calls: { page: number; command: KeepAliveCommand }[] = [];
  const records: LogRecord[] = [];
  const running: boolean[] = [];
  let listener: Parameters<RequestSource['webRequest']['onCompleted']>[0] = () => undefined;
  const alive = createSessionAlive({
    running: () => ['united-india'],
    pagesOf: () => [portal.page, popup.page],
    signedIn: () => options.signedIn ?? true,
    logger: createLogger([(r) => records.push(r)]),
    now: () => t,
    run: (wc, command) => {
      calls.push({ page: wc.id, command });
      return Promise.resolve({
        answered: options.answered ?? false,
        pinged: command.ping ? true : null,
      });
    },
    onRunning: (any) => running.push(any),
  });
  alive.watchSession('united-india', {
    webRequest: { onCompleted: (l) => (listener = l) },
  });
  const request = (details: Partial<Parameters<typeof listener>[0]> = {}) =>
    listener({
      webContentsId: 1,
      resourceType: 'xhr',
      method: 'GET',
      statusCode: 200,
      url: HOME,
      ...details,
    });
  return {
    alive,
    calls,
    records,
    running,
    portal,
    request,
    later: (ms: number) => (t += ms),
    last: () => calls.slice(-2),
  };
}

describe('keeping portals signed in', () => {
  it('right after opening, only looks for session warnings', async () => {
    const s = setup();
    await s.alive.tick();
    expect(s.calls).toEqual([
      { page: 1, command: { activity: false, ping: null } },
      { page: 2, command: { activity: false, ping: null } },
    ]);
    expect(s.running).toEqual([true]);
  });

  it('after the advisor has been away, nudges every page and fetches the portal page again', async () => {
    const s = setup();
    s.request({ resourceType: 'mainFrame' });
    await s.alive.tick();
    s.later(NUDGE_MS);
    await s.alive.tick();
    expect(s.last()).toEqual([
      { page: 1, command: { activity: true, ping: HOME } },
      { page: 2, command: { activity: true, ping: null } },
    ]);
    // Not again until another NUDGE_MS has passed.
    s.later(CHECK_MS);
    await s.alive.tick();
    expect(s.last().map((c) => c.command.activity)).toEqual([false, false]);
    s.later(NUDGE_MS);
    await s.alive.tick();
    expect(s.last()[0]?.command.activity).toBe(true);
  });

  it('the advisor’s own mouse or keys hold it back', async () => {
    const s = setup();
    await s.alive.tick();
    s.later(NUDGE_MS - 1000);
    s.portal.wc.emit('input-event');
    s.later(2000);
    await s.alive.tick();
    expect(s.last().map((c) => c.command.activity)).toEqual([false, false]);
  });

  it('a portal that talked to its server lately is nudged but not fetched', async () => {
    const s = setup();
    s.request({ resourceType: 'mainFrame' });
    await s.alive.tick();
    s.later(NUDGE_MS - 1000);
    s.request(); // the portal's own request
    s.later(1000);
    await s.alive.tick();
    expect(s.last()[0]?.command).toEqual({ activity: true, ping: null });
  });

  it('never fetches a page reached by sending a form', async () => {
    const s = setup();
    s.request({ resourceType: 'mainFrame', method: 'POST' });
    await s.alive.tick();
    s.later(NUDGE_MS);
    await s.alive.tick();
    expect(s.last()[0]?.command).toEqual({ activity: true, ping: null });
  });

  it('does nothing on the login page', async () => {
    const s = setup({ signedIn: false });
    await s.alive.tick();
    s.later(NUDGE_MS);
    await s.alive.tick();
    expect(s.calls).toEqual([]);
  });

  it('logs when it answered a session warning (insurer only)', async () => {
    const s = setup({ answered: true });
    await s.alive.tick();
    expect(s.records.filter((r) => r.event === 'insurer.session-kept-alive')).toEqual([
      expect.objectContaining({ insurer: 'united-india' }),
      expect.objectContaining({ insurer: 'united-india' }),
    ]);
  });

  it('repeats only GET pages answered with a page, without one-time codes', () => {
    expect(safeToRepeat({ url: HOME, method: 'GET', status: 200 })).toBe(true);
    expect(safeToRepeat({ url: HOME, method: 'POST', status: 200 })).toBe(false);
    expect(safeToRepeat({ url: HOME, method: 'GET', status: 500 })).toBe(false);
    expect(safeToRepeat({ url: `${HOME}?code=abc&x=1`, method: 'GET', status: 200 })).toBe(false);
    expect(safeToRepeat({ url: `${HOME}?page=2`, method: 'GET', status: 200 })).toBe(true);
    expect(safeToRepeat(undefined)).toBe(false);
  });
});
