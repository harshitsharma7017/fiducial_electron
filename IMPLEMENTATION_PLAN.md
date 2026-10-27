# Implementation Plan — Fiducial Quote Fetcher

| | |
|---|---|
| Date | 26 October 2026 |
| Basis | Workstreams in `15_DELIVERY_PLAN_AND_DEFINITION_OF_DONE §1`, mapped onto the current repository state (no code; see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)) |
| Design reference | [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) |
| Blocking questions | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) |

## 1. Schedule warning

`15 §2` sets feature freeze at **26 October 2026, 12:00** and client handover on **27 October 2026**. Both fall on or after this audit, and the repository has no implementation. **Neither date can be met.** A revised schedule must be agreed before work starts (OPEN_QUESTIONS Q-00). This plan gives the order, dependencies and exit criteria. It does not give calendar dates, because those depend on Q-00, on access to insurers and on the M1 spike results.

> **M0 update (26 Oct 2026):** the release structure, a revised schedule estimate, the detailed M1 spike plan and the M0 status are in **§7 to §11** below. Sections 1–6 are the original audit plan and remain valid except where §7 changes the order.

## 2. Strategy: manual-first, then automation

All eight insurer automations depend on external permission, accounts and portal feasibility (`14` R-02, R-10). Most of the product does not. The plan therefore has two tracks:

- **Track A — Releasable baseline (no insurer access needed).** Security shell, contracts, storage, orchestrator with mock adapters, all screens, manual entry for all eight insurers, comparison, PDF, history, packaging and guides. This satisfies FR-01 to FR-18 except live automation, and meets goals G2, G3 and G4. Release criterion 3 in `01 §14` ("each non-automated insurer completes end-to-end through manual entry") is met for every insurer.
- **Track B — Automated adapters.** Each insurer is a separately gated increment. One adapter enables nothing for another. An adapter ships only with written permission, sanitised fixtures, tests, a README and a tested manual fallback (`15 §4`).

This follows decision D-05 (manual fallback is required), and the PRD itself frames the insurer plan as "target, not guarantee" (`01 §7`).

## 3. Milestone overview and dependencies

```
M0 Decisions & baseline ─► M1 Spikes ─► M2 Scaffold+security ─► M3 Contracts/SDK ─┬─► M4 Storage/settings/secrets ─┐
                                                                                 └─► M5 Orchestrator/panes/mocks ─┤
                                                                                                                  ▼
                                                     M6 UI + manual entry ─► M7 PDF ─► M10 Packaging/release ─► M11 Docs/UAT/handover
                                                                                         ▲
                       (gated per insurer)   M8 First live adapter ─► M9 Remaining adapters
                                              requires M5 + D-01/D-02 approvals
```

| Milestone | Track | Workstream (`15 §1`) | Hard dependencies | Blocked by (OPEN_QUESTIONS) |
|---|---|---|---|---|
| M0 Decisions and baseline | — | — | — | Q-00 to Q-03 |
| M1 Technical spikes | A/B | 1. Spike | M0 | Q-E01 (OS targets), test hardware Q-D07 |
| M2 Scaffold and security baseline | A | 2. Foundation | M1 | E-02 |
| M3 Contracts (SDK) and domain logic | A | 2. Foundation | M2 | C-01, C-02, C-04, C-05; placeholders allowed for Q-B01 to Q-B05 |
| M4 Storage, settings, SecretStore, retention | A | 3. Shell/storage | M3 | Q-B06 (value only), Q-B09, Q-B15, Q-B17 |
| M5 Orchestrator, PaneManager, mock adapters | A | 2. Foundation | M3 | Q-E04, Q-E06 |
| M6 UI screens and manual entry | A | 5. UI | M4, M5 | Q-B11, Q-B12 |
| M7 PDF report service | A | 6. PDF/branding/QA | M4, M6 | Q-B07, Q-B08 (content only) |
| M8 First live adapter (vertical slice) | B | 4. Vertical slice | M5, M7 | Q-D01, Q-D02, Q-B16 |
| M9 Remaining adapters | B | 7. Adapters | M8 | Q-D01, Q-D02, Q-B16 per insurer |
| M10 Packaging, signing, update, hardening | A | 8. Release | M7 | Q-D04 to Q-D07 |
| M11 Documentation, UAT and handover | A | 8. Release | M10 | Q-D03, Q-D08 |

