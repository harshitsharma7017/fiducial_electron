# Architecture Review — Fiducial Quote Fetcher

| | |
|---|---|
| Date | 26 October 2026 |
| Inputs | `03_TECHNICAL_DESIGN`, `04_ADAPTER_SDK_AND_INSURER_MATRIX`, `05_DATA_MODEL_AND_STORAGE`, `06_SECURITY_PRIVACY_COMPLIANCE`, `08_PDF_REPORT_SPEC`, `16_IPC_ERROR_AND_EVENT_CONTRACTS`, and an audit of this repository |
| Status | Proposed. Technical decisions marked **[Decision]** are tracked in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md), section E |

## 1. Current architecture

> **M0 update (26 Oct 2026):** the repository is now under git (baseline `d21976a`). A wider search found no existing SDK or codebase (OPEN_QUESTIONS §0.1, Q-01), so the project is treated as greenfield. M0 architecture positions are in **§7**.

**None.** The repository contains no code, configuration or build tooling (see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), section 1). Nothing is being replaced, so the design below is greenfield. It still follows `03_TECHNICAL_DESIGN` and uses the documents' terminology.

The documents assume that several things already exist: a "frozen SDK and Zod schemas", an "existing approved driver/CDP approach", a "helper library" and a "smoke runner". **They do not exist in this workspace.** Unless they are found elsewhere (OPEN_QUESTIONS Q-01), this project must create them. The "do not create a competing contract" rule (`04 §1`, `16 §1`) then means *create exactly one contract* and treat it as frozen after the M3 review.

**Reusable conventions (not code).** The team's other TypeScript projects under `../fiducial/` use TypeScript 6, Zod 4, Vitest 5, ESLint with Prettier, Husky with lint-staged, npm 11 and Node ≥ 20.12. They also use React 19, react-hook-form, Radix and Tailwind on the frontend. Adopting the same toolchain lowers onboarding cost. Those repos belong to a different product (an Express/MongoDB web app), and none of their code or schemas should be imported.

## 2. Required architecture (from the documents)

```
┌──────────────────────── Main process (privileged) ────────────────────────┐
│  IPC gateway (allowlist + Zod validation + sender check + AppResult)       │
│  QuoteService · Orchestrator · AdapterRegistry · Comparison/Normalizer     │
│  PaneManager/Driver · Storage (SQLite) · SecretStore · PdfService          │
│  Retention · Settings · Logger (redacting) · Diagnostics                   │
└───────▲─────────────────────────────────────────────────────▲──────────────┘
        │ typed preload bridge (contextBridge)                │ CDP / DOM driver (main-side only)
┌───────┴──────────────────┐                     ┌────────────┴────────────────────────┐
│ App renderer (untrusted) │                     │ Insurer views (untrusted, remote)   │
│ React UI, no Node, CSP   │                     │ one partition per insurer, NO preload│
└──────────────────────────┘                     └─────────────────────────────────────┘
```

Trust levels (`03 §6`): the main process is privileged, the app renderer is untrusted, and insurer content is untrusted external content.

## 3. Proposed concrete design

### 3.1 Toolchain **[Decision E-02]**

- **Electron:** the latest stable line when M1 starts, pinned exactly. Choose it only after confirming its OS support against `01 §11` (see risk AR-01). **→ M0: Electron 45.x proposed, with macOS 13+ (§7.2, DM-01).**
- **Build:** electron-vite for main, preload and renderer bundles. electron-builder for NSIS (Windows) and DMG (macOS) packages, as `03 §2` suggests.
- **Language:** TypeScript strict mode, with React for the renderer.
- **Validation:** Zod schemas in `src/shared/contracts`. The main process and renderer import the same schemas.
- **Tests:** Vitest for unit, fixture and integration tests. Playwright's Electron support for end-to-end smoke tests, run against **mock** adapters only.

### 3.2 Proposed source layout

```
src/
  shared/contracts/      Zod schemas and types — the single "SDK": quote, member, insurer result,
                         run/connection states, error codes, IPC request/response, progress events
  shared/money.ts        integer-paise helpers and INR formatting (display layer only)
  main/
    index.ts             lifecycle, single-instance lock, fuses-aware startup
    security/            webPreferences factory, CSP, navigation/popup/permission/download guards
    ipc/                 handler registry; validate(schema) → handler → AppResult; sender check
    quotes/              QuoteService (create/get/duplicate/delete/manual result)
    orchestrator/        RunManager: concurrency limit, timeouts, retry policy, cancellation, events
    panes/               PaneManager (sessions/views), Driver (CDP via webContents.debugger)
    adapters/            registry.ts + <insurer>/ {adapter.ts, parse.ts, fields.ts, fixtures/, README.md}
                         + mock/ (deterministic success/fail/timeout/login/OTP/CAPTCHA adapters)
    comparison/          normalisation, comparability check, cheapest selection
    storage/             db.ts, migrations/, repositories/, files.ts (evidence store)
    secrets/             SecretStore (safeStorage, fail-closed)
    pdf/                 template rendering + printToPDF
    retention/ settings/ logging/ diagnostics/
  preload/index.ts       contextBridge.exposeInMainWorld('fqf', typedApi)
  renderer/              React screens per 07_UI_UX_AND_WORKFLOWS
resources/fonts/         bundled font containing U+20B9 (₹)
resources/pdf/           report template + CSS
```

