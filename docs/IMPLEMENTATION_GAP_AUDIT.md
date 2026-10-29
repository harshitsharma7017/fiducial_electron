# Implementation Gap Audit — Fiducial Quote Fetcher

| | |
|---|---|
| Date | 27 October 2026 |
| Repository state audited | Branch `m3/contracts-comparison`, HEAD `4f428495fafe9e0bbe49a364ccb35306dc0220c3`, **plus uncommitted working-tree changes** (the development demo, the `.gitattributes` line-ending fix, and documentation) |
| Requirements baseline | FQF-DOCS-001 v1.0 **draft**: PDFs `00`–`19` in the repository root. Every approval in `19_CHANGELOG_AND_APPROVALS` is **pending** (Q-03) |
| Not available | The nine-page source PRD and the conversation task list that `00` names as the pack's sources (Q-02). The `docs/0x_*.md` files that `00` suggests do not exist; the PDFs are the baseline (C-09, Q-E09) |
| Status | Audit and planning only. **This document approves nothing**, changes no requirement, and does not replace any record in [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md), [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) or [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) |

**Relation to existing documents.** No earlier gap audit exists. [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) §2–§9 hold the requirement statuses as recorded at the pre-code audit, with milestone changes appended in §1a–§1d. Those tables do not map requirements to source files. This document does that against the code as it stands today. Where the two differ, IMPLEMENTATION_STATUS remains the record of status changes until someone with authority updates it.

---

## 1. Executive summary

1. **No end-to-end business workflow exists in the product.**
   - The packaged app opens a single "foundation build" screen (`src/renderer/src/App.tsx`).
   - It offers no quote entry, insurer connection, result display, manual entry, PDF or history.
2. **What exists:**
   - a hardened Electron shell (M2);
   - a pure, tested domain layer (M3): contracts, money handling, input validation, insurer pre-flight and the comparison engine.
   - M3 is **implemented and tested on macOS but not accepted**:
     - the contracts are draft (`CONTRACTS_STATUS = 'draft'`);
     - every business rule is provisional or a placeholder;
     - M3 has never run in CI or on Windows.
3. **The insurer calculates the premium; the application does not.**
   - The engine parses the insurer's displayed amount into paise and never changes it.
   - It ranks results by that unchanged total, and it does not annualise or derive premiums (§6, item R1).
4. **The PRD's comparison requirements are preserved in the engine:**
   - per-insurer status, plan, premium and source are present in the contracts;
   - "cheapest valid comparable premium" is implemented;
   - a missing premium is never treated as zero;
   - manual results are supported.
   - **The rule that decides "comparable" is not approved** (Q-B01, Q-B02, Q-B10, DM-06), and under the strict provisional rule a highlight may rarely occur in practice (AR-23).
5. **The next milestones are gated:**
   - M4 (storage) waits on security approvals (Q-M1-01, DM-02, Q-D08).
   - Insurer adapters wait on written authorisation, test access and plan selection (Q-D01, Q-D02, Q-B16).
   - The order of M5 relative to M6/M7 depends on DM-05, which is not approved.
6. **The next smallest safe task** is not product code. It is to commit the one-line `.gitattributes` fix and run CI on Windows, which needs your authorisation (§10). Until then nothing has been verified on Windows.

## 2. Current verified implementation state

**Checks run for this audit** (27 Oct 2026, macOS 15.7.2 arm64, Node 24.11.1, current working tree; output kept outside the repository):

| Check | Result |
|---|---|
| `npm run typecheck` | Pass (exit 0) |
| `npm run lint` (ESLint and Prettier) | Pass (exit 0) |
| `npm run test:coverage` | **395/395 tests in 14 files.** 100% statements (445/445), branches (322/322), functions (82/82) and lines (383/383) for `src/shared` |
| `npm run secrets:scan` | Pass (exit 0) |
| `npm run test:smoke` (production build plus in-app checks) | Pass. 13/13 in-app checks; launch guard refused 3/3 debugging switches |

The 395 tests are the 328 committed in `4f42849` plus 67 for the **uncommitted, development-only** demo (`test/comparison-demo.test.ts`).

**What has never run:**
- any check on Windows;
- CI on the M3 commit;
- packaging in CI;
- an installer on a clean machine;
- anything against a real insurer portal.

