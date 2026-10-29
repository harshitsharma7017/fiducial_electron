# Implementation Status — Fiducial Quote Fetcher

| | |
|---|---|
| Audit date | 26 October 2026 |
| Requirements baseline | FQF-DOCS-001 v1.0 draft (PDFs `00`–`19` in the repository root; all approvals **pending** per `19_CHANGELOG_AND_APPROVALS`) |
| Repository audited | `fiducial_electron/` (this folder) |
| Companion documents | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) · [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) · [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) |

## 1. Audit finding

**No implementation exists.** The repository contains only the 21 documentation PDFs: 19 numbered documents plus two index files (`00_Project_Documentation_Index.pdf` and `00_README_DOCUMENT_INDEX.pdf`). The `docs/` folder is empty. The repository has none of the following:

- `package.json`, lockfile or `node_modules`
- Electron main, preload or renderer code
- shared schemas, a "frozen SDK" or Zod contracts
- a database, migrations, SecretStore, PDF service or insurer adapters
- tests, fixtures, a smoke runner, packaging configuration or CI
- a git repository (`git status` reports that the folder is not a repository)

The documentation repeatedly defers to "the existing repository's frozen schemas, SDK and tested contracts" (`02_SRS §1`, `04 §1`, `16 §1`), an "existing approved driver/CDP approach" (`03 §2`) and a "smoke runner" (`15 §1`). **None of these were found in this workspace.** I also checked the sibling folder `../fiducial/` read-only. It contains a different product: an Express/MongoDB backend and Next.js frontends for a property-insurance placement platform. It has no Electron, Quote Fetcher, adapter or SDK code. See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) Q-01.

As a result, **every requirement below is either `NOT IMPLEMENTED` or `BLOCKED`**, and no relevant source files exist. The "Milestone" column refers to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). The "Acceptance" column cites test IDs from `09_TEST_PLAN_AND_REGRESSION_PACK` and the traceability in `17_REQUIREMENTS_TRACEABILITY`. Where doc 17's FR numbering disagrees with the PRD, the PRD numbering is used (see OPEN_QUESTIONS C-03).

### Status legend

| Status | Meaning |
|---|---|
| `VERIFIED` | Implemented and verified by a recorded test result |
| `NEEDS VALIDATION` | Implemented, but not yet verified by recorded evidence |
| `PARTIAL` | Some of the functionality exists |
| `NOT IMPLEMENTED` | Nothing exists. Work can start once its dependencies are met |
| `BLOCKED` | Cannot be completed without external information, access or approval. The blocker is named. Parts that are not blocked may still be built |

### Summary

| Category | Total | Verified | Needs validation | Partial | Not implemented | Blocked |
|---|---:|---:|---:|---:|---:|---:|
| P0 functional (FR-01 to FR-20) | 20 | 0 | 0 | 0 | 16 | 4 |
| P1 / P2 / deferred | 11 | 0 | 0 | 0 | 8 | 3 |
| Non-functional | 10 | 0 | 0 | 0 | 8 | 2 |
| Security and privacy controls | 19 | 0 | 0 | 0 | 17 | 2 |
| Data, IPC and contracts | 11 | 0 | 0 | 0 | 10 | 1 |
| Insurer adapters | 9 | 0 | 0 | 0 | 1 | 8 |
| Release and handover | 12 | 1 | 0 | 2 | 6 | 3 |
| Regression cases (TC-01 to TC-28, PRD cases 1–5) | 33 | 0 | 0 | 0 | 28 | 5 |

The two `PARTIAL` items are documentation: the user guide (doc 11) and the install/UAT guide (doc 12) exist as drafts but have not been checked against a built application.

*At audit time the "Release and handover" row read 0 verified / 7 not implemented. It changed in M0 when REL-08 was verified; see §1a.*

## 1a. M0 update (26 October 2026)

| Change | Detail | Evidence |
|---|---|---|
| REL-08 version control: NOT IMPLEMENTED → **VERIFIED** | Git repository in this folder only, branch `main`, baseline commit `d21976a`. `.gitignore` excludes env files, signing material, databases, sessions, evidence, exports, raw captures, logs and build output. `.gitattributes` marks PDFs binary | `git log`; `git check-ignore` against 16 sample paths; `git check-attr` |
| Q-01 (existing SDK) | **Not found anywhere checked.** The project is treated as greenfield | OPEN_QUESTIONS §0.1 |
| NFR-COMPAT | Remains BLOCKED. The macOS 12 floor in `01 §11` conflicts with every supported Electron line (≥ 44 needs macOS 13), per Electron's documentation. Awaiting DM-01. **No platform has been tested yet** | OPEN_QUESTIONS §0.1, DM-01 |
| FR-05 to FR-09 | Status unchanged (NOT IMPLEMENTED). **Proposed** move from R1 to R2 under DM-05, awaiting PO approval | IMPLEMENTATION_PLAN §7 |
| Decision register | DM-01 to DM-09 recorded as **provisional directions**. PO, client and security approvals are pending. **No requirement status changed as a result**, because a direction is not an implementation or a test result | OPEN_QUESTIONS §0.2 |
| All other rows | Unchanged. **There are still no source files.** M0 produced only planning documents and repository configuration | — |