---

## 4. Milestones

Every milestone also inherits the project Definition of Done (`15 §4`): reviewed and merged; relevant tests pass; regression coverage added; no secrets or real customer data; documentation and known limitations updated; evidence recorded; scope or risk changes accepted by the product owner.

### M0 — Decisions and baseline (no product code)

**Deliverables**
- Answers or explicit deferrals for Q-00 (revised schedule), Q-01 (whether a frozen SDK exists elsewhere), Q-02 (missing source PRD and task list) and Q-03 (approval of this document set).
- `git init`, a private remote, branch protection, and a `.gitignore` covering build outputs, `*.db`, logs and raw captures.
- Optionally, move the PDFs into `docs/` as `00_README_DOCUMENT_INDEX` suggests (owner's choice; Q-E09).

**Definition of done:** the revised schedule is recorded, and the repository is under version control with these planning documents committed.

### M1 — Technical spikes (`15 §1` workstream 1)

Spikes are throwaway or `spikes/` code. Each produces a short written result. **→ M0: the detailed spike plan with pass criteria is in §9 and supersedes this table where they differ.**

| Spike | Question answered | Evidence |
|---|---|---|
| S1 Electron version and OS floor | Which stable Electron supports Windows 10/11 x64 and the macOS floor? | Version decision recorded in E-01 |
| S2 Panes and driver | Can isolated `persist:` partitions in WebContentsView, driven by `webContents.debugger`, fill, click and read a **local mock portal**? Also time-boxed checks on one permitted live portal *only if* Q-D01/Q-D02 are already answered | Demo plus notes |
| S3 SQLite packaging | Does better-sqlite3 build and run in packaged apps on Windows x64, macOS x64 and macOS arm64? | Packaged app opens a database on each target |
| S4 PDF ₹ glyph | Do `printToPDF` and a bundled font render ₹ with selectable text on both OSes? | Sample PDFs from both OSes |
| S5 safeStorage | Behaviour on both OSes, including an unavailable or locked keychain | Notes |
| S6 Signing pipeline | Do signing identities exist, and can notarisation run? | Yes/no and owner (Q-D04, Q-D05) |

**Definition of done:** each spike has a recorded outcome, E-01 to E-04 are decided, and newly found risks are added to `14`.

### M2 — Scaffold and security baseline

**Deliverables**
- electron-vite and electron-builder project with TypeScript strict mode, React renderer, ESLint, Prettier, Husky and lint-staged, and Vitest.
- `package.json` scripts: `lint`, `typecheck`, `test`, `build`, `build:win`, `build:mac` (`10 §1`).
- Secure window factory; `app://` protocol with CSP; navigation, popup, permission and download guards (ARCHITECTURE_REVIEW §3.3).
- IPC registry: constant channels, Zod validation, sender verification and the `AppResult`/`AppError` envelope (`16 §3`). Typed preload bridge with no raw `ipcRenderer`.
- Allowlist-based structured logger with correlation IDs. Secret scanning (for example gitleaks) in pre-commit and CI.
- CI running lint, typecheck and test on Windows and macOS.

**Tests:** TC-22 (invalid IPC payload rejected), TC-23 (navigation and popup blocked), a webPreferences assertion test, and logger tests showing forbidden fields cannot be logged.

**Definition of done:** an empty app launches on both OSes from `npm run dev`, CI is green, and the security baseline items SEC-01 to SEC-06 and LOG-01 are verified.

### M3 — Contracts (SDK) and domain logic

**Deliverables**
- `src/shared/contracts`: customer, member, quote request, insurer result, `RunStatus`/`ConnectionStatus`, error codes (merged list, C-02), progress event, IPC request and response schemas.
- Adapter interface and registry types (ARCHITECTURE_REVIEW §3.6).
- Money utilities (integer paise; Indian-format parse and format); validators for pincode, age, sum insured and floater rules, using **configurable** rule tables with placeholder values until Q-B03 to Q-B05 are answered.
- Comparison engine: eligibility, a comparability key behind a pluggable rule (placeholder until Q-B01/Q-B02), and cheapest selection that never ranks missing values.
- Contract review, after which the contract is frozen.

**Tests:** TC-01 to TC-04 (schema level), TC-09, TC-10, TC-27, and property-based tests for money parsing and formatting.

**Definition of done:** contracts are reviewed and frozen, 100% of comparison and money branches are covered, and the placeholder rules are clearly marked and listed under known limitations.

### M4 — Storage, settings, SecretStore and retention

**Deliverables**
- SQLite database, migration runner and initial migration for the entities in `05 §2`. Repositories with transactional related writes.
- Evidence file store. Cascading deletion with a sanitised audit event.
- Settings and branding storage, including logo import with type and size checks.
- SecretStore over `safeStorage`, fail-closed, with a separate ciphertext file. Saving credentials stays behind a setting that is off until Q-B09 is answered.
- Retention job (configurable N days; disabled or placeholder until Q-B06), covering rows, evidence and app-managed temporary files.
- Locked or corrupt database handling: read-only open where possible, a recovery screen, and no automatic deletion.

**Tests:** TC-19 (persistence across restart), TC-20 (retention expiry), TC-21 (SecretStore unavailable means no plaintext), migration-upgrade test (part of TC-26), deletion of linked files (part of TC-28).

**Definition of done:** the tests pass on both OSes, a dummy database can be inspected and contains no secrets, and the deletion audit event contains no PII.

### M5 — Orchestrator, PaneManager and mock adapters

> **→ M0:** if DM-05 is approved, M5 moves from the R1 path to the start of Track B (R2). See §7.

**Deliverables**
- PaneManager with per-insurer partitions, an origin allowlist from adapter metadata, view lifecycle and a "Forget session" action. Portal window UX as decided in Q-E04.
- Driver helper API (CDP through `webContents.debugger`). Challenge detection hooks that set `*_required` states and **never** solve challenges.
- Orchestrator with a concurrency limit, the timeout policy (Q-E06), single classified retry, idempotent cancel, persisted transitions and sanitised progress events.
- Mock adapters with local fixtures for: success, failure, timeout, login required, OTP required, CAPTCHA/blocked, malformed result and missing premium.
- Smoke CLI or test harness that runs mocks end to end (P1-05).

**Tests:** TC-05 to TC-08, TC-12 to TC-14, a partition isolation test (SEC-12) and an orchestrator stress test with eight concurrent mocks.

**Definition of done:** all state transitions are covered with mocks, there is no unhandled rejection under cancel or timeout races, and the progress payloads are checked to contain no PII.

### M6 — UI screens and manual entry

**Deliverables** (`07_UI_UX_AND_WORKFLOWS`)
- Dashboard, New Quote (multi-member, insurer selection, review, unsaved-change warning), Connect board, Results, Manual entry with evidence, History (search, reopen, duplicate, delete), Settings and first-run wizard.
- User-facing state copy exactly as written in `07 §3`; status always shown as text, never by colour alone.
- Accessibility: labels, keyboard order, visible focus and focus-managed dialogs.
- Review/exclude before PDF only if Q-B12 is approved.

**Tests:** TC-11, TC-28, UI tests for TC-01 to TC-04, an accessibility checklist, and an end-to-end flow (new quote, mocks, one failure, manual entry, results).

**Definition of done:** a non-developer can complete the manual-first flow for all eight insurers using dummy data. Manual results never look like automated ones.

### M7 — PDF report service

**Deliverables** (`08_PDF_REPORT_SPEC`)
- Template with every required section, bundled font, escaping and JS-disabled render window.
- Status boxes; "Entered manually" tag; the indicative-premium statement; cheapest highlight only when comparable, otherwise the differences are shown.
- Save dialog, a filename without PII, a history link, offline regeneration and an export warning.

**Tests:** TC-15 to TC-18, 1/2/4/8-insurer layout snapshots, long plan names, page breaks, selectable text, an offline-regeneration test and a timing check under 5 seconds.

**Definition of done:** PDFs generated on both OSes are reviewed and archived as evidence. Branding and legal text are marked **placeholder** until Q-B07 and Q-B08 are approved.

### M8 — First live adapter: vertical slice (Track B, gated)

**Entry gate:** written permission for the insurer (Q-D01), an authorised test account with an available OTP holder (Q-D02), the product and plan to quote (Q-B16), and dummy member data (Q-D03). Candidate: ICICI Lombard, or whichever insurer is approved first (`15 §1`).

**Deliverables:** adapter, pure `parse.ts`, at least 3 sanitised fixtures (success, missing or changed field, malformed or ambiguous), README (`04 §5`), sanitised fixture capture tooling (P1-06), and a live run record.

**Tests:** fixture tests with exact normalised outputs; PRD cases 1–4 (and 5 if floater) with client-supplied expected values; a live check on both OSes.

**Definition of done:** `15 §4`, including a tested manual fallback. An adapter without sanitised fixtures and a tested fallback is not release-ready.

### M9 — Remaining adapters (Track B, gated per insurer)

Repeat M8 for each approved insurer, in the order approvals and spike results allow. Suggested order by feasibility (`04 §6`): Niva Bupa, then Tata AIG (assisted OTP), then Star Health, then HDFC ERGO (only after the canvas/OCR spike and permission), then the advisor-assisted CAPTCHA insurers (United India, Bajaj Allianz). New India Assurance stays manual unless shown feasible and permitted. **Any insurer not approved stays manual-only for v1, and the release notes say so.**

### M10 — Packaging, signing, update and release hardening

**Deliverables** (`10_RELEASE_AND_BUILD_RUNBOOK`)
- electron-builder targets: Windows NSIS x64; macOS DMG for arm64 and x64 (or a universal build, decided in M1).
- Electron Fuses; signing and notarisation once identities exist (Q-D04, Q-D05).
- Auto-update **only if** hosting and signing are ready and the update is verified end to end (P1-04); otherwise ship without it.
- Checksums, release notes, known limitations, a rollback procedure and a sanitised diagnostics export.
- Final security gate (`06 §7`).

**Tests:** TC-24 and TC-25 on clean machines; TC-26 upgrade from the previous build; full regression on both OSes.

**Definition of done:** the release checklist in `15 §5` is complete, with build IDs and hashes recorded.

### M11 — Documentation, UAT and handover

**Deliverables:** user and install guides updated from the drafts in docs 11 and 12 to match the built app; walkthrough (`12 §4`); UAT record (`12 §6`); handover checklist (`12 §5`); credential rotation (SEC-13).

**Definition of done:** client acceptance is recorded, or accepted conditions are documented (`01 §14`).

---

## 5. Testing approach (`09_TEST_PLAN_AND_REGRESSION_PACK`)

| Layer | Tooling | Introduced |
|---|---|---|
| Unit (schemas, money, comparison, validators, logger) | Vitest | M2, M3 |
| Fixture (parsers) | Vitest with sanitised HTML/JSON fixtures per adapter | M5 (mocks), M8, M9 |
| Integration (IPC, orchestrator, SQLite, SecretStore, PDF) | Vitest in the Electron main context where needed | M2, M4, M5, M7 |
| End-to-end (mock adapters only) | Playwright for Electron | M6 |
| Live portal | Manual, authorised accounts, dummy data, evidence template `09 §5` | M8, M9 |
| Platform smoke | Clean Windows and macOS machines | M10 |

Rules: no real customer data or credentials in any fixture; no test may automate a CAPTCHA, OTP or MFA step; PRD cases 1–5 use only values supplied by the client (`09 §3`).

## 6. Critical path

M0, then M1 (S1, S3, S4), then M2, M3, M4/M5, M6, M7 and M10. In parallel, start requesting the external inputs **now**, because they have the longest lead times: insurer permission and accounts, signing identities, approved legal and branding text, PRD test cases, and clean test machines.

---

# Revision 1 — M0 outcome (26 October 2026)

Labels: **Direction** means given by the project lead in the M0 instruction. **Recommendation** means awaiting approval. Decision IDs (DM-xx) are defined in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) §0.2.

