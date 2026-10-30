// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the durable creation-attempt store and
// its crash-safe writes.
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NODE_FILE_OPS,
  writeFileAtomic,
  type FileOps,
} from '../../src/demo/portal-automation/main/atomic-file';
import {
  AttemptStore,
  AttemptStoreError,
  fingerprintOf,
  summarise,
  type NewAttempt,
} from '../../src/demo/portal-automation/main/attempt-store';
import type { CreationPayload } from '../../src/demo/portal-automation/shared/creation-payload';

const PAYLOAD: CreationPayload = {
  type: 'NEW',
  clientId: 'c'.repeat(24),
  locationIds: ['1'.repeat(24), '2'.repeat(24)],
  ownerId: 'e'.repeat(24),
  policyStart: '2026-12-01',
  policyEnd: '2027-11-30',
  dueDate: '2026-11-20',
};
const NEW: NewAttempt = {
  portalOrigin: 'http://localhost:3100',
  type: 'NEW',
  clientId: PAYLOAD.clientId,
  clientName: 'Deccan Cold Chain LLP',
  payload: PAYLOAD,
};

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'fqf-attempts-'));
}

/** File operations whose rename can be made to fail, as a crash or a locked file would. */
function failingRename(): { ops: FileOps; fail: { now: boolean } } {
  const fail = { now: false };
  return {
    fail,
    ops: {
      ...NODE_FILE_OPS,
      renameSync: (from, to) => {
        if (fail.now) throw Object.assign(new Error('disk gone'), { code: 'EIO' });
        NODE_FILE_OPS.renameSync(from, to);
      },
    },
  };
}