M1 spike results (IMPLEMENTATION_PLAN §9) will be recorded here per platform. A spike result counts only for the platforms it actually ran on.

## 1b. M1 update (26 October 2026): feasibility evidence

Evidence: [docs/evidence/M1/](docs/evidence/M1/README.md). Spike code: `spikes/m1/` on branch `spike/m1-feasibility`. **Tested platform: macOS 15.7.2 on Apple M4 (arm64) only**, in both development and packaged (ad-hoc signed, fused) builds. Windows x64, Intel Mac and macOS 13 have not been tested.

| Spike | Result on macOS 15 arm64 | Not yet tested |
|---|---|---|
| S1 Electron 45 launch | **PASS** (13/13 checks in each build) | Windows 10/11 x64, Intel Mac, macOS 13 |
| S2 Session isolation and debug port | **PASS** (14/14 checks in each build; debug ports closed in the fused build). Launch guard alone is insufficient; fuses are required | Windows; real portals (Track B) |
| S3 Encrypted SQLite | **PASS** (17/17 checks across create and reopen in each build; native module works packaged) | Windows x64, macOS x64 |
| S4 PDF ₹ | **PASS** (text and font checks; negative controls detected; visual check done) | **Windows (TC-17)**; 1/2/4/8 layouts (M7) |
| S5 Secret storage | **PASS after Q-M1-01** (final runs 26 Oct, 14:57–15:01 UTC, after internal review fixes): authenticated vault rejects every tampering attempt, including 48/48 wrapped-key flips on real `safeStorage`. Raw `safeStorage` still rejects only 21/48 (recorded finding). **Q-M1-01: technically tested on macOS, awaiting independent security review.** *Was PARTIAL before Q-M1-01* | Windows DPAPI; supervised Keychain scenarios; independent security review |
| S6 Signing and notarisation | **BLOCKED** (0 identities; ad-hoc app `rejected` by Gatekeeper) | Everything |

**No product requirement changed status.** Spike code is not product code, and the requirement rows above stay as recorded. The evidence reduces technical risk for NFR-COMPAT (macOS arm64 only), SEC-01 to SEC-07, SEC-10, SEC-12, DATA-01 to DATA-03, FR-13 and TC-17 (macOS only), TC-21 and TC-22, TC-23 (mock pages), but none of these is verified for the product.

Automated checks for the spike, run on 26 Oct 2026: `npm run typecheck` passed, `npm run lint` passed (ESLint and Prettier), and `npm test` passed 10 files and 52 tests. After Q-M1-01: 11 files, 77 tests. After the Q-M1-01 internal review (7 regression tests added): **11 files, 84 tests**, all passing.

**Q-M1-01 / DM-02 security status:** technically tested on macOS 15 arm64 only. **Independent security review is outstanding; neither is approved.** Windows credential storage (DPAPI) and Windows file-system behaviour are untested. Crash/power-loss testing, fuzzing, supervised Keychain scenarios and code signing are outstanding. **No unresolved risk has been accepted.** The vault's integrity protection is separate from the OS layer: raw `safeStorage` still rejected only 21/48 tamperings (recorded finding). `npm audit` reported 0 vulnerabilities after zod and vite were raised to patched versions.

## 1c. M2 update (27 October 2026): scaffold and security baseline

Branch `m2/scaffold-security-baseline` (from `e8a68b0`). Evidence: [docs/evidence/M2/](docs/evidence/M2/README.md). **Verified on macOS 15.7.2 arm64 only** (development build and packaged arm64 app). Windows packages build from macOS but have **not been run on Windows**. CI has **not run** (no remote). The rows in §2–§9 below keep their audit-time values; this table records what changed.

