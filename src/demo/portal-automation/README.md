# Portal automation — pre-release, NOT production-ready

This feature lets the Quote Fetcher work the Fiducial portal's **New proposal** form
(`/proposals/new`). It started as a temporary demo and is being taken towards a production
proposal-creation integration. **It is not production-ready.** Creating a proposal has been
verified only on a local copy of the portal. Live creation is set to **live verification**
(2026-10-29, at the team's request): one confirmed proposal per app run, with test data only. It
has not yet been run on the live portal.

## Status (2026-10-29)

| What                                       | Where                                                       | Result                                                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated tests                            | `test/portal-automation-demo/`, scripted portal             | Pass                                                                                                                                                                                                           |
| End-to-end, local portal copy              | `tools/local-portal.mjs` + `tools/e2e/run.mjs`              | Pass: a proposal created, read back and checked against the portal's API                                                                                                                                       |
| Live portal, signed out (read-only)        | https://fiducial.spirezen.tech                              | The portal redirects signed-out users to `/login?next=…`, `auth/me` answers 401, and its published API description is **identical** to the portal source the local tests ran on (backend `73f9a0e`) |
| Live portal, signed in (fill-only)         | —                                                           | **Not yet run**                                                                                                                                                                                                |
| Live portal, proposal creation             | —                                                           | **Not done.** No live proposal has been created or verified                                                                                                                                                    |

## How it talks to the portal

The portal publishes an API description (OpenAPI 3.1, `GET /api/openapi.json`, public). It
documents creating a proposal (`POST /api/v1/proposals`, answering 201 with the proposal) and
reading one back. Even so, this integration **does not call the API directly**:

- **Credentials:** the API signs in with the user's email and password and returns a bearer
  token. Calling it from the app would mean the app handling the user's password or token. The
  portal offers no integration credential, such as a service account or an API key.
- **No approval:** nothing says the API is approved for other systems to use. Making the API
  description public is itself an open item in the portal's audit (F-09).

The integration therefore drives the portal's own form in a separate window:
- **Business rules:** the portal's validation and business logic apply unchanged.
- **Sign-in:** the user signs in to the portal itself.
- **The one request:** the only write is the request the portal's own form sends after the user
  confirms.

The documented API is used in two ways:
- **Contract check:** `shared/portal-contract.ts`, run before a release with
  `tools/check-live-contract.mjs`, compares the portal's API description with what the
  integration relies on.
- **Read-only views:** reading the proposal back, and the recovery look-up, go through the
  portal's own `/api/proxy/…` layer with the user's session.

Moving to direct API calls would need an approved integration credential and the portal owners'
agreement. The page-facing code (`page/page-agent.ts`) would then be replaced, and the review,
confirmation and verification would stay.

## Modes and portals

| Portal                                                       | Fill-only (default) | Full workflow (`PORTAL_AUTOMATION_FULL_WORKFLOW=1`)                                                    |
| ------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------ |
| Live portal, `https://fiducial.spirezen.tech`                | Yes                 | **Live verification:** one confirmed proposal per app run, test data only. See *Live verification*.    |
| Local portal copy (`http://localhost` / `http://127.0.0.1`)  | Yes                 | Yes: one creation per confirmed review                                                                 |
| Any other address                                            | Yes                 | No                                                                                                     |

Creation on the live portal is controlled by `LIVE_PROPOSAL_CREATION` in `shared/environment.ts`.
It is a reviewed code constant, **never an environment variable**:
- **`'off'`:** fill-only on the live portal.
- **`'verification'`** (current): the live verification run. Synthetic data only, and one creation
  attempt per app run.

Both the constant and the full-workflow setting are needed. There is no "on" value for the live
portal yet.

## What it does

1. Opens the portal in its own window and waits while you **sign in normally**. Nothing about
   your credentials passes through the app.
   - **Failed sign-in:** the portal's own message is shown.
   - **Ended session:** a redirect to the sign-in page asks you to sign in again.
2. Chooses the Property line if asked, then fills the supported fields (below). It picks the
   client with **exactly** the given name, and never a different client.
3. Reads every field back, and reports what was filled, what was skipped (and why), and any
   errors.
4. **Fill-only:** stops before "Create proposal" or "Create renewal".

**Full workflow**, continuing:

5. **Checks** the following before offering a review:
   - **Session:** the portal's read-only `auth/me`, for the signed-in name and the
     `property.create` and `property.view` permissions.
   - **Environment:** the portal's profile allows creation, and it set the session cookie it
     should (`__Host-erp_session` on the live portal, `erp_session` on a local copy). Only the
     names are read, never the values.
   - **Form:** every required field filled and read back correctly, the client chosen, and exactly
     one "Create proposal" button.
6. **Review:**
   - **What it shows:** the target environment, case type, insured, dates, assignee, the risk
     locations ticked on the form, every filled field, skipped fields and warnings.
   - **On the live portal**, a warning says the record is real.
   - **Nothing has been created yet.**
7. **Explicit confirmation:** a tick box, then **Create proposal in <environment>**.
8. **Creation:**
   - **Checks again** that the form still shows the reviewed values and the same ticked risk
     locations, and that the environment still checks out.
   - **Arms the network guard** for one creation request.
   - **Presses the reviewed button** once.
   - **Waits for the portal's real answer.**
9. **Verification:** opens the new proposal's page (`/proposals/<id>`), reads it back with
   `GET /api/proxy/proposals/<id>`, and compares it with the review. Then it shows the proposal
   number (`PRP-<year>-<n>`), status (DRAFT), insured, dates, assignee and record link.

### Supported fields

| Field            | Portal field                                                                  |
| ---------------- | ----------------------------------------------------------------------------- |
| Type of case     | "New business" / "Renewal" radio (`type` = `NEW` / `EXISTING`)                |
| Insured          | "Search clients by name or GSTIN", then the client with **exactly** that name |
| Policy period    | "Policy period from" (`policyStart`), "Policy period to" (`policyEnd`)        |
| Quotes needed by | "Quotes needed by" (`dueDate`)                                                |
| Assigned to      | "Assigned to" select (`ownerId`), by the staff member's name                  |

All are required except Assigned to; the portal keeps the signed-in user if no name is given.

**Risk locations:** when a client is chosen, the portal ticks **every** risk location of that
client. The integration never ticks or unticks them. It reads which are ticked, shows them on
the review, and creates nothing if they change after the review. The proposal covers the ticked
locations; with "Deccan Cold Chain LLP" that is both "Peenya cold store" and "City office".

Some data is not on this form and is reported as skipped, never typed anywhere: occupancy, sums
insured, contact details and the Data Sheet. The mapping is in
`shared/field-map.ts`, taken from the portal's form (frontend `4593f4a`). The live portal's
signed-in form has **not** been inspected yet: that is step 2 of the live verification.

### Outcomes

| Outcome                  | When                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Created and verified** | The portal answered 201, opened the new proposal, and it reads back as reviewed.                                                             |
| **Not created**          | The portal refused it (4xx, with its message), the button sent no request, or a check before creation failed.                               |
| **Result not certain**   | A 5xx, a failed connection, no answer within 30 seconds, a read-back that differs, or a read-back that failed. See *Error recovery*.        |

## Release readiness

### Required portal permissions

The signed-in user needs `property.create` (to create) and `property.view` (to read the proposal
back). The integration checks both before offering a review. The portal enforces them again on
every request.

### Authentication

- **Sign-in:** the user signs in to the portal's own page, in the integration's window. The app
  never sees, stores or logs the password. Any OTP, MFA or CAPTCHA the portal adds is left to the
  user, never bypassed.
- **Session storage:** the window's session is in memory only (a non-persistent partition). The
  sign-in is gone when the app quits. Cookie values are never read; only their names are, for the
  environment check.
- **Expired sessions:** the portal sends the user to `/login?next=…` on a 401. The integration
  notices, asks the user to sign in again, and continues. If the session ends after the review,
  nothing is created and the user is told to run again.

### Error recovery

- **Not created:** the portal's message is shown. Fix the cause in the portal and run again.
- **Result not certain:**
  - **No automatic retry,** ever.
  - **Look-up:** the integration reads the portal's 100 newest proposals (read-only). It accepts
    exactly one that matches the review and was created since the confirmation, minus 2 minutes
    for clock differences; that proposal is then read back and verified.
  - **No single match:** the screen says to **check the Proposals list in the portal before
    creating it again**. If the request did reach the portal, a second run would create a
    duplicate.
- **Duplicates within one review:**
  - one confirmation per review (a token, accepted once);
  - one network permit per confirmation, single use, valid for 15 seconds;
  - no automatic retry.
  - On the live portal in verification, also one creation attempt per app run.

### Secure configuration

| Setting                                         | Where                     | Effect                                                                          |
| ----------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `ENABLE_PORTAL_AUTOMATION_DEMO=1`               | environment               | Shows the feature at all. Without it, no IPC channel or bridge exists.          |
| `PORTAL_AUTOMATION_FULL_WORKFLOW=1`             | environment               | Asks for the full workflow; granted only where the portal's profile allows it.  |
| `PORTAL_AUTOMATION_DEMO_URL`                    | environment               | The portal address: https, or http on localhost / 127.0.0.1 only.              |
| `LIVE_PROPOSAL_CREATION`                        | code, `shared/environment.ts` | `'verification'` (current) or `'off'`. A reviewed change.                  |

No password, token or cookie is kept in source, settings, logs or files.

### How to disable it

- **Stop creating:** unset `PORTAL_AUTOMATION_FULL_WORKFLOW`. Fill-only remains.
- **Remove the feature from a run:** unset `ENABLE_PORTAL_AUTOMATION_DEMO`. No channel or bridge
  is registered.
- **Stop live creation in a build:** set `LIVE_PROPOSAL_CREATION` back to `'off'` and release.

### How to roll back a release

The feature has no database, migration, stored state or new dependency. Rolling back means
either:
- releasing the previous build; or
- releasing with `LIVE_PROPOSAL_CREATION = 'off'`.

Proposals already created stay in the portal. They are ordinary DRAFT proposals, and the
portal's own users with `property.delete` can delete them there.

### Known limitations

- **Live use:** not verified on the live portal (see *Status*), and not production-ready.
- **Fields:** only the five fields above. Risk locations are left as the portal ticks them. No
  Data Sheet and no client creation.
- **Data:** the data comes from the integration's screen and must be test data. The insured's
  name contains "Demo", "Synthetic" or "Sample", **or** is an approved test client by its exact
  name (`APPROVED_TEST_CLIENTS` in `shared/demo-data.ts`, today "Deccan Cold Chain LLP"). The
  contact must be at `example.test`. Creating real business proposals needs a decision on the
  data source and a change to those checks.
- **Environment check:** relies on the portal's address and the session cookie's name. The portal
  reports nothing about its environment.
- **UI automation:** a changed form is detected (the field is skipped, so no creation is offered),
  but the field map then needs updating.
- **Uncertain outcomes:** they need a person to check, and the look-up reads only the 100 newest
  proposals.
- **Duplicates:** protection covers one review (and, in live verification, one app run). A new run
  can create another proposal on purpose.
- **Naming:** the launcher card and the code markers still say "Demo".

## Live verification (before any live creation is enabled)

The **Proposal-creation test** below creates a real record. It needs, in advance:
- an authorised test account on the live portal, holding `property.create` and `property.view`;
- an approved test procedure;
- the test client "Deccan Cold Chain LLP" in the live portal (the prefilled insured), confirmed
  with the portal owners as a test record, not a customer. Its GSTIN `29ZZZZZ0003Z1ZJ` is a
  placeholder. A proposal for it covers both its risk locations.

1. **Contract check** (read-only, no sign-in):
   `node src/demo/portal-automation/tools/check-live-contract.mjs` must report that the API
   matches.
2. **Fill-only on the live portal:** nothing is saved.
   - **Run:** `ENABLE_PORTAL_AUTOMATION_DEMO=1 npm run dev`, then sign in with the test account.
   - **Expect** "Filled and checked 5 of 5 fields" with the test client chosen.
   - **Record** the form's field names and the button text if anything is skipped.
3. **Proposal-creation test:** the only step that creates a record.
   - **Set up:** in a local build, set `LIVE_PROPOSAL_CREATION = 'verification'` (a reviewed
     change, never committed to a release branch without review).
   - **Run** with `ENABLE_PORTAL_AUTOMATION_DEMO=1 PORTAL_AUTOMATION_FULL_WORKFLOW=1`.
   - **Confirm** the review once.
   - **Expect** "Created and verified" with a `PRP-…` number.
   - **Check the record in the portal:** the client, dates, type, risk locations and DRAFT
     status.
   - **Then** set the constant back to `'off'`.
4. **Evidence:** record the result, the proposal number and who approved it. Ask the portal
   owners whether to keep the DRAFT test proposal or delete it.
5. **Review:** only after this passes and is reviewed can an "on" setting for the live portal be
   proposed. That proposal must also cover real data input, and naming beyond "Demo".

## How to run it

### Fill-only (any portal; nothing is saved)

```sh
ENABLE_PORTAL_AUTOMATION_DEMO=1 npm run dev
```

Then **Open demo**, review the data, and **Run**. Sign in to the portal in the window that
opens. `PORTAL_AUTOMATION_DEMO_URL` points it at another portal; otherwise it opens
https://fiducial.spirezen.tech.

### Full workflow (local portal copy)

This needs the portal's source next to this repository (`../fiducial/Fiducial_backend` and
`../fiducial/Fiducial_frontend`, with `npm install` done). Otherwise, point to it with
`FIDUCIAL_BACKEND_DIR` and `FIDUCIAL_FRONTEND_DIR`.

