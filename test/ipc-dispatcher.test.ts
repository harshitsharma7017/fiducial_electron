// TC-22: invalid IPC payloads are rejected in the main process; sender verification; error
// sanitisation; correlation IDs. Exercises the same dispatcher Electron uses.
import { describe, expect, it, vi } from 'vitest';
import { createDispatcher, AppException, type IpcHandlers } from '../src/main/ipc/dispatcher';
import { createSenderPolicy, type IpcSender } from '../src/main/ipc/sender-policy';
import { createLogger, type LogRecord } from '../src/main/logging/logger';
import { IPC_CHANNELS } from '../src/shared/ipc/channels';
import type { AppResult } from '../src/shared/ipc/result';

const APP_ORIGIN = 'app://fqf';
const info = {
  name: 'Fiducial Quote Fetcher',
  version: '0.1.0',
  platform: 'darwin' as const,
  arch: 'arm64',
  electron: '45.0.0',
  isPackaged: false,
};

/** Insurer handlers are not exercised here (see insurer-ipc.test.ts); they must exist for the type. */
const insurerStubs: Omit<IpcHandlers, 'app:get-info'> = {
  'insurers:list': () => ({ enabled: false, vaultError: null, portals: [] }),
  'insurers:save-login': () => ({ saved: true }),
  'insurers:forget-login': () => ({ forgotten: false }),
  'insurers:open-portal': () => ({ opened: true }),
  'insurers:sign-out': () => ({ signedOut: false }),
  'insurers:record': () => ({ recording: false, file: null }),
  'clients:list': () => ({ enabled: false, storageError: null, clients: [] }),
  'clients:get': () => {
    throw new AppException('VALIDATION_FAILED');
  },
  'clients:save': () => ({ id: 'x' }),
  'clients:delete': () => ({ deleted: false }),
  'vehicles:list': () => ({ vehicles: [] }),
  'vehicles:get': () => {
    throw new AppException('VALIDATION_FAILED');
  },
  'vehicles:save': () => ({ id: 'x' }),
  'vehicles:delete': () => ({ deleted: false }),
  'travellers:list': () => ({ travellers: [] }),
  'travellers:get': () => {
    throw new AppException('VALIDATION_FAILED');
  },
  'travellers:save': () => ({ id: 'x' }),
  'travellers:delete': () => ({ deleted: false }),
  'portals:tabs': () => ({ version: 1, tabs: [], active: null }),
  'portals:show': () => ({ shown: true }),
  'portals:close': () => ({ closed: true }),
  'portals:set-bounds': () => ({ set: true }),
  'quotes:run': () => ({ outcome: 'refused', step: null, message: 'x', problems: [] }),
  'imports:template': () => ({ saved: false }),
  'imports:preview': () => {
    throw new AppException('CANCELLED');
  },
  'imports:commit': () => ({ saved: 0, skipped: 0, failed: [] }),
};

function setup(handler: IpcHandlers['app:get-info'] = () => info) {
  const records: LogRecord[] = [];
  const policy = createSenderPolicy(APP_ORIGIN);
  policy.trust(1);
  let id = 0;
  const dispatch = createDispatcher(
    { ...insurerStubs, [IPC_CHANNELS.appGetInfo]: handler },
    {
      isTrustedSender: policy.isTrusted,
      logger: createLogger([(r) => records.push(r)]),
      newCorrelationId: () => `0000000${++id}-aaaa`,
    },
  );
  return { dispatch, records, policy };
}

const trusted: IpcSender = {
  webContentsId: 1,
  frameIsMain: true,
  frameUrl: 'app://fqf/index.html',
};
const errorCode = (r: AppResult<unknown>) => (r.ok ? 'OK' : r.error.code);

describe('IPC dispatcher', () => {
  it('serves a valid request from the trusted app window', async () => {
    const { dispatch } = setup();
    expect(await dispatch(trusted, 'app:get-info', {})).toEqual({ ok: true, data: info });
  });

  it.each([
    ['unregistered window', { ...trusted, webContentsId: 2 }],
    ['subframe of the app window', { ...trusted, frameIsMain: false }],
    ['foreign origin in the app window', { ...trusted, frameUrl: 'https://evil.example/' }],
    ['look-alike origin', { ...trusted, frameUrl: 'app://fqf.evil/index.html' }],
    ['missing frame URL', { ...trusted, frameUrl: null }],
  ])('rejects a call from an untrusted sender: %s', async (_label, sender) => {
    const handler = vi.fn(() => info);
    const { dispatch } = setup(handler);
    expect(errorCode(await dispatch(sender, 'app:get-info', {}))).toBe('FORBIDDEN_SENDER');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'x'],
    ['number', 42],
    ['array', []],
    ['unexpected field', { extra: 'secret-value' }],
    ['prototype pollution attempt', JSON.parse('{"__proto__": {"polluted": true}}') as unknown],
  ])('TC-22: rejects an invalid payload (%s) before the handler runs', async (_label, payload) => {
    const handler = vi.fn(() => info);
    const { dispatch } = setup(handler);
    const result = await dispatch(trusted, 'app:get-info', payload);
    expect(errorCode(result)).toBe('VALIDATION_FAILED');
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('rejects an unknown channel', async () => {
    const { dispatch } = setup();
    expect(errorCode(await dispatch(trusted, 'fs:read', { path: '/etc/passwd' }))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('never leaks a handler exception message or stack', async () => {
    const { dispatch, records } = setup(() => {
      throw new Error('db password=hunter2 at /Users/someone/secret.db');
    });
    const result = await dispatch(trusted, 'app:get-info', {});
    expect(errorCode(result)).toBe('INTERNAL_ERROR');
    const text = JSON.stringify([result, records]);
    expect(text).not.toMatch(/hunter2|secret\.db|someone|stack/);
  });

  it('passes through a deliberate AppException code', async () => {
    const { dispatch } = setup(() => {
      throw new AppException('STORAGE_ERROR');
    });
    expect(errorCode(await dispatch(trusted, 'app:get-info', {}))).toBe('STORAGE_ERROR');
  });

  it('rejects a handler response that breaks the contract', async () => {
    const { dispatch } = setup(() => ({ ...info, leaked: 'internal' }) as typeof info);
    const result = await dispatch(trusted, 'app:get-info', {});
    expect(errorCode(result)).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(result)).not.toContain('internal"');
  });

  it('gives every call a correlation ID that appears in the error and the log only', async () => {
    const { dispatch, records } = setup();
    const result = await dispatch({ ...trusted, webContentsId: 9 }, 'app:get-info', {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.correlationId).toMatch(/^[0-9a-f-]{8,}$/);
    expect(records.at(-1)).toMatchObject({
      event: 'ipc.call',
      channel: 'app:get-info',
      outcome: 'error',
      errorCode: 'FORBIDDEN_SENDER',
      correlationId: result.error.correlationId,
    });
  });

  it('reports validation issues by path and code without values or key names', async () => {
    const { dispatch } = setup();
    const result = await dispatch(trusted, 'app:get-info', { leakedKey: 'leakedValue' });
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/leakedKey|leakedValue/);
  });
});
