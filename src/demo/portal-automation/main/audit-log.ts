// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The durable audit trail of proposal creation (<userData>/portal-automation/audit.jsonl): one JSON
// line per event, flushed to disk before the step goes on. Like the app's logger, it takes only
// allowlisted events and fields with constrained values: identifiers, states, status codes, short
// reason codes and field names. There is no free-text field, so credentials, cookies, names,
// dates, payloads or portal messages cannot reach it. A field that does not fit is dropped and
// counted. At 5 MiB the log moves to audit.1.jsonl (one older file is kept).
import { existsSync, readFileSync, renameSync, statSync } from 'node:fs';
import { z } from 'zod';
import { ATTEMPT_STATES } from '../shared/attempt-state';
import { CREATION_FIELDS } from '../shared/creation-payload';
import { appendDurable, NODE_FILE_OPS, type FileOps } from './atomic-file';

export const AUDIT_FILE = 'audit.jsonl';
const ROTATE_AT_BYTES = 5 * 1024 * 1024;

export const AUDIT_EVENTS = [
  'attempt.created',
  'review.completed',
  'approval.granted',
  'attempt.cancelled',
  'submission.started',
  'submission.accepted',
  'submission.refused',
  'submission.not-sent',
  'verification.completed',
  'result.uncertain',
  'recovery.restored',
  'recovery.reconciled',
  'recovery.resolved',
  'store.unreadable',
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

const OBJECT_ID = z.string().regex(/^[0-9a-f]{24}$/i);
const CODE = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);

const FIELD_SCHEMAS = {
  attemptId: z.string().regex(/^[0-9a-f-]{36}$/),
  state: z.enum(ATTEMPT_STATES),
  from: z.enum(ATTEMPT_STATES),
  clientId: OBJECT_ID,
  /** The first 16 hex digits of the approved request's SHA-256. */
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  httpStatus: z.number().int().min(100).max(599),
  proposalId: OBJECT_ID,
  reference: z.string().regex(/^[A-Z0-9][A-Z0-9/_-]{0,39}$/),
  reason: CODE,
  /** Names of fields (never values) that differed or could not be verified. */
  fields: z.array(z.enum([...CREATION_FIELDS, 'unexpected field', 'body', 'content-type'])).max(12),
  verification: z.enum(['complete', 'partial', 'mismatch', 'unverified']),
  outcome: z.enum(['found', 'none', 'several', 'failed']),
  count: z.number().int().min(0).max(1000),
} as const;

export type AuditFields = {
  [K in keyof typeof FIELD_SCHEMAS]?: z.infer<(typeof FIELD_SCHEMAS)[K]>;
};

export interface AuditRecord {
  v: 1;
  ts: string;
  event: AuditEvent;
  droppedFields?: number;
  [field: string]: unknown;
}

/** Where the runner records what happened. */
export interface AuditTrail {
  /** Writes one record; false if it could not be written durably. */
  record(event: AuditEvent, fields?: AuditFields): boolean;
}

export const NO_AUDIT: AuditTrail = { record: () => true };

/** Shortens a fingerprint for the log. */
export function shortFingerprint(fingerprint: string | null): string | undefined {
  return fingerprint ? fingerprint.slice(0, 16) : undefined;
}

export function auditRecord(event: AuditEvent, fields: AuditFields, now: Date): AuditRecord {
  const record: AuditRecord = { v: 1, ts: now.toISOString(), event };
  let dropped = 0;
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (value === undefined) continue;
    const schema = (FIELD_SCHEMAS as Record<string, z.ZodType>)[key];
    if (schema?.safeParse(value).success) record[key] = value;
    else dropped += 1;
  }
  if (dropped > 0) record.droppedFields = dropped;
  return record;
}

export class FileAuditLog implements AuditTrail {
  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
    private readonly ops: FileOps = NODE_FILE_OPS,
  ) {}

  record(event: AuditEvent, fields: AuditFields = {}): boolean {
    if (!(AUDIT_EVENTS as readonly string[]).includes(event)) return false;
    try {
      this.rotate();
      appendDurable(
        this.file,
        `${JSON.stringify(auditRecord(event, fields, this.now()))}\n`,
        this.ops,
      );
      return true;
    } catch {
      return false;
    }
  }

  private rotate(): void {
    if (existsSync(this.file) && statSync(this.file).size >= ROTATE_AT_BYTES) {
      renameSync(this.file, this.file.replace(/\.jsonl$/, '.1.jsonl'));
    }
  }
}

/** Reads an audit file; a line cut short by a crash is skipped. */
export function readAuditLog(file: string): AuditRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line): AuditRecord[] => {
      if (line.trim() === '') return [];
      try {
        const value = JSON.parse(line) as unknown;
        return value !== null && typeof value === 'object' ? [value as AuditRecord] : [];
      } catch {
        return [];
      }
    });
}