| Item | New status | Evidence |
|---|---|---|
| SEC-01 / SEC-02 Node integration off, context isolation, sandbox | **NEEDS VALIDATION** (Windows): verified on macOS | Unit `web-preferences.test.ts`; smoke `renderer.no-node`, `renderer.sandboxed` (dev and packaged) |
| SEC-03 Allowlisted preload only | **NEEDS VALIDATION** (Windows): verified on macOS | Smoke `bridge.shape`; `contract.test.ts` (no raw `ipcRenderer`); preload bundle 305 bytes |
| SEC-04 / TC-22 Main-process IPC validation and sender verification | **NEEDS VALIDATION** (Windows): verified on macOS | `ipc-dispatcher.test.ts` (untrusted senders, 7 invalid payload classes, unknown channel, response validation, no leakage); smoke `ipc.round-trip` |
| SEC-05 / TC-23 Navigation and popup restrictions | **NEEDS VALIDATION** (Windows): verified on macOS | `navigation-policy.test.ts`; smoke `tc23.*` (dev and packaged) |
| SEC-06 Restrictive CSP | **NEEDS VALIDATION** (Windows): verified on macOS | `csp.test.ts`; smoke `protocol.csp-header`, `csp.inline-script-blocked` |
| LOG-01 Allowlist logging | **NEEDS VALIDATION** (log review on Windows): unit-verified | `logger.test.ts` (forbidden fields, free text, unknown events) |
| SEC-11 No secrets in logs | **PARTIAL**: enforced by the allowlist logger; no secrets handled in M2 yet | `logger.test.ts` |
| IPC-01 / IPC-02 Envelope and error codes | **PARTIAL**: implemented; contract freeze is M3 | `src/shared/ipc/` |
| IPC-04 API surface | **PARTIAL**: only `app:get-info` (M2 scope) | `src/shared/ipc/contract.ts` |
| REL-01 Scripts `lint`, `typecheck`, `test`, `build`, `build:win`, `build:mac` | **VERIFIED** on macOS (all run, exit 0) | `docs/evidence/M2/README.md` |
| REL-02 Secret scan | **PARTIAL**: secretlint runs locally (168 files, 0 findings; detection proven on a planted token); pre-commit hook **not activated**; CI not run | Evidence README |
| REL-03 Windows build | **PARTIAL**: unsigned NSIS installer cross-built on macOS; content and fuses verified; **never installed or run on Windows** | `check-package.mjs win` |
| REL-08 CI | **PARTIAL**: workflow written (macOS and Windows, SHA-pinned actions); **not run** (no remote) | `.github/workflows/ci.yml` |
| DM-04 fuses and launch guard | Fuses verified in macOS and Windows packages; guard refuses 3/3 debugging switches (dev and packaged macOS) | `check-package.mjs`; `scripts/smoke.mjs` |

**No product feature requirement (FR-01 to FR-20) changed status:** M2 delivers infrastructure only.

> **Correction (M3, 27 October 2026):** CI has since run once on GitHub (run 40454782355, commit `37879c5`). The **macOS job passed** every step. The **Windows job failed** at `npm run lint`: Prettier flagged all 50 files it checks. **Root cause, confirmed by reproduction:** the Windows checkout converts LF to CRLF (`core.autocrlf=true`; `.gitattributes` has `* text=auto` without `eol`), and Prettier requires `endOfLine: lf` (ARCHITECTURE_REVIEW AR-25). Type-check, tests and smoke were **skipped** on Windows. See §1d.

## 1d. M3 update (27 October 2026): contracts and comparison engine

Branch `m3/contracts-comparison`, created from `37879c5`. The M3 engine and contracts are **committed locally** as `4f428495fafe9e0bbe49a364ccb35306dc0220c3` (not pushed). The development-only demo, the `.gitattributes` line-ending fix and these documentation updates are **uncommitted** working-tree changes on the same branch (see the end of this section). Evidence: [docs/evidence/M3/](docs/evidence/M3/README.md). Verified on **macOS 15.7.2 arm64 only**; M3 has **not run in CI or on Windows**.

**Acceptance status: not accepted.** The contract review and freeze are outstanding, every business rule is provisional or a placeholder awaiting PO approval, and CI and Windows runs are outstanding.

M3 is pure TypeScript under `src/shared/`. It has no Electron, Node, database, filesystem, network or portal code, and it registers **no IPC channel**. The app bundle is unchanged.

**Contracts are DRAFT** (`CONTRACTS_STATUS = 'draft'`): the review that freezes them has not happened. **All business rules are provisional or placeholders and are not approved** (OPEN_QUESTIONS §0.6).

