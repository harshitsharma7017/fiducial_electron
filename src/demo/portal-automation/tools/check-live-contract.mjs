// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// Release check: compares the portal's published API description (GET /api/openapi.json, public,
// no sign-in) with what the full workflow relies on (shared/portal-contract.ts). Read-only: one
// GET, no credentials, nothing is created or changed.
//
// Usage (from the Quote Fetcher repository; Node 23.6 or later loads the .ts module directly):
//   node src/demo/portal-automation/tools/check-live-contract.mjs [portal-origin]
// The origin defaults to the live portal. Exits 0 when the contract matches, 1 otherwise.
import { contractProblems } from '../shared/portal-contract.ts';

const origin = new URL(process.argv[2] ?? 'https://fiducial.spirezen.tech').origin;
const response = await fetch(`${origin}/api/openapi.json`, {
  headers: { Accept: 'application/json' },
  redirect: 'error',
  signal: AbortSignal.timeout(20_000),
});
if (response.status !== 200) {
  console.error(
    `${origin}/api/openapi.json answered HTTP ${response.status}; the contract was not checked.`,
  );
  process.exit(1);
}
const document = await response.json();
const problems = contractProblems(document);
const version = document?.info?.version ?? 'unknown';
if (problems.length > 0) {
  console.error(
    `The portal's API (version ${version}) differs from what the integration relies on:`,
  );
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(
  `The portal's API (version ${version}) matches what the integration relies on (${origin}).`,
);
