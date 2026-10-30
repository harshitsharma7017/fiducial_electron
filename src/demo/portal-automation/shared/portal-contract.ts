// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// What the full workflow relies on in the portal's API (the creation request, the read-back, the
// client and risk-location ids, the duplicate check and the look-ups), checked against the portal's own published
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
  const client = obj(obj(properties['client'])['properties']);
  if (!('name' in client)) problems.push(`${where}: the client has no name.`);
  if (!('id' in client)) problems.push(`${where}: the client has no id.`);
  if (!('id' in obj(obj(properties['owner'])['properties']))) {
    problems.push(`${where}: the assignee (owner) has no id.`);
  }
  const location = obj(obj(obj(properties['locations'])['items'])['properties']);
  if (!('locationId' in location)) {
    problems.push(`${where}: the risk locations have no locationId.`);
  }
  return problems;
}

function queryParameter(op: Json, name: string): Json | undefined {
  return list(op['parameters'])
    .map(obj)
    .find((parameter) => parameter['name'] === name && parameter['in'] === 'query');
}

/** A cursor-paged list (items plus nextCursor) of up to LOOKUP_PAGE_SIZE whose items have `fields`. */
function pagedListProblems(op: Json | null, label: string, fields: readonly string[]): string[] {
  if (!op) return [`${label} is not documented.`];
  const problems: string[] = [];
  const limit = queryParameter(op, 'limit');
  const maximum = obj(limit?.['schema'])['maximum'];
  if (!limit || (typeof maximum === 'number' && maximum < LOOKUP_PAGE_SIZE)) {
    problems.push(`${label} no longer returns ${LOOKUP_PAGE_SIZE} at a time.`);
  }
  if (!queryParameter(op, 'cursor')) problems.push(`${label} can no longer be paged (cursor).`);
  const page = obj(jsonSchema(obj(op['responses'])['200'])['properties']);
  if (!('nextCursor' in page)) problems.push(`${label} no longer gives a nextCursor.`);
  const absent = missing(obj(obj(page['items'])['items']), fields);
  if (absent.length > 0) problems.push(`${label}: its items have no ${absent.join(', ')}.`);
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
    if (!queryParameter(browse, 'clientId')) {
      problems.push('The proposals list can no longer be filtered by client (clientId).');
    }
  }

  // The client, its risk locations and the duplicate check are identified by id (runner.ts).
  const clients = operation(doc, '/api/v1/clients', 'get');
  problems.push(
    ...pagedListProblems(clients, 'GET /api/v1/clients (the client master)', [
      'id',
      'name',
      'gstin',
    ]),
  );
  if (clients && !queryParameter(clients, 'q')) {
    problems.push('The client master can no longer be searched by name (q).');
  }
  problems.push(
    ...pagedListProblems(
      operation(doc, '/api/v1/clients/{id}/locations', 'get'),
      'GET /api/v1/clients/{id}/locations (a client’s risk locations)',
      ['id', 'name'],
    ),
  );

  const me = operation(doc, '/api/v1/auth/me', 'get');
  const meSchema = jsonSchema(obj(me?.['responses'])['200']);
  const meAbsent = missing(meSchema, ['id', 'name', 'permissions']);
  if (!me || meAbsent.length > 0) {
    problems.push('GET /api/v1/auth/me no longer gives the signed-in id, name and permissions.');
  }
  return problems;
}
