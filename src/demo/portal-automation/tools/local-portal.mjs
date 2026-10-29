// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// Starts a throwaway local copy of the Fiducial portal, the demo's only approved test
// environment: an in-memory MongoDB replica set, the portal's backend API (unmodified,
// src/server.ts) and its frontend (next dev), with synthetic data only.
//
// Safety: MONGODB_URI is set explicitly to the in-memory database, and the backend's .env is not
// read (the backend reads it only through `--env-file-if-exists`, which this does not pass). The
// frontend's API_URL and USE_MOCK_API are set explicitly (Next.js never overrides them from .env
// files). Nothing persists: the database lives in memory and is gone when this stops.
//
// Seeds: active masters (the backend's own test fixture, plus the occupancies and pincodes below
// with made-up rates), a synthetic admin who may create Property proposals, a read-only user, and
// the test client "Deccan Cold Chain LLP" with its two risk locations, as in the live portal
// (synthetic contact; no GSTIN).
// The synthetic logins (random passwords) are written to <tmp>/fqf-portal-demo/local-portal.json
// with mode 600, for you and for the end-to-end check; nothing is printed.
//
// Usage (from the Quote Fetcher repository):
//   node src/demo/portal-automation/tools/local-portal.mjs
// Portal source locations, if not next to this repository:
//   FIDUCIAL_BACKEND_DIR=/path/Fiducial_backend FIDUCIAL_FRONTEND_DIR=/path/Fiducial_frontend
// Stop with Ctrl+C.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const BACKEND = resolve(
  process.env.FIDUCIAL_BACKEND_DIR ?? join(REPO, '../fiducial/Fiducial_backend'),
);
const FRONTEND = resolve(
  process.env.FIDUCIAL_FRONTEND_DIR ?? join(REPO, '../fiducial/Fiducial_frontend'),
);
const API_PORT = 4100;
const WEB_PORT = 3100;
const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const CLIENT_NAME = 'Deccan Cold Chain LLP';
const STATE_DIR = join(tmpdir(), 'fqf-portal-demo');
/** Files `next dev` (16.x) writes into the frontend; removed again if this run created them. */
const NEXT_GENERATED = ['AGENTS.md', 'CLAUDE.md'];

for (const dir of [BACKEND, FRONTEND]) {
  if (!existsSync(join(dir, 'package.json')) || !existsSync(join(dir, 'node_modules'))) {
    console.error(`Portal source with installed dependencies not found at ${dir}`);
    process.exit(1);
  }
}
mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });

const { MongoMemoryReplSet } = await import(
  join(BACKEND, 'node_modules/mongodb-memory-server/index.js')
);
const mongoose = (await import(join(BACKEND, 'node_modules/mongoose/index.js'))).default;

// A single-node replica set: the API creates proposals in multi-document transactions.
const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  binary: { version: '7.0.43' },
});
const uri = replSet.getUri('fiducial_local_demo');
await mongoose.connect(uri);
const { ensureIndexes } = await import(join(BACKEND, 'src/models.ts'));
const { ensureSystemRoles } = await import(join(BACKEND, 'src/modules/roles/roles.service.ts'));
const { seedMasters, insertOccupancies, insertPincodes, OCCUPANCIES } = await import(
  join(BACKEND, 'test/helpers/masters.ts')
);
const { hashPassword } = await import(join(BACKEND, 'src/modules/auth/password.ts'));
const { UserModel } = await import(join(BACKEND, 'src/modules/users/user.model.ts'));
await ensureIndexes();
await ensureSystemRoles();
const masters = await seedMasters();
// The test client's occupancies and pincodes, which the fixture lacks. Made-up rates, local only.
const template = OCCUPANCIES.find((occupancy) => occupancy.tacCode === '2001');
await insertOccupancies(new mongoose.Types.ObjectId(masters.occupancyVersionId), [
  { ...template, tacCode: '4007', description: 'Cold Storage premises' },
  { ...template, tacCode: '1007', description: 'Office premises / Meeting Rooms' },
]);
await insertPincodes(
  new mongoose.Types.ObjectId(masters.pincodeVersionId),
  ['560058', '560001'].map((pincode) => ({
    pincode,
    state: 'Karnataka',
    district: 'Bangalore',
    eqZone: 4,
    rates: ['0.05', '0.1', '0.1'],
  })),
);
const users = {
  admin: { email: 'demo.admin@example.test', name: 'Demo Admin', roles: ['ADMIN'] },
  viewer: { email: 'demo.viewer@example.test', name: 'Demo Viewer', roles: ['READ_ONLY'] },
};
const logins = {};
for (const [key, user] of Object.entries(users)) {
  const password = randomBytes(12).toString('base64url');
  await UserModel.create({
    email: user.email,
    name: user.name,
    passwordHash: await hashPassword(password),
    roles: user.roles,
    active: true,
  });
  logins[key] = { email: user.email, password };
}
await mongoose.disconnect();

