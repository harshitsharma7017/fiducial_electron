// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the durable, allowlisted audit trail.
import { appendFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditRecord,
  FileAuditLog,
  readAuditLog,
} from '../../src/demo/portal-automation/main/audit-log';

const ATTEMPT = '0b5c3b7e-6a1f-4c55-9d1e-2f9a3c4b5d6e';
const NOW = new Date('2026-10-30T10:00:00.000Z');

function logFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'fqf-audit-')), 'audit.jsonl');
}

describe('the audit log', () => {
  it('writes one JSON line per event, durably, and reads them back in order', () => {
    const file = logFile();
    const log = new FileAuditLog(file, () => NOW);
    expect(log.record('attempt.created', { attemptId: ATTEMPT, clientId: 'c'.repeat(24) })).toBe(
      true,
    );
    expect(log.record('submission.refused', { attemptId: ATTEMPT, httpStatus: 400 })).toBe(true);
    expect(readAuditLog(file)).toEqual([
      {
        v: 1,
        ts: NOW.toISOString(),
        event: 'attempt.created',
        attemptId: ATTEMPT,
        clientId: 'c'.repeat(24),
      },
      {
        v: 1,
        ts: NOW.toISOString(),
        event: 'submission.refused',
        attemptId: ATTEMPT,
        httpStatus: 400,
      },
    ]);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('takes only allowlisted fields with constrained values: no names, cookies, dates or payloads', () => {
    const record = auditRecord(
      'submission.started',
      {
        attemptId: ATTEMPT,
        // Each of these is refused: free text where only codes, ids or field names are allowed.
        reason: 'Deccan Cold Chain LLP',
        reference: 'erp_session=abc123; Path=/',
        fields: ['policyStart', '2026-12-01'] as never,
        ...({ cookie: 'erp_session=abc', payload: { clientId: 'x' }, password: 'p' } as object),
      },
      NOW,
    );
    expect(record).toEqual({
      v: 1,
      ts: NOW.toISOString(),
      event: 'submission.started',
      attemptId: ATTEMPT,
      droppedFields: 6,
    });
  });

  it('skips a line a crash cut short, and keeps the lines before it', () => {
    const file = logFile();
    const log = new FileAuditLog(file, () => NOW);
    log.record('approval.granted', { attemptId: ATTEMPT });
    appendFileSync(file, '{"v":1,"ts":"2026-10-30T10:00:01.000Z","event":"submission.st');
    expect(readAuditLog(file).map((record) => record.event)).toEqual(['approval.granted']);
  });

  it('moves a full log aside (one older file is kept) and goes on writing', () => {
    const file = logFile();
    writeFileSync(file, `${'x'.repeat(5 * 1024 * 1024)}\n`);
    const log = new FileAuditLog(file, () => NOW);
    expect(log.record('approval.granted', { attemptId: ATTEMPT })).toBe(true);
    expect(statSync(file.replace(/\.jsonl$/, '.1.jsonl')).size).toBeGreaterThan(5_000_000);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('reports a write that failed, so the step it guards does not go on', () => {
    const log = new FileAuditLog(join(tmpdir(), 'fqf-no-such-folder', 'x', 'audit.jsonl'));
    expect(log.record('approval.granted', { attemptId: ATTEMPT })).toBe(false);
  });
});
