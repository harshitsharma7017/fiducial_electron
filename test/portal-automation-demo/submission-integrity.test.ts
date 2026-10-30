// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the network guard lets the creation
// request through only if it is exactly the request the user approved; the read-back checks every
// field of the created proposal.
import { describe, expect, it } from 'vitest';
import { RequestPolicy } from '../../src/demo/portal-automation/main/network-guard';
import {
  checkRecord,
  recordMatches,
  requestBodyProblems,
  type CreationPayload,
  type RecordFacts,
} from '../../src/demo/portal-automation/shared/creation-payload';

const LOCAL = 'http://localhost:3100';
const CREATE = `${LOCAL}/api/proxy/proposals`;
const APPROVED: CreationPayload = {
  type: 'NEW',
  clientId: 'c'.repeat(24),
  locationIds: ['1'.repeat(24), '2'.repeat(24)],
  ownerId: 'e'.repeat(24),
  policyStart: '2026-12-01',
  policyEnd: '2027-11-30',
  dueDate: '2026-11-20',
};
const json = (value: unknown) => [{ bytes: Buffer.from(JSON.stringify(value)) }];

function armed(approved: CreationPayload = APPROVED): RequestPolicy {
  const policy = new RequestPolicy(LOCAL, () => 0);
  expect(policy.armCreation(approved)).toBe(true);
  return policy;
}

describe('the outgoing creation request', () => {
  it('matches when it carries exactly the approved values (any key or location order)', () => {
    expect(requestBodyProblems({ ...APPROVED }, APPROVED)).toEqual([]);
    const reordered = {
      dueDate: APPROVED.dueDate,
      locationIds: [...APPROVED.locationIds].reverse(),
      policyEnd: APPROVED.policyEnd,
      ownerId: APPROVED.ownerId!.toUpperCase(),
      clientId: APPROVED.clientId,
      policyStart: APPROVED.policyStart,
      type: 'NEW',
    };
    expect(requestBodyProblems(reordered, APPROVED)).toEqual([]);
  });

  it.each([
    [{ clientId: 'd'.repeat(24) }, ['clientId']],
    [{ type: 'EXISTING' }, ['type']],
    [{ policyStart: '2026-12-02' }, ['policyStart']],
    [{ policyEnd: '2027-12-31' }, ['policyEnd']],
    [{ dueDate: '2026-11-21' }, ['dueDate']],
    [{ ownerId: 'f'.repeat(24) }, ['ownerId']],
    [{ locationIds: ['1'.repeat(24)] }, ['locationIds']],
    [{ locationIds: ['1'.repeat(24), '1'.repeat(24)] }, ['locationIds']],
    [{ locationIds: ['1'.repeat(24), '3'.repeat(24)] }, ['locationIds']],
    [{ existingPolicy: null }, ['unexpected field']],
  ])('names the field that differs: %j', (change, fields) => {
    expect(requestBodyProblems({ ...APPROVED, ...change }, APPROVED)).toEqual(fields);
  });

  it('with no assignee approved, refuses a request that names one', () => {
    const unassigned = { ...APPROVED, ownerId: null };
    const { ownerId: _owner, ...withoutOwner } = APPROVED;
    expect(requestBodyProblems(withoutOwner, unassigned)).toEqual([]);
    expect(requestBodyProblems(APPROVED, unassigned)).toEqual(['ownerId']);
    expect(requestBodyProblems(withoutOwner, APPROVED)).toEqual(['ownerId']);
  });

  it('refuses a body that is not an object', () => {
    for (const body of [null, 'x', 1, []])
      expect(requestBodyProblems(body, APPROVED)).toEqual(['body']);
  });
});