| Item | New status | Evidence |
|---|---|---|
| DATA-03 Money as integer paise | **PARTIAL**: parse and format implemented and property-tested; storage is M4 | `src/shared/money.ts`; `test/money.test.ts` |
| SDK-01 Adapter contract | **PARTIAL**: metadata schema, `InsurerAdapter`/registry **types**, result input and normalised result schemas, states. No adapter or registry implementation (M5/M6). Not frozen | `src/shared/contracts/adapter.ts`, `quote.ts`, `status.ts` |
| IPC-03 Progress event | **PARTIAL**: schema only; nothing emits it yet (M5) | `progressEventSchema` |
| FR-01 Customer | **PARTIAL**: schema (name required; phone, email and notes optional); no form or storage | `customerSchema`; `test/quote-validation.test.ts` |
| FR-02 Members, age limits | **PARTIAL**: relationship and age only (no name, gender or DOB; C-04, C-05); age limits from a **placeholder** table (Q-B04) | `memberSchema`, `PLACEHOLDER_QUOTE_INPUT_RULES` |
| FR-03 Sum insured, pincode, floater | **PARTIAL**: schema plus **placeholder** rules (Q-B03, Q-B05); pincode is a format check only | `quoteRequestSchema`, `validateQuoteRequest` |
| FR-04 Insurer required fields | **PARTIAL**: pure pre-flight check per insurer; no adapters declare fields yet | `src/shared/validation/preflight.ts` |
| FR-12 Cheapest comparable premium | **PARTIAL (rule not approved)**: engine implemented under the **provisional** DM-06 rule; Q-B01, Q-B02 and Q-B10 remain open | `src/shared/comparison/`; `test/comparison.test.ts` |
| TC-01 to TC-04 | **Schema level passes**; UI-level tests remain for M6 | `test/quote-validation.test.ts` |
| TC-09, TC-10, TC-27 | **Engine level passes** under the provisional rule | `test/comparison.test.ts` |
| REL-08 CI | **PARTIAL**: ran once; macOS passed, Windows failed at lint (see correction above); the coverage gate was added for M3 | `.github/workflows/ci.yml` |

**Test totals:** the committed M3 suite is 328 tests in 13 files (re-run 27 Oct, unchanged). The current working tree adds 67 development-demo tests, for **395 tests in 14 files**. `src/shared` has 100% statement, branch, function and line coverage, and CI enforces it for `money.ts`, `comparison/**` and `validation/**`. A mutation check (12 deliberately injected rule bugs) was caught by the tests every time.

**Pre-commit review (27 October 2026):** two engine defects were found and fixed, with regression tests:
1. **GST-exclusive totals.** The premium consistency check assumed total = base + GST for every basis. A GST-exclusive quote that showed its GST was therefore reported as `PREMIUM_INCONSISTENT` (validity), and so did not suppress the highlight. The check now depends on the basis, and the result is reported as `PREMIUM_BASIS_NOT_RANKED`.
2. **Unreadable sum insured.** It was a validity exclusion, so it did not suppress the highlight, while a missing sum insured did. It is now the comparability finding `SUM_INSURED_UNPARSEABLE`, and it suppresses the highlight as ARCH §3.7 describes.

No business rule changed. Validity exclusions (duplicates, review flags) still do not suppress the highlight; this is recorded for PO decision in OPEN_QUESTIONS §0.6.

**Unchanged:**
- **Q-M1-01 and DM-02 (vault) remain unapproved.** M3 neither uses nor requires storage.
- **Windows runtime testing remains outstanding.**

**Development-only Quote Comparison demo (27 October 2026, uncommitted).** `src/renderer/src/dev/` adds a "Quote Comparison" screen, opened from a development-tools card on the home screen. It runs the real `validateQuoteDraft` and `compareQuotes` on eight synthetic in-memory scenarios (Demo Insurer A–F) and shows the engine's own output: the request summary, comparable and excluded counts, the highlight or the no-highlight reason, a quote-by-attribute table, and findings grouped by quote and stage. `App.tsx` loads it only behind `import.meta.env.DEV`. It adds no IPC channel, storage, network call or dependency, and it **changes no requirement status**. It is not a product screen: FR-10, FR-12 and FR-14 UI work remains M6, and its wording is demo copy, not approved text. Tests: `test/comparison-demo.test.ts` (67). The production renderer bundle was checked and contains no demo code, data or styles. **Visual review:** rendered screenshots of all eight scenarios were inspected at 1440×900 and 1000×800, and three at 820×700, in a hidden Electron window on the dev server (stub bridge, no CSP) on macOS 15 arm64; not the real app window. Light theme only; Windows rendering not checked. **Fix (27 Oct, acceptance review):** sum insured, deductible and room-rent-cap amounts from a non-INR quote were shown with the rupee sign; every amount from an insurer result is now formatted in that result's own currency, with regression tests. The engine's `CURRENCY_UNSUPPORTED` behaviour is unchanged.

**Windows line-ending fix (27 Oct 2026, uncommitted).** `.gitattributes` now reads `* text=auto eol=lf`, the exact one-line change from `fix/windows-ci-eol` (`cbe74e7`), applied to this branch's working tree. Binary rules are unchanged, and no tracked file has CRLF endings. It was validated only on a **simulated** Windows checkout on macOS (AR-25); a real Windows CI run is still required.

---

## 2. P0 functional requirements (`01_PRD §9`)