## 7. Release structure

| Release | Content | Gate | Status |
|---|---|---|---|
| **R1 — Manual-first** | M0 → M1 → M2 → M3 → M4 → M6 → M7 → M10 → M11. Customer and member details; manual quote entry for all eight insurers, with each insurer's required fields as data where known; history; settings and first run; comparison under the approved DM-06 rule; branded PDF; encrypted local storage (DM-02) and retention; Windows and macOS packaging with release validation | DM-01, DM-02, DM-05, DM-06, DM-07, DM-08 approved; R1 inputs in OPEN_QUESTIONS §0.3 | **Recommended; pending PO approval** (DM-05). Provisional direction only |
| **R2 — Automation foundation and first adapter** | M5 (orchestrator, PaneManager, driver, mock adapters, Connect board UI) and M8 (first live adapter) | DM-03 and DM-04 approved; **per insurer:** written authorisation (Q-D01), test account and OTP holder (Q-D02), plan to quote (Q-B16), validated sanitised fixtures | Direction: separately gated |
| **R3 onward — Further adapters** | M9, one insurer at a time | The same per-insurer gate. Any insurer without approval stays manual | Direction: separately gated |

**P0 items deferred from R1 to R2 (needs PO acceptance under `19` change control):** FR-05, FR-06, FR-07, FR-08, FR-09 and the automated parts of FR-10. **R1 acceptance:** every other P0 requirement is verified, every insurer completes end to end through manual entry (`01 §14` criterion 3), PDF regression passes (TC-15 to TC-18), and the clean-machine installs pass (TC-24, TC-25).

