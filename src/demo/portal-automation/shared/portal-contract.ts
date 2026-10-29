// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// What the full workflow relies on in the portal's API, checked against the portal's own published
// API description (OpenAPI 3.1, GET /api/openapi.json, public). Pure: the release check
// (tools/check-live-contract.mjs) fetches the document and passes it in. The integration itself
// never calls these endpoints directly: the portal's form sends the creation request through its
// /api/proxy/<path> layer, which forwards to /api/v1/<path>.
//
// Self-contained (no imports), so the release check can load it with Node alone.

/** The fields the creation request may carry (the portal's form builds it). */
const CREATE_FIELDS = [
  'type',
  'clientId',
  'locationIds',
  'ownerId',
  'policyStart',
  'policyEnd',
  'dueDate',
];
const CREATE_REQUIRED = ['clientId', 'locationIds', 'policyStart', 'policyEnd', 'dueDate'];
/** What the read-back and the recovery look-up read from a proposal (page/page-agent.ts). */
const RECORD_FIELDS = [
  'id',
  'reference',
  'type',
  'stage',
  'client',
  'owner',
  'policyStart',
  'policyEnd',
  'dueDate',
  'createdAt',
];
/** How many proposals the recovery look-up reads at once. */
export const LOOKUP_PAGE_SIZE = 100;

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonSchema(holder: unknown): Json {
  return obj(obj(obj(obj(holder)['content'])['application/json'])['schema']);
}

function operation(doc: Json, path: string, method: string): Json | null {
  const found = obj(obj(doc['paths'])[path])[method];
  return found === undefined ? null : obj(found);
}

function missing(schema: Json, fields: readonly string[]): string[] {
  const properties = obj(schema['properties']);
  return fields.filter((field) => !(field in properties));
}

/** A proposal record as the read-back needs it. Returns problems, prefixed with `where`. */
function recordProblems(schema: Json, where: string): string[] {
  const problems: string[] = [];
  const absent = missing(schema, RECORD_FIELDS);
  if (absent.length > 0) problems.push(`${where} has no ${absent.join(', ')}.`);
  const properties = obj(schema['properties']);
  if (!list(obj(properties['stage'])['enum']).includes('DRAFT')) {
    problems.push(`${where}: a new proposal's DRAFT stage is not documented.`);
  }
  if (!('name' in obj(obj(properties['client'])['properties']))) {
    problems.push(`${where}: the client has no name.`);
  }
  return problems;
}

/**
 * Compares the portal's API description with what the full workflow relies on. Returns each
 * difference; an empty list means the documented contract still matches.
 */
export function contractProblems(document: unknown): string[] {
  const doc = obj(document);
  if (typeof doc['openapi'] !== 'string' || !doc['openapi'].startsWith('3.')) {
    return ['This is not an OpenAPI 3 document.'];
  }
  const problems: string[] = [];

  const create = operation(doc, '/api/v1/proposals', 'post');
  if (!create) {
    problems.push('POST /api/v1/proposals (create a proposal) is not documented.');
  } else {
    const request = jsonSchema(create['requestBody']);
    const fields = Object.keys(obj(request['properties']));
    const extra = fields.filter((field) => !CREATE_FIELDS.includes(field));
    const absent = CREATE_FIELDS.filter((field) => !fields.includes(field));
    if (absent.length > 0)
      problems.push(`The creation request no longer takes ${absent.join(', ')}.`);
    if (extra.length > 0) problems.push(`The creation request now takes ${extra.join(', ')}.`);
    const required = list(request['required']).filter((v): v is string => typeof v === 'string');
    if ([...required].sort().join() !== [...CREATE_REQUIRED].sort().join()) {
      problems.push(`The creation request now requires ${required.join(', ') || 'nothing'}.`);
    }
    if (!list(obj(obj(request['properties'])['type'])['enum']).includes('EXISTING')) {
      problems.push('The creation request no longer takes a renewal (type EXISTING).');
    }
    const responses = obj(create['responses']);
    if (!('201' in responses)) {
      problems.push('Creating a proposal no longer answers 201.');
    } else {
      problems.push(...recordProblems(jsonSchema(responses['201']), 'The creation answer'));
    }
  }

  const read = operation(doc, '/api/v1/proposals/{id}', 'get');
  if (!read) {
    problems.push('GET /api/v1/proposals/{id} (read a proposal) is not documented.');
  } else {
    problems.push(...recordProblems(jsonSchema(obj(read['responses'])['200']), 'A proposal read'));
  }

  const browse = operation(doc, '/api/v1/proposals', 'get');
  if (!browse) {
    problems.push('GET /api/v1/proposals (the proposals list) is not documented.');
  } else {
    const limit = list(browse['parameters'])
      .map(obj)
      .find((parameter) => parameter['name'] === 'limit' && parameter['in'] === 'query');
    const maximum = obj(limit?.['schema'])['maximum'];
    if (!limit || (typeof maximum === 'number' && maximum < LOOKUP_PAGE_SIZE)) {
      problems.push(`The proposals list no longer returns ${LOOKUP_PAGE_SIZE} at a time.`);
    }
    const items = obj(obj(jsonSchema(obj(browse['responses'])['200'])['properties'])['items']);
    problems.push(...recordProblems(obj(items['items']), 'A proposals list item'));
  }

  const me = operation(doc, '/api/v1/auth/me', 'get');
  const meSchema = jsonSchema(obj(me?.['responses'])['200']);
  const meAbsent = missing(meSchema, ['name', 'permissions']);
  if (!me || meAbsent.length > 0) {
    problems.push('GET /api/v1/auth/me no longer gives the signed-in name and permissions.');
  }
  return problems;
}