```sh
node src/demo/portal-automation/tools/local-portal.mjs           # terminal 1
ENABLE_PORTAL_AUTOMATION_DEMO=1 PORTAL_AUTOMATION_FULL_WORKFLOW=1 \
  PORTAL_AUTOMATION_DEMO_URL=http://localhost:3100 npm run dev     # terminal 2
```

`local-portal.mjs`:
- **Runs** the portal's unmodified backend and frontend against an in-memory database.
- **Seeds** a synthetic admin (`demo.admin@example.test`) and a read-only user. Their random
  passwords go to `<tmp>/fqf-portal-demo/local-portal.json` (mode 600).
- **Seeds the test client** "Deccan Cold Chain LLP" and its two risk locations, as in the live
  portal. The contact is synthetic and there is no GSTIN. The occupancy and pincode rows it needs
  (4007, 1007, 560058, 560001) get made-up rates.
- **Sets addresses explicitly:** the database and API addresses are set, and the portal's `.env`
  files are never read.
- **Cleans up** the `AGENTS.md` / `CLAUDE.md` that `next dev` writes into the frontend.
- **If it stops with "The demo client was not created: HTTP 401",** run it again. This happened
  once, and the next start worked.

In the end-to-end check, scenario 3 (a user who may not create) once timed out after the portal
signed the session out on its own. The next run passed; the cause was not found.

