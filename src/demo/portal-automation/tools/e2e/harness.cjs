// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../../README.md).
// End-to-end check against the LOCAL portal copy (in-memory database, synthetic data), started by
// run.mjs. Drives the demo's real main-process code in Electron. It signs in through the portal's
// own sign-in page with the local synthetic accounts, and stands in for the user's confirmation
// click by calling runner.confirm(token), which is what the demo screen sends over IPC. Five
// scenarios: the full workflow (with the attempt store and audit log on disk), fill-only, a user
// who may not create, a second run that must warn of the duplicate, and requests the network guard
// must stop because they differ from the approved one. Never prints passwords.
const { app, BrowserWindow, session } = require('electron');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const demo = require(process.env.FQF_E2E_BUNDLE);

const local = JSON.parse(
  readFileSync(join(tmpdir(), 'fqf-portal-demo', 'local-portal.json'), 'utf8'),
);
const ORIGIN = local.web;
// The creation-attempt store and audit log of this run, in a throwaway folder.
const DATA_DIR = join(mkdtempSync(join(tmpdir(), 'fqf-e2e-records-')), 'portal-automation');
const records = demo.openRecords(DATA_DIR);
const logger = { log() {}, info() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// One API sign-in for the whole harness (the API rate-limits sign-ins).
let apiToken = null;
async function api(path, init = {}) {
  if (!apiToken) {
    const login = await fetch(`${local.api}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(local.admin),
    });
    if (login.status !== 200) throw new Error(`API sign-in failed: HTTP ${login.status}`);
    apiToken = (await login.json()).accessToken;
  }
  const accessToken = apiToken;
  const response = await fetch(`${local.api}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  return response.json();
}
const proposalsInPortal = async () => {
  const body = await api('/proposals?limit=100');
  if (!Array.isArray(body.items)) throw new Error('could not list proposals');
  return body.items;
};

function portalWindow() {
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
}

async function waitFor(what, predicate, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = await predicate();
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Types into the portal's sign-in form like a person would, then presses Sign in. */
async function signIn(credentials) {
  const win = await waitFor('the portal window', () => portalWindow());
  await waitFor('the sign-in form', async () =>
    win.webContents
      .executeJavaScript(
        'location.pathname === "/login" && !!document.querySelector("input[type=password]")',
      )
      .catch(() => false),
  );
  for (const [selector, text] of [
    ['input[type=email], input[name=email]', credentials.email],
    ['input[type=password]', credentials.password],
  ]) {
    await win.webContents.executeJavaScript(
      `(() => { const f = document.querySelector(${JSON.stringify(selector)}); f.focus(); f.select && f.select(); })()`,
    );
    await win.webContents.insertText(text);
  }
  await win.webContents.executeJavaScript(
    '(() => { [...document.querySelectorAll("button[type=submit]")].find(b => /sign in/i.test(b.textContent)).click(); })()',
  );
}

async function settle(runner, states, ms = 90_000) {
  return waitFor(
    `state ${states.join('|')}`,
    () => (states.includes(runner.current().state) ? runner.current() : null),
    ms,
  );
}

async function fullWorkflow() {
  console.log('\n== Scenario 1: full workflow on the local portal copy ==');
  const env = {
    ENABLE_PORTAL_AUTOMATION_DEMO: '1',
    PORTAL_AUTOMATION_FULL_WORKFLOW: '1',
    PORTAL_AUTOMATION_DEMO_URL: ORIGIN,
  };
  const decision = demo.decideMode(env, demo.portalOrigin(env));
  check('mode is full on the local copy', decision.mode === 'full', decision.environment.name);
  const runner = new demo.PortalDemoRunner({
    portalOrigin: ORIGIN,
    mode: decision,
    store: records.store,
    audit: records.audit,
    openPage: () => demo.openPortalPage(ORIGIN, logger, decision.mode),
  });
  const before = (await proposalsInPortal()).length;
  void runner.start(demo.SYNTHETIC_DEMO_PROPOSAL);

  // A failed sign-in first: the demo must show the portal's message and keep waiting.
  await signIn({ email: local.admin.email, password: 'wrong-password-for-test' });
  const failed = await waitFor(
    'the sign-in failure message',
    () => (runner.current().message.startsWith('Sign-in failed') ? runner.current().message : null),
    30_000,
  );
  check('a failed sign-in is reported with the portal’s message', true, failed);
  await signIn(local.admin);

  const report = await settle(runner, ['awaiting-confirmation', 'failed', 'done']);
  check(
    'fills, verifies and waits for confirmation',
    report.state === 'awaiting-confirmation',
    report.message,
  );
  if (report.state !== 'awaiting-confirmation') return null;
  check(
    'the session is verified (signed-in name only)',
    report.signedInAs === 'Demo Admin',
    String(report.signedInAs),
  );
  check(
    'the environment is verified',
    report.environment.verified === true,
    report.environment.name,
  );
  const review = report.review;
  console.log(
    '   review:',
    JSON.stringify({
      environment: review.environment,
      origin: review.origin,
      caseType: review.caseType,
      insured: review.insured,
      policy: `${review.policyStart}..${review.policyEnd}`,
      quotesNeededBy: review.quotesNeededBy,
      assignedTo: review.assignedTo,
      riskLocations: review.riskLocations,
      action: review.action,
      fields: review.fields.map((f) => `${f.label}=${f.value}${f.verified ? '' : ' (DIFFERS)'}`),
      skipped: review.skipped.length,
    }),
  );

  // Before confirming: nothing created, and nothing can be created by other routes.
  check('nothing is created before confirmation', (await proposalsInPortal()).length === before);
  check(
    'a confirmation for another review is refused',
    runner.confirm('not-the-token').ok === false,
  );
  const win = portalWindow();
  const blockedBefore = runner.current().blockedWrites;
  const unrelated = await win.webContents.executeJavaScript(
    `fetch('/api/proxy/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
       .then(r => 'sent ' + r.status, () => 'blocked')`,
  );
  check('an unrelated write from the portal window is blocked', unrelated === 'blocked', unrelated);
  await win.webContents.executeJavaScript(
    '(() => { const b = [...document.querySelectorAll("button[type=submit]")].find(x => x.textContent.trim() === "Create proposal"); b && b.click(); })()',
  );
  await sleep(2000);
  check(
    'clicking Create proposal in the portal before confirming creates nothing',
    (await proposalsInPortal()).length === before,
  );
  check(
    'the guard counted the blocked writes',
    runner.current().blockedWrites > blockedBefore,
    `${blockedBefore} -> ${runner.current().blockedWrites}`,
  );

  // The user's confirmation (the app screen sends this token over IPC).
  check('the confirmation is accepted once', runner.confirm(review.token).ok === true);
  check('a second confirmation is refused', runner.confirm(review.token).ok === false);
  const final = await settle(runner, ['created', 'creation-failed', 'uncertain', 'failed'], 60_000);
  console.log(`   final: ${final.state} — ${final.message}`);
  console.log('   progress:', final.progress.map((s) => `${s.label}:${s.status}`).join(', '));
  check('the proposal is created and verified', final.state === 'created');
  check(
    'every field is verified by id (client, type, dates, assignee, risk locations)',
    (final.verification ?? []).length === 7 &&
      final.verification.every((item) => item.status === 'verified'),
    (final.verification ?? []).map((item) => `${item.field}:${item.status}`).join(', '),
  );
  const stored = records.store.list();
  check(
    'the attempt is recorded as CREATED with the proposal id',
    stored.length === 1 &&
      stored[0].state === 'CREATED' &&
      stored[0].result.proposalId === final.proposal?.id,
    stored.map((attempt) => attempt.state).join(','),
  );
  const events = demo.readAuditLog(join(DATA_DIR, 'audit.jsonl')).map((record) => record.event);
  check(
    'the audit log has each step',
    events.join(',') ===
      'attempt.created,review.completed,approval.granted,submission.started,submission.accepted,verification.completed',
    events.join(','),
  );

  // Independent check through the API, outside Electron.
  const after = await proposalsInPortal();
  const mine = after.filter((p) => final.proposal && p.id === final.proposal.id);
  check(
    'exactly one new proposal in the portal (no duplicate)',
    after.length === before + 1 && mine.length === 1,
    `${before} -> ${after.length}`,
  );
  if (final.proposal && mine[0]) {
    const record = await api(`/proposals/${final.proposal.id}`);
    check(
      'the API shows the same proposal number and status',
      record.reference === final.proposal.reference && record.stage === final.proposal.stage,
      `${record.reference} / ${record.stage}`,
    );
    check(
      'the API shows the reviewed values',
      record.policyStart === '2026-12-01' &&
        record.policyEnd === '2027-11-30' &&
        record.dueDate === '2026-11-20' &&
        record.type === 'NEW',
      `${record.policyStart}..${record.policyEnd}, due ${record.dueDate}, ${record.type}`,
    );
    const covered = (record.locations ?? []).map((item) => item.location?.name).sort();
    check(
      'the API shows the reviewed client and risk locations',
      record.client?.name === review.insured &&
        covered.join('|') === [...review.riskLocations].sort().join('|') &&
        covered.length === 2,
      `${record.client?.name}: ${covered.join(', ')}`,
    );
  }
  check('a confirmation after the run is refused', runner.confirm(review.token).ok === false);
  return after.length;
}

async function fillOnly(count) {
  console.log('\n== Scenario 2: fill-only on the same local portal ==');
  const env = { ENABLE_PORTAL_AUTOMATION_DEMO: '1', PORTAL_AUTOMATION_DEMO_URL: ORIGIN };
  const decision = demo.decideMode(env, demo.portalOrigin(env));
  check('mode is fill-only without the full-workflow setting', decision.mode === 'fill-only');
  const runner = new demo.PortalDemoRunner({
    portalOrigin: ORIGIN,
    mode: decision,
    openPage: () => demo.openPortalPage(ORIGIN, logger, decision.mode),
  });
  await runner.start(demo.SYNTHETIC_DEMO_PROPOSAL);
  const report = runner.current();
  check('fills and stops before saving', report.state === 'done', report.message);
  check('no review is offered', report.review === null && runner.confirm('x').ok === false);
  await portalWindow().webContents.executeJavaScript(
    '(() => { const b = [...document.querySelectorAll("button[type=submit]")].find(x => x.textContent.trim() === "Create proposal"); b && b.click(); })()',
  );
  await sleep(2000);
  check('clicking Create proposal creates nothing', (await proposalsInPortal()).length === count);
}

async function noPermission(count) {
  console.log('\n== Scenario 3: full workflow signed in as a user who may not create ==');
  await session.fromPartition('portal-automation-demo').clearStorageData({ storages: ['cookies'] });
  const env = {
    ENABLE_PORTAL_AUTOMATION_DEMO: '1',
    PORTAL_AUTOMATION_FULL_WORKFLOW: '1',
    PORTAL_AUTOMATION_DEMO_URL: ORIGIN,
  };
  const decision = demo.decideMode(env, demo.portalOrigin(env));
  const runner = new demo.PortalDemoRunner({
    portalOrigin: ORIGIN,
    mode: decision,
    formTimeoutMs: 15_000,
    openPage: () => demo.openPortalPage(ORIGIN, logger, decision.mode),
  });
  void runner.start(demo.SYNTHETIC_DEMO_PROPOSAL);
  await signIn(local.viewer);
  const report = await settle(runner, ['awaiting-confirmation', 'failed', 'done'], 60_000);
  check(
    'stops before any review',
    report.state === 'failed' && report.review === null,
    report.message,
  );
  check('nothing is created', (await proposalsInPortal()).length === count);
}

async function duplicateWarning(count) {
  console.log(
    '\n== Scenario 4: a second run for the same client and period warns of the duplicate ==',
  );
  await session.fromPartition('portal-automation-demo').clearStorageData({ storages: ['cookies'] });
  const env = {
    ENABLE_PORTAL_AUTOMATION_DEMO: '1',
    PORTAL_AUTOMATION_FULL_WORKFLOW: '1',
    PORTAL_AUTOMATION_DEMO_URL: ORIGIN,
  };
  const decision = demo.decideMode(env, demo.portalOrigin(env));
  const runner = new demo.PortalDemoRunner({
    portalOrigin: ORIGIN,
    mode: decision,
    store: records.store,
    audit: records.audit,
    openPage: () => demo.openPortalPage(ORIGIN, logger, decision.mode),
  });
  void runner.start(demo.SYNTHETIC_DEMO_PROPOSAL);
  await signIn(local.admin);
  const report = await settle(runner, ['awaiting-confirmation', 'failed', 'done'], 60_000);
  const duplicates = report.review?.duplicates ?? [];
  check(
    'the review lists the proposal created in scenario 1 as a possible duplicate',
    report.state === 'awaiting-confirmation' && duplicates.length === 1,
    duplicates.map((item) => `${item.reference} (${item.source})`).join(', ') || report.message,
  );
  check(
    'confirming without acknowledging the duplicate is refused',
    report.review ? runner.confirm(report.review.token, false).ok === false : false,
  );
  runner.cancel();
  check('nothing more is created', (await proposalsInPortal()).length === count);
}

async function mismatchedRequests(count) {
  console.log(
    '\n== Scenario 5: the network guard stops requests that differ from the approved one ==',
  );
  // The same window and guard as the runs above; the user is still signed in from scenario 4.
  const page = demo.openPortalPage(ORIGIN, logger, 'full');
  const win = portalWindow();
  const stored = records.store.list().find((attempt) => attempt.state === 'CREATED');
  const approved = { ...stored.payload, policyStart: '2030-01-01', policyEnd: '2030-12-31' };
  const send = (body, contentType = 'application/json') =>
    win.webContents.executeJavaScript(
      `fetch('/api/proxy/proposals', { method: 'POST', headers: { 'Content-Type': ${JSON.stringify(contentType)} }, body: ${JSON.stringify(body)} })
         .then(r => 'sent ' + r.status, () => 'blocked')`,
    );
  const cases = [
    [
      'another client id',
      JSON.stringify({ ...approved, clientId: 'f'.repeat(24) }),
      'application/json',
      'body-mismatch',
    ],
    ['a text/plain body', JSON.stringify(approved), 'text/plain', 'content-type'],
    [
      'an extra field',
      JSON.stringify({ ...approved, existingPolicy: null }),
      'application/json',
      'body-mismatch',
    ],
  ];
  for (const [name, body, contentType, reason] of cases) {
    check(
      `armed for the approved request: ${name} is stopped`,
      page.armCreation(approved) === true,
    );
    const result = await send(body, contentType);
    const outcome = page.creationOutcome();
    check(
      `  …blocked before it left (${reason})`,
      result === 'blocked' && outcome.state === 'rejected' && outcome.reason === reason,
      `${result}; ${JSON.stringify(outcome)}`,
    );
  }
  check('nothing was created by those requests', (await proposalsInPortal()).length === count);
}

app.whenReady().then(async () => {
  try {
    const count = await fullWorkflow();
    if (count !== null) {
      await fillOnly(count);
      await noPermission(count);
      await duplicateWarning(count);
      await mismatchedRequests(count);
    }
  } catch (error) {
    check('harness ran to completion', false, String(error.message));
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nRESULT ${results.length - failed}/${results.length} checks passed`);
  app.exit(failed === 0 ? 0 : 1);
});
