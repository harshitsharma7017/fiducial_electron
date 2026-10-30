// Strings that only the temporary portal automation demo (src/demo/portal-automation/) contains:
// its live portal address, its creation request, its settings and its bridge. A production build
// must contain none of them (docs/ACTUAL_PRODUCT_STATUS_AUDIT.md §9). Used by scripts/smoke.mjs
// (the built out/ folder) and scripts/check-package.mjs (app.asar).
export const DEMO_MARKERS = [
  'fiducial.spirezen.tech',
  '/api/proxy/proposals',
  'ENABLE_PORTAL_AUTOMATION_DEMO',
  'PORTAL_AUTOMATION_FULL_WORKFLOW',
  'LIVE_PROPOSAL_CREATION',
  'fqfPortalDemo',
  'portal-automation-demo',
];

/** The demo markers found in a file's text. */
export function demoMarkersIn(text) {
  return DEMO_MARKERS.filter((marker) => text.includes(marker));
}
