# Implementation Plan — Fiducial Quote Fetcher

| | |
|---|---|
| Date | 26 October 2026 |
| Basis | Workstreams in `15_DELIVERY_PLAN_AND_DEFINITION_OF_DONE §1`, mapped onto the current repository state (no code; see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)) |
| Design reference | [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) |
| Blocking questions | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) |

## 1. Schedule warning

`15 §2` sets feature freeze at **26 October 2026, 12:00** and client handover on **27 October 2026**. Both fall on or after this audit, and the repository has no implementation. **Neither date can be met.** A revised schedule must be agreed before work starts (OPEN_QUESTIONS Q-00). This plan gives the order, dependencies and exit criteria. It does not give calendar dates, because those depend on Q-00, on access to insurers and on the M1 spike results.

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

Spikes are throwaway or `spikes/` code. Each produces a short written result.

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
