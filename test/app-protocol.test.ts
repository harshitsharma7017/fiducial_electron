// app:// confinement: only files inside the renderer folder can be served.
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mimeTypeFor, resolveAppAsset } from '../src/main/security/app-protocol';

const root = resolve('/srv/app/out/renderer');

describe('resolveAppAsset', () => {
  it('maps the root and assets inside the renderer folder', () => {
    expect(resolveAppAsset(root, 'app://fqf/')).toBe(join(root, 'index.html'));
    expect(resolveAppAsset(root, 'app://fqf/index.html')).toBe(join(root, 'index.html'));
    expect(resolveAppAsset(root, 'app://fqf/assets/index-abc.js?v=1#x')).toBe(
      join(root, 'assets', 'index-abc.js'),
    );
  });

  it.each([
    'app://fqf/..%2f..%2fpackage.json',
    'app://fqf/assets%2f..%2f..%2fmain%2findex.js',
    'app://fqf/..%5c..%5cpackage.json',
    'app://fqf/index.html%00.js',
    'app://fqf/%E0%A4%A',
    'app://other/index.html',
    'app://fqf.evil/index.html',
    'https://fqf/index.html',
    'file:///etc/hosts',
    'not a url',
  ])('rejects %s', (url) => {
    expect(resolveAppAsset(root, url)).toBeNull();
  });

  // WHATWG URL parsing treats "%2e%2e" path segments as ".." and normalises them before the
  // resolver runs, so such URLs map inside the root (and 404 at runtime) rather than escaping.
  it('never resolves outside the root, whatever the URL parser normalises', () => {
    for (const url of [
      'app://fqf/../main/index.js',
      'app://fqf/../../etc/passwd',
      'app://fqf/./a/../../b',
      'app://fqf/%2e%2e/%2e%2e/package.json',
    ]) {
      const resolved = resolveAppAsset(root, url);
      if (resolved !== null) expect(resolved.startsWith(root + sep)).toBe(true);
    }
  });
});

describe('mimeTypeFor', () => {
  it('serves known types only', () => {
    expect(mimeTypeFor('a/index.html')).toBe('text/html; charset=utf-8');
    expect(mimeTypeFor('a/x.JS')).toBe('text/javascript; charset=utf-8');
    expect(mimeTypeFor('a/x.exe')).toBeNull();
    expect(mimeTypeFor('a/noext')).toBeNull();
  });
});