| Layer | Files | State |
|---|---|---|
| Main process (M2) | `src/main/index.ts`; `security/` (web preferences, CSP, `app://` protocol, navigation policy, launch guard, origins); `ipc/` (dispatcher, sender policy, handlers); `logging/logger.ts` | Implemented; verified on macOS (unit tests and smoke). The only IPC channel is `app:get-info` |
| Preload (M2) | `src/preload/index.ts` | Exposes `window.fqf.app.getInfo` only; no raw `ipcRenderer` |
| Renderer | `src/renderer/src/App.tsx` | Foundation screen only. The comparison demo in `src/renderer/src/dev/` is **development-only**: it is loaded only when `import.meta.env.DEV` is set, uses synthetic data, is uncommitted, and is not a product screen |
| Contracts (M3, draft) | `src/shared/contracts/` (customer, quote, insurer, coverage, status, adapter, comparison, issues, common) | Zod schemas and types; version 0.1.0, **draft** |
| Rules (M3, unapproved) | `src/shared/rules/comparison-rule.ts` (`dm06-provisional`, status `provisional`); `quote-input-rules.ts` (`quote-input-placeholder`, status `placeholder`) | Configuration, not approved |
| Domain logic (M3) | `src/shared/money.ts`; `validation/quote-request.ts`, `preflight.ts`; `comparison/` (normalize, validity, eligibility, comparability, selection, compare) | Pure TypeScript with no I/O; 100% coverage |
| Persistence, vault, PDF, adapters, orchestrator | — | **None in the product.** The M1 vault, SQLite and PDF code lives only in `spikes/m1/` (spike code, never merged into `src/`) |
| CI | `.github/workflows/ci.yml` (macOS and Windows) | Ran once, on M2 `37879c5`: macOS passed, Windows failed at lint (AR-25). **Never run on M3** |

## 3. Requirements-to-code traceability

**Status values:**
- **Implemented and verified:** code exists and tests covering it **ran and passed in this audit**. Unless a row says otherwise, that means on **macOS 15 arm64 only**; **no row is verified on Windows**.
- **Partially implemented:** some product code exists and is tested; the requirement is not met.
- **Not implemented:** no product code exists.
- **Blocked by approval:** the controlling gap is an unapproved decision, or missing authorisation or access, named in the row.
- **Not applicable:** outside v1 scope, or there is nothing to build.

Spike evidence (`docs/evidence/M1/`) reduces risk but **does not count as product implementation**.

### 3.1 P0 functional requirements (`01_PRD §9`)