### Checks

```sh
npm run test -- test/portal-automation-demo                     # automated tests
node src/demo/portal-automation/tools/e2e/run.mjs                # end-to-end, local copy running
node src/demo/portal-automation/tools/check-live-contract.mjs    # live API contract, read-only
```

The end-to-end check bundles the integration's real main-process code into
`out/portal-demo-e2e/` (git-ignored) and drives it in Electron:
- **Scenarios:** the full workflow, fill-only, and a user who may not create.
- **Sign-in:** through the portal's own page.
- **Confirmation:** it stands in for the confirmation click, calling the same `confirm(token)`
  the screen sends.

The contract check needs Node 23.6 or later. It may print a harmless module-type warning.

## Safeguards

- **Network guard** (`main/network-guard.ts`): the window cancels every POST, PUT, PATCH and
  DELETE except sign-in and sign-out. The only exception is a **single-use permit**:
  - **When:** armed after your confirmation.
  - **What it allows:** exactly one `POST /api/proxy/proposals`, with the exact path, no query,
    and the portal's own origin, within 15 seconds.
  - **Everything else stays blocked,** including a second creation and every change to an existing
    case. Blocked requests are counted on the result.
- **Submit block:** form submission is blocked except on the sign-in page and the one submit a
  confirmed creation allows.
