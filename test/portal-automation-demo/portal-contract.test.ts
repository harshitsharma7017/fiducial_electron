// DEMO ONLY — TEMPORARY FEATURE (portal automation demo): the portal API contract the full
// workflow relies on, checked against a trimmed copy of the live portal's public API description
// (live-openapi-proposals.json), and the in-page agent's use of it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portalPageAgent } from '../../src/demo/portal-automation/page/page-agent';
import {
  contractProblems,
  LOOKUP_PAGE_SIZE,
} from '../../src/demo/portal-automation/shared/portal-contract';

type Json = Record<string, unknown>;

function liveDocument(): Json {
  return JSON.parse(readFileSync(join(__dirname, 'live-openapi-proposals.json'), 'utf8')) as Json;
}

/** The object at a path of keys in the document (the test edits it in place). */
function at(value: Json, ...keys: string[]): Json {
  return keys.reduce((node, key) => node[key] as Json, value);
}

const JSON_SCHEMA = ['content', 'application/json', 'schema'];
const CREATE = ['paths', '/api/v1/proposals', 'post'];

describe('the portal API contract', () => {
  it('matches the live portal’s published API description', () => {
    expect(contractProblems(liveDocument())).toEqual([]);
  });

  it('notices a changed creation request', () => {
    const doc = liveDocument();
    const request = at(doc, ...CREATE, 'requestBody', ...JSON_SCHEMA);
    at(request, 'properties')['branchId'] = { type: 'string' };
    request['required'] = [...(request['required'] as string[]), 'branchId'];
    delete at(request, 'properties')['dueDate'];
    const problems = contractProblems(doc);
    expect(problems).toContain('The creation request no longer takes dueDate.');
    expect(problems).toContain('The creation request now takes branchId.');
    expect(
      problems.some((problem) => problem.startsWith('The creation request now requires')),
    ).toBe(true);
  });

  it('notices a creation answer the read-back could not use', () => {
    const doc = liveDocument();
    const created = at(doc, ...CREATE, 'responses');
    delete at(created, '201', ...JSON_SCHEMA, 'properties')['reference'];
    expect(contractProblems(doc)).toContain('The creation answer has no reference.');
    delete created['201'];
    expect(contractProblems(doc)).toContain('Creating a proposal no longer answers 201.');
  });

  it('notices a missing read-only view or a smaller proposals page', () => {
    const doc = liveDocument();
    delete at(doc, 'paths')['/api/v1/proposals/{id}'];
    const parameters = at(doc, 'paths', '/api/v1/proposals', 'get')['parameters'] as Json[];
    const limit = parameters.find((parameter) => parameter['name'] === 'limit')!;
    at(limit, 'schema')['maximum'] = 50;
    const problems = contractProblems(doc);
    expect(problems).toContain('GET /api/v1/proposals/{id} (read a proposal) is not documented.');
    expect(problems).toContain('The proposals list no longer returns 100 at a time.');
  });

  it('refuses anything that is not an OpenAPI 3 document', () => {
    expect(contractProblems({})).toEqual(['This is not an OpenAPI 3 document.']);
    expect(contractProblems('<html>')).toEqual(['This is not an OpenAPI 3 document.']);
  });

  it('is what the in-page agent reads: the documented page size, through the portal’s own layer', () => {
    const agent = portalPageAgent.toString();
    expect(agent).toContain(`/api/proxy/proposals?limit=${LOOKUP_PAGE_SIZE}`);
    expect(agent).not.toMatch(/\/api\/v1\//);
  });
});