| Requirement ID | Documented requirement | Current implementation | Status | Gap | Recommended next action |
|---|---|---|---|---|---|
| FR-01 | Customer name, phone, email, notes | `customerSchema` (`contracts/customer.ts:45`): name required; phone, email and notes optional. Tested in `test/quote-validation.test.ts` (TC-01, TC-02 at schema level) | Partially implemented | No form, no persistence. Rejecting landlines is provisional (OPEN_QUESTIONS §0.6) | Contract review (Tech, PO); form in M6 after M4 |
| FR-02 | Members with relationship and age or DOB; minimise DOB; validate age limits | `memberSchema` holds relationship and age only (`customer.ts:25`). Age limits come from the placeholder table (`quote-input-rules.ts:48–67`) via `checkRequestRules` (`validation/quote-request.ts:31`). TC-03 passes at schema level | Blocked by approval | Age limits, relationships and counts are placeholders (Q-B04). DOB is not captured (C-05); member name is omitted (C-04); PRIV-01 | PO decisions Q-B04, C-04, C-05 |
| FR-03 | Sum insured, validated pincode, floater/individual | `quoteRequestSchema` (`contracts/quote.ts:28`); `pincodeSchema` checks format only (`quote.ts:22`); sum-insured and floater rules are placeholders (`quote-input-rules.ts:68–76`) | Blocked by approval | Sum-insured rule (Q-B03); floater and pincode rules (Q-B05). `quote.ts:31` reads sum insured as "per member for individual, shared for floater"; that reading is unconfirmed (Q-B03) | PO decisions Q-B03, Q-B05 |
| FR-04 | Validate insurer-specific required fields before starting | `preflight()` (`validation/preflight.ts:26`) blocks only the affected insurer; `REQUIRED_FIELDS` is in `contracts/adapter.ts:17`. TC-04 passes at function level | Partially implemented | No adapter declares any fields. Real per-insurer field lists need authorised portal evidence (Q-D01, Q-D02). An adapter that needs a DOB is always blocked (C-05) | Gather field lists during each insurer's authorised feasibility work (M8/M9) |
| FR-05 | Isolated persistent session per insurer | None in product. Spike S2 verified partition isolation against **local mock pages** on macOS | Blocked by approval | PaneManager not built (M5). Persistent sessions are DM-03, which needs security review; on-disk cookie conflict C-08 | Security review of DM-03; then M5 |
| FR-06 | Connection/auth states; reconnect without losing the quote | `CONNECTION_STATUSES` and `RUN_STATUSES` (`contracts/status.ts:9,35`); no state machine | Partially implemented (contract only) | No Connect board, state machine or reconnect. The state lists differ between documents (C-01, E-05) | M5/M6 after DM-05 sequencing |
| FR-07 | Concurrent runs; bounded concurrency; per-insurer timeout; at most one safe retry | None | Not implemented | Orchestrator not built. Timeout semantics are open (Q-E06) | M5 with mock adapters |
| FR-08 | Cancellation; keep partial results | `AdapterRunContext.signal` type only (`contracts/adapter.ts:62`) | Not implemented | Orchestrator; persisting terminal states needs M4 | M5 |
| FR-09 | One insurer failure does not block others | At engine level, a failed result is excluded without affecting others (`comparison.test.ts:599`, TC-05 engine level) | Partially implemented | Runtime isolation needs the orchestrator | M5 |
| FR-10 | Live status, premium, plan, cover, source and failure reason per insurer | `normalizedResultSchema` (`quote.ts:122`) carries status, plan, premium, sum insured, source and error code; `progressEventSchema` (`status.ts:58`) is defined, but nothing emits it | Partially implemented (contract only) | No IPC events and no Results screen. `ComparisonResult.excluded` (`contracts/comparison.ts:133`) carries IDs and findings but not premiums, so a Results view must show every insurer from its `NormalizedResult`, not only `comparable` | M6 design input; M5 for live status |
| FR-11 | Manual entry for any insurer, labelled, optional screenshot | `source: 'manual'` in the contract; manual and automated results share one normaliser (`comparison/normalize.ts`); manual source kept in the output (`comparison.test.ts:590`, TC-11 engine level) | Partially implemented | No form; no evidence store (M4). Whether manual results may be ranked (Q-B10); whether evidence is mandatory (Q-B11) | PO decisions Q-B10, Q-B11; form in M6 |
| FR-12 | Highlight cheapest valid comparable premium; never treat missing or failed as zero | `compareQuotes` (`comparison/compare.ts:35`), `selectCheapest` (`selection.ts:21`), rule `PROVISIONAL_COMPARISON_RULE` (`rules/comparison-rule.ts:43`). TC-09, TC-10 and TC-27 pass at engine level | Blocked by approval | The rule is provisional: Q-B01, Q-B02, Q-B10, DM-06, ties, the two-quote minimum, duplicates and the label are unapproved. Under it a highlight may rarely occur (AR-23). See §6 | PO decisions at the stakeholder review |
| FR-13 | Branded HTML-based PDF for 1–8 insurers; ₹ renders | None in product. Spike S4: ₹ rendered with the bundled font, **macOS only** | Not implemented | PDF service (M7). TC-17 not run on Windows | M7 after M4 and M6 |
| FR-14 | Failed, timed-out, unsupported and manual results in labelled boxes | States `failed`, `timed_out`, `unsupported` and source `manual` exist in the contract (`status.ts:9`) | Partially implemented (contract only) | No UI or PDF boxes. User-facing wording in `07 §3` is not implemented | M6, M7 |
| FR-15 | PDF has approved brand, licence/GST, disclaimer, consent, date | None | Blocked by approval | Content not approved: Q-B07 (branding, licence/GST), Q-B08 (disclaimer and consent), C-06 | Client decisions Q-B07, Q-B08 |
| FR-16 | Save PDF to chosen folder; link to history | None | Not implemented | Needs M7 and M4 | M7 |
| FR-17 | First-run setup and branding configuration | None | Not implemented | Needs M4 settings storage; content Q-B07 | M4, M6 |
| FR-18 | History: search, reopen, regenerate PDF, delete with attachments | None | Blocked by approval | M4 gated on Q-M1-01 and DM-02; retention Q-B06 | Security approvals, then M4 |
| FR-19 | Build and smoke-test Windows and macOS installers | `build:mac` and `build:win` (`package.json`) with `scripts/check-package.mjs` (content and fuses). The macOS packaged app passed its smoke checks in M2 | Partially implemented | Windows installer never run. No clean-machine tests (TC-24, TC-25). Signing blocked (Q-D04, Q-D05). Packaging is not in CI | Windows CI first (§10); clean machines (Q-D07) |
| FR-20 | User and install guides; UAT evidence | Drafts only (`11_USER_GUIDE.pdf`, `12_INSTALLATION_HANDOVER_UAT.pdf`) | Partially implemented | Must be checked against a built app. UAT owner not named (Q-D08) | M11 |