- **In-page agent:** it presses a submit button only for the `create` command, on
  `/proposals/new`, and only the one button whose text is exactly the reviewed action.
- **Navigation:** the window may navigate only within the portal's origin. Permissions and
  downloads are denied.
- **Isolation:**
  - The window uses the app's locked-down web preferences, with no preload, no Node.js and a
    sandbox.
  - The agent runs in an isolated world.
  - The integration's four IPC channels (`portal-demo:start|report|cancel|confirm`) answer only
    the app's own trusted window and validate every payload.
  - The app's `window.fqf` bridge, CSP, logger and comparison engine are unchanged.

## Files

```
src/demo/portal-automation/
  README.md            this file
  shared/              flag; environment profiles and mode decisions; portal API contract;
                       synthetic data; field map; planning and checking (pure); IPC names
  page/page-agent.ts   the in-page agent
  main/                portal window, network guard (with the creation permit), run
                       orchestration, IPC registration
  preload/expose.ts    window.fqfPortalDemo, only with the flag
  renderer/            the screen and its styles
  tools/               local-portal.mjs, e2e/, check-live-contract.mjs
test/portal-automation-demo/   tests, and live-openapi-proposals.json (a trimmed copy of the
                               live portal's public API description, 2026-10-29)
```

## How to remove it

1. Delete `src/demo/portal-automation/` (including `tools/`) and `test/portal-automation-demo/`.
2. In `src/main/index.ts`, remove the `registerPortalDemo` import and its `if (!smoke) { … }`
   block (marked "DEMO ONLY").
3. In `src/preload/index.ts`, remove the `exposePortalDemo` import and call (marked "DEMO ONLY").
4. In `src/renderer/src/App.tsx`, remove the `PortalDemoGate` constant (marked "DEMO ONLY"). Then
   replace `homeScreen` with `home`, and delete the `homeScreen` constant.
5. In `tsconfig.node.json`, remove `"src/demo/portal-automation/**/*.ts"`. In `tsconfig.web.json`,
   remove the three `src/demo/portal-automation/...` entries.
6. In `eslint.config.mjs`, remove the block marked "DEMO ONLY".
7. Delete `out/portal-demo-e2e/` if it exists, and `<tmp>/fqf-portal-demo/`.
8. Run `npm run typecheck && npm run lint && npm test && npm run build`.