## 8. Revised schedule (estimate)

**Assumptions:**
- One full-time developer.
- **W1** is the week the M0 decisions are approved.
- Test hardware (Q-D07) is available in W1.
- R1 business inputs arrive by the dates in OPEN_QUESTIONS §0.3.
- Signing identities are requested now.

These are planning estimates, not commitments. Re-baseline after M1.

| Milestone | Effort (dev-days) | Planned weeks | Exit gate |
|---|---:|---|---|
| M0 close-out | 0.5 | W1 | DM approvals recorded |
| M1 Feasibility spikes (§9) | 5–6 | W1–W2 | Spike results recorded; E-01 to E-04 confirmed or revised |
| M2 Scaffold and security baseline | 3–4 | W2–W3 | §4 M2 definition of done |
| M3 Contracts and comparison engine | 3–4 | W3 | Contract frozen; DM-06 rule configured |
| M4 Encrypted storage, settings, retention | 5–6 | W4 | TC-19, TC-20, TC-21; migration test |
| M6 UI and manual entry (8 insurers) | 7–9 | W5–W6 | End-to-end manual flow |
| M7 PDF report | 3–4 | W7 | TC-15 to TC-18 on both OSes |
| M10 Packaging and release validation | 4–5 | W8 | TC-24 to TC-26; release checklist `15 §5` |
| M11 Documentation and UAT | 2–3, plus the client's UAT window | W9–W10 | UAT record `12 §6` |
| **Total R1** | **33–42**, plus ~15–20% contingency | **8–10 weeks** | |