### 3.2 Security, data, IPC, platform and scope items

IDs below are those in [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) §4–§8.

| Requirement ID | Documented requirement | Current implementation | Status | Gap | Recommended next action |
|---|---|---|---|---|---|
| Insurer premium not altered (`02 §2` "never fabricate"; `05 §3`) | Insurer-provided amounts kept as given; no premium calculation | `normalizeResult` parses text to paise without rounding (`money.ts:45`) or takes paise as given (`normalize.ts:23`). Ranking uses that total unchanged (`compare.ts:101`). No annualisation: other tenures are excluded (`eligibility.ts:24`). Exact outputs asserted (`comparison.test.ts:76`) | Implemented and verified | The zero-tolerance consistency check needs review (§6, R2) | Keep; review R2 |
| SEC-01, SEC-02 | Node integration off; context isolation; sandbox | `main/security/web-preferences.ts`; `test/web-preferences.test.ts`; smoke `renderer.no-node`, `renderer.sandboxed` | Implemented and verified | Windows not run | Windows CI |
| SEC-03 | Allowlisted preload only | `preload/index.ts`; `shared/ipc/api.ts` `API_SHAPE`; `test/contract.test.ts`; smoke `bridge.shape` | Implemented and verified | Windows not run | Windows CI |
| SEC-04 / TC-22 | Main-process validation and sender verification for all IPC | `main/ipc/dispatcher.ts`, `sender-policy.ts`; `test/ipc-dispatcher.test.ts` | Implemented and verified | Only one channel exists; every future channel needs the same tests | Keep the pattern for M4–M7 channels |
| SEC-05 / TC-23 | Navigation and popup restrictions | App window: `main/security/navigation-policy.ts`; `test/navigation-policy.test.ts`; smoke `tc23.*` | Partially implemented | No insurer views yet (M5) | M5 |
| SEC-06 | Restrictive CSP | `main/security/csp.ts`, `app-protocol.ts`; tests and smoke | Implemented and verified | Windows not run | Windows CI |
| SEC-07 | Insurer content isolated from privileged APIs | None in product (S2 spike on mock pages) | Not implemented | M5; DM-03 | Security review, then M5 |
| SEC-10 / TC-21 | OS-backed secret storage; fail closed | None in product. Vault exists in `spikes/m1/` only, tested on macOS (Q-M1-01) | Blocked by approval | Q-M1-01, DM-02 and AR-13 key-loss acceptance; independent reviewer Q-D08; Windows evidence Q-M1-02 | Name the reviewer; review the vault |
| SEC-09 / REL-02 | No secrets in source; secret scan | `secretlint` (`secrets:scan`), passing; also in CI | Partially implemented | Pre-commit hook not activated; never run in CI on M3 | Windows CI |
| LOG-01, SEC-11 | Allowlist logging; never log secrets | `main/logging/logger.ts`; `test/logger.test.ts` | Implemented and verified | Log review with real data flows comes later | Keep |
| DM-04 | No debugging port in production builds | `main/security/launch-guard.ts`, fuses in `electron-builder.yml`; `check-package.mjs`; smoke guard 3/3 | Implemented and verified | Windows runtime measurement outstanding (AR-16) | Windows run |
| DATA-03 | Money as integer paise | `money.ts` (`parseInrAmount`, `formatInr`); property tests in `test/money.test.ts` | Implemented and verified | Storage is M4 | Keep |
| DATA-01, 02, 04, 06 | Entities, migrations, recovery, deletion audit | None | Blocked by approval | M4 gate: Q-M1-01, DM-02, E-03 (SQLite driver, DM-07 remainder); contract freeze first (AR-24) | Approvals, then M4 |
| DATA-05 | Backup and restore | None | Blocked by approval | Q-B15 | Client decision |
| P1-03 | Retention auto-delete | None | Blocked by approval | Q-B06 | PO, security decision |
| IPC-01, IPC-02 | `AppResult`/`AppError` envelope; error codes | `shared/ipc/result.ts`, `errors.ts` (union of `04 §4` and `16 §5` plus `FORBIDDEN_SENDER`, C-02) | Implemented and verified | Not frozen | Contract review |
| IPC-03 | Progress event | `progressEventSchema` only | Partially implemented | Nothing emits it (M5) | M5 |
| IPC-04 | API surface (`quote.*`, `history.*`, `settings.*`) | Only `app:get-info` | Not implemented | Channels arrive with M4–M7. `quoteDraftSchema` is ready for a future `quote.create` | Add per milestone |
| SDK-01 | Adapter contract | `contracts/adapter.ts`: `adapterMetadataSchema`, `InsurerAdapter` (`run`, `parse`), `AdapterRegistry`, `AdapterSnapshot`, `AdapterRunContext` | Partially implemented | Types only; no registry or adapter implementation; draft | Contract review; M5 |
| M3 contract freeze | Contracts reviewed and frozen (Plan §4 M3) | `CONTRACTS_STATUS = 'draft'` (`contracts/common.ts:6`) | Blocked by approval | Needs a human review (Tech, PO) and a versioning policy | Contract review meeting |
| NFR-COMPAT | Windows 10/11 x64; macOS floor on Intel and Apple Silicon | Electron 45.0.0; verified on macOS 15 arm64 only | Blocked by approval | DM-01 (macOS 12 vs 13 floor); no Windows, macOS 13 or Intel runs (Q-D07, Q-M1-02) | PO decision DM-01; hardware |
| NFR-PERF | 8-insurer run under 3 min; PDF under 5 s | None | Not implemented | Needs adapters and M7; measurement conditions Q-B14 | M7, M9 |
| NFR-A11Y | Keyboard, focus, contrast, selectable PDF text | None in product screens (the demo is not product) | Not implemented | M6, M7 | M6 |
| NFR-OFFLINE | History and PDF regeneration offline | None | Not implemented | M4, M7 | M7 |
| NFR-MAINT | One adapter per insurer; pure parsers; ≥3 sanitised fixtures each | `InsurerAdapter.parse` is typed as pure | Not implemented | No adapters or fixtures | M8/M9 per insurer |
| REL-08 | CI on Windows and macOS | `.github/workflows/ci.yml` | Partially implemented | Never run on M3. The committed `.gitattributes` would repeat the Windows lint failure (AR-25); the fix is uncommitted | §10 |
| REL-04, REL-05 | Signing and notarisation | None | Blocked by approval | Q-D04, Q-D05 (S6 blocked) | Client to name owners |
| ADP-MANUAL | Manual path for all eight insurers (D-05; `01 §14` criterion 3) | Contract and engine support manual results | Partially implemented | No form, evidence store or PDF | M6 after M4 |
| ADP-ICICI … ADP-NIA | Eight insurer adapters | None | Blocked by approval | Q-D01, Q-D02, Q-B16 per insurer; feasibility (HDFC canvas, Q-E07; CAPTCHA insurers) | Per-insurer gate (§7) |
| PRD cases 1–5 | Client-supplied regression cases | None | Blocked by approval | Q-D03 | Client to supply |
| DEF-01 | Excel bulk upload and ZIP | None | Not applicable | v1.1 by D-06; confirmation pending (Q-B13) | PO to confirm |
| PRIV-04 | No automatic upload or email of PDFs | No such feature | Not applicable | Re-check when M7 lands | — |