describe('the network guard with an approved request', () => {
  it('lets the matching request through, once', () => {
    const policy = armed();
    expect(policy.evaluate('POST', CREATE, json(APPROVED))).toEqual({
      allow: true,
      creation: true,
    });
    expect(policy.checkHeaders({ 'Content-Type': 'application/json' })).toBe(true);
    expect(policy.evaluate('POST', CREATE, json(APPROVED)).allow).toBe(false);
  });

  it('cancels a request that differs, uses up the permit and says which fields differed', () => {
    const policy = armed();
    const sent = { ...APPROVED, clientId: 'd'.repeat(24), policyEnd: '2027-12-31' };
    expect(policy.evaluate('POST', CREATE, json(sent))).toEqual({ allow: false, creation: false });
    expect(policy.creationOutcome()).toEqual({
      state: 'rejected',
      reason: 'body-mismatch',
      fields: ['clientId', 'policyEnd'],
    });
    // The permit is gone: even the right request is now blocked.
    expect(policy.evaluate('POST', CREATE, json(APPROVED)).allow).toBe(false);
    expect(policy.blocked()).toBe(2);
  });

  it.each([
    ['no body', undefined],
    ['several parts', [...json(APPROVED), ...json(APPROVED)]],
    ['a file', [{ file: '/tmp/x' }]],
    ['a blob', [{ blobUUID: 'abc' }]],
    ['not JSON', [{ bytes: Buffer.from('type=NEW&clientId=x') }]],
    ['invalid UTF-8', [{ bytes: Buffer.from([0xff, 0xfe, 0x00]) }]],
  ])('cancels a body it cannot read (%s)', (_name, upload) => {
    const policy = armed();
    expect(policy.evaluate('POST', CREATE, upload).allow).toBe(false);
    expect(policy.creationOutcome()).toMatchObject({
      state: 'rejected',
      reason: 'body-unreadable',
    });
  });

  it('cancels the request before it is sent unless its Content-Type is JSON', () => {
    const policy = armed();
    expect(policy.evaluate('POST', CREATE, json(APPROVED)).allow).toBe(true);
    expect(policy.checkHeaders({ 'content-type': 'text/plain' })).toBe(false);
    expect(policy.creationOutcome()).toEqual({
      state: 'rejected',
      reason: 'content-type',
      fields: ['content-type'],
    });
    const ok = armed();
    ok.evaluate('POST', CREATE, json(APPROVED));
    expect(ok.checkHeaders({ 'Content-Type': 'application/json; charset=utf-8' })).toBe(true);
    expect(ok.creationOutcome()).toEqual({ state: 'sent' });
  });

  it('a withdrawn permit lets nothing through, and says whether it was unused', () => {
    const policy = armed();
    expect(policy.revoke()).toBe(true);
    expect(policy.creationOutcome()).toEqual({ state: 'revoked' });
    expect(policy.evaluate('POST', CREATE, json(APPROVED)).allow).toBe(false);
    const used = armed();
    used.evaluate('POST', CREATE, json(APPROVED));
    expect(used.revoke()).toBe(false);
  });

  it('a completion or failure after a rejection does not change the outcome', () => {
    const policy = armed();
    policy.evaluate('POST', CREATE, json({ ...APPROVED, type: 'EXISTING' }));
    policy.failed();
    policy.completed(201);
    expect(policy.creationOutcome()).toMatchObject({ state: 'rejected' });
  });
});

describe('the read-back of a created proposal', () => {
  const record: RecordFacts = {
    type: 'NEW',
    clientId: APPROVED.clientId,
    ownerId: APPROVED.ownerId!,
    locationIds: [...APPROVED.locationIds],
    policyStart: APPROVED.policyStart,
    policyEnd: APPROVED.policyEnd,
    dueDate: APPROVED.dueDate,
  };
  const statuses = (facts: RecordFacts, owner: string | null = APPROVED.ownerId) =>
    Object.fromEntries(
      checkRecord(facts, APPROVED, owner).map((check) => [check.field, check.status]),
    );

  it('verifies the client by id, the type, the dates, the assignee and the risk locations', () => {
    expect(statuses(record)).toEqual({
      type: 'verified',
      clientId: 'verified',
      locationIds: 'verified',
      ownerId: 'verified',
      policyStart: 'verified',
      policyEnd: 'verified',
      dueDate: 'verified',
    });
  });

  it('reports a different client id, assignee or set of locations as a mismatch', () => {
    expect(statuses({ ...record, clientId: 'd'.repeat(24) }).clientId).toBe('mismatch');
    expect(statuses({ ...record, ownerId: 'f'.repeat(24) }).ownerId).toBe('mismatch');
    expect(statuses({ ...record, locationIds: ['1'.repeat(24)] }).locationIds).toBe('mismatch');
  });

  it('reports what the record does not show as unverified, never as verified', () => {
    expect(statuses({ ...record, locationIds: null }).locationIds).toBe('unverified');
    expect(statuses({ ...record, ownerId: '' }).ownerId).toBe('unverified');
    expect(statuses(record, null).ownerId).toBe('unverified');
    expect(statuses({ ...record, clientId: '' }).clientId).toBe('unverified');
  });

  it('a look-up match needs the client, type and dates confirmed and nothing contradicted', () => {
    expect(recordMatches(record, APPROVED, APPROVED.ownerId)).toBe(true);
    expect(recordMatches({ ...record, locationIds: null }, APPROVED, null)).toBe(true);
    expect(recordMatches({ ...record, clientId: '' }, APPROVED, null)).toBe(false);
    expect(recordMatches({ ...record, ownerId: 'f'.repeat(24) }, APPROVED, APPROVED.ownerId)).toBe(
      false,
    );
  });
});