describe('the attempt store', () => {
  it('writes every change to disk and reads it back in a new app run', () => {
    const file = join(folder(), 'attempts.json');
    const store = new AttemptStore({ file });
    const attempt = store.create(NEW);
    store.transition(attempt.id, 'AWAITING_APPROVAL');
    const reopened = new AttemptStore({ file });
    expect(reopened.problem).toBeNull();
    expect(reopened.get(attempt.id)).toMatchObject({
      state: 'AWAITING_APPROVAL',
      clientId: PAYLOAD.clientId,
      payload: PAYLOAD,
      fingerprint: fingerprintOf(PAYLOAD),
    });
    expect(reopened.get(attempt.id)!.history.map((entry) => entry.state)).toEqual([
      'PREPARED',
      'AWAITING_APPROVAL',
    ]);
  });

  it('keeps the file private to the user', () => {
    const file = join(folder(), 'attempts.json');
    new AttemptStore({ file }).create(NEW);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('refuses an invalid transition and leaves the attempt as it was', () => {
    const store = new AttemptStore({ file: null });
    const attempt = store.create(NEW);
    expect(() => store.transition(attempt.id, 'SUBMITTING')).toThrow(AttemptStoreError);
    expect(store.get(attempt.id)!.state).toBe('PREPARED');
  });

  it('a failed write leaves both the file and the attempt unchanged (atomic)', () => {
    const file = join(folder(), 'attempts.json');
    const { ops, fail } = failingRename();
    const store = new AttemptStore({ file, ops });
    const attempt = store.create(NEW);
    const before = readFileSync(file, 'utf8');
    fail.now = true;
    expect(() => store.transition(attempt.id, 'AWAITING_APPROVAL')).toThrow(
      'could not be recorded on disk',
    );
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(store.get(attempt.id)!.state).toBe('PREPARED');
    // No half-written temporary file is left behind.
    expect(readdirSync(join(file, '..'))).toEqual(['attempts.json']);
  });

  it('ignores and removes a temporary file a crash left; the last complete version counts', () => {
    const dir = folder();
    const file = join(dir, 'attempts.json');
    const attempt = new AttemptStore({ file }).create(NEW);
    writeFileSync(`${file}.tmp-123-abcd`, '{"version":1,"attempts":[{"trunc');
    const reopened = new AttemptStore({ file });
    expect(reopened.problem).toBeNull();
    expect(reopened.get(attempt.id)!.state).toBe('PREPARED');
    expect(readdirSync(dir)).toEqual(['attempts.json']);
  });

  it('an unreadable store is kept aside, and creation is refused for this app run', () => {
    const dir = folder();
    const file = join(dir, 'attempts.json');
    writeFileSync(file, '{"version":1,"attempts":[{"id":');
    const store = new AttemptStore({ file });
    expect(store.problem).toMatch(/could not be read/);
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(dir).some((name) => name.startsWith('attempts.json.unreadable-'))).toBe(
      true,
    );
    // A store that does not match the schema counts as unreadable too.
    writeFileSync(file, JSON.stringify({ version: 1, attempts: [{ id: 'x' }] }));
    expect(new AttemptStore({ file }).problem).not.toBeNull();
  });

  it('writeFileAtomic replaces the whole file or nothing', () => {
    const dir = folder();
    const file = join(dir, 'data.json');
    writeFileAtomic(file, 'first');
    const { ops, fail } = failingRename();
    fail.now = true;
    expect(() => writeFileAtomic(file, 'second', ops)).toThrow('disk gone');
    expect(readFileSync(file, 'utf8')).toBe('first');
    expect(readdirSync(dir)).toEqual(['data.json']);
    writeFileAtomic(file, 'third');
    expect(readFileSync(file, 'utf8')).toBe('third');
  });

  it('restores after a restart: in flight → reconciliation required, not yet sent → cancelled', () => {
    const file = join(folder(), 'attempts.json');
    const store = new AttemptStore({ file });
    const reviewed = store.create(NEW);
    store.transition(reviewed.id, 'AWAITING_APPROVAL');
    const sending = store.create(NEW);
    store.transition(sending.id, 'AWAITING_APPROVAL');
    store.transition(sending.id, 'APPROVED');
    store.transition(sending.id, 'SUBMITTING', { submittedAt: '2026-10-30T10:00:00.000Z' });

    const restarted = new AttemptStore({ file });
    const changed = restarted.restoreAfterRestart();
    expect(changed.map((attempt) => [attempt.id, attempt.state])).toEqual([
      [reviewed.id, 'CANCELLED'],
      [sending.id, 'RECONCILIATION_REQUIRED'],
    ]);
    expect(new AttemptStore({ file }).get(sending.id)).toMatchObject({
      state: 'RECONCILIATION_REQUIRED',
      submittedAt: '2026-10-30T10:00:00.000Z',
    });
    expect(restarted.unresolved().map((attempt) => attempt.id)).toEqual([sending.id]);
    // A second start changes nothing more.
    expect(new AttemptStore({ file }).restoreAfterRestart()).toEqual([]);
  });

  it('keeps nothing beyond identifiers, dates and states: no session, contact or form data', () => {
    const file = join(folder(), 'attempts.json');
    const store = new AttemptStore({ file });
    const attempt = store.create(NEW);
    store.transition(attempt.id, 'AWAITING_APPROVAL');
    const text = readFileSync(file, 'utf8');
    for (const forbidden of ['erp_session', 'password', 'example.test', 'Demo Admin', 'Peenya']) {
      expect(text).not.toContain(forbidden);
    }
    const stored = JSON.parse(text) as { attempts: object[] };
    expect(Object.keys(stored.attempts[0]!).sort()).toEqual(
      [
        'approvedAt',
        'clientId',
        'clientName',
        'completedAt',
        'createdAt',
        'fingerprint',
        'history',
        'id',
        'lastReconciledAt',
        'payload',
        'portalOrigin',
        'reconciliation',
        'result',
        'state',
        'submittedAt',
        'type',
        'version',
      ].sort(),
    );
  });

  it('lets an attempt be marked not created only after a look-up found no single match', () => {
    const store = new AttemptStore({ file: null });
    const attempt = store.create(NEW);
    for (const to of ['AWAITING_APPROVAL', 'APPROVED', 'SUBMITTING', 'UNCERTAIN'] as const) {
      store.transition(attempt.id, to);
    }
    expect(summarise(store.get(attempt.id)!).canMarkNotCreated).toBe(false);
    const at = '2026-10-30T10:00:00.000Z';
    store.note(attempt.id, { reconciliation: { outcome: 'failed', at, candidates: [] } });
    expect(summarise(store.get(attempt.id)!).canMarkNotCreated).toBe(false);
    store.note(attempt.id, { reconciliation: { outcome: 'none', at, candidates: [] } });
    expect(summarise(store.get(attempt.id)!)).toMatchObject({
      unresolved: true,
      canMarkNotCreated: true,
    });
  });
});