### 3.3 Regression cases: run vs planned

| Ran in this audit (macOS only) | Level | File |
|---|---|---|
| TC-01, TC-02, TC-03, TC-04 | Schema and function level only; UI level is M6 | `test/quote-validation.test.ts` |
| TC-05 | Engine level only: a failed result is excluded without affecting others | `test/comparison.test.ts:599` |
| TC-09, TC-10, TC-27 | Engine level, under the **provisional** rule | `test/comparison.test.ts` |
| TC-11 | Engine level only: manual source kept in the output; no UI or PDF | `test/comparison.test.ts:590` |
| TC-22 | IPC dispatcher | `test/ipc-dispatcher.test.ts` |
| TC-23 | App window only; no insurer views exist | `test/navigation-policy.test.ts`; smoke |

**Planned only (never run against the product):** TC-06, TC-07, TC-08, TC-12 to TC-21, TC-24 to TC-26, TC-28, and PRD cases 1–5.

TC-17 (₹) and TC-21 (secret store unavailable) ran only in the M1 spike on macOS. That is not product evidence.

## 4. Missing end-to-end workflows

| Step in the intended workflow | What exists | What is missing |
|---|---|---|
| 1. Enter customer and members once | `quoteDraftSchema` | New Quote form; draft persistence (M4, M6) |
| 2. Validate | `validateQuoteDraft` with **placeholder** rules | Approved rules (Q-B03–B05); UI field errors |
| 3. Identify each insurer's required fields | `preflight()` | Per-insurer field lists (authorised evidence) |
| 4. Connect to insurer portals | Connection states (contract) | PaneManager, portal window (Q-E04), Connect board; DM-03 review |
| 5. Advisor completes login, OTP and CAPTCHA | `login_required`, `otp_required`, `manual_action_required` states | Challenge detection that sets a state and never solves it (M5) |
| 6. Fill the insurer's form | Nothing | Per-insurer adapter `run`. Blocked by Q-D01, Q-D02, Q-B16 |
| 7. Insurer calculates the premium | External | — |
| 8. Retrieve and validate returned data | `normalizeResult`, `checkValidity` | Per-insurer `parse` against sanitised fixtures |
| 9. Show results as they arrive | `progressEventSchema` | Orchestrator, IPC events, Results screen (M5, M6) |
| 10. Manual entry for unsupported or failed insurers | `source: 'manual'` through the same normaliser | Manual-entry form, evidence store (M4, M6); Q-B10, Q-B11 |
| 11. Branded comparison PDF | Nothing in product (S4 spike only) | PDF service and template (M7); content Q-B07, Q-B08 |
| 12. Save and reopen history | Nothing | M4 storage (security-gated), M6 history screen |