- **Example calendar, if W1 starts Monday 2 November 2026:** build complete around W8 (late December 2026). Allowing for year-end holidays, an **R1 UAT-ready build around mid-January 2027**. The handover date is set with the client after UAT. These dates are illustrative until Q-00/DM-09 are approved.
- **Signing.** If identities are not ready by W8, UAT may use unsigned builds **only with written client acceptance**. A production release waits for signing (AR-14).
- **R2 and later** cannot be dated until the per-insurer gates are met. Estimate M5 at 5–7 dev-days, and each adapter at 4–8 dev-days after access is granted, depending on portal complexity. HDFC ERGO (canvas) and the CAPTCHA insurers are at the high end or stay manual.

## 9. M1 feasibility spike plan

**Rules:**
- Spike code lives under `spikes/` on branch `spike/m1-feasibility`. It is never merged into `src/`.
- Results are recorded in `docs/evidence/M1/<spike>-<platform>.md`, using the evidence fields in `09 §5`: build/version, OS/version, expected, actual, pass/fail, tester, date and sanitised output.
- **A spike passes only on the platforms it actually ran on. Nothing is "verified" from documentation alone.**
- No live insurer portal, real customer data or real credentials are used.

**Platforms:**

| Code | Platform |
|---|---|
| **M-A** | macOS 15 arm64. Available locally (Apple M4, macOS 15.7.2) |
| **M-13** | macOS 13 at the proposed floor. Needs a physical Mac or VM; whether this M4 host can run a macOS 13 VM is unverified |
| **M-X** | macOS x64 on an Intel Mac. Rosetta on M-A is only a partial substitute |
| **W-10 / W-11** | Windows 10 22H2 and Windows 11, x64. Needs real or virtualised x64 machines (Q-D07) |

