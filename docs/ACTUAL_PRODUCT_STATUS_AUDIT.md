# Fiducial Quote Fetcher — Actual Product Status Audit

| | |
|---|---|
| Date | 30 October 2026 |
| Scope | The Fiducial Quote Fetcher product (health-insurance quotations across up to eight insurers) |
| Excluded | The temporary Fiducial portal proposal-automation demo (`src/demo/portal-automation/`). It drives a different system (the Fiducial property ERP) and creates property proposals, not insurer quotations. Nothing in it counts towards product completion. It appears here only where it affects the product's security or build |
| Method | Read-only inspection of the repository, the M1 Windows worktree (git log only) and GitHub Actions results. Local checks: typecheck, lint, secrets scan, tests with coverage, and the smoke launch. No source file, git state, worktree or portal was changed. No live portal or insurer site was contacted |
| Machine for today's runs | macOS 15.7.2, Apple M4 (arm64), Node 24.11.1 |

**Headline.** The product is a **secured, empty desktop shell plus a tested domain library** (contracts, money, validation, comparison). Milestones M0 to M3 are implemented; M1, M2 and M3 each have open exit items. **None of the nine product capabilities works end to end in the product app.** There is no storage, no quote screen, no insurer session, no adapter, no PDF and no history. **Zero of eight insurer integrations exist.** On Windows, the shell and domain library pass CI, but the M1 storage and secret-storage spikes **fail**.

---

## 1. Repository and branch status