**Today, none of the twelve steps can be performed in the product.** Steps 2, 3, 8 and the comparison exist only as tested library functions.

## 5. Existing M3 components to retain

These hold without any pending business decision. Approved values would change rule data, not this code.

- **Money handling.** `money.ts`: integer paise, strict Indian-format parsing with reason codes, locale-independent formatting.
- **Insurer result contracts and normalisation.** `insurerResultInputSchema` and `normalizeResult`, one path for adapter and manual results. Missing values stay `null` or `unknown`; nothing is filled from the request.
- **The staged pipeline.** Validity, then eligibility and comparability, then term differences, then selection (`compare.ts`). Every exclusion carries a finding code and path, never the value.
- **Rules as versioned data.** `comparisonRuleSchema`, `quoteInputRulesSchema`. The rule ID, version and status are stamped on every `ComparisonResult`, so a stored comparison or PDF can name its rule.
- **Determinism.** No clock, locale or randomness; deterministic tie order (`comparison.test.ts` "determinism").
- **Pre-flight per insurer** (`preflight.ts`), which reports field names only.
- **Shared status and error enumerations** (`status.ts`, `ipc/errors.ts`). These implement the C-02 union; C-01 is still to be confirmed in the contract review.
- **The M2 security baseline:** IPC dispatcher, sender policy, CSP, navigation policy, launch guard and logger.
- **Tests and gates:** the 100% coverage gate, the smoke harness and the CI workflow.

## 6. M3 components that need review against the PRD

Recorded here, not decided. Nothing below has been changed.

| # | Component | Observation | Decision owner and record |
|---|---|---|---|
| R1 | Premium handling, as a whole | **Consistent with "the insurer calculates its premium".** No premium is derived, recalculated, annualised or defaulted. `expectedTotal` (`validity.ts:53`) only *checks* that the displayed base plus GST equals the displayed total; it never replaces the total | No action needed |
| R2 | `PREMIUM_INCONSISTENT` tolerance (`validity.ts:38–43`) | The check is exact to the paisa. If an insurer shows a rounded total, its genuine quote is excluded from ranking (it is still shown with the finding). Because validity exclusions do not suppress the highlight, a higher premium could then be highlighted. **Observation from this audit; no question ID.** Needs sanitised evidence of how each insurer displays base, GST and total | Tech and PO. Related to Q-B01 and Q-B02; should be decided with the §0.6 row "Validity exclusions and the highlight" |
| R3 | Strict provisional rule (`comparison-rule.ts:43–55`) | FR-12 requires a highlight; under this rule (exact members, all terms known, base plan only) one may rarely occur (AR-23) | PO: Q-B01, Q-B02; DM-06 |
| R4 | Validity exclusions do not suppress the highlight (`compare.ts:91`) | A lower premium that is excluded at validity does not block a highlight of a higher one | PO: Q-B01 (OPEN_QUESTIONS §0.6) |
| R5 | Manual results are ranked (`manualResults: 'rank'`) | The PRD says manual results are "not insurer-verified" but is silent on ranking | PO: Q-B10 |
| R6 | Ties: all highlighted (`ties`) | Not in the documents | PO; **no question ID** |
| R7 | Minimum of two quotes for a highlight (`minComparableForHighlight: 2`) | The PRD allows a PDF for one to eight insurers; with one quote nothing is highlighted | PO; **no question ID** |
| R8 | Duplicate plans all excluded (`validity.ts:71`) | M3 proposal | PO; **no question ID**. Related to, but not answered by, Q-B16 (which plan to quote per insurer) |
| R9 | Highlight label (`HIGHLIGHT_LABEL`, `contracts/comparison.ts:12`) | Fixed non-advisory text | Client, PO under DM-06 wording; **no question ID**. Not Q-B08, which covers disclaimer and consent wording |
| R10 | Member data: no name, DOB or gender (`customer.ts:25`) | FR-02 allows "age or DOB"; insurers may need a DOB | PO, security: C-04, C-05, PRIV-01 |
| R11 | Input rule placeholders (`quote-input-rules.ts:48–76`) | Ages, relationships, member count, floater size, sum-insured range, tenures | PO: Q-B03, Q-B04, Q-B05 |
| R12 | Sum insured meaning for individual cover (`quote.ts:31`) | "Per member" is an assumption, and comparability requires an exact match | PO: Q-B03 |
| R13 | A `completed` result may carry an `errorCode` (`quote.ts:98`) | The contract allows it; the meaning is undefined | Tech, at the contract review |
| R14 | Run and connection states (`status.ts`) | The documents' lists differ | Tech: C-01, E-05 |
| R15 | Comparison output for the Results view | `excluded` carries no premium or plan; the UI must join with `NormalizedResult` to meet FR-10 for every insurer | Tech; M6 design input. No contract change proposed |

