// TC-23 decision logic: renderer-initiated navigation only to registered origins.
import { describe, expect, it } from 'vitest';
import { isNavigationAllowed } from '../src/main/security/navigation-policy';
import { devServerOrigin, originOf } from '../src/main/security/origins';

const appOnly = new Set(['app://fqf']);

describe('isNavigationAllowed', () => {
  it('allows the app origin', () => {
    expect(isNavigationAllowed(appOnly, 'app://fqf/index.html#/history')).toBe(true);
  });

  it.each([
    'https://example.com/',
    'http://localhost:5173/',
    'file:///etc/hosts',
    'app://fqf.evil/index.html',
    'app://other/index.html',
    'javascript:alert(1)',
    'data:text/html,<p>x</p>',
    'about:blank',
    'not a url',
    '',
  ])('blocks %s', (url) => {
    expect(isNavigationAllowed(appOnly, url)).toBe(false);
  });

  it('blocks everything for a webContents with no registered origins', () => {
    expect(isNavigationAllowed(new Set(), 'app://fqf/index.html')).toBe(false);
  });
});

describe('origin helpers', () => {
  it('derives scheme//host origins, including for app://', () => {
    expect(originOf('app://fqf/a/b?c#d')).toBe('app://fqf');
    expect(originOf('https://Example.com:8443/x')).toBe('https://example.com:8443');
    expect(originOf('file:///etc/hosts')).toBeNull();
  });

  it('accepts only loopback dev-server URLs', () => {
    expect(devServerOrigin('http://localhost:5173/')).toBe('http://localhost:5173');
    expect(devServerOrigin('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
    expect(devServerOrigin('https://evil.example/')).toBeNull();
    expect(devServerOrigin('http://localhost.evil.example/')).toBeNull();
    expect(devServerOrigin('file:///tmp/index.html')).toBeNull();
    expect(devServerOrigin(undefined)).toBeNull();
  });
});