| ID | Requirement | Status | Missing functionality | Depends on | Milestone | Acceptance |
|---|---|---|---|---|---|---|
| FR-01 | Capture customer name, phone, email, notes | NOT IMPLEMENTED | Customer schema, New Quote form, persistence | Contracts (M3), storage (M4) | M3, M4, M6 | TC-01, TC-02. The quote is saved with a stable ID and invalid input is rejected with a field error |
| FR-02 | One or more members with relationship and age/DOB; minimise DOB; validate age limits | NOT IMPLEMENTED | Member schema, age-limit rules, relationship list, DOB minimisation | Age limits and the relationship list (Q-B04); age vs DOB (C-05) | M3, M6 | TC-03 |
| FR-03 | Sum insured, validated pincode, floater/individual | NOT IMPLEMENTED | Quote schema, pincode validator, sum-insured rules | Allowed sum-insured values and floater rules (Q-B03, Q-B05) | M3, M6 | TC-01, TC-02 |
| FR-04 | Validate insurer-specific required fields before starting | NOT IMPLEMENTED | Adapter metadata (`requiredFields`) and pre-flight validation | Adapter SDK (M3); per-insurer field lists come from feasibility spikes (M1, M8, M9) | M3, M5 | TC-04. A missing field blocks that insurer only |
| FR-05 | Isolated persistent session per insurer | NOT IMPLEMENTED | PaneManager with `persist:insurer-<id>` partitions, origin allowlist, popup and permission policy | Electron spike (M1); acceptance of on-disk session persistence (C-08) | M5 | TC-06, TC-07, TC-23 |
| FR-06 | Connection/auth states and reconnect without losing the quote | NOT IMPLEMENTED | Connection state machine, Connect board, reconnect action | State model decision (C-01), PaneManager (M5) | M5, M6 | TC-06, TC-07 |
| FR-07 | Concurrent runs with bounded concurrency, per-insurer timeout and at most one safe retry | NOT IMPLEMENTED | Orchestrator, timeout policy, transient-error classification | Error taxonomy (C-02); how timeouts treat advisor wait time (Q-E06) | M5 | TC-05, TC-14 |
| FR-08 | Cancellation; preserve partial results | NOT IMPLEMENTED | Per-run `AbortController`, idempotent cancel, persisted terminal states | Orchestrator, storage | M5 | TC-05, TC-13 |
| FR-09 | One insurer failure does not block others | NOT IMPLEMENTED | Per-adapter isolation in the orchestrator | Orchestrator | M5 | TC-05, TC-12 |
| FR-10 | Live status, premium, plan, cover, source and failure reason | NOT IMPLEMENTED | Progress events, Results view, safe messages (`07 §3`) | IPC events (M2), orchestrator (M5) | M5, M6 | TC-05, TC-09 |
| FR-11 | Manual entry for any insurer, labelled, with optional screenshot | NOT IMPLEMENTED | Manual-entry form, evidence file store, Manual label in the UI and PDF | Storage (M4); whether evidence is mandatory per insurer (Q-B11) | M4, M6 | TC-08, TC-11, TC-28 |
| FR-12 | Highlight cheapest valid comparable premium; never treat a missing premium as zero | BLOCKED | The comparison engine can be built with a placeholder rule. The **comparability rule and premium basis** (GST, tenure, add-ons) are undefined | Q-B01, Q-B02, Q-B10 | M3 | TC-10, TC-27 |
| FR-13 | Branded HTML-based PDF for 1–8 insurers; rupee symbol renders | NOT IMPLEMENTED | Template, bundled font with U+20B9, `printToPDF` service, layouts | PDF spike (M1) | M7 | TC-15, TC-16, TC-17. Note: the doc-pack PDFs themselves render ₹ as "■" |
| FR-14 | Failed, timed-out, unsupported and manual results shown in labelled boxes | NOT IMPLEMENTED | Status boxes in the UI and PDF; `timed_out` state | State model (C-01) | M6, M7 | TC-11, TC-12, TC-14 (doc 17 has no row for this; see C-03) |
| FR-15 | PDF includes approved brand, licence/GST, disclaimer, consent and date | BLOCKED | Settings fields and template slots can be built. **The approved content is missing** | Q-B07, Q-B08 | M4, M7 | TC-18 |
| FR-16 | Save PDF to a chosen folder and link it to quote history | NOT IMPLEMENTED | Save dialog, `pdf_exports` reference, filename policy without PII | PDF service, storage | M7 | TC-15, TC-19 |
| FR-17 | First-run setup and branding configuration | NOT IMPLEMENTED | First-run wizard, settings persistence, logo import | Storage (M4) | M6 | TC-18, TC-24, TC-25 |
| FR-18 | Search/reopen history; regenerate PDF; delete quote and attachments | NOT IMPLEMENTED | History list and search, duplicate, offline regeneration, cascading delete with an audit event | Storage, PDF, retention policy (Q-B06) | M4, M6, M7 | TC-19, TC-20 |
| FR-19 | Build and smoke-test Windows and macOS installers | BLOCKED | Unsigned builds can be produced. **Signing identities, clean test machines and the OS floor** are not available | Q-D04, Q-D05, Q-D07, Q-E01 | M10 | TC-24, TC-25, TC-26 |
| FR-20 | User and install guides plus UAT evidence | BLOCKED | Drafts exist (docs 11 and 12) but can only be finalised against a built app. UAT needs a named client representative | Built app; Q-D08 | M11 | Handover checklist (`12 §5`) |

