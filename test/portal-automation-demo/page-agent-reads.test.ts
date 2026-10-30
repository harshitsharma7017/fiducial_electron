// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the in-page agent's read-only API calls,
// run directly against a stubbed fetch (the portal's API answers as its description documents).
// Only GET requests to the portal's own /api/proxy layer; lists are followed page by page.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { portalPageAgent } from '../../src/demo/portal-automation/page/page-agent';

const CLIENT = 'c'.repeat(24);

/** A fetch that answers each path from the table, and records what it was asked. */
function portal(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { path: string; method: string }[] = [];
  const fetch = vi.fn((path: string, init: RequestInit) => {
    calls.push({ path, method: init.method ?? 'GET' });
    const route = routes[path];
    return Promise.resolve({
      status: route ? (route.status ?? 200) : 404,
      json: () => Promise.resolve(route?.body ?? null),
    });
  });
  vi.stubGlobal('fetch', fetch);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the in-page agent’s reads', () => {
  it('finds clients named exactly so, across pages, with their ids and GSTINs', async () => {
    const calls = portal({
      '/api/proxy/clients?q=Deccan+Cold+Chain+LLP&limit=100': {
        body: {
          items: [
            { id: CLIENT, name: 'Deccan Cold Chain LLP', gstin: '29ZZZZZ0003Z1ZJ' },
            { id: 'd'.repeat(24), name: 'Deccan Cold Chain LLP (Pune)', gstin: null },
          ],
          nextCursor: 'e'.repeat(24),
        },
      },
      [`/api/proxy/clients?q=Deccan+Cold+Chain+LLP&limit=100&cursor=${'e'.repeat(24)}`]: {
        body: {
          items: [{ id: 'f'.repeat(24), name: 'Deccan  Cold Chain LLP', gstin: null }],
          nextCursor: null,
        },
      },
    });
    const result = await portalPageAgent({ op: 'find-clients', name: 'Deccan Cold Chain LLP' });
    expect(result).toEqual({
      ok: true,
      clients: [
        { id: CLIENT, name: 'Deccan Cold Chain LLP', gstin: '29ZZZZZ0003Z1ZJ' },
        // The same name with other spacing is the same name.
        { id: 'f'.repeat(24), name: 'Deccan Cold Chain LLP', gstin: null },
      ],
    });
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('reports a failed or endless client list as failed, never as complete', async () => {
    portal({ '/api/proxy/clients?q=X+Demo&limit=100': { status: 500, body: null } });
    expect(await portalPageAgent({ op: 'find-clients', name: 'X Demo' })).toEqual({
      ok: false,
      reason: 'failed',
    });
    const looping = vi.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ items: [], nextCursor: 'a'.repeat(24) }),
      }),
    );
    vi.stubGlobal('fetch', looping);
    expect(await portalPageAgent({ op: 'find-clients', name: 'X Demo' })).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(looping).toHaveBeenCalledTimes(10);
  });

  it('reads a client’s risk locations by id', async () => {
    portal({
      [`/api/proxy/clients/${CLIENT}/locations?limit=100`]: {
        body: { items: [{ id: '1'.repeat(24), name: ' Peenya   cold store ' }], nextCursor: null },
      },
    });
    expect(await portalPageAgent({ op: 'client-locations', clientId: CLIENT })).toEqual({
      ok: true,
      locations: [{ id: '1'.repeat(24), name: 'Peenya cold store' }],
    });
    expect(await portalPageAgent({ op: 'client-locations', clientId: '../users' })).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('reads a client’s proposals and the fields the checks need', async () => {
    portal({
      [`/api/proxy/proposals?clientId=${CLIENT}&limit=100`]: {
        body: {
          items: [
            {
              id: 'a'.repeat(24),
              reference: 'FIB/PROP/2026/0001',
              type: 'NEW',
              stage: 'DRAFT',
              client: { id: CLIENT, name: 'Deccan Cold Chain LLP', gstin: null },
              owner: { id: 'e'.repeat(24), name: 'Demo Admin' },
              locations: [{ locationId: '1'.repeat(24), location: null }],
              policyStart: '2026-12-01',
              policyEnd: '2027-11-30',
              dueDate: '2026-11-20',
              createdAt: '2026-10-30T10:00:00.000Z',
            },
            { id: 'b'.repeat(24) },
          ],
          nextCursor: null,
        },
      },
    });
    const result = await portalPageAgent({ op: 'client-proposals', clientId: CLIENT });
    expect(result).toMatchObject({
      ok: true,
      proposals: [
        {
          id: 'a'.repeat(24),
          clientId: CLIENT,
          clientGstin: null,
          ownerId: 'e'.repeat(24),
          locationIds: ['1'.repeat(24)],
          policyStart: '2026-12-01',
        },
        // A record without these fields reads as unknown, never as matching.
        { id: 'b'.repeat(24), clientId: '', ownerId: '', locationIds: null, policyStart: null },
      ],
    });
  });

  it('reports the signed-in user’s id with the session', async () => {
    portal({
      '/api/proxy/auth/me': {
        body: {
          id: 'e'.repeat(24),
          name: 'Demo Admin',
          permissions: ['property.create', 'property.view'],
        },
      },
    });
    expect(await portalPageAgent({ op: 'session' })).toEqual({
      ok: true,
      session: {
        signedIn: true,
        name: 'Demo Admin',
        userId: 'e'.repeat(24),
        canCreateProperty: true,
      },
    });
  });
});
