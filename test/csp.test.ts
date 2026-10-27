// SEC-06: app-owned UI gets a restrictive CSP.
import { describe, expect, it } from 'vitest';
import { developmentCsp, PRODUCTION_CSP } from '../src/main/security/csp';

function directives(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

describe('production CSP', () => {
  const d = directives(PRODUCTION_CSP);
  it('denies by default and allows only the app itself', () => {
    expect(d['default-src']).toEqual(["'none'"]);
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'none'"]);
    expect(d['frame-ancestors']).toEqual(["'none'"]);
    expect(d['form-action']).toEqual(["'none'"]);
  });
  it('has no inline code, eval or remote sources', () => {
    expect(PRODUCTION_CSP).not.toMatch(/unsafe-inline|unsafe-eval|https?:|ws:|\*/);
  });
});

describe('development CSP', () => {
  it('is limited to the given loopback dev-server origin', () => {
    const csp = developmentCsp('http://localhost:5173');
    const d = directives(csp);
    expect(d['default-src']).toEqual(["'none'"]);
    expect(d['connect-src']).toEqual(['http://localhost:5173', 'ws://localhost:5173']);
    expect(csp).not.toMatch(/unsafe-eval|\*/);
  });
});