| Item | Value |
|---|---|
| Branch | `m3/contracts-comparison` |
| HEAD | `d1d9f31` "feat: add portal automation demo and workflow tools…" (29 Oct 2026) |
| Remote | `origin` (GitHub). HEAD is **1 commit ahead** of `origin/m3/contracts-comparison`, so it has **no CI run** |
| Last commit with CI | `66f3fa7`: CI **green on macOS and Windows** (run 40516560732) |
| Staged | Nothing |
| Uncommitted | 22 modified and 12 untracked files. All are in the portal demo (`src/demo/portal-automation/`, `test/portal-automation-demo/`), plus `src/main/index.ts` (the demo's data folder) |
| Worktree | `../fiducial_electron-m1-windows` on `spike/m1-windows-evidence` at `19bca52`. Not modified by this audit |
| Build output | `release/` holds unsigned 0.1.0 builds from 27 Oct (NSIS x64, DMG arm64 and x64), git-ignored |

Commit history: M0 planning (`d853dbb`), then M1 spikes (`e8a68b0`), M2 scaffold (`37879c5`), M3 contracts and comparison (`4f42849`), three CI fixes (`2d9e19e`, `b692cfb`, `66f3fa7`), and the demo (`d1d9f31`).

## 2. Actual product architecture

**Stack:** Electron 45.0.0, electron-vite 6.0.0, electron-builder 26.17.0, React 19.3.0, TypeScript (strict), Zod 4.6.7, Vitest. `npm audit --omit=dev`: 0 vulnerabilities.

| Layer | What exists | Files |
|---|---|---|
| Main process | Secure window factory; `app://` protocol with CSP header; navigation, popup, permission, download and webview guards; launch guard against debug flags; single-instance lock; IPC dispatcher with Zod validation and sender verification; allowlist logger with correlation IDs; in-app smoke checks | `src/main/**` |
| IPC | **One channel**: `app:get-info` (read-only app version and platform) | `src/shared/ipc/*`, `src/main/ipc/handlers.ts` |
| Preload | Typed `window.fqf` bridge, no raw `ipcRenderer` | `src/preload/index.ts` |
| Renderer (product) | **Foundation screen only**: "Foundation build. Quote features are added in later milestones", plus an About panel | `src/renderer/src/App.tsx` |
| Shared domain | Contracts (customer, member, quote request and draft, insurer, plan, coverage, result input and normalised result, run and connection states, progress event, adapter metadata, comparison result); money in paise; request validation and pre-flight; comparison engine with versioned, configurable rules | `src/shared/contracts/*`, `money.ts`, `validation/*`, `rules/*`, `comparison/*` |
| Packaging | electron-builder config with fuses (RunAsNode off, cookie encryption on, NODE_OPTIONS and inspect flags off, asar integrity on); package-content and fuse check script | `electron-builder.yml`, `scripts/check-package.mjs` |

**Present but not product:**
- **Development-only simulation**, `src/renderer/src/dev/` (about 10,000 lines). A quote-comparison demo and a full workflow mock-up: request, census, jobs, results. It uses synthetic data and **simulated** insurers (`dev/workflow/simulators.ts`). It is loaded only when `import.meta.env.DEV` is true, so production builds drop it. It is a UI prototype, not product functionality.
- **Portal demo**, `src/demo/portal-automation/`. It is excluded from scope, but **it is wired into the product's main process** (`src/main/index.ts` imports and registers it in every build, gated by environment variables). See §9.

**Planned but absent** (ARCHITECTURE_REVIEW §3): Storage (SQLite), SecretStore, settings and branding, retention job, PaneManager (per-insurer `WebContentsView` and `persist:` partitions), Driver (CDP), Orchestrator, adapter registry and adapters, PdfService, History, product UI screens.

## 3. Implemented features, with evidence

"CI Windows" means GitHub's `windows-latest` runner (Windows Server). That is real Windows execution, but not a Windows 10 or 11 desktop install.

| Feature | Source | Tests | Results | Platforms tested |
|---|---|---|---|---|
| Hardened window and renderer: sandbox, context isolation, no Node, locked webPreferences | `src/main/windows/main-window.ts`, `src/main/security/web-preferences.ts` | `test/web-preferences.test.ts`; smoke `renderer.no-node`, `renderer.sandboxed` | Pass today; smoke 13/13 | macOS (local, today); CI macOS and Windows at `66f3fa7` |
| `app://` protocol and CSP: traversal, other-host and main-bundle access blocked; inline script blocked | `src/main/security/app-protocol.ts`, `csp.ts`, `origins.ts` | `test/app-protocol.test.ts`, `test/csp.test.ts`; smoke `protocol.*`, `csp.inline-script-blocked` | Pass | macOS; CI both |
| Navigation, popup, permission and download guards (TC-23) | `src/main/security/navigation-policy.ts` | `test/navigation-policy.test.ts`; smoke `tc23.*` | Pass | macOS; CI both |
| Launch guard: `--remote-debugging-port/pipe`, `--inspect` | `src/main/security/launch-guard.ts` | `test/launch-guard.test.ts`; smoke launch probes (3) | Pass. Only fuses fully close the inspector (M1 finding 4) | macOS; CI both |
| IPC registry: constant channels, Zod, sender policy, `AppResult` envelope (TC-22) | `src/main/ipc/*`, `src/shared/ipc/*` | `test/ipc-dispatcher.test.ts`, `test/contract.test.ts`; smoke `ipc.round-trip`, `bridge.shape` | Pass | macOS; CI both |
| Allowlist structured logger (LOG-01) | `src/main/logging/logger.ts` | `test/logger.test.ts` | Pass | macOS; CI both |
| Lint guard against sync `safeStorage` (AR-17) and clean launch environment (AR-19) | `eslint.config.mjs`, `scripts/run-clean-env.mjs` | `test/lint-rules.test.ts` | Pass | macOS; CI both |
| Money: integer paise, Indian-format parse and format | `src/shared/money.ts` | `test/money.test.ts` (includes property tests) | Pass; 100% coverage | macOS; CI both |
| Domain contracts | `src/shared/contracts/*` | `test/domain-contracts.test.ts` | Pass. **Status `draft` (0.1.0), not frozen** | macOS; CI both |
| Quote-request validation and pre-flight (TC-01 to TC-04 at schema level) | `src/shared/validation/*`, `src/shared/rules/quote-input-rules.ts` | `test/quote-validation.test.ts` | Pass. **Rule values are placeholders** (Q-B03 to Q-B05) | macOS; CI both |
| Result normalisation from structured input (manual or adapter) | `src/shared/comparison/normalize.ts` | `test/comparison.test.ts` | Pass | macOS; CI both |
| Comparison engine: validity, eligibility, comparability, cheapest selection that never ranks missing values (TC-09, TC-10, TC-27) | `src/shared/comparison/*`, `src/shared/rules/comparison-rule.ts` | `test/comparison.test.ts` | Pass; 100% coverage. **Rule provisional** (DM-06, Q-B01/Q-B02) | macOS; CI both |
| Packaging config and fuse check | `electron-builder.yml`, `scripts/check-package.mjs` | `build:mac` and `build:win` with content and fuse check (M2 evidence) | Packages built on 27 Oct. **The Windows package was cross-built on macOS and never installed or run** | macOS build only |

**Test results today** (macOS 15.7.2 arm64):

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` (ESLint and Prettier) | Pass |
| `npm run secrets:scan` | Pass |
| `npm run test:coverage` | 636/636 tests in 29 files; `src/shared` 100% (445 statements, 322 branches, 82 functions, 383 lines) |
| Product tests only | **328/328 in 13 files** |
| Dev simulation tests (`test/comparison-demo.test.ts`, `test/demo-workflow.test.ts`) | 119/119 (not product functionality) |
| Portal demo tests (`test/portal-automation-demo/`) | 189/189 (excluded from scope) |
| `npm run test:smoke` (builds, then launches the app) | Pass: 13 runtime checks and 3 launch probes |
| `spikes/m1` unit tests | 84/84 in 11 files |

**CI history** (GitHub Actions `ci`, macOS and Windows): failed at `37879c5`, `2d9e19e` and `b692cfb` (Windows line endings, then a lint timeout); **green on both at `66f3fa7`**. HEAD `d1d9f31` has not been pushed.

## 4. Partially implemented features

| Feature | What exists | What is missing |
|---|---|---|
| Customer and member capture (objective 1) | Schemas and validators (`contracts/customer.ts`, `quote.ts`, `validation/*`) | Product UI, persistence, approved rule values (Q-B03 to Q-B05). The only screens are in the dev simulation |
| Comparison (objective 6) | Engine, versioned rules, highlight label, difference reporting | Approved comparability rule and premium basis (Q-B01, Q-B02, Q-B10); Results UI; persistence |
| Normalisation (objective 5) | Strict parsing of structured result input, missing values kept null | Extraction from insurer portals (adapters), sanitised fixtures |
| Contracts (M3) | Implemented, 100% covered | Review and freeze (`CONTRACTS_STATUS = 'draft'`) |
| Security baseline (M2) | Implemented; smoke-verified on macOS and on the CI Windows runner | Windows 10/11 desktop run; Husky hook activation; S6 signing |
| Packaging | Config, fuses, content check, unsigned builds | Install and run on Windows; signing and notarisation (Q-D04, Q-D05); clean-machine tests TC-24 to TC-26 |
| UI prototype | Dev-only workflow and comparison screens with simulated insurers | Not product code; must be rebuilt or ported against real IPC, storage and orchestrator |

## 5. Experimental spike components (not product code)

| Spike | Location | Proves | Platforms |
|---|---|---|---|
| S1 Electron runtime | `spikes/m1/src/main/spikes/s1-electron.ts` | Locked-down window, validated IPC, clean exit | macOS 15 arm64 only |
| S2 Session isolation and CDP driver | `s2-sessions.ts`, `cdp-driver.ts`, `mock-portal.ts` | `persist:` partitions isolated; CDP fills, clicks and reads a **local mock** form; no debug port with fuses | macOS 15 arm64 only; **not run on Windows** |
| S3 Encrypted SQLite | `s3-sqlite.ts`, `shared/sqlite-core.ts` | SQLCipher v4 at rest; native module in the packaged app | macOS pass; **Windows fails** (§7) |
| S4 PDF with ₹ | `s4-pdf.ts`, `shared/rupee-check.ts`, `ttf.ts` | Embedded Noto Sans; ₹ extracted as U+20B9; negative controls | macOS only; **not run on Windows** |
| S5 Secret storage and vault (Q-M1-01) | `s5-secure-storage.ts`, `s5-vault.ts`, `shared/vault/*` | AES-256-GCM vault with `safeStorage`-wrapped data keys; every tampering rejected | macOS pass; **Windows fails** (§7); independent security review outstanding |
| S6 Signing | `docs/evidence/M1/S6-signing-blocked.md` | — | **Blocked**: no identities |
| Windows evidence harness | Branch `spike/m1-windows-evidence` (`.github/workflows/m1-windows-evidence.yml`, `windows-fs-probe.mjs`, `sqlite-tamper.test.ts`, `vault-acl-windows.test.ts`) | Collects Windows S3/S5 evidence in CI | Runs on 27 and 28 Oct: **failed** |

The portal demo (`src/demo/portal-automation/`) is also experimental. It creates property proposals in the Fiducial ERP and is unrelated to insurer quotations.

## 6. Missing product features

Against the product objective:

| # | Objective | Status in the product app |
|---|---|---|
| 1 | Collect customer and member details once | **Partial**: schemas and validators only; no UI, no persistence |
| 2 | Run quotations across up to eight insurers in parallel | **Missing**: no orchestrator (M5). Parallelism exists only in the dev simulation |
| 3 | Isolated, visible browser sessions per insurer | **Missing**: no PaneManager. Proven only in spike S2, against a local mock page, on macOS |
| 4 | Advisor handles login, OTP and CAPTCHA manually | **Missing**: the states exist in the contracts (`login_required`, `otp_required`, `manual_action_required`); nothing detects or displays them |
| 5 | Extract and normalise quotations | **Partial**: normalisation of structured input exists; **no extraction**, because there are no adapters |
| 6 | Compare premiums and coverage accurately | **Partial**: engine done and tested; rule not approved; no Results UI |
| 7 | Branded comparison PDFs | **Missing**: spike S4 only (macOS); no PdfService, template or branding content (Q-B07, Q-B08) |
| 8 | Local quote history and retention | **Missing**: no database, history or retention job (M4; Q-B06) |
| 9 | Secure storage of sensitive data | **Missing in product**: spike only (SQLCipher and vault, macOS); failing on Windows; DM-02 not approved |

Also missing:
- **Manual entry for all eight insurers** (ADP-MANUAL, the R1 baseline);
- **Settings, first-run setup and logo import** (FR-17);
- **History search, reopen, duplicate and delete** (FR-18);
- **Signed installers** (FR-19);
- **User and install guides, and UAT** (FR-20).

PRD P0 coverage: FR-01 to FR-04 and FR-12 are partial (domain layer only). **FR-05 to FR-11 and FR-13 to FR-20 are not implemented.**

## 7. M1 completion assessment

M1 exit criterion (IMPLEMENTATION_PLAN §9): S1, S3, S4 and S5 pass on macOS arm64 **and at least one Windows x64 platform**; S2 recorded; S6 recorded or blocked with an owner.

| Spike | macOS 15 arm64 | Windows x64 | macOS 13 / Intel |
|---|---|---|---|
| S1 | Pass (dev and packaged) | Not run as a spike. The product shell's smoke test passes on the CI Windows runner, which is indirect evidence | Not run |
| S2 | Pass (mock portal) | Not run (`debug-port-check.mjs` is macOS-only) | — |
| S3 | Pass | **Fail.** Windows evidence run 40646550825 (28 Oct, `19bca52`): dev and packaged `s3-create` gave `EBUSY: resource busy or locked … cache.db`; `s3-reopen` gave `NOT NULL constraint failed: quote.label` | Intel not run |
| S4 | Pass | Not run | Not run |
| S5 | Pass after Q-M1-01 | **Fail.** `s5-write`/`s5-read` gave `EBUSY`; `s5-vault-foreign` gave `ENOENT … secrets`. Only `s5-decrypt-foreign` passed | Not run |
| S6 | Blocked (no identities) | Blocked | — |

Further findings from the same Windows run:
- **WAL loss:** with a broken WAL checksum, or the WAL file missing, a committed transaction was **silently lost** and `integrity_check` reported ok.
- **No real failure test:** an OS-level "secure storage unavailable" condition was not produced; fail-closed behaviour is covered only by mocked unit tests.

**Verdict: M1 is not complete.**
- **Windows:** S3 and S5 fail, and S1, S2 and S4 have not run there. Whether `EBUSY` is a harness defect (a file still open across phases) or a real Windows locking issue is **not yet diagnosed**.
- **Other platforms:** macOS 13 and Intel are untested.
- **Signing:** S6 is blocked.
- **Security review:** the Q-M1-01 independent review is outstanding.

## 8. Windows compatibility assessment

| Area | Evidence | Assessment |
|---|---|---|
| Lint, typecheck and unit tests | CI `windows-latest` green at `66f3fa7` | **Works** on Windows Server |
| App launch and security smoke | `test:smoke` passed in the same CI job | **Works** on Windows Server (headless CI) |
| Installer | NSIS x64 cross-built on macOS; content and fuse check passed | **Unverified**: never installed or run |
| Windows 10 22H2 / 11 desktop | None | **Untested** (needs Q-D07 machines) |
| Encrypted SQLite (S3) | Windows evidence run | **Failing** |
| Secret storage, DPAPI (S5) | Windows evidence run | **Failing** (except the foreign-key-store check) |
| PDF ₹ (S4), sessions and debug port (S2) | None | **Untested** |
| Signing and SmartScreen | None | **Blocked** (Q-D05) |

**Verdict:** the empty shell and the domain library are Windows-compatible as far as CI shows. **The storage and secrets foundation that R1 depends on does not yet work on Windows.** No Windows support claim can be made for any user-facing feature.

## 9. Security and data-protection gaps

Ordered by urgency.

1. **The portal demo ships inside the product build and can create live records** (high).
   - **Wiring:** `src/main/index.ts` imports and registers the demo in every build.
   - **Committed setting:** HEAD `d1d9f31` sets `LIVE_PROPOSAL_CREATION = 'verification'` in `src/demo/portal-automation/shared/environment.ts`.
   - **Consequence:** a packaged Quote Fetcher started with `ENABLE_PORTAL_AUTOMATION_DEMO=1` and `PORTAL_AUTOMATION_FULL_WORKFLOW=1` can create real proposals in the live Fiducial ERP, after a user confirmation.
   - **Data on disk:** the demo writes `attempts.json` and `audit.jsonl` to `<userData>/portal-automation/`, including client names in plain JSON.
   - **Fix:** set live creation back to `'off'`, and exclude the demo from production builds or remove it before any release build.
2. **No encrypted storage in the product.**
   - **Approval:** DM-02 (encrypted SQLite) is unapproved, and the Q-M1-01 vault has had no independent security review.
   - **Windows:** S3 and S5 fail there.
   - **Integrity gap:** the Windows run showed that WAL tampering or loss can silently drop committed data. This needs a design response, such as a WAL checkpoint policy, synchronous FULL, or backup and verification, before M4.
3. **`safeStorage` ciphertext is not integrity-protected.** Confirmed on macOS (AR-18). Mitigated only in the spike vault, not in the product.
4. **No signing.**
   - **macOS:** Gatekeeper rejects the ad-hoc app.
   - **Windows:** the SmartScreen outcome is unknown.
   - **Lead time:** identities have long lead times (AR-14; Q-D04, Q-D05).
5. **Debug ports.**
   - **Fuses:** the launch guard alone cannot stop the inspector; fuses are configured and checked.
   - **Port race:** the `--remote-debugging-port` race (AR-16) is unmeasured on Windows.
6. **Sync `safeStorage` removal in Electron 46** (AR-17). Lint-guarded in the product. Plan the Electron upgrade within the 45.x support window (AR-15).
7. **Retention and deletion are not implemented** (Q-B06). Low risk today because no PII is stored, but they are a release gate.
8. **Persistent insurer sessions (DM-03).** Cookies are encrypted only with the cookie-encryption fuse (configured). On-disk session persistence needs security review before R2.
9. **Process.** The Husky pre-commit hook is not activated (M2 note). Secret scanning runs in CI and passes.

What is in place:
- **Hardened app:** sandboxed renderer, CSP, `app://` with traversal tests, navigation, popup and permission denial, and a single-instance lock.
- **Locked-down IPC:** validated IPC with sender checks, and an allowlist logger.
- **Build checks:** fuses in the build config, and a package-content check.

## 10. Insurer integration readiness

| Insurer | Mode planned | Code | Blockers |
|---|---|---|---|
| ICICI Lombard | Automated candidate (first slice) | None | Written permission (Q-D01), test account and OTP holder (Q-D02), plan to quote (Q-B16) |
| HDFC ERGO | Automated if the canvas spike passes | None | As above, plus Flutter/canvas and OCR feasibility |
| Niva Bupa | Automated candidate | None | Q-D01, Q-D02, Q-B16 |
| Tata AIG | Human-assisted OTP | None | Q-D01, Q-D02 (who receives OTP), Q-B16 |
| Star Health | Automated or manual | None | Public quote path unexplored; permission |
| United India | Advisor-assisted or manual | None | Image CAPTCHA (no bypass); permission |
| Bajaj Allianz | Advisor-assisted or manual | None | SSO and CAPTCHA; permission |
| New India Assurance | Likely manual | None | CAPTCHA; permission |

**Readiness: 0 of 8.**
- **What exists:** the adapter metadata contract (`src/shared/contracts/adapter.ts`: modes, required fields, https origins) and a CDP driver proven against a local mock page on macOS (spike S2).
- **What doesn't:** no adapter registry, PaneManager, orchestrator, fixture tooling, or parser.
- **Manual fallback:** the manual entry that the plan requires for every insurer (D-05) is also not built.

**The Fiducial demo is not insurer-integration evidence.**
- **Different system:** it targets a different system (the Fiducial ERP), whose source and API description were available.
- **Different action:** it creates a record rather than reading a quotation.
- **Different architecture:** it uses a `BrowserWindow` with an in-memory session, not per-insurer `WebContentsView`s with persistent partitions.

Some patterns are reusable for R2: an isolated window, a network write guard, read-back verification, an attempt store and audit log, and manual sign-in. **It proves nothing about any insurer's portal, permissions, OTP or CAPTCHA flow, or quotation extraction.**

## 11. Exact next development milestone

**M4 — Encrypted storage, settings, SecretStore and retention** (IMPLEMENTATION_PLAN §4 M4; R1 path M4, then M6, M7, M10 and M11).

M4 must not start until three entry conditions hold:
1. **M1 Windows closed for S3 and S5.**
   - **Diagnose and fix** the `EBUSY` and `NOT NULL` failures on `spike/m1-windows-evidence`.
   - **Get a green Windows evidence run.**
   - **Address the WAL silent-loss finding** in the storage design.
2. **M3 contract freeze:** technical and PO review of `src/shared/contracts` (version 0.1.0, `draft`). Storage schemas are written from these contracts.
3. **DM-02 decision:** the security review of the encrypted-SQLite and vault design (Q-M1-01). If DM-02 goes to option A, the plain driver plus full-disk encryption is used, and only `storage/db.ts` and `files.ts` change.

Items 1 and 2 are engineering and review work that can start immediately. Item 3 needs the named security reviewer.

## 12. Prioritised roadmap

**P0: now, no external dependency.**
1. **Contain the demo:**
   - set `LIVE_PROPOSAL_CREATION` back to `'off'`;
   - exclude `src/demo/` from production builds (or remove it);
   - push, and confirm CI is green on both OSes.
2. **Windows S3 and S5:** fix and re-run the evidence workflow. Add S1, S2 and S4 to the Windows workflow (port `debug-port-check.mjs`).
3. **Contract freeze review (M3),** and PO answers to Q-B01 to Q-B05 and Q-B10, so the comparison and validation rules stop being placeholders.
4. **Start long-lead items:**
   - signing identities (Q-D04, Q-D05);
   - Windows 10/11 test machines (Q-D07);
   - branding and legal content (Q-B07, Q-B08);
   - retention period (Q-B06).

**P1: R1, manual-first. Estimate 33–42 developer-days (plan §8).**
5. **M4** encrypted storage, settings, SecretStore and retention (TC-19 to TC-21), on both OSes.
6. **M6** product UI and **manual entry for all eight insurers**. The dev simulation screens are a design reference, but must be rebuilt on real IPC and storage.
7. **M7** PDF service, from the S4 approach (TC-15 to TC-18 on both OSes).
8. **M10** signed packaging and clean-machine installs (TC-24 to TC-26).
9. **M11** guides, UAT and handover.

**P2: R2 and later, gated per insurer.**
10. **M5** PaneManager, Driver, Orchestrator, mock adapters and the Connect board.
11. **M8** first live adapter (ICICI Lombard, or the first insurer approved). It needs written permission (Q-D01), a test account and OTP holder (Q-D02), the plan to quote (Q-B16) and sanitised fixtures.
12. **M9** the remaining insurers, one at a time. Any insurer without approval stays manual.

---

## Verdict

**What is genuinely complete**
- **Security foundation (M2):**
  - **Implemented and tested:** a hardened Electron shell with a protocol, CSP, navigation and IPC security baseline.
  - **Where it runs:** verified on macOS locally and on GitHub's macOS and Windows runners at `66f3fa7`.
- **Domain library (M3):** money handling, request validation, result normalisation and the comparison engine.
  - **Tested:** 328 product tests and 100% coverage of `src/shared`.
  - **Not final:** the contracts are a draft, and the business rules are placeholders.
- **M1 spikes on macOS arm64:** S1 to S5 pass. They are spike code, not product code.

**What is blocking the actual product**
- **No feature works end to end:** the product has no storage, quote UI, manual entry, PDF or history.
- **Windows:** storage and secret storage, the base for everything after M3, fail there, and no Windows desktop has been tested.
- **Unmade decisions:**
  - DM-02, the security review;
  - the contract freeze;
  - the comparison and validation rules (Q-B01 to Q-B05);
  - branding and legal text (Q-B07, Q-B08);
  - signing identities (Q-D04, Q-D05).
- **Insurer automation:** every integration is blocked by missing permissions, test accounts and plan choices (Q-D01, Q-D02, Q-B16). Zero adapters exist.
- **A release risk in the build:** the Fiducial demo is wired into the product with live creation enabled in the committed code.

**What to implement next**
1. **Contain the demo** in the build, and get CI green for HEAD.
2. **Close M1 on Windows** for S3 and S5, including the WAL finding.
3. **Freeze the M3 contracts.**
4. **Build M4,** encrypted storage and settings, once DM-02 is decided.
5. **Build M6,** manual entry for all eight insurers. That is the shortest path to a usable R1 product. Automated insurer integration (M5, M8) comes after it, and only per approved insurer.