const children = [];
function start(name, command, args, cwd, env) {
  const log = createWriteStream(join(STATE_DIR, `${name}.log`));
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
}

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`${url} did not come up (see the logs in ${STATE_DIR})`);
}

const baseEnv = { ...process.env };
delete baseEnv.ELECTRON_RUN_AS_NODE;
delete baseEnv.NODE_OPTIONS;
start('api', process.execPath, ['src/server.ts'], BACKEND, {
  ...baseEnv,
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  MONGODB_URI: uri,
  JWT_SECRET: randomBytes(32).toString('hex'),
  JWT_EXPIRES_IN_SECONDS: '3600',
  CORS_ORIGIN: WEB,
  LOG_LEVEL: 'warn',
});
await waitFor(`${API}/api/v1/health`, 60_000);

// The client the demo picks by its exact name, and its risk locations, created through the
// portal's own API.
const signIn = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(logins.admin),
});
const { accessToken } = await signIn.json();
const asAdmin = (path, body) =>
  fetch(`${API}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
const client = await asAdmin('/clients', {
  name: CLIENT_NAME,
  gstin: null,
  address: {
    line1: '45 Peenya Industrial Area, Phase 2',
    line2: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560058',
  },
  contacts: [
    {
      name: 'Demo Contact',
      designation: 'Partner',
      email: 'risk.manager@example.test',
      phone: null,
    },
  ],
  natureOfBusiness: 'Cold storage and warehousing',
  occupancyCode: '4007',
});
if (client.status !== 201)
  throw new Error(`The demo client was not created: HTTP ${client.status}`);
const { id: clientId } = await client.json();
for (const location of [
  {
    name: 'Peenya cold store',
    line1: '45 Peenya Phase 2',
    line2: null,
    city: 'Bengaluru',
    pincode: '560058',
    occupancyCode: null,
  },
  {
    name: 'City office',
    line1: '3rd Floor, 18 MG Road',
    line2: null,
    city: 'Bengaluru',
    pincode: '560001',
    occupancyCode: '1007',
  },
]) {
  const created = await asAdmin(`/clients/${clientId}/locations`, location);
  if (created.status !== 201)
    throw new Error(`The risk location "${location.name}" was not created: HTTP ${created.status}`);
}

const preExisting = new Set(NEXT_GENERATED.filter((name) => existsSync(join(FRONTEND, name))));
start('web', join(FRONTEND, 'node_modules/.bin/next'), ['dev', '-p', String(WEB_PORT)], FRONTEND, {
  ...baseEnv,
  API_URL: API,
  USE_MOCK_API: 'false',
  NEXT_TELEMETRY_DISABLED: '1',
});
await waitFor(`${WEB}/login`, 120_000);
// Leave the frontend repository as it was.
for (const name of NEXT_GENERATED) {
  if (!preExisting.has(name)) rmSync(join(FRONTEND, name), { force: true });
}

writeFileSync(
  join(STATE_DIR, 'local-portal.json'),
  JSON.stringify({ web: WEB, api: API, ...logins, client: CLIENT_NAME }, null, 2),
  { mode: 0o600 },
);
console.log(`Local portal copy ready at ${WEB} (in-memory database, synthetic data).`);
console.log(`Synthetic sign-in details: ${join(STATE_DIR, 'local-portal.json')}`);
console.log('Stop with Ctrl+C.');

async function stop() {
  for (const child of children) child.kill('SIGTERM');
  await replSet.stop();
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