| Spike | Objective | Method | Platforms | Pass criteria | Time-box | If it fails |
|---|---|---|---|---|---|---|
| **S1** Electron and OS matrix (DM-01) | Electron 45.x runs on the proposed matrix | Minimal app with the §3.3 secure webPreferences, packaged unsigned with electron-builder (NSIS; DMG for arm64 and x64) | M-A, M-13, M-X, W-10, W-11 | Installs, launches, renders and quits cleanly on every platform; idle memory recorded; no security warnings in the console | 1 day plus hardware time | Retry on 44.9.x; record the regression; escalate DM-01 |
| **S2** Portal session isolation and no debug port (DM-03, DM-04) | Isolation, permission and navigation policy, CDP driver and debug-port exposure | Two `persist:` partitions loading **local mock portal pages** on two local origins | M-A, W-11 | (1) A cookie set in partition A is not visible in B. (2) `window.require` and `process` are undefined in views. (3) Geolocation and notification requests are denied. (4) Navigation to an origin outside the allowlist is blocked. (5) `window.open` is denied. (6) `webContents.debugger` fills, clicks and reads a mock form. (7) A packaged build has **no listening TCP port**; check with `lsof -iTCP -sTCP:LISTEN` or `netstat -ano`. (8) Launch with `--remote-debugging-port=9222` and record whether a port opens before the startup guard exits (AR-16). (9) With the cookie-encryption fuse on, the `Cookies` database stores only `encrypted_value` | 1.5 days | Record it; revise §7.4/§7.5 before R2 (not on the R1 path) |
| **S3** SQLite and native packaging (DM-02, DM-07) | Native driver works in packaged apps | `better-sqlite3-multiple-ciphers` (and plain `better-sqlite3` as a control): keyed open, WAL, foreign keys, migration, CRUD; `*.node` unpacked from asar | M-A, M-X, W-10/W-11; universal macOS build if chosen | CRUD works in the **packaged** app on every target. A wrong key gives a clean error. The file cannot be read without the key (`sqlite3` CLI reports "file is not a database"). The native module is code-signed inside the macOS app once S6 identities exist | 1 day | Build from source with `@electron/rebuild`. If the ciphers variant alone fails, re-open DM-02 (option A) |
| **S4** ₹ rendering in PDF (DM-08) | `printToPDF` with the bundled font renders ₹ correctly and fast enough | Template with `₹1,23,456`, `₹0`, long plan names and 1/2/4/8 mock insurers; `javascript: false`; network blocked | M-A, W-11 (and M-13 if available) | pdfjs-dist text extraction contains U+20B9 and **no** U+25A0. Fonts are embedded. Text is selectable. 8-insurer PDF renders in under 5 s. A **negative control** (no bundled font) is detected by the test | 1 day | Try a different OFL font; check CSS `font-family` resolution; escalate if a platform renderer issue is found |
| **S5** OS-backed credential storage (DM-02) | `safeStorage` is reliable for wrapping database and evidence keys | Round-trip encrypt and decrypt; restart persistence; behaviour across **unsigned, ad-hoc and Developer ID** signing on macOS (Keychain access is tied to code signature); Windows DPAPI under the same user and after a password change; simulated unavailability | M-A, W-11 (M-X if available) | Round trip works after restart on both OSes. The unavailable path shows the fail-closed screen with no plaintext written (TC-21). **Record exactly when a signing-identity change locks the key out**, because that drives AR-13 and the release process | 1 day | Re-open DM-02. If identity changes lock keys out, release signing must keep one stable identity |
| **S6** Code signing and notarisation | Signed artefacts install cleanly | macOS: Developer ID signing with hardened runtime and entitlements, `notarytool` submission, staple, `codesign --verify --deep --strict`, `spctl -a -vvv`, quarantined first launch on a clean Mac. Windows: sign the exe and NSIS installer, `signtool verify /pa`, first launch on clean Windows with the SmartScreen result recorded | M-13 or M-X, plus W-11 (clean machines) | All verification commands pass. Gatekeeper opens the app without override. Windows signature is valid, and the SmartScreen outcome is recorded (not assumed) | 1–2 days **after identities exist** | **BLOCKED** until Q-D04 and Q-D05 are answered. Meanwhile document the exact unsigned-install warnings for a possible UAT exception |

