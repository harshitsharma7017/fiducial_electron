// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The approved creation request: the exact data the user reviewed, by identifier. The portal's form
// sends it as JSON to POST /api/proxy/proposals (Fiducial_frontend new-proposal-form.tsx and
// CreateProposalRequestSchema; the live API description documents the same fields). The network
// guard compares the outgoing request with it, the attempt store keeps it for recovery, and the
// read-back and the recovery look-up compare the portal's record with it. Pure, no Node.js.

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ProposalType = 'NEW' | 'EXISTING';

export interface CreationPayload {
  type: ProposalType;
  clientId: string;
  /** The ticked risk locations, sorted (the order on the form is not significant). */
  locationIds: string[];
  /** The assigned staff member; null when the form sends none (the portal assigns the creator). */
  ownerId: string | null;
  policyStart: string;
  policyEnd: string;
  dueDate: string;
}

/** Every field the creation request may carry; anything else is refused. */
export const CREATION_FIELDS = [
  'type',
  'clientId',
  'locationIds',
  'ownerId',
  'policyStart',
  'policyEnd',
  'dueDate',
] as const;

export type CreationField = (typeof CREATION_FIELDS)[number];

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

/** The payload in its one canonical form: ids lower-cased, locations sorted. */
export function normalisePayload(payload: CreationPayload): CreationPayload {
  return {
    type: payload.type,
    clientId: payload.clientId.toLowerCase(),
    locationIds: payload.locationIds.map((id) => id.toLowerCase()).sort(),
    ownerId: payload.ownerId === null ? null : payload.ownerId.toLowerCase(),
    policyStart: payload.policyStart,
    policyEnd: payload.policyEnd,
    dueDate: payload.dueDate,
  };
}

/** A stable text of the payload (fixed key order), for its fingerprint. */
export function canonicalPayload(payload: CreationPayload): string {
  const p = normalisePayload(payload);
  return JSON.stringify([
    p.type,
    p.clientId,
    p.locationIds,
    p.ownerId,
    p.policyStart,
    p.policyEnd,
    p.dueDate,
  ]);
}

/** Whether a value is a well-formed payload (used when reading the attempt store back). */
export function isCreationPayload(value: unknown): value is CreationPayload {
  if (value === null || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    (p['type'] === 'NEW' || p['type'] === 'EXISTING') &&
    isObjectId(p['clientId']) &&
    Array.isArray(p['locationIds']) &&
    p['locationIds'].every(isObjectId) &&
    (p['ownerId'] === null || isObjectId(p['ownerId'])) &&
    typeof p['policyStart'] === 'string' &&
    ISO_DATE.test(p['policyStart']) &&
    typeof p['policyEnd'] === 'string' &&
    ISO_DATE.test(p['policyEnd']) &&
    typeof p['dueDate'] === 'string' &&
    ISO_DATE.test(p['dueDate'])
  );
}

function sameIdSet(actual: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  if (!actual.every(isObjectId)) return false;
  const seen = new Set(actual.map((id) => id.toLowerCase()));
  return seen.size === actual.length && expected.every((id) => seen.has(id.toLowerCase()));
}

function sameId(actual: unknown, expected: string): boolean {
  return isObjectId(actual) && actual.toLowerCase() === expected.toLowerCase();
}

/**
 * The fields of an outgoing creation request body that differ from the approved payload, by name
 * only (never values). An unknown field is reported as "unexpected field". Empty: it matches.
 */
export function requestBodyProblems(body: unknown, approved: CreationPayload): string[] {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return ['body'];
  const sent = body as Record<string, unknown>;
  const problems: string[] = [];
  if (Object.keys(sent).some((key) => !(CREATION_FIELDS as readonly string[]).includes(key))) {
    problems.push('unexpected field');
  }
  if (sent['type'] !== approved.type) problems.push('type');
  if (!sameId(sent['clientId'], approved.clientId)) problems.push('clientId');
  if (!sameIdSet(sent['locationIds'], approved.locationIds)) problems.push('locationIds');
  // No assignee approved: the request must not name one (the portal then assigns the creator).
  const owner = sent['ownerId'];
  if (
    approved.ownerId === null
      ? owner !== undefined && owner !== null
      : !sameId(owner, approved.ownerId)
  ) {
    problems.push('ownerId');
  }
  for (const field of ['policyStart', 'policyEnd', 'dueDate'] as const) {
    if (sent[field] !== approved[field]) problems.push(field);
  }
  return problems;
}

/** One checked field of a proposal read back from the portal. */
export type FieldCheck = 'verified' | 'mismatch' | 'unverified';

/** What the portal returned for a proposal, as far as the checks need it. */
export interface RecordFacts {
  type: string;
  clientId: string;
  ownerId: string;
  /** Null when the record did not list its locations. */
  locationIds: string[] | null;
  policyStart: string | null;
  policyEnd: string | null;
  dueDate: string;
}

export interface RecordCheck {
  field: CreationField;
  label: string;
  status: FieldCheck;
}

const LABELS: Record<CreationField, string> = {
  type: 'Type of case',
  clientId: 'Client (by identifier)',
  locationIds: 'Risk locations',
  ownerId: 'Assigned to',
  policyStart: 'Policy period from',
  policyEnd: 'Policy period to',
  dueDate: 'Quotes needed by',
};

/**
 * Compares a record with the approved payload, field by field. `expectedOwner` is the approved
 * assignee, or the signed-in user when the request named none (null: not known, so unverified).
 */
export function checkRecord(
  record: RecordFacts,
  approved: CreationPayload,
  expectedOwner: string | null,
): RecordCheck[] {
  const check = (field: CreationField, status: FieldCheck): RecordCheck => ({
    field,
    label: LABELS[field],
    status,
  });
  const equal = (field: CreationField, actual: unknown, expected: unknown) =>
    check(
      field,
      actual === '' || actual === null
        ? 'unverified'
        : actual === expected
          ? 'verified'
          : 'mismatch',
    );
  return [
    equal('type', record.type, approved.type),
    check(
      'clientId',
      record.clientId === ''
        ? 'unverified'
        : sameId(record.clientId, approved.clientId)
          ? 'verified'
          : 'mismatch',
    ),
    check(
      'locationIds',
      record.locationIds === null
        ? 'unverified'
        : sameIdSet(record.locationIds, approved.locationIds)
          ? 'verified'
          : 'mismatch',
    ),
    check(
      'ownerId',
      record.ownerId === '' || expectedOwner === null
        ? 'unverified'
        : sameId(record.ownerId, expectedOwner)
          ? 'verified'
          : 'mismatch',
    ),
    equal('policyStart', record.policyStart, approved.policyStart),
    equal('policyEnd', record.policyEnd, approved.policyEnd),
    equal('dueDate', record.dueDate, approved.dueDate),
  ];
}

/** Whether a record could be this payload's: every field it shows agrees, none differs. */
export function recordMatches(
  record: RecordFacts,
  approved: CreationPayload,
  expectedOwner: string | null,
): boolean {
  const checks = checkRecord(record, approved, expectedOwner);
  // The client, the type and the dates must be confirmed, not merely "not contradicted".
  const essential: CreationField[] = ['type', 'clientId', 'policyStart', 'policyEnd', 'dueDate'];
  return (
    checks.every((item) => item.status !== 'mismatch') &&
    essential.every((field) => checks.find((item) => item.field === field)?.status === 'verified')
  );
}