## 3. P1, P2 and deferred items (`01_PRD §10`, `02_SRS §2`)

| ID | Item | Priority | Status | Notes / dependencies | Milestone |
|---|---|---|---|---|---|
| P1-01 | Save drafts | P1 | NOT IMPLEMENTED | Follows from the quote `status = draft` lifecycle (`03 §4` step 3 persists a draft anyway) | M4, M6 |
| P1-02 | Optional OS-protected saved credentials | P1 | BLOCKED | SecretStore can be built. **Client policy on saving credentials** is undecided (Q-B09) | M4 |
| P1-03 | Retention auto-delete | P1 | BLOCKED | The mechanism can be built. **The retention period (N days)** is not approved (Q-B06) | M4 |
| P1-04 | Verified auto-update | P1 | BLOCKED | Needs update hosting and signing (Q-D06) | M10 |
| P1-05 | Smoke CLI | P1 | NOT IMPLEMENTED | Headless run of mock adapters, then PDF generation | M5, M10 |
| P1-06 | Sanitised fixture capture | P1 | NOT IMPLEMENTED | Developer-only capture with a redaction step, never enabled in production builds | M8 |
| P1-07 | Advisor review/exclude results before PDF | "if approved" (`02 §2`) | NOT IMPLEMENTED | Scope decision (Q-B12) | M6 |
| P2-01 | Settings export/import | P2 | NOT IMPLEMENTED | After v1 | — |
| P2-02 | Developer inspector/copy-selector | P2 | NOT IMPLEMENTED | After v1 | — |
| P2-03 | Richer plan comparison and analytics | P2 | NOT IMPLEMENTED | After v1 | — |
| DEF-01 | Excel bulk upload producing a ZIP of PDFs | v1.1 (D-06) | NOT IMPLEMENTED | Out of v1 unless the owner moves it (Q-B13) | — |

## 4. Non-functional requirements (`01_PRD §11`, `02_SRS §3`)

| ID | Requirement | Status | Notes | Milestone | Acceptance |
|---|---|---|---|---|---|
| NFR-PERF-1 | Eight-insurer run under 3 minutes after login, excluding advisor interaction | BLOCKED | Needs live adapters and documented measurement conditions (Q-B14) | M9 | Timed run under recorded conditions |
| NFR-PERF-2 | PDF in under 5 seconds | NOT IMPLEMENTED | Measure on the minimum-spec machine | M7 | Timed TC-16 |
| NFR-REL | Per-insurer isolation, at most one retry, partial results preserved, no false success, transactional writes | NOT IMPLEMENTED | Orchestrator and storage | M4, M5 | TC-05, TC-09, TC-13, TC-14 |
| NFR-USE | Standard flow learnable after a 30-minute walkthrough; plain-language errors; state not shown by colour alone | NOT IMPLEMENTED | User-facing copy from `07 §3` | M6 | UAT survey (G8) |
| NFR-COMPAT | Windows 10/11 x64; macOS 12+ on Intel and Apple Silicon | BLOCKED | macOS 12 support in current Electron is **not verified** (Q-E01). **M0: Electron's documentation states ≥ 44 needs macOS 13; awaiting DM-01** | M1, M10 | TC-24, TC-25 |
| NFR-MAINT | One adapter per insurer; pure parsers; at least 3 sanitised fixtures and tests per adapter | NOT IMPLEMENTED | Adapter SDK template | M3, M8, M9 | Fixture tests in CI |
| NFR-OFFLINE | History and PDF regeneration work offline | NOT IMPLEMENTED | Local fonts and assets; no network calls in the PDF path | M7 | Offline PDF regeneration test (`08 §4`) |
| NFR-A11Y | Keyboard navigation, focus management, contrast, selectable PDF text | NOT IMPLEMENTED | | M6, M7 | Accessibility checklist (`07 §4`) |
| NFR-SEC | No secrets in logs; narrow IPC | NOT IMPLEMENTED | See section 5 | M2 | Release security gate (`06 §7`) |
| NFR-PRIV | Data minimisation, safe logs, retention, deletion, export warnings | NOT IMPLEMENTED | See section 5 | M2, M4, M7 | TC-20, log review |

## 5. Security, privacy and compliance controls (`06_SECURITY_PRIVACY_COMPLIANCE`)

These IDs are derived for tracking only. They add no new requirements.