**M1 exit criteria:** S1, S3, S4 and S5 have passed (or have approved fallbacks) on at least M-A and one Windows x64 platform. Gaps in M-13 or M-X are listed as open release risks for M10. S2 is recorded. S6 is either recorded or explicitly blocked with its owner named. IMPLEMENTATION_STATUS and the risk register are updated.

## 10. M0 status and definition of done

| M0 item | Status | Evidence |
|---|---|---|
| Git baseline in this folder only; sibling repositories untouched | **Done** | Commit `d21976a`; the parent folder is not a repository; `../fiducial/` was not modified (read-only checks only) |
| `.gitignore` excludes env files, signing material, databases, sessions, evidence, exports, raw captures, logs and build output | **Done** | `git check-ignore` tested against 16 sample paths |
| `.gitattributes` protects the binary PDFs | **Done** | `git check-attr` reports `binary: set` |
| Q-01 investigated | **Done** | OPEN_QUESTIONS §0.1 |
| Architecture positions prepared | **Done (proposed)** | ARCHITECTURE_REVIEW §7 |
| Revised scope and schedule | **Proposed** | §7, §8 |
| Spike plan | **Done** | §9 |
| DM-01 to DM-09 | **Provisional directions recorded (26 Oct 2026). PO, client and security approvals pending** | OPEN_QUESTIONS §0.2 decision register |
| M0 planning documents committed | **Done** | Commit "docs: finalize M0 planning and decision register" |

M0 is **finalised**. The formal approvals remain open and are tracked in the decision register. M1 may start under the provisional directions DM-01 and DM-07: the spikes *are* the compatibility tests those directions depend on. If a spike fails, or a pending approval goes the other way, the affected direction is revisited before M2.

## 11. Next concrete step (after approval)

1. Create branch `spike/m1-feasibility`.
2. Scaffold a minimal Electron 45.x spike app under `spikes/m1/` (electron-vite and electron-builder, secure webPreferences only, no product features).
3. Run **S1, S3, S4 and S5 on the local macOS arm64 machine first**, because it is available today. Record evidence.
4. Repeat on Windows x64 and the Intel/macOS 13 targets as soon as Q-D07 provides access.
5. In parallel, start the non-engineering lead-time items now: signing identities (Q-D04, Q-D05), named approvers (Q-D08) and the R1 business inputs (OPEN_QUESTIONS §0.3).

---

# Revision 2 — M1 progress (26 October 2026)

Evidence: [docs/evidence/M1/](docs/evidence/M1/README.md). Spike code: `spikes/m1/` (branch `spike/m1-feasibility`; committed in the M1 spike commit after an internal code review; **not** independently security-reviewed).

## 12. M1 status against §9

| Spike | M-A (macOS 15 arm64, local) | M-13 | M-X | W-10 / W-11 |
|---|---|---|---|---|
| S1 | **Pass** (dev and packaged) | Not run | Not run | Not run |
| S2 | **Pass** (mock portal; fused build exposes no debug port) | n/a | n/a | Not run |
| S3 | **Pass** (dev and packaged) | n/a | Not run | Not run |
| S4 | **Pass** (dev and packaged) | Not run | n/a | Not run |
| S5 | **Pass after Q-M1-01** (authenticated vault; raw `safeStorage` integrity finding recorded) | n/a | Not run | Not run |
| S6 | **Blocked**: no identities (Q-D04, Q-D05) | — | — | — |

**M1 exit criteria (§9) are not met.** Still required: S1, S3, S4 and S5 on at least one Windows x64 platform; **approval** of the S5 integrity resolution (Q-M1-01 is implemented and tested on macOS); and S2 recorded on Windows.

## 13. Remaining work to complete M1

