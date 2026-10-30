// The temporary portal automation demo (src/demo/portal-automation/) is kept out of the product:
// it is loaded only in development builds, never by a packaged app, and live proposal creation is
// off (docs/ACTUAL_PRODUCT_STATUS_AUDIT.md §9). The built output is checked by scripts/smoke.mjs
// and scripts/check-package.mjs with the same markers.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_MARKERS, demoMarkersIn } from '../scripts/demo-markers.mjs';
import {
  LIVE_PROPOSAL_CREATION,
  decideMode,
} from '../src/demo/portal-automation/shared/environment';
import { portalOrigin } from '../src/demo/portal-automation/shared/flag';

const root = join(__dirname, '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');

function sources(dir: string, skip: RegExp | null = null): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
    .map((file) => join(dir, file).replaceAll('\\', '/'))
    .filter((file) => /\.(ts|tsx|css|html)$/.test(file) && !(skip && skip.test(file)));
}

describe('the portal demo in the product', () => {
  it('is loaded by main only in a development build, never by a packaged app', () => {
    const main = read('src/main/index.ts');
    // No static import: the production bundle cannot pull the demo in.
    expect(main).not.toMatch(/^import[^;]*from '\.\.\/demo\//m);
    const references = main.match(/\.\.\/demo\/[^'"]+/g) ?? [];
    expect(references).toEqual(['../demo/portal-automation/main/register']);
    expect(main).toMatch(
      /if \(import\.meta\.env\.DEV && !app\.isPackaged\) \{\s+try \{\s+const \{ registerPortalDemo \} = await import\('\.\.\/demo\/portal-automation\/main\/register'\);/,
    );
  });

  it('exposes its bridge from the preload only in a development build', () => {
    const preload = read('src/preload/index.ts');
    const calls = preload.match(/^.*exposePortalDemo\(.*$/gm) ?? [];
    expect(calls).toEqual(['if (import.meta.env.DEV) exposePortalDemo(process.env);']);
  });

  it('adds its launcher to the home screen only in a development build', () => {
    const app = read('src/renderer/src/App.tsx');
    expect(app).not.toMatch(/^import[^;]*demo\/portal-automation/m);
    expect(app).toMatch(
      /const PortalDemoGate =\s+import\.meta\.env\.DEV && window\.fqfPortalDemo\s+\? lazy\(\(\) =>\s+import\('\.\.\/\.\.\/demo\/portal-automation\/renderer\/PortalDemo'\)/,
    );
  });

  it('ships with live proposal creation off, whatever the environment says', () => {
    expect(LIVE_PROPOSAL_CREATION).toBe('off');
    const env = {
      ENABLE_PORTAL_AUTOMATION_DEMO: '1',
      PORTAL_AUTOMATION_FULL_WORKFLOW: '1',
      PORTAL_AUTOMATION_DEMO_URL: 'https://fiducial.spirezen.tech',
      LIVE_PROPOSAL_CREATION: 'verification',
    };
    expect(decideMode(env, portalOrigin(env))).toMatchObject({
      mode: 'fill-only',
      environment: { kind: 'production', creation: 'off' },
    });
  });
});

describe('the demo markers the build checks look for', () => {
  it('are all in the demo’s own code, so its code cannot be in a build unnoticed', () => {
    const demo = sources('src/demo/portal-automation', /\/tools\//)
      .map(read)
      .join('\n');
    expect(demoMarkersIn(demo)).toEqual([...DEMO_MARKERS]);
  });

  it('are in none of the product’s own code, so a build without the demo has none', () => {
    const product = [
      ...sources('src/main'),
      ...sources('src/preload'),
      ...sources('src/shared'),
      // The development-only screens are dropped from production builds too.
      ...sources('src/renderer', /\/dev\//),
    ].filter((file) => file !== 'src/main/env.d.ts');
    // Code only: comments (which builds drop) may name the demo's settings.
    const code = (file: string) =>
      read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const found = product
      .map((file) => ({ file, markers: demoMarkersIn(code(file)) }))
      .filter((hit) => hit.markers.length > 0);
    // Only the renderer names the demo's bridge, inside the development-build branch tested above.
    expect(found).toEqual([{ file: 'src/renderer/src/App.tsx', markers: ['fqfPortalDemo'] }]);
  });
});