## 7. Outstanding business and security approvals

**Insurer integration.** These block any real adapter.
- **Interfaces that exist:** `AdapterMetadata` (with mode `automated`, `assisted` or `manual`, HTTPS origin allowlist, required fields), `InsurerAdapter.run` and `parse`, `AdapterRegistry`, `AdapterSnapshot`, run and connection states, progress event, error codes.
- **Missing:** registry implementation, orchestrator, PaneManager, driver, challenge detection, Connect board, `quote.*` IPC, mock adapters, any adapter, fixtures and adapter READMEs.
- **Evidence needed per insurer:** written permission (Q-D01); an authorised test account and named OTP holder (Q-D02); the product or plan to quote (Q-B16); dummy cases (Q-D03); at least three sanitised fixtures (`04 §5`, `09 §4`); a feasibility result (HDFC ERGO canvas and OCR, Q-E07; CAPTCHA insurers advisor-assisted or manual only); an adapter README.
- **Testable with synthetic data now:** the orchestrator with mock adapters (success, failure, timeout, login or OTP required, blocked, malformed, missing premium, as planned for M5); PaneManager against **local mock pages** (as S2 did); the normaliser and comparison; and manual entry and PDF with synthetic results.
- **Not testable synthetically:** any insurer's real form fields, page structure or parser. A synthetic "insurer fixture" would invent portal behaviour.
- **No insurer portal was accessed for this audit.**

**Business decisions (PO or client).**
- Inputs and comparison:
  - Q-B01 to Q-B05, Q-B10, Q-B16;
  - DM-06 and its unnumbered parts: ties, the two-quote minimum, duplicate handling and the highlight label;
  - C-04, C-05;
  - R2 above.
- Scope and sequencing:
  - DM-05 (manual-first; deferral of FR-05 to FR-09);
  - DM-01 (OS floor);
  - Q-B13 (bulk upload).
- Content: Q-B07 (branding, licence, GST) and Q-B08 (disclaimer and consent wording).
- Other: Q-B06 (retention), Q-B09 (saved credentials), Q-B11 (evidence), Q-B12 (review or exclude before PDF), Q-B15 (backup), Q-B17 (local data protection).
- Baseline: Q-03 (approval of the document pack), Q-02 (source PRD), Q-00 and DM-09 (schedule).

**Security approvals (M4 gate). All open; none accepted.**
- Independent review of the M1 vault design (Q-M1-01) by a named reviewer (Q-D08).
- Encrypted SQLite with OS-protected keys (DM-02), including acceptance of the key-loss consequence (AR-13).
- Recovery when the OS key store is lost (vault limitation L5).
- Key integrity and rollback protection (L1, L2).
- Same-user process access (L3).
- Windows credential-storage and file-system evidence (Q-M1-02).
- Supervised Keychain tests (Q-M1-03).
- Crash and power-loss testing (L7).
- Retention (Q-B06) and backup and restore (Q-B15).
- SQLite driver (E-03, DM-07 remainder).
- Persistent insurer sessions (DM-03, C-08); debugging port on Windows (DM-04, AR-16).
- Legal and privacy review (Q-D09).

**The M1 vault is spike code. It is not production-ready and is not approved.**

**External access.** Signing identities (Q-D04, Q-D05), update hosting (Q-D06), clean test machines (Q-D07) and named approvers (Q-D08).