| ID | Control | Source | Status | Milestone | Acceptance |
|---|---|---|---|---|---|
| SEC-01 | Renderer `nodeIntegration` disabled; `sandbox` enabled | 06 §2 | NOT IMPLEMENTED | M2 | Config unit test and review |
| SEC-02 | `contextIsolation` enabled | 06 §2 | NOT IMPLEMENTED | M2 | Config unit test |
| SEC-03 | Allowlisted preload methods only; no raw `ipcRenderer` | 06 §2, 16 §1 | NOT IMPLEMENTED | M2 | Test that the preload surface matches the allowlist |
| SEC-04 | Main-process schema validation and sender verification for all IPC | 06 §2 | NOT IMPLEMENTED | M2 | TC-22 |
| SEC-05 | Navigation and popup restrictions in app and insurer views | 06 §2 | NOT IMPLEMENTED | M2, M5 | TC-23 |
| SEC-06 | Restrictive CSP for app-owned UI | 06 §2 | NOT IMPLEMENTED | M2 | CSP header test |
| SEC-07 | Insurer content isolated from privileged APIs (no preload, separate partition, permissions denied) | 06 §2, 03 §6 | NOT IMPLEMENTED | M5 | TC-23 and review |
| SEC-08 | Review Electron security guidance for the installed version | 06 §2 | NOT IMPLEMENTED | M2, M10 | Signed-off checklist |
| SEC-09 | No credentials in source, fixtures, docs, screenshots or CLI arguments | 06 §3 | NOT IMPLEMENTED | M2 (scanner), ongoing | Secret scan clean |
| SEC-10 | OS-backed secure storage only; fail closed | 06 §3, 05 §4 | NOT IMPLEMENTED | M4 | TC-21 |
| SEC-11 | Never log passwords, OTPs, tokens, cookies or auth headers | 06 §3, §6 | NOT IMPLEMENTED | M2 | Logger redaction tests and log review |
| SEC-12 | Session cookies never shared across insurers | 06 §3 | NOT IMPLEMENTED | M5 | Partition isolation test |
| SEC-13 | Rotate development/test credentials at handover | 06 §3 | BLOCKED | M11 | Needs the credential owner (Q-D02) |
| SEC-14 | Signing and update provenance verified | 06 §7 | BLOCKED | M10 | Needs signing identities (Q-D04, Q-D05) |
| PRIV-01 | Collect only the fields needed; prefer age over DOB | 06 §4 | NOT IMPLEMENTED | M3 | Schema review |
| PRIV-02 | Redact screenshots and diagnostic bundles; user reviews the bundle before export | 06 §4, 13 | NOT IMPLEMENTED | M5, M10 | Diagnostics test |
| PRIV-03 | Warn that exported PDFs contain sensitive data | 06 §4, 07 §2 | NOT IMPLEMENTED | M7 | UI test |
| PRIV-04 | No automatic upload or email of PDFs | 06 §4 | NOT IMPLEMENTED (by design: no such feature) | — | Review |
| LOG-01 | Log only the allowed fields: version, run ID, insurer ID, state transition, error category, timing, retry count | 06 §6 | NOT IMPLEMENTED | M2 | Logger unit tests |

## 6. Data, IPC and contracts (`05`, `16`, `04 §2–4`)

| ID | Item | Status | Notes | Milestone |
|---|---|---|---|---|
| DATA-01 | Entities: customers, insured_members, quotes, insurer_results, quote_events, settings | NOT IMPLEMENTED | Field-level conflicts are in C-04 | M4 |
| DATA-02 | Versioned migrations, foreign keys, transactions, indexes, upgrade test | NOT IMPLEMENTED | | M4 |
| DATA-03 | Money stored as integer paise; never as floats | NOT IMPLEMENTED | | M3 |
| DATA-04 | Recovery from a locked or corrupt database | NOT IMPLEMENTED | Recovery behaviour needs definition | M4 |
| DATA-05 | Backup and restore | BLOCKED | Whether backups are required at all is undecided (Q-B15) | M4 |
| DATA-06 | Sanitised audit event on deletion | NOT IMPLEMENTED | | M4 |
| IPC-01 | `AppResult<T>` / `AppError` envelope | NOT IMPLEMENTED | `16 §3` | M2 |
| IPC-02 | Error code map | NOT IMPLEMENTED | Merge the lists in 04 and 16 (C-02) | M2 |
| IPC-03 | Progress event `{runId, insurerId, status, progressStep?, safeMessage, occurredAt}` | NOT IMPLEMENTED | `16 §4` | M2, M5 |
| IPC-04 | API surface (`quote.*`, `history.*`, `settings.*`, `diagnostics.export`) | NOT IMPLEMENTED | Names are illustrative in 16; finalise in M2 | M2 |
| SDK-01 | Shared adapter contract (metadata, required fields, run, parse, normalised result, states) | NOT IMPLEMENTED | The documents assume this already exists and is frozen (Q-01) | M3 |

## 7. Insurer adapters (`01_PRD §7`, `04 §6`)