### 3.3 Electron security baseline (`06 §2`)

- Every app `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` and `webSecurity: true`. A single factory sets these, and a unit test asserts them.
- **Serve the renderer from a custom `app://` protocol** registered with `protocol.handle`, not `file://`. This allows a strict CSP header (`default-src 'self'`, no `unsafe-eval`, no remote origins).
- **Navigation and popups.** The app window blocks every navigation away from `app://`. Insurer views may only navigate to origins in that adapter's metadata allowlist. `setWindowOpenHandler` denies popups by default; an adapter may allowlist a same-origin popup. `will-download` is cancelled unless explicitly needed.
- **Insurer sessions** come from `session.fromPartition('persist:insurer-<id>')`, one per insurer. Insurer views have **no preload**. Permission request and check handlers deny everything (camera, geolocation, notifications, clipboard-read and so on).
- **IPC.** `ipcMain.handle` is used only through the registry. Each channel is a fixed constant with a Zod request schema. The handler verifies that `event.senderFrame` belongs to the app window's `app://` origin, which provides the "appropriate authorisation" for a single-user app. Responses are `AppResult<T>` (`16 §3`). Unexpected exceptions are mapped to `INTERNAL_ERROR` with a correlation ID; stack traces never reach the renderer.
- **Release hardening.** Apply Electron Fuses: disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments`; enable `EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar`. Each fuse must be verified on both platforms.
- **No remote debugging port.** The driver attaches through the in-process `webContents.debugger` API. Do not use `--remote-debugging-port` or Playwright `connectOverCDP` in production builds, because they would expose authenticated insurer sessions to any local process.

### 3.4 State model (proposed reconciliation of C-01) **[Decision E-05]**

The documents give three different state lists (`02 §2`, `04 §3`, `07 §3`), and the regression pack needs a timeout state that none of them define (TC-14). The proposal is to separate *session* state from *run* state:

| ConnectionStatus (Connect board, per insurer session) | RunStatus (per insurer per run) |
|---|---|
| `not_connected`, `connecting`, `connected`, `login_required`, `otp_required`, `manual_action_required` (CAPTCHA or other human step), `blocked` | `pending`, `running`, `login_required`, `otp_required`, `manual_action_required`, `manual_required`, `completed`, `failed`, `timed_out`, `cancelled`, `unsupported` |

- Every RunStatus maps to the user-facing copy in `07 §3`.
- `blocked` maps to "the app cannot continue automatically" plus the manual path.
- A manual result is `status: completed, source: manual`. It is never shown as automated.

### 3.5 Orchestrator (`03 §5`, `16 §6`)

- `quote.start(quoteId, insurerIds)` validates the stored quote, runs pre-flight checks against each adapter's `requiredFields` (FR-04), creates a `runId` and returns immediately. Progress is delivered through events.
- **Concurrency** is bounded by a small configurable limit; the M1 spike sets the default. Each insurer task gets a child `AbortController` of the run.
- **Timeouts.** Proposal: separate timers for automated steps and for waiting on the advisor (login, OTP, CAPTCHA). The PRD performance target excludes advisor time, and an OTP wait should not count as an automation timeout. See Q-E06.
- **Retry.** At most once. Only for errors classified retryable (`PORTAL_UNAVAILABLE`, `NAVIGATION_TIMEOUT`), and only when the adapter declares the step idempotent. Never retry `AUTH_REQUIRED`, `OTP_REQUIRED`, `MANUAL_ACTION_REQUIRED`, `RATE_LIMITED`, `PARSE_FAILED` or `VALIDATION_FAILED`.
- **Cancellation** is idempotent. Cancelling a finished run is a no-op that returns the current state.
- **Persistence.** Each transition is written as a sanitised `quote_events` row. A terminal result and its event are written in one transaction. An adapter exception becomes a `failed` result for that insurer only (FR-09).
- **Adapter output** is validated with the shared Zod schema. If validation fails, the result becomes `PARSE_FAILED` and no premium is recorded (TC-09).

### 3.6 Adapters and driver (`04`)

- **Adapter contract:** `{ id, displayName, version, mode: 'automated'|'assisted'|'manual', allowedOrigins, requiredFields, run(ctx), parse(snapshot) }`.
- `parse` is a **pure function** of a sanitised snapshot (DOM text, JSON or OCR text) and returns a normalised result. Fixture tests target `parse` only.
- The driver gives adapters a narrow helper API: navigate, wait-for, fill, click, read text, screenshot and dispatch input. It is implemented with `webContents.debugger` (CDP `Runtime`, `DOM` and `Input` domains) or `executeJavaScriptInIsolatedWorld`. CDP input dispatch is what makes coordinate-based Flutter/canvas interaction (HDFC) possible, but only if that interaction is permitted.
- **No CAPTCHA, OTP or MFA handling in code.** The driver detects these challenges, sets the state to `*_required`, and waits for the advisor in the visible view or stops.
- **OCR** (tesseract.js in a worker) is deferred until the HDFC spike shows it is necessary and permitted.
- **Mock adapters** load local HTML fixtures through a mock origin. They allow end-to-end testing of every state without live portals.

### 3.7 Money and comparison (`05 §3`, `08 §3`)

- Premiums are stored as integers in paise. Parsers handle Indian digit grouping (`1,23,456.00`), the `₹`/`Rs.`/`INR` prefixes and ambiguous amounts. An ambiguous amount gives `PARSE_FAILED` with a review warning; it is never guessed.
- **Cheapest eligibility:** status is `completed`, the premium is a valid positive integer, there are no ambiguity warnings, and the comparability key is equal across candidates. The proposed key is sum insured, cover type, member set and tenure, plus premium basis (GST-inclusive or exclusive). The rule itself is owned by the business (Q-B01, Q-B02). Whether manual results are eligible is also undecided (Q-B10).
- If any candidate fails the comparability key, **suppress the highlight** and show the differences (TC-27).

### 3.8 Storage (`05`)

- **SQLite** in `userData`, accessed only from the main process. Foreign keys, WAL mode, numbered migrations with a schema-version table, transactional related writes and indexes on (customer name, created date, status). The driver is better-sqlite3, subject to the M1 packaging spike; `node:sqlite` is the fallback if Electron's Node exposes it stably **[Decision E-03]**.
- **Single-instance lock**, which prevents two writers.
- **Evidence screenshots** go in `userData/evidence/<quoteId>/` and are referenced by relative path. Delete and retention cover rows, evidence files and app-managed temporary PDFs. Exported PDFs saved outside the app are explicitly outside its control (`05 §6`).
- **Corrupt or locked database:** never auto-delete. Open read-only if possible, show a recovery screen and keep the original file.
- **Data at rest is not encrypted** by the current design: names, phone numbers and ages sit in plain SQLite. The documents list "unauthorized local access" as a threat (`06 §1`) but specify no control. Decide between relying on OS account protection plus full-disk encryption (documented and accepted) and encrypting the database. See Q-B17 and risk AR-06. **→ M0: database encryption recommended (§7.3, DM-02).**

### 3.9 SecretStore (`05 §4`, `06 §3`)

- Uses `safeStorage` (Keychain on macOS, DPAPI on Windows). Ciphertext lives in a separate `secrets` file, not in SQLite. SQLite holds only a non-secret reference.
- If `safeStorage.isEncryptionAvailable()` is false, all saves return `SECRET_STORE_UNAVAILABLE`. There is **no plaintext fallback** (TC-21).
- Secrets never cross IPC to the renderer. The UI shows only "saved / not saved" (`07 §2`).
- Persistent insurer partitions also store session cookies on disk (Chromium encrypts cookie values on both target OSes). This must be acknowledged (C-08), cleared on "Disconnect/forget", and covered by the retention policy.

### 3.10 PDF service (`08`)

- **Rendering.** Main builds the HTML from **persisted, validated** data with strict escaping, because plan names come from untrusted portals. It renders in a hidden window with `javascript: false`, no preload, and network requests blocked.
- **Output.** `printToPDF` with A4, `printBackground`, a footer template carrying page numbers, and tagged PDF output for accessibility if supported.
- **Fonts.** Bundle a font that includes U+20B9 and reference it locally with `@font-face`. This is a known failure mode: **the doc-pack PDFs themselves render ₹ as "■"** (`05 §3`, `08 §3`, `09` TC-17).
- **Layout.** Test 1, 2, 4 and 8 insurer layouts with `break-inside: avoid` on rows and status boxes.
- **Filenames** use the quote reference and date, not customer names (`08 §3`).

### 3.11 Logging and diagnostics (`06 §6`, `13`)

- Logging is structured and **allowlist-based**: events carry only typed fields (version, correlation ID, run ID, insurer ID, state, error code, timing, retry count). This is safer than regex redaction of free text.
- Log files are rotated in `userData/logs`.
- `diagnostics.export()` assembles the bundle, shows it to the user for review, and then writes it.

## 4. Gaps between the documents and reality

| # | Gap | Impact | Recommendation |
|---|---|---|---|
| G-1 | Frozen SDK, Zod schemas, driver/CDP approach, helper library and smoke runner are assumed to exist but are absent | The documents' "defer to the existing contract" rule has nothing to defer to | Confirm with the owner (Q-01). If they are absent, M3 creates the single contract and freezes it after review |
| G-2 | The nine-page source PRD and the conversation task list are not in the repository | Unclear whether the four-page PRD is complete; "where required by the task plan" clauses cannot be checked | Add both to `docs/` (Q-02) |
| G-3 | No version control | No change history, review or rollback | `git init` and push to a private remote before any code (M0) |
| G-4 | Several business rules are undefined (comparability, premium basis, age limits, sum-insured values, retention, legal text) | FR-02, FR-03, FR-12, FR-15 and FR-18 cannot be finished | Build configurable mechanisms; release only with approved values |
| G-5 | Per-insurer product/plan selection is unspecified | Adapters cannot know which product to quote | Owner decision per insurer (Q-B16) |

## 5. Technical risks

Existing RAID IDs (`14`) are cited where they apply. AR-xx are new architecture risks.

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| AR-01 | The macOS 12 floor (`01 §11`) may be unsupported by current Electron/Chromium; pinning an old Electron leaves security patches behind | Medium / High | Verify in M1. Prefer raising the OS floor to pinning an unsupported Electron (Q-E01). **→ M0: Electron's documentation states that Electron ≥ 44 needs macOS 13 (§7.2); not yet tested on hardware** |
| AR-02 | Native module (better-sqlite3) ABI and packaging issues across Windows x64, macOS x64 and macOS arm64 | Medium / High | M1 spike builds and runs on all three targets. Keep the `node:sqlite` fallback |
| AR-03 | Delivery date: the documented freeze (26 Oct 2026 12:00) and handover (27 Oct) fall on or after the audit date, and no code exists | Certain / Critical | Re-plan (Q-00). The manual-first release path shortens the critical path |
| AR-04 | Live adapter work depends entirely on external permission and accounts (R-10) | High / High | Ship the manual-first baseline; gate each adapter separately |
| AR-05 | Memory and CPU with up to eight live insurer views at once | Medium / Medium | Bound concurrency, lazily create views, destroy views when a run ends (keep sessions) |
| AR-06 | Unencrypted local PII in SQLite and evidence files | Medium / High | Decide Q-B17. Document the reliance on OS account and disk encryption if accepted |
| AR-07 | Untrusted portal strings reaching the PDF or UI (injection) | Medium / High | Escape everything, PDF window with JS disabled, React default escaping, never `dangerouslySetInnerHTML` |
| AR-08 | Persistent insurer sessions retain authenticated cookies on disk (C-08) | Medium / Medium | Cookie-encryption fuse, "Forget session" action, retention clearing |
| AR-09 | OTP and CAPTCHA steps make automation timing unpredictable | High / Low | Separate automation and advisor-wait timers (Q-E06) |
| AR-10 | Portal changes break parsers (R-01) | High / Medium | Pure parsers, fixtures, fast manual fallback, per-adapter version in results |

## 6. Recommendations (in priority order)

1. **Resolve Q-00, Q-01 and Q-02 before writing code.** If an existing codebase exists elsewhere, this plan must be re-based on it rather than duplicating it.
2. **Adopt the manual-first release path.** Shell, storage, manual entry for all eight insurers, comparison, PDF and history meet G2, G3 and G4 and most P0 requirements without any insurer authorisation. Automated adapters are then added one at a time behind their gates.
3. **Build the security baseline (section 3.3) and the IPC envelope in the first code milestone, not at the end.**
4. **Freeze `src/shared/contracts` after the M3 review.** Afterwards, change it only through change control (`19`).
5. **Run the M1 spikes on real Windows and macOS hardware early:** the native database module, the ₹ glyph in a PDF, `safeStorage`, and unsigned packaging.

---

## 7. M0 architecture positions (26 October 2026)

Every item below is a **recommendation** unless it is labelled *Evidence*. At M0 finalisation, DM-01 to DM-09 were recorded as **provisional directions** from the project lead. **The PO, client and security approvals are all still pending**, and no technical test has been run. See the decision register in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) §0.2. *Evidence* here means documentary evidence: release notes, official docs or package contents. It is **not** a platform test; the M1 spikes provide those.

### 7.1 Existing codebase (Q-01)

*Evidence:* no Quote Fetcher code, SDK or schemas exist in the local home folder, in the 60 repositories of GitHub account `harshitsharma7017`, or in `../fiducial/`. **Position:** greenfield. M3 creates the single shared contract (§3.2 `src/shared/contracts`), and it is frozen after review.

### 7.2 Electron and OS support matrix (DM-01)

*Evidence:* npm registry; electron/electron at tag `v45.0.0`.

| Electron line | Status on 26 Oct 2026 | macOS minimum | Windows |
|---|---|---|---|
| 45 (45.0.0, released 21 Oct 2026; Chromium 156, Node 24.22) | Supported, latest | 13 Ventura | 10+ (x64, arm64) |
| 44 (44.9.3) | Supported | 13 Ventura | 10+ |
| 43 (43.8.3) | Supported, oldest; likely out of support when 46 ships (about 16 Dec 2026, by cadence) | 12 Monterey | 10+ |

**Proposed matrix:** Electron 45.x; Windows 10 22H2 and 11 on x64; macOS 13+ on x64 and arm64. Release artefacts:

- Windows: NSIS installer, x64.
- macOS: two DMGs (arm64 and x64), or one universal DMG, chosen by S3 and S6 (a universal build doubles the native-module packaging work).

**Maintenance consequence:** Electron supports only the latest three majors, about 24 weeks per line. A 45.x release stays patched until roughly April 2027. Plan an Electron upgrade every one or two releases. Without auto-update (P1-04), clients must reinstall to get Chromium security fixes (AR-15).

### 7.3 Customer data at rest (DM-02)

**Recommended design (option B):**

- **Database.** `better-sqlite3-multiple-ciphers` (API-compatible with better-sqlite3) opens `fqf.db` with a random 256-bit key. The key is generated with `crypto.randomBytes` on first run and stored only as `safeStorage.encryptString` ciphertext in `userData/keys`. It never goes to SQLite, logs or IPC.
- **Evidence files.** AES-256-GCM using Node `crypto`, with a separate wrapped key, a per-file random nonce and an authentication tag.
- **Fail closed.** If `safeStorage.isEncryptionAvailable()` is false or the key cannot be unwrapped, the app shows a blocking "secure storage unavailable" screen with support guidance. It never creates a plaintext database and never re-keys silently over existing data.
- **Threats covered:** copied profile folders, backups, disk images, other OS accounts. **Not covered:** malware running as the same user, or an unlocked logged-in session. Both are residual risks to document and to present to the security reviewer for acceptance. **They have not been accepted yet.**
- **Recovery:** losing the OS key store means losing local history. The user guide states this, and exported PDFs are unaffected.
- **Option A fallback:** if DM-02 picks A, the plain `better-sqlite3` driver is used and the install guide makes full-disk encryption a prerequisite. The repository and service interfaces are the same either way, so only `storage/db.ts` and `files.ts` differ.

### 7.4 Insurer session isolation and storage (DM-03; Track B)

**Recommended design (option A):**

- One `session.fromPartition('persist:insurer-<id>')` per insurer, created only by PaneManager.
- Views are `WebContentsView`s with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` and **no preload**.
- `setPermissionRequestHandler` and `setPermissionCheckHandler` deny everything. `will-navigate`, `will-redirect` and `setWindowOpenHandler` enforce the adapter's `allowedOrigins`. `will-download` is cancelled.
- No cookie copying between partitions; there is no API path for it.
- `EnableCookieEncryption` fuse on (cookie values encrypted with the OS key).
- "Sign out and forget" calls `session.clearStorageData()` and `clearCache()` for that partition. App reset clears all partitions.
- Under DM-05 these sessions are **not part of R1**.