## 8. Recommended implementation order

The order proposed in the brief (A–H) mostly matches [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). **One difference must be decided, not assumed:**

| Brief | Repository plan | Agreement |
|---|---|---|
| A. Resolve M3 discrepancies and get product decisions | M3 definition of done; stakeholder review ([M3_STAKEHOLDER_BRIEF.md](M3_STAKEHOLDER_BRIEF.md)) | Agrees |
| B. Complete approved contracts and validation | M3 contract review and freeze; replace placeholder rule data | Agrees. Must come before M4 schemas (AR-24) |
| C. M4 secure persistence after approvals | M4, gated on Q-M1-01 and DM-02 | Agrees |
| D. Quotation creation and input workflows | M6 New Quote. Depends on M4, and in the original plan also on M5 | Agrees once M4 exists |
| E. Insurer connection and fetching foundation | M5. Original plan: in parallel with M4 after M3. **DM-05 (provisional, not approved): moved to R2, after the manual-first release** | **Differs from DM-05** |
| F. Individual adapters after authorisation | M8/M9; M8 also depends on M7 | Agrees (per-insurer gate) |
| G. Results, manual entry, branded PDF | M6, M7. Under DM-05 these come **before** M5 | **Differs from DM-05** |
| H. History, settings, release | History and settings are M4 and M6, not last; release is M10, M11 | Partly. History and settings come earlier in the plan |

**Recommendation.** Do not reorder anything until the PO decides DM-05. The order that is valid under either choice is:

1. A
2. B (contract freeze and approved rule data)
3. C (M4, once security approvals exist)
4. D (New Quote, M6 part)

After that the paths diverge:
- **Manual-first (DM-05 as recorded):** G (manual entry, Results, PDF) → release work, then E → F.
- **Brief's order:** E → F → G.

Manual-first reaches PRD release criterion 3 (`01 §14`: every insurer completes through manual entry) without any insurer authorisation. M8 depends on M7 in either case.

## 9. Test and cross-platform verification gaps

- **Windows has never run anything:**
  - CI on M2 stopped at lint (AR-25);
  - type-check, tests, smoke, installer and runtime have never run there;
  - the M1 spikes S1 to S5 were never run on Windows (M1 exit criterion unmet, Q-M1-02).
- **The CI fix is not committed.** CI runs the committed tree, and `4f42849` still has `* text=auto`. The working-tree line `* text=auto eol=lf` (identical to `cbe74e7` on `fix/windows-ci-eol`) must be committed, or `cbe74e7` integrated, before any push. It was validated only on a simulated Windows checkout.
- **M3 has never run in CI.**
- **Other gaps:**
  - no macOS 13 or Intel runs (DM-01, Q-D07);
  - packaging, `check-package` and `npm audit` are not in CI;
  - GitHub runners are not the clean Windows 10/11 or macOS-floor machines that TC-24 and TC-25 require;
  - signing is blocked (S6).
- **Product test layers not started:** integration tests (IPC beyond `app:get-info`, orchestrator, SQLite, secret store, PDF), end-to-end tests (Playwright planned for M6), live-portal tests, and the PRD cases.
- **The development demo** was checked visually on macOS only, in light theme only, in a hidden window rather than the real app window. It is not product evidence.

## 10. The next smallest safe implementation task

**Task:** commit the existing one-line `.gitattributes` change (`* text=auto eol=lf`) on `m3/contracts-comparison`, or integrate `cbe74e7`. Then push and let CI run on macOS and Windows.

**Why this one:**
- It is the only remaining technical gate within M2 and M3 that needs no business or security decision.
- It is isolated from product behaviour: no source, rule, contract or test changes.
- It produces the first Windows evidence for type-check, tests and smoke.
- Every later milestone assumes a green CI on both platforms (M2 definition of done).

**What it needs:** your explicit authorisation to commit and push (this audit did neither), and a decision on whether the uncommitted demo and documentation go in the same push or separately.

**Done when:**
- both CI jobs pass every step on the pushed commit, and the run ID is recorded in `docs/evidence/M3/`;
- or each Windows failure is recorded as found, with no claim of Windows support beyond what that run shows.

**What should not start yet:**
- M4 storage, until the security approvals in §7.
- Real adapters, until the per-insurer gate.
- Changes to comparison or input rules, until the PO decides.
- M5 or M6 product code, until the contract review freezes the contracts they consume (AR-24) and the PO decides DM-05.

When those are cleared, the earliest product code that depends on no insurer access is either the M5 orchestrator with mock adapters or the M6 manual-entry path, whichever DM-05 selects.