No adapter may be marked release-ready without sanitised fixtures and a tested manual fallback (`15 §4`). "BLOCKED" here means **live** automation is blocked. Manual fallback for every insurer is covered by ADP-MANUAL and can be built now.

| ID | Insurer | Planned mode | Status | Blockers | Milestone |
|---|---|---|---|---|---|
| ADP-MANUAL | All eight insurers (manual entry) | Required (D-05) | NOT IMPLEMENTED | None. This is the G4 baseline | M6 |
| ADP-ICICI | ICICI Lombard | Automated candidate | BLOCKED | Written permission, test account, product/plan to quote (Q-B16), fixtures | M8 |
| ADP-HDFC | HDFC ERGO | Automated only if the spike passes | BLOCKED | Same blockers, plus a Flutter/canvas feasibility and OCR permission spike | M9 |
| ADP-NIVA | Niva Bupa | Automated candidate | BLOCKED | Permission, account, plan, fixtures | M9 |
| ADP-TATA | Tata AIG | Human-assisted OTP | BLOCKED | Same blockers, plus who receives the OTP during development and test (Q-D02) | M9 |
| ADP-STAR | Star Health | Automated or manual | BLOCKED | Public quote path needs investigation; permission | M9 |
| ADP-UIIC | United India | Advisor-assisted or manual | BLOCKED | Image CAPTCHA (no bypass); permission | M9 |
| ADP-BAJAJ | Bajaj Allianz | Advisor-assisted or manual | BLOCKED | Keycloak SSO and CAPTCHA; permission | M9 |
| ADP-NIA | New India Assurance | Likely manual | BLOCKED | CAPTCHA/reCAPTCHA; permission | M9 |

## 8. Release, documentation and handover (`10`, `11`, `12`, `15`)

| ID | Item | Status | Notes | Milestone |
|---|---|---|---|---|
| REL-01 | `lint`, `typecheck`, `test` and `build` scripts | NOT IMPLEMENTED | No `package.json` exists | M2 |
| REL-02 | Secret scan in CI and pre-release | NOT IMPLEMENTED | | M2 |
| REL-03 | Windows build (`build:win`) | NOT IMPLEMENTED | Unsigned builds are possible | M10 |
| REL-04 | macOS build, signing and notarisation (`build:mac`) | BLOCKED | Apple Developer identity (Q-D04) | M10 |
| REL-05 | Windows code signing | BLOCKED | Certificate owner (Q-D05) | M10 |
| REL-06 | Checksums, release notes, known limitations | NOT IMPLEMENTED | | M10 |
| REL-07 | Rollback procedure and preservation of previous installers | NOT IMPLEMENTED | | M10 |
| REL-08 | Version control and CI | **VERIFIED** (version control, M0) / NOT IMPLEMENTED (CI) | Audit: the folder was not a git repository. M0: baseline `d21976a` (§1a). CI comes in M2 | M0, M2 |
| DOC-01 | User guide | PARTIAL | Draft in `11_USER_GUIDE.pdf`; validate against the built UI | M11 |
| DOC-02 | Install, handover and UAT guide | PARTIAL | Draft in `12_INSTALLATION_HANDOVER_UAT.pdf` | M11 |
| DOC-03 | Adapter READMEs (`04 §5`) | NOT IMPLEMENTED | One per adapter | M8, M9 |
| UAT-01 | Client UAT sign-off | BLOCKED | Client representative not named (Q-D08) | M11 |

## 9. Regression pack (`09 §2–3`)

All 28 cases are **NOT IMPLEMENTED**. No test runner exists.

| Group | Cases | Earliest milestone |
|---|---|---|
| Input validation | TC-01 to TC-04 | M3 (schema unit tests), M6 (UI) |
| Orchestration with mock adapters | TC-05 to TC-08, TC-12 to TC-14 | M5 |
| Parsing and comparison | TC-09, TC-10, TC-27 | M3 (TC-27 also needs Q-B01) |
| Manual entry and evidence | TC-11, TC-28 | M6 |
| PDF | TC-15 to TC-18 | M7 |
| Persistence and retention | TC-19, TC-20 | M4 |
| Security | TC-21 to TC-23 | M2, M4, M5 |
| Platform and installers | TC-24 to TC-26 | M10 (signing blocked) |
| **PRD standard cases 1–4 and floater case 5** | **BLOCKED** | The client must supply dummy inputs and expected values (`09 §3`, Q-D03) |

## 10. Product goals (`01_PRD §3`)

G1 to G8 are acceptance targets, not features. None can be measured until the relevant milestone is complete. G1, G5 and G8 also need agreed sample sizes and measurement conditions (Q-B14).

---

### How to maintain this file

Change a status only with evidence: a test ID with its recorded result, a build ID and the platform. Per `17_REQUIREMENTS_TRACEABILITY`, "a requirement is not verified merely because a test exists." Record any scope change against the PRD and update `17` as the change-control rules in `19` require.