### 7.5 Portal automation without a remote debugging port (DM-04)

- The driver uses `webContents.debugger.attach()` and `sendCommand()` (CDP `DOM`, `Runtime`, `Input`) inside the main process. Nothing listens on a TCP port.
- **Startup guard.** In packaged builds, the first lines of `main/index.ts` exit if `process.argv` contains `--remote-debugging-port`, `--remote-debugging-pipe`, `--inspect`, `--inspect-brk` or `--js-flags`. The guard runs before `app.whenReady()`. S2 measures whether Chromium opens the port before the guard can react; if it does, a launcher-level mitigation is needed (AR-16).
- **Fuses:** `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `OnlyLoadAppFromAsar` on, `EnableEmbeddedAsarIntegrityValidation` on.
- **Development** builds may use DevTools for the app renderer, never a remote port.

### 7.6 PDF generation with a correct ₹ (DM-08)

- Bundle Noto Sans (OFL-1.1) under `resources/fonts/` and load it through `@font-face` from the app protocol. **No system-font fallback for currency text.**
- The render window has `javascript: false`, no preload, and network requests blocked by a `webRequest` filter (offline-safe, NFR-OFFLINE).
- `printToPDF` options: A4, `printBackground`, and a `footerTemplate` with page numbers.
- **Acceptance (automated):**
  1. A font unit test asserts that the bundled font's character map contains U+20B9.
  2. A PDF test extracts text with pdfjs-dist and asserts that `₹` appears and U+25A0 `■` does not.
  3. The test checks that fonts are embedded.
- **Acceptance (manual):** visual check of 1, 2, 4 and 8-insurer PDFs on Windows and macOS (TC-15 to TC-17). This failure mode is real: the doc-pack PDFs print ₹ as ■.

### 7.7 Comparability engine (supports any DM-06 outcome)

Each insurer result stores the comparison inputs explicitly. Manual entry captures them too, so the manual form depends on DM-06:

```
sumInsuredPaise, coverType, memberSetKey (relationship+age band per member), tenureYears,
premiumBasis: 'incl_gst' | 'excl_gst' | 'unknown', basePremiumPaise?, gstPaise?, totalPremiumPaise,
addOns: 'none' | 'unknown' | string[], source: 'automated' | 'manual', evidenceRef?
```

`compare(results, rule)` is a pure function. `rule` is versioned configuration: basis, allowed tenure, add-on policy, whether manual results are eligible, and tie handling. It returns `{eligible[], excluded[{id, reason}], cheapestIds[]}`. The `reason` values drive the "why not ranked" text in the UI and PDF (TC-27). The rule version is stored with each generated PDF, so a regenerated PDF can be explained later.

### 7.8 Effect of the manual-first R1 (DM-05)

R1 needs no PaneManager, orchestrator, driver or adapters. Its runtime surface is the app renderer, IPC, storage, PDF and packaging. This removes untrusted remote content from R1 entirely, which is a security as well as a schedule benefit. The Track B components (§3.5, §3.6, §7.4, §7.5) are built in R2 on the same contracts.

### 7.9 Risk register additions

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| AR-11 | N-API prebuilds of better-sqlite3 13 may not load in Electron 45 as packaged (signing, asar unpacking, arm64/x64 selection) | Low–Medium / High | Spike S3 on all three targets; `asarUnpack` for `*.node`; fall back to building from source with `@electron/rebuild` |
| AR-12 | Electron 45.0 is a new `.0` major | Medium / Medium | Pin the latest 45.x patch at M2. Fall back to 44.9.x, which has the same macOS 13 floor |
| AR-13 | Encrypted-database key loss (OS reinstall, keychain reset) makes history unrecoverable | Low / Medium | Documented. PDFs are exported outside the app. Recovery screen never deletes data. Optional backup if Q-B15 requires it |
| AR-14 | Signing identities have long external lead times: Apple organisation enrolment needs a D-U-N-S number, and Windows certificates need organisation validation and an HSM or cloud signing service | High / High | Start Q-D04 and Q-D05 now. Agree in writing whether UAT may use unsigned builds |
| AR-15 | Electron's ~24-week support window per line, with no auto-updater in R1 | High / Medium | Maintenance release cadence in the support plan. Treat P1-04 auto-update as a priority for R2 |
| AR-16 | Chromium may start the DevTools server from a command-line switch before app code runs | Unknown / High (Track B only) | Measured in S2. If confirmed, document it, keep insurer sessions out of R1, and evaluate mitigations before R2 |

---

## 8. M1 evidence (26 October 2026)

Source: [docs/evidence/M1/](docs/evidence/M1/README.md). Platform: **macOS 15.7.2 on Apple M4 only**, in development and packaged (ad-hoc, fused) builds. Each item below is labelled **Confirmed here** (measured on this platform), **Corrected** (an earlier statement in this document was wrong or incomplete) or **New**. Sections 1–7 are unchanged; where this section corrects them, this section wins.

| Topic | Label | Finding | Affects |
|---|---|---|---|
| Electron 45 runtime | Confirmed here | Launches, sandboxed renderer, context isolation, strict-Zod IPC rejection, clean shutdown (S1) | §3.3, §7.2 |
| Partition isolation and default-deny policy | Confirmed here | No cross-partition cookie, storage or HTTP leakage; navigation, redirect, popup and permission requests blocked (S2, mock portal) | §7.4 |
| Cookies at rest | **New** | Without the `EnableCookieEncryption` fuse, insurer cookies are stored in **plaintext**; with it they are stored only as `v10` ciphertext. The fuse is **mandatory** if DM-03 option A is adopted | §7.4, C-08 |
| Launch guard vs. fuses | **Corrected** | §7.5 treated the guard as the main control. Measured: `--inspect`, `--inspect-brk` and `NODE_OPTIONS=--inspect` open Node's inspector **before** app code runs, and `--inspect-brk` blocks the guard entirely. Only the `EnableNodeCliInspectArguments`, `EnableNodeOptionsEnvironmentVariable` and `RunAsNode` fuses closed these. The guard remains useful for `--remote-debugging-port/-pipe` | §7.5, DM-04 |
| AR-16 (DevTools port before guard) | Confirmed here (narrowly) | Without a guard, port 9222 accepted connections at ~162 ms; with the guard, the app exited first and no port was observed. Timing-dependent; re-measure on Windows and slow hardware | AR-16 |
| `safeStorage` API | **Corrected** | §3.9 and §7.3 named the synchronous `safeStorage` calls. They are deprecated in Electron 45 and documented for **removal in Electron 46**. Use `isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`. Old sync ciphertext decrypts with the async API. Storage reports *unavailable* before `ready` | §3.9, §7.3 |
| `safeStorage` integrity | **New** | Ciphertext is **not integrity-protected** on this Mac: 27 of 48 single-bit tamperings decrypted to corrupted values instead of failing. The SQLCipher database stays fail-closed (no corrupted key opened it), but secrets stored with `safeStorage` alone could be silently corrupted. **Proposal (needs DM-02 security review):** use `safeStorage` only to wrap random data keys; protect secrets and evidence files with AES-256-GCM. **Implemented in the spike as Q-M1-01** (data keys verified by an HKDF key-check value; AES-256-GCM envelope v1 with authenticated header and name). On real macOS `safeStorage` every tampering attempt was rejected ([evidence](docs/evidence/M1/Q-M1-01-secret-vault.md)) | §3.9, §7.3, P1-02 |
| Encrypted SQLite | Confirmed here | SQLCipher v4 mode via `better-sqlite3-multiple-ciphers` 13.0.3: no plaintext header or data in the database or WAL; wrong or missing key gives `SQLITE_NOTADB`; N-API prebuild works in the packaged, asar-integrity-checked app with `asarUnpack: **/*.node` | §3.8, §7.3, AR-11 |
| PDF ₹ | Confirmed here | Bundled Noto Sans (OFL 1.1, licence verified in the font files) renders ₹ as extractable U+20B9; the regression test detects ■, ?, � and fallback fonts | §7.6 |
| PDF header and footer | **New** | `printToPDF` `headerTemplate`/`footerTemplate` do not use page fonts (footer embedded as Times-Roman). Keep branding and any ₹ in the page body | §3.10, §7.6 |
| Packaging hygiene | **New** | `@electron/packager` pruning removes devDependency modules but not non-module folders such as `.bin` and caches. The product packaging config needs an explicit filter and a content check in CI. All eight platforms' SQLite prebuilds were shipped and should be trimmed per target | M10 |
| Development environment | **New** | The IDE exports `ELECTRON_RUN_AS_NODE=1`, so unfused Electron binaries run as Node. Launch scripts must clear it. This is also a live demonstration of why the `RunAsNode` fuse matters | §7.5 |

### 8.1 Risk register additions and updates

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| AR-11 (update) | Native-module packaging | Reduced on macOS arm64 (works packaged); **open** for Windows x64 and macOS x64 | Complete S3 on those targets |
| AR-16 (update) | DevTools port before guard | Not observed on macOS arm64; open elsewhere | Fuses always on; re-measure on Windows |
| AR-17 | Sync `safeStorage` removed in Electron 46 (expected around mid-December 2026) | Certain / High if sync calls are used | Async API only; lint rule banning the sync methods |
| AR-18 | `safeStorage` ciphertext lacks integrity protection | Confirmed on macOS / Medium | AES-256-GCM with a `safeStorage`-wrapped data key for all non-database secrets. **Mitigation implemented and tested on macOS (Q-M1-01)**, with 7 internal-review defects fixed (including the keyring lost-update and non-exclusive initialisation). Windows and the independent security review are still pending; limitations L1–L11 are unresolved, not accepted |
| AR-19 | Developer tooling environment variables (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`) change runtime behaviour | High in development / Medium | Clean environments in scripts and CI; fuses in every packaged build |
| AR-20 | Dev-only files shipped in the package | Medium / Low–Medium | Explicit packaging allowlist plus a CI check of `app.asar` contents |

---

## 9. M2 implementation notes (27 October 2026)

How M2 implemented §3. Verified on macOS 15 arm64 only.

| Topic | Implementation | Note |
|---|---|---|
| Layout | `src/main` (security, ipc, logging, windows, smoke), `src/preload`, `src/renderer` (React), `src/shared/ipc` | Matches §3.2 for the parts in M2 scope |
| `app://` | Privileged standard and secure scheme; `protocol.handle` serves `out/renderer` only, with CSP, `nosniff` and COOP headers. The resolver rejects other hosts, encoded separators, NUL and backslashes, and confines results to the renderer folder | WHATWG URL parsing already normalises `%2e%2e` segments, so such requests map *inside* the root (a 404 at runtime); tested |
| Origins | Compared as `scheme//host`, because WHATWG `URL.origin` is `"null"` for non-special schemes such as `app:` | Used by the navigation policy and the IPC sender check |
| Development CSP | Applied only to the validated loopback dev-server origin in unpackaged builds. Allows the inline React refresh preamble and the HMR WebSocket | Never applies to `app://`; production CSP has no `unsafe-*` (tested) |
| IPC | Contract-driven dispatcher (Electron-free, unit-tested) plus thin `ipcMain` wiring. Sender must be a registered window's top frame on the app origin. Responses are also schema-validated | New error code `FORBIDDEN_SENDER` (OPEN_QUESTIONS §0.5) |
| Preload | Bundled to one CommonJS file (305 bytes) importing only channel names. No zod, no raw `ipcRenderer` | Sandbox-compatible |
| Smoke mode | `--smoke-test` (a P1-05 subset): throwaway userData; checks the bridge, isolation, sandbox, CSP effect, TC-23, protocol confinement; prints booleans only | The launch guard is enforced in smoke runs too |
| Launch guard | Enforced in packaged builds and smoke runs; plain `npm run dev` stays debuggable | The fuses remain the primary control (M1 S2) |
| Single instance | `app.requestSingleInstanceLock()` (L6 / AR prerequisite for the vault) | Implemented; **not yet exercised by an automated test** |
| Packaging | electron-builder `electronFuses` sets the DM-04 fuses; `check-package.mjs` allowlists asar contents (`package.json`, `out/`, `zod`) and verifies fuses | arm64 and x64 DMG and NSIS cross-built; all pass the check |
| Renderer bundle | Not minified (electron-vite default), 568 kB | Consider minification in M10 |

### 9.1 Risk register additions

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| AR-21 | electron-vite 6.0.0 was 13 days old at adoption (5.x lacks Vite 8 support) | Low / Medium | Pinned; review patch releases before M10 |
| AR-22 | CI and Windows runtime unverified: Windows-specific failures (paths, protocol, NSIS, fuses at runtime) could surface late | Medium / High | Obtain a remote and Windows hardware (Q-D07, Q-M1-02) before M4 |

## 10. M3 implementation notes (27 October 2026)

How M3 implemented §3.6, §3.7 and §7.7. All code is in `src/shared/` and is pure: no Electron, Node, I/O, clock, randomness or locale. Lint rules enforce this.

| Topic | Implementation | Note |
|---|---|---|
| Layout | `src/shared/contracts/` (Zod schemas and types), `money.ts`, `rules/` (versioned rule tables), `validation/` (request rules and pre-flight), `comparison/` (normalise, validity, eligibility, comparability, selection, `compareQuotes`) | Contracts are `draft` until reviewed |
| Money | Integer paise. The parser accepts plain digits or Indian grouping, `₹`/`Rs.`/`INR`, the `/-` suffix and at most two decimals. It rejects with a reason code: negatives, ranges, Western grouping, extra text, more decimals, and values beyond `MAX_SAFE_INTEGER`. The formatter does not use `Intl` | Property-tested round trip over the whole safe range |
| Errors | `{ path, code }` only, as in the M2 dispatcher. No values, no unexpected key names, capped at 20 | Tested with synthetic sensitive values |
| Normalisation | Adapter or manual input becomes `NormalizedResult`. Missing amounts are `null`; missing terms are `unknown`. Amount text that fails to parse is dropped and only its reason is kept | Nothing is defaulted to zero or copied from the request |
| Pipeline | Validity (premium, currency, plan, review flags; consistency of premium parts depends on the GST basis), which also covers set-level duplicates. If valid: **eligibility** (rule gates: manual, premium basis, ranked tenure) and **comparability** (sum insured, which may be unknown or unreadable, cover type, member set and tenure against the request; required terms known). Then term differences across the comparable set, then selection | A valid result that fails eligibility or comparability suppresses the highlight under `suppress_highlight` |
| Output | `{ contractsVersion, rule {id, version, status}, comparable[], excluded[{index, resultId, insurerId, findings}], differences[], cheapest, noHighlightReason }`. Exactly one of `cheapest` and `noHighlightReason` is non-null | Extends §7.7's `{eligible, excluded, cheapestIds}` with explicit reasons |
| Determinism | Ordering is premium, then insurer ID, then result ID. Ties highlight all of them in that order. The output is identical for any input order (property-tested) and the input is never mutated | `compareText` replaces `localeCompare` (lint-enforced) |
| Adapter SDK | Metadata schema (HTTPS-only `allowedOrigins`; `requiredFields` from a closed list) and `InsurerAdapter`/`AdapterRegistry` **types**. `parse` returns the same input shape as manual entry | No implementation until M5/M6 |

### 10.1 Risk register additions

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| AR-23 | The strict provisional rule (unknown terms are never comparable) may mean **no highlight in practice** until adapters and the manual form capture co-pay, deductible, room rent and add-ons | High / Medium | PO decision on Q-B01/Q-B02. The policy is configuration (`ignore` per term), so relaxing it is a reviewed data change |
| AR-24 | Contracts are draft; M4–M6 may build on them before the freeze | Medium / Medium | Hold the contract review before M4 storage schemas are written; bump `CONTRACTS_VERSION` on any change after the freeze |
| AR-25 | Windows CI fails at lint, so the Windows type-check, tests and smoke have never run. **Root cause, confirmed by reproduction:** with `* text=auto` and no `eol`, a Windows checkout (`core.autocrlf=true`) writes CRLF, and Prettier (`endOfLine: lf`) flags all 50 checked files | High / Medium | `* text=auto eol=lf` (`fix/windows-ci-eol`, `cbe74e7`). It is verified on a simulated CRLF checkout (Prettier passes; no committed file changes on renormalisation; all PDFs byte-identical). **Approved and applied to the M3 branch working tree, uncommitted (27 Oct).** Still needs a real Windows CI run |