1. **Windows x64 runs** (Q-D07): S1, S3, S4 (TC-17) and S5 (DPAPI), plus S2 and the debug-port check, on Windows 10 22H2 and/or 11. The spike's `package.mjs` is macOS-only and needs a Windows target, either `@electron/packager` for `win32` or the M2 packager decision.
2. **macOS 13 and Intel (M-13, M-X)**: S1 on macOS 13 (the proposed floor) and S3 on x64.
3. **S5 follow-up (Q-M1-01)**: design implemented and tested on macOS (every tampering attempt rejected, including 48/48 wrapped-key flips; [evidence](docs/evidence/M1/Q-M1-01-secret-vault.md)). An internal review fixed 7 defects (R1–R7; 84 tests pass); a review package and checklist are ready. **Remaining:** independent security review and approval (including decisions on limitations L1–L11, for example a mandatory single-instance lock), and the Windows run.
4. **Supervised Keychain tests**: same-app signing-identity change, a second macOS user, a locked keychain. These need a person present and, for identity change, S6 identities.
5. **S6** once signing identities exist (prerequisites and steps in `docs/evidence/M1/S6-signing-blocked.md`).
6. **Review and commit** the spike branch: internal review done and committed in the M1 spike commit (experimental spike only, not production approval).

**Q-M1-01 / DM-02 security status:** technically tested on macOS 15 arm64 only. **Independent security review is outstanding; neither is approved.** Windows credential storage (DPAPI) and Windows file-system behaviour are untested. Crash/power-loss testing, fuzzing, supervised Keychain scenarios and code signing are outstanding. **No unresolved risk has been accepted.** The vault's integrity protection is separate from the OS layer: raw `safeStorage` still rejected only 21/48 tamperings (recorded finding).

## 14. Plan adjustments arising from M1 (proposed, for approval)

- **M2:** add a lint rule or wrapper banning sync `safeStorage` methods (AR-17); clean the launch environment in all scripts and CI (AR-19); add a packaged-content check (AR-20).
- **M4:** the SecretStore design moves from "`safeStorage` per secret" to "`safeStorage` wraps data keys; AES-256-GCM for secrets and evidence" (pending DM-02 review).
- **M7:** keep ₹ and branding out of `printToPDF` header/footer templates; reuse the S4 regression approach (text + font + negative controls) for TC-15 to TC-17.
- **M10:** fuses are a release gate, verified with `@electron/fuses read` and the debug-port probe on every platform.

---

# Revision 3 — M2 progress (27 October 2026)

Branch `m2/scaffold-security-baseline` from the M1 commit `e8a68b0`. Toolchain per DM-07, decided by the project lead on 27 Oct 2026: electron-vite, electron-builder, React. Evidence: [docs/evidence/M2/](docs/evidence/M2/README.md).

## 15. M2 against its definition of done (§4 M2)

| Definition-of-done item | Status |
|---|---|
| Empty app launches from `npm run dev` | **macOS: yes** (renderer IPC round trip logged, no CSP violations). **Windows: not tested** |
| CI green | **Not run**: the workflow exists, but the repository has no remote |
| SEC-01 to SEC-06 and LOG-01 verified | **macOS: yes** (unit tests plus 13/13 in-app smoke checks in dev and the packaged arm64 app). **Windows: not tested** |
| Deliverables | electron-vite + electron-builder + React scaffold; scripts; secure window factory; `app://` with CSP header; navigation, popup, permission, download and webview guards; IPC registry with Zod and sender verification and `AppResult`; typed preload; allowlist logger with correlation IDs; secretlint; Husky and lint-staged (hook not activated); CI workflow; §14 adjustments (sync-`safeStorage` lint ban, clean launch environment, packaged-content check) |

**M2 is implemented and verified on macOS but not complete**: Windows launch, CI and Windows verification remain open, as does the unmet M1 Windows exit criterion.

## 16. Next milestone

**M3 — Contracts (SDK) and domain logic** (§4 M3): customer, member, quote and result schemas; money in paise with INR formatting; validators; the comparison engine behind a pluggable rule; contract freeze.

Dependencies:
- DM-06 comparability rules are still provisional: implement them as configuration with placeholders.
- Q-B03, Q-B04 and Q-B05 (sum insured, age limits, floater rules) are unanswered: use placeholder rule tables.
- No dependency on the vault (DM-02) until M4.
