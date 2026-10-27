# Open Questions and Decisions — Fiducial Quote Fetcher

| | |
|---|---|
| Date | 26 October 2026 |
| Extends | `18_GLOSSARY_AND_OPEN_QUESTIONS` and the open decisions in `14_RISKS_ASSUMPTIONS_ISSUES_DECISIONS`. Where a question already appears there, its original number is cited, e.g. "(18 Q9)" |
| Owner key | **PO** = product owner (Nitinthilak L) · **Client** = client representative (not yet named) · **Tech** = technical owner (Harshit Sharma) · **Sec** = security/privacy reviewer (not yet named) · **Release** = release owner |

"Blocks" refers to milestones in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## 0. M0 update (26 October 2026)

Sections A–F below are the original audit, kept unchanged apart from "→ M0" pointers. This section records what M0 established and what now needs approval.

**Labels used in this section**

| Label | Meaning |
|---|---|
| **Requirement** | Stated in the FQF-DOCS-001 pack |
| **Evidence** | Checked during M0; the method is stated. *Documentary* evidence (release notes, package contents) is **not** a platform test |
| **Direction** | Given by the project lead in the M0 instruction. Not a PO, client or security approval |
| **Provisional direction** | Recorded by the project lead on 26 Oct 2026 (M0 finalisation). Planning and spikes may proceed against it. It is **not** a PO, client or security approval, and it is revisited if a spike fails or a pending approval goes the other way |
| **Recommendation** | Technical proposal. Not in effect until approved |
| **Awaiting** | Needs the named approver |

### 0.1 Resolved or narrowed in M0

| ID | Update | Basis |
|---|---|---|
| Q-01 | **No Quote Fetcher code, SDK or schemas found.** (a) The home folder was searched to depth 6 for Electron `package.json` files and quote/fetcher folders; the only hit, `~/Desktop/JARVIS`, is an unrelated workplace assistant. (b) All 60 repositories under GitHub account `harshitsharma7017` were listed, and code search for `PaneManager`, `safeStorage`, "quote fetcher" and "insurer adapter" returned nothing. (c) `../fiducial/` is a different product (audit). **The project is treated as greenfield.** Residual gap: repositories in other accounts (the client's or a previous vendor's) could not be checked, so PO confirmation is still requested | Evidence; Direction |
| Q-00 | The project lead has directed that the original freeze and handover dates (`15 §2`) cannot be assumed achievable. **Formally replacing them is a PO and client decision and has not been made.** A revised schedule is proposed in IMPLEMENTATION_PLAN §8 (DM-09) | Direction; **Awaiting PO and client** |
| REL-08 | The repository is under git (initialised by the project lead). Baseline commit `d21976a`. `.gitignore` and `.gitattributes` were tested against 16 sample paths | Evidence |
| E-01 / Q-E01 | Electron facts (npm registry and electron/electron at tag `v45.0.0`). Latest stable is **45.0.0** (21 Oct 2026; Chromium 156, Node 24.22). The supported lines are **45, 44 and 43** ("latest three stable majors"). **Electron ≥ 44 requires macOS 13 (Ventura)** (`docs/breaking-changes.md`). Electron 43 is the last line that runs on macOS 12, and it should lose support when 46 ships, around **16 Dec 2026** (inferred from the observed 8-week cadence). Windows 10+ x64 is supported. **Conclusion: the PRD's "macOS 12+" target (`01 §11`) cannot be met with a supported Electron.** See DM-01 | Evidence (documentary) |
| E-03 | `better-sqlite3@13.0.3` and `better-sqlite3-multiple-ciphers@13.0.3` both ship N-API prebuilds for `darwin-arm64`, `darwin-x64` and `win32-x64` inside the npm package. GitHub releases since v13 carry no per-Electron-ABI binaries. **Loading in Electron 45 has not been tested** (spike S3) | Evidence (documentary) |

### 0.2 Decisions needing your approval

Each item lists its options, a recommended default and the required approvers.

#### Decision register — status recorded at M0 finalisation (26 October 2026)

All nine items are **provisional directions** from the project lead. **No PO, client or security approval has been given for any of them.** No technical test has been run yet; M1 spikes are the pending compatibility tests.

| ID | Provisional direction (as recorded) | Still pending | Approver(s) still required | Work that may proceed now |
|---|---|---|---|---|
| DM-01 | Electron 45.x; Windows 10 22H2 and 11 x64; macOS 13+ on Intel and Apple Silicon | Compatibility testing (S1, S3); PO confirmation of the macOS floor change from 12 to 13 (`01 §11`) | **PO** | M1 spikes on Electron 45.x |
| DM-02 | Encrypted SQLite with OS-backed key storage (option B) | Security validation (S3, S5) and security review; the key-loss consequence (AR-13) must be accepted | **Security reviewer** (not yet named, Q-D08) | Spikes S3 and S5 |
| DM-03 | Persistent per-insurer sessions (option A), **deferred to R2** | Security review; S2 results | **Security reviewer** | Spike S2 against local mock pages only |
| DM-04 | No exposed remote debugging port in production builds | S2 verification, including AR-16 (whether Chromium opens the port before the startup guard runs). **Not yet verified** | Project lead (security reviewer to confirm in the release gate `06 §7`) | Design and spike S2 |
| DM-05 | Manual-first R1 **recommended**; FR-05 to FR-09 and the automated parts of FR-10 proposed for R2 | Deferring P0 requirements under `19` change control | **PO** | Planning only. R1 scope is not final |
| DM-06 | Comparability rules **provisional** (the defaults in the DM-06 table) | Every business choice in the table; there is no default for deductible, co-pay or room rent | **PO**; **client** for the highlight wording | M3 may implement the configurable engine with defaults marked *placeholder* |
| DM-07 | **TypeScript, Zod, Vitest, ESLint and Prettier** | Compatibility checks with Electron 45.x (M1/M2). **Not covered by this direction and still undecided:** electron-vite, electron-builder, React, Playwright, the SQLite driver | Project lead (for the undecided items) | Spike scaffolding with the directed toolchain |
| DM-08 | A bundled, appropriately licensed font, with automated ₹ (U+20B9) validation | Choosing the font (Noto Sans under SIL OFL 1.1 is the proposed candidate; confirm the licence from the files actually obtained); S4 results | Project lead; **client** if a brand font is supplied | Spike S4 |
| DM-09 | Revised schedule (IMPLEMENTATION_PLAN §8) as a planning estimate | Agreement on dates and scope | **PO and client** | None. Dates are illustrative only |

The option tables below are unchanged from the M0 analysis. Where a subsection says "Recommendation", read its status from this register.

#### DM-01 — Electron line and OS support matrix (architecture and scope)

| Option | Detail | Consequence |
|---|---|---|
| **A (recommended)** | Electron **45.x**, pinned to the latest patch at M2, with 44.9.x as fallback if S1 finds a 45.0 regression. **Windows 10 (22H2) and 11, x64. macOS 13 Ventura or later on Intel x64 and Apple Silicon arm64** | Raises the PRD macOS floor from 12 to 13, which is a P0 NFR change and needs PO approval. Electron must then be upgraded about every 8 weeks to stay in support (AR-15) |
| B | Electron 43.x, keeping macOS 12 | Unsupported from about mid-December 2026, before R1 could ship. **Not recommended** |
| C | Pin an older, unsupported Electron | Unpatched Chromium would render untrusted insurer content. **Rejected on security grounds** |

Windows on Arm is not in the PRD and stays out of scope. **Approvers:** project lead, and PO for the NFR change. **Unblocks:** M1 S1.

#### DM-02 — Customer data at rest (security)

| Option | Detail | Consequence |
|---|---|---|
| A | Rely on the OS account and full-disk encryption (FileVault/BitLocker) as a documented install prerequisite. SQLite and evidence files stay in plaintext | Simplest. Data is readable in backups, copied profile folders, or on a disk without full-disk encryption |
| **B (recommended)** | Encrypt the database with a SQLCipher-compatible driver (`better-sqlite3-multiple-ciphers`). A random 256-bit key is generated on first run and stored **only** wrapped by `safeStorage`. Evidence files are encrypted with AES-256-GCM under a second wrapped key. Full-disk encryption is still recommended in the install guide | Protects copied data (backups, other accounts, disk images). **Does not** protect against malware running as the same user (accepted residual risk). **If the OS key store is lost (OS reinstall, profile or keychain reset), local data is unrecoverable**; the user guide must say so. If `safeStorage` is unavailable the app cannot open its data and fails closed, consistent with `05 §4`. Adds scope to spikes S3 and S5 |
| C | A for R1, then B later | Requires a one-way data migration on clients' machines. Not recommended |

**Approvers:** project lead and security reviewer (Q-D08). **Unblocks:** M4.

#### DM-03 — Insurer session isolation and storage (security; Track B only, not on the R1 path)

| Option | Detail | Consequence |
|---|---|---|
| **A (recommended)** | One `persist:insurer-<id>` partition per insurer (FR-05). No preload. All permission requests denied. Navigation limited to the adapter's origin allowlist. Cookie-encryption fuse on. A per-insurer **"Sign out and forget"** action. All partitions wiped on app reset | Meets FR-05. Residual risk: authenticated cookies at rest, encrypted with the OS key (C-08) |
| B | In-memory (non-persistent) partitions | No session data at rest, but the advisor signs in again (possibly with OTP) every launch. Contradicts "persistent" in FR-05, so it needs PO approval |

**Approvers:** project lead and security reviewer, plus PO if B is chosen. Can wait until Track B starts; spike S2 tests option A.

#### DM-04 — Portal automation without a remote debugging port (security)

**Recommendation:**
- Drive pages only through in-process `webContents.debugger` (CDP).
- Packaged builds refuse to start if launched with `--remote-debugging-port`, `--remote-debugging-pipe`, `--inspect*` or `--js-flags`.
- Set the `RunAsNode` and `EnableNodeCliInspectArguments` fuses off.
- Spike S2 verifies with `lsof`/`netstat` that a packaged build opens no listening debug port.

**Approver:** project lead.

#### DM-05 — First-delivery scope: R1 manual-first (scope)

**Recommendation (follows the M0 direction):**
- **R1 includes:** customer and member capture, manual entry for all eight insurers, comparison, branded PDF, history, settings and first run, encrypted local storage, retention, and signed (or explicitly accepted unsigned) Windows and macOS packages with release validation.
- **R1 excludes:** the Connect board, in-app insurer portal windows, the orchestrator and all automated adapters. **FR-05 to FR-09 and the automated parts of FR-10 move to R2.** The deferral must be recorded under the change control in `19`, because these are P0 requirements.

**Alternative:** R1 also includes a Connect board with isolated in-app portal windows that the advisor uses manually, without automation. This adds the M5 PaneManager (about 4–6 days) and puts DM-03 on the R1 path.

**Approvers:** PO (for deferring P0 items) and project lead.

#### DM-06 — Comparability, GST, tenure, add-ons and manual ranking (business rule, PO decision)

These are **business decisions**; nothing here is decided. The engine is designed so any option is a configuration change (ARCHITECTURE_REVIEW §7.7). M3 can proceed with the recommended defaults marked *placeholder*.

| Topic | Options | Recommended default |
|---|---|---|
| Premium basis (Q-B02) | (a) Total payable **including GST**; (b) base premium excluding GST | (a). Capture base and GST separately when the insurer shows them |
| Tenure (Q-B02) | (a) Rank 1-year quotes only; (b) annualise multi-year quotes; (c) rank within the same tenure | (a). Show multi-year quotes but do not rank them, because annualising hides multi-year discounts |
| Add-ons and riders (Q-B02) | (a) Base plan without optional add-ons; (b) require the same advisor-chosen add-on set | (a) for v1 |
| Sum insured (Q-B03) | Rank only when the returned sum insured equals the requested one | Equal; otherwise show but do not rank |
| Members and cover type | Identical member set and cover type | Identical |
| Deductible, co-pay, room-rent limits | (a) Show but ignore for ranking; (b) require equality | **No default.** This needs product knowledge. (a) would need the plan-features disclaimer |
| Manual quotes (Q-B10) | (a) Eligible, labelled "Manual" on the highlight and in the PDF; (b) never eligible; (c) eligible only with an evidence screenshot | (a). In R1 every quote is manual, so (b) would mean R1 never highlights a cheapest premium |
| Ties | Highlight all tied quotes | All tied |
| Basis unknown or incomplete | Not ranked | Not ranked |

Highlight wording (proposed, for client approval): "Lowest premium among comparable quotes — not a recommendation" (`08 §3`). **Approvers:** PO; client for the wording.

#### DM-07 — Toolchain (E-02)

**Recommendation:** electron-vite, electron-builder, strict TypeScript, React, Zod, Vitest, Playwright for Electron, and better-sqlite3 or its ciphers variant (depending on DM-02 and S3). All versions pinned exactly at M2. **Approver:** project lead. **Status:** the provisional direction covers TypeScript, Zod, Vitest, ESLint and Prettier only. The other items in this recommendation remain undecided (see the register).

#### DM-08 — PDF font

**Recommendation:** bundle **Noto Sans** (SIL Open Font License 1.1) for body text and ₹. A client brand font may replace it only if its licence permits embedding and it contains U+20B9. **Approver:** project lead; client if a brand font is supplied. **Status:** the provisional direction is "a bundled, appropriately licensed font with automated ₹ validation". Noto Sans remains the candidate, not a decision.

#### DM-09 — Revised schedule

See IMPLEMENTATION_PLAN §8. **Approvers:** PO and client.

### 0.3 Still open, with the date each answer is needed

These are unchanged from sections B and D. "W" means weeks after the decisions are approved; see IMPLEMENTATION_PLAN §8.

| Needed by | Questions |
|---|---|
| Now (long lead time) | Q-D04 and Q-D05 (signing identities), Q-D07 (Windows x64 machine, Intel Mac, macOS 13 test target), Q-D08 (named approvers), Q-02, Q-03 |
| End of W3 (M3) | Q-B03, Q-B04, Q-B05; DM-06 |
| W4 (M4) | Q-B06 (retention days), Q-B09 (saved credentials; R1 has no portal logins, so this can wait for R2), Q-B15 |
| W5 (M6) | Q-B11, Q-B12 |
| W7 (M7) | Q-B07, Q-B08 (branding and legal text) |
| W9 (M11) | Q-D03 (dummy data and PRD cases), Q-D06 (hosting), Q-D09 (legal review) |
| Track B (R2) | Q-D01, Q-D02, Q-B16, Q-E06, Q-E07 |

### 0.4 M1 evidence against the decision register (26 October 2026)

Evidence: [docs/evidence/M1/](docs/evidence/M1/README.md). Tested on **macOS 15.7.2 arm64 only**. **No decision status changes**: every DM item is still a provisional direction, and no PO, client or security approval has been given. The table records only what has now been *tested*.

| ID | Evidence from M1 | Still pending |
|---|---|---|
| DM-01 | Electron 45.0.0 runs on macOS 15 arm64 (dev and packaged) | Windows 10/11 x64, Intel Mac and **macOS 13** testing; PO confirmation of the macOS floor |
| DM-02 | Encrypted SQLite verified on disk; key wrapped by OS storage; packaged native module works. **Finding:** `safeStorage` ciphertext is not integrity-protected (database still fail-closed). **Q-M1-01 vault implemented and tested** (every tampering rejected on macOS) | Security review of the vault design (Q-M1-01); Windows; supervised Keychain scenarios |
| DM-03 | Partition isolation verified on a mock portal. Cookies are **plaintext at rest without the cookie-encryption fuse**, encrypted with it | Security review; real-portal behaviour (R2) |
| DM-04 | Fused packaged build exposes no debug port under any tested switch. **The launch guard alone does not stop `--inspect*` or `NODE_OPTIONS`** (fuses are required) | Windows re-measurement (AR-16) |
| DM-05, DM-06, DM-09 | Not testable by spikes | Unchanged |
| DM-07 | TypeScript 6.0.3, Zod 4.6.7, Vitest 5.0.3, ESLint 10.12.0 and Prettier 3.9.9 work together with Electron 45 on this Mac. **Zod 4.6.5 and Vite 8.3.2 (the team's current pins) have published advisories**; the spike uses patched versions | Packager choice; Windows |
| DM-08 | Noto Sans (OFL 1.1, verified in the font files) renders ₹ correctly; automated regression test in place | Windows rendering (TC-17); client brand font, if any; legal acceptance of the OFL (Q-D09) |

**New questions raised by M1**

| ID | Question | Why it matters | Owner | Blocks |
|---|---|---|---|---|
| Q-M1-01 | Approve the revised secret design: `safeStorage` wraps random data keys only, and secrets and evidence files use AES-256-GCM (authenticated)? **Status (26 Oct 2026): technically tested on macOS 15 arm64** (development and packaged); every tampering attempt rejected. An internal review found and fixed 7 defects (R1–R7, including a keyring lost-update that could strand secrets); 84 tests pass. **Awaiting independent security review; not approved; no risk accepted.** Windows credential storage and file-system behaviour, crash/power-loss testing, fuzzing, supervised Keychain scenarios and signing are outstanding. Review package: [design record](docs/evidence/M1/Q-M1-01-secret-vault.md) and [checklist](docs/evidence/M1/Q-M1-01-review-checklist.md). Open sub-decisions: rollback (L1), keyring metadata HMAC (L2), same-user access (L3), recovery/escrow (L5), single-instance lock (L6), usage cap, SQLCipher key placement, quarantine retention | `safeStorage` alone lets tampered secrets decrypt to corrupted values (AR-18) | Security reviewer, Tech | M4, P1-02 |
| Q-M1-02 | When can Windows 10/11 x64, an Intel Mac and a macOS 13 machine be made available (Q-D07)? | M1 cannot complete without Windows results | Tech, Client | M1 exit |
| Q-M1-03 | Can a person be present for supervised Keychain tests (identity change, second user, locked keychain)? These raise OS dialogs and were deliberately not run unattended | Key-loss behaviour (AR-13) must be documented for support | Tech | M4, M11 |
| Q-M1-04 | Should the team's other repositories be told about the zod and vite advisories? This spike did not modify them | Same advisories apply wherever those pins are used | Tech | — |

### 0.5 M2 decision records (27 October 2026)

| ID | Decision / record | Basis | Status |
|---|---|---|---|
| DM-07 (remaining items) | **Build tool: electron-vite 6.0.0. Packager: electron-builder 26.17.0. UI: React 19.3.0** (with @vitejs/plugin-react 6.1.2) | **Decided by the project lead on 27 Oct 2026** at M2 kick-off, choosing the recommended option. Matches IMPLEMENTATION_PLAN §4 M2, ARCHITECTURE_REVIEW §3.1 and TDD 03 §2 | Decided (project lead). Playwright and the SQLite driver **remain undecided** (needed in M6 and M4) |
| C-02 | Error codes implemented as the union of 04 §4 and 16 §5, **plus `FORBIDDEN_SENDER`** for IPC sender verification (`src/shared/ipc/errors.ts`) | Tech owner per C-02 / C-07 (names in 16 are illustrative) | Implemented; contract freeze is an M3 deliverable |
| Secret scanning | **secretlint 13.0.7** (npm, pinned) instead of gitleaks, which is not installed and is not an npm package | Plan §4 M2 says "for example gitleaks" | Tech choice; revisit if the client mandates gitleaks |
| M2 scope conflict | The M2 kick-off request listed functional areas A–G (shell, forms, quote entry, comparison, history, PDF, settings). The plan assigns them to M3–M7; **M2 was built as documented** (scaffold and security baseline) | IMPLEMENTATION_PLAN §4, §7 | Resolved as recommended; no scope invented |
| Workspace | The product is at the repository root (`src/`). `spikes/m1/` stays experimental; reviewed spike modules (launch guard, webPreferences, navigation policy, IPC sender check) were ported **with their tests** | ARCHITECTURE_REVIEW §3.2; spike README | Resolved as recommended |
| M1 → M2 gate | M1 exit criteria are unmet (no Windows results); M2 proceeded on macOS with the Windows items recorded as unverified | Project-lead direction ("do not stop for unrelated M1 follow-ups") | Windows verification **open** (Q-M1-02, Q-D07) |

### 0.6 M3 provisional assumptions and records (27 October 2026)

M3 implements the business rules as **versioned configuration** (`src/shared/rules/`). Neither table is approved:
- `PROVISIONAL_COMPARISON_RULE` (`dm06-provisional` 0.1.0, status `provisional`);
- `PLACEHOLDER_QUOTE_INPUT_RULES` (`quote-input-placeholder` 0.1.0, status `placeholder`).

Each row below **needs product-owner approval**. None of these risks is accepted. Changing a value needs no code change. Tests pin the current values, so a change shows up as a reviewed diff.

**Comparability and ranking**

| Decision | Provisional value in M3 | Basis | Needs |
|---|---|---|---|
| Premium basis compared | GST-inclusive total only. Exclusive or unknown basis is **not ranked**. The engine never assumes a GST rate | DM-06 default | Q-B02 (PO) |
| Tenure | Only 1-year premiums are ranked. The quoted tenure must also equal the requested tenure | DM-06 default | Q-B02 (PO) |
| Add-ons | Base plan only. Add-ons must be known **and** none | DM-06 default | Q-B02 (PO) |
| Sum insured, cover type, members | Must exactly equal the request: sum insured to the paisa, members by relationship and exact age (order ignored). **Unknown never matches** | DM-06 default; 08 §3 | Q-B01, Q-B03 (PO) |
| Co-pay, deductible, room rent | **Strictest option**: each must be known, and identical across the comparable set. Otherwise there is no highlight and the differences are listed. Conditional terms (such as age-based co-pay) must be recorded as unknown | DM-06 gives **no default** | Q-B01, Q-B02 (PO; product knowledge) |
| Incomparable or ineligible valid results | **Suppress the highlight for the whole set**. Configurable to `exclude_and_rank_rest` | ARCH §3.7; TC-27 allows "suppressed **or** differences shown" | Q-B01 (PO) |
| Manual results | Ranked, and labelled `source: manual` in the output | DM-06 default | Q-B10 (PO) |
| Ties | Every tied result is highlighted, in a fixed order (insurer ID, then result ID) | DM-06 default | PO |
| Minimum for a highlight | **Two** comparable results. A single quote is never highlighted as "lowest" | M3 proposal (not in DM-06) | PO |
| Duplicates | Duplicate result IDs, and two completed results with the same insurer and plan label, are **all** excluded as ambiguous | M3 proposal | Q-B16 (PO) |
| Validity exclusions and the highlight | Results excluded at validity do **not** suppress the highlight, even if their premium is lower. This covers duplicates, review flags such as `ambiguous_coverage`, unreadable or missing premiums, and non-completed runs. Only valid results that fail eligibility or comparability suppress it | ARCH §3.7 ("no ambiguity warnings" is a candidate condition) | Q-B01 (PO): confirm, or treat duplicates and `ambiguous_coverage` as suppressing |
| Currency | INR only; other or missing currencies are not ranked | 04 §2 | — |
| Highlight label | Fixed text: "Lowest premium among comparable quotes — not a recommendation". No "best", "winner" or "recommended" wording anywhere | DM-06; 08 §3 | Q-B08 (wording, Client) |

**Quote input**

| Decision | Placeholder value in M3 | Needs |
|---|---|---|
| Ages: self and spouse | 18–65 | Q-B04 (PO) |
| Ages: son and daughter | 0–25 (age in whole years; infants' months are not modelled) | Q-B04 (PO) |
| Ages: parents and parents-in-law | 18–80 | Q-B04 (PO) |
| Relationships and counts | All eight contract relationships allowed. One each of self, spouse and each parent; up to four sons and four daughters. At most six members | Q-B04 (PO) |
| Floater | 2–6 members. Single-member floater is rejected; there are no relationship-combination rules | Q-B05 (PO) |
| Sum insured | Free entry from ₹1 lakh to ₹1 crore in steps of ₹50,000. A fixed list is also supported by configuration | Q-B03 (PO) |
| Tenure that may be requested | 1, 2 or 3 years. Only 1-year premiums are ranked (above) | Q-B02 (PO) |
| Pincode | Six digits, first digit 1–9; format check only, no serviceability | Q-B05 (PO) |
| Customer fields | Name required. Phone (Indian mobile; landlines rejected), email and notes optional | FR-01; C-04 (PO) |
| Member fields | Relationship and age only: no name, gender or date of birth. An adapter requiring a date of birth is blocked at pre-flight until DOB capture is approved | C-04, C-05 (PO, Sec) |

**Records: conflicts between the M3 request and the documents, and how they were resolved**

| Topic | Request said | Documents say | Resolution |
|---|---|---|---|
| "Winner selection" | Select a winner | 08 §3 and DM-06: cheapest comparable premium only, "not a recommendation" | Implemented as `cheapest`, with a fixed non-advisory label. There is no "winner", "best" or coverage ranking |
| IPC | No new IPC channels | Plan §4 M3 lists "IPC request and response schemas" | Domain schemas only (for example `quoteDraftSchema` for a future `quote.create`). **No channel or handler registered** |
| Contract freeze | Implement the contracts | Plan §4 M3: review, then freeze | Contracts are marked `draft`. **The freeze needs a human review** |
| Main member versus dependants | Mentioned in the request | Not defined in the documents | Not modelled. Comparability requires the **exact** requested member set |

## A. Must be answered before any implementation

| ID | Question | Why it matters | Owner | Blocks |
|---|---|---|---|---|
| Q-00 | **What is the revised delivery schedule and scope?** `15 §2` set feature freeze at 26 Oct 2026 12:00 and handover on 27 Oct 2026. The repository has no code as of 26 Oct 2026 | Neither date can be met. The scope for the first delivery must be agreed. The manual-first baseline is recommended. **→ M0: DM-05, DM-09** | PO, Client | Everything |
| Q-01 | **Does an existing codebase, "frozen SDK" or set of Zod schemas exist elsewhere?** Docs 02, 03, 04, 15 and 16 defer to an existing repository, driver/CDP approach, helper library and smoke runner. None are in this workspace or in `../fiducial/` | If they exist, the plan must be re-based on them to avoid "a competing contract" (`04 §1`). If not, M3 creates the single contract. **→ M0: none found; treated as greenfield (§0.1)** | Tech, PO | M2, M3 |
| Q-02 | **Where are the nine-page source PRD and the "task list supplied in conversation"?** `00` says the pack is derived from them; only the four-page derived PRD is here | Clauses such as "where required by the task plan" (`04 §5`, `09 §4`) and "Vitest per task list" (`03 §2`) cannot be checked | PO, Tech | M0 |
| Q-03 | **Is the FQF-DOCS-001 v1.0 draft approved as the baseline?** Every approval in `19` is pending | Implementing against an unapproved draft risks rework. At minimum, P0 scope needs PO approval | PO, Client, Sec | M3 onward |

## B. Product and business rules (missing information)

| ID | Question | Why it matters | Owner | Blocks |
|---|---|---|---|---|
| Q-B01 | What is the authoritative **comparability rule** for highlighting the cheapest premium? (18 Q9) | FR-12, TC-27 | PO | M3 (final), M7 |
| Q-B02 | **What exactly is "premium"?** GST-inclusive or exclusive? Annual only, or are multi-year tenures allowed? Base plan only, or with add-ons and riders? Do deductibles or co-pay count? | Results are not comparable otherwise. The PDF says "annual premium" (`08 §2`) but does not define the basis | PO | M3, M7 |
| Q-B03 | Is **sum insured** free entry or a fixed list? What happens when an insurer returns a different sum insured from the one requested? | FR-03, comparability | PO | M3 |
| Q-B04 | What are the **age limits** (minimum and maximum, adult and child), the allowed **relationships**, and the maximum number of members? | FR-02, TC-03 | PO | M3 |
| Q-B05 | **Floater rules**: minimum members and allowed relationship combinations. **Pincode**: six-digit format check only, or also serviceability? | FR-03, TC-02 | PO | M3 |
| Q-B06 | What is the approved **retention period**, and what does deletion cover? (18 Q6, 14) | P1-03, TC-20 | PO, Sec | M4 (value) |
| Q-B07 | Which **branding, licence, POSP and GST fields** apply to the actual firm, and what are the approved values and logo? (18 Q15) | FR-15, FR-17, TC-18 | Client | M7 (content) |
| Q-B08 | What is the approved **disclaimer and consent wording**? (18 Q8) | FR-15, release gate `06 §7` | Client, PO | M7 (content) |
| Q-B09 | Does client policy allow **saved insurer credentials**? (18 Q7) | P1-02 | Client, Sec | M4 |
| Q-B10 | **Can manual results be highlighted as cheapest?** The documents say a manual result is "not insurer-verified" but do not say whether it is eligible for ranking | FR-12, R-09 | PO | M3 |
| Q-B11 | Is the evidence screenshot **optional for all insurers**, or mandatory for some? (FR-11 says optional; the user guide says "if required") | Manual-entry validation | PO | M6 |
| Q-B12 | Is advisor **review/exclude before PDF** in v1? (`02 §2` "if approved") | Scope | PO | M6 |
| Q-B13 | Confirm that **Excel bulk upload / ZIP** is v1.1. (18 Q1, D-06) | Scope | PO | — |
| Q-B14 | What are the **sample size and conditions** for G1, G5, G8 and the performance targets? | Release criteria | PO, Tech | M9, M11 |
| Q-B15 | Is **local backup and restore** required? (18 Q14, `05 §7`) | DATA-05 | Client | M4 |
| Q-B16 | **For each insurer, which product or plan should be quoted?** Each insurer offers several health products. The documents do not say which one | Adapters cannot be specified. Comparability depends on it | PO | M8, M9 |
| Q-B17 | **Local data protection:** is the OS account plus full-disk encryption (FileVault, BitLocker) acceptable for the SQLite database and evidence files, or are database encryption and an app lock required? `06 §1` names "unauthorized local access" as a threat but defines no control | AR-06; adding encryption later would require a data migration. **→ M0: DM-02** | Sec, Client | M4 |

## C. Conflicts and inconsistencies in the documentation

Each item includes a proposed resolution, which needs the listed owner's approval.

| ID | Conflict | Proposed resolution | Owner |
|---|---|---|---|
| C-01 | **State models differ.** `02 §2` lists not connected, connected, login required, OTP required, CAPTCHA/manual action required, blocked, running, completed, failed, cancelled, unsupported. `04 §3` lists pending, running, completed, login_required, otp_required, manual_action_required, manual_required, failed, cancelled, unsupported. `07 §3` adds "blocked". TC-14 and `08` need "timed-out", which neither list defines | Split into **ConnectionStatus** and **RunStatus** and add `timed_out` (ARCHITECTURE_REVIEW §3.4) | Tech, PO |
| C-02 | **Error code lists differ.** `04 §4` lacks `SECRET_STORE_UNAVAILABLE` and `PDF_GENERATION_FAILED`, which `16 §5` includes | Use the union of both lists as the single error enumeration | Tech |
| C-03 | **The traceability matrix (`17`) misnumbers the FRs.** It lists "FR-14 Rupee symbol" and "FR-15 Branding/disclaimer". In the PRD, FR-13 covers the rupee symbol, FR-14 covers labelled status boxes and FR-15 covers branding. PRD FR-14 has no trace row | Correct `17` so it follows PRD numbering, and trace FR-14 to TC-11, TC-12 and TC-14 | Tech (doc update), PO approval |
| C-04 | **Data model vs. FR-01/FR-02.** `05 §2` adds `customers.company_name` and `insured_members.name`, which FR-01 and FR-02 do not list | Leave both out unless the PO or an insurer requires them (data minimisation, `06 §4`) | PO |
| C-05 | **Age vs. DOB.** FR-02 allows "age or DOB"; `05` says avoid storing both. Some insurer portals may require DOB | Store age by default. Store DOB only for insurers whose required fields demand it, and document why per adapter | PO, Sec |
| C-06 | **Licence fields.** FR-15 says "licence/GST"; `08 §2` says "licence/POSP and GST" | Make the fields configurable: licence number, POSP code (optional), GST. The client confirms which apply (Q-B07) | Client |
| C-07 | **IPC naming.** `16 §2` has `quote.get(runId)`, which mixes up quote and run identifiers | `quote.get(quoteId)` plus `run.get(runId)`. The names in 16 are illustrative, so this is allowed | Tech |
| C-08 | **"Persistent session" vs. secret handling.** FR-05 requires persistent insurer sessions, which means Chromium stores authenticated cookies on disk. `05 §4` and `06 §3` forbid storing cookies in app data. They do not address the browser profile | Accept partition persistence, with cookie encryption enabled, a "Forget session" action and retention clearing. Record this as an accepted risk. **→ M0: DM-03** | Sec, PO |
| C-09 | **Documentation format.** `00` suggests `docs/*.md`; the supplied files are PDFs in the repository root, and two index PDFs overlap | Decide which format is canonical before editing either (Q-E09) | PO |
| C-10 | **Auto-update scope.** `01 §4` includes the updater in v1 "if configured and tested"; `01 §10` lists "verified auto-update" as P1 | Treat it as P1. Ship without the updater unless hosting and signing are ready | PO |

## D. External access, authorisation and people

| ID | Need | Why | Owner | Blocks |
|---|---|---|---|---|
| Q-D01 | **Written confirmation, per insurer, that the planned portal interaction is permitted** under portal terms and agreements (18 Q2, R-10) | Required before any live automation | Client, Business owner | M8, M9 |
| Q-D02 | **Authorised test accounts** for each insurer, **who receives each OTP** during development and testing, and the credential **rotation** plan at handover (18 Q3) | Live adapter development and TC-07 are impossible without these | Client | M8, M9, M11 |
| Q-D03 | **Dummy customers and PRD cases 1–4 (and floater case 5)** with expected outputs (18 Q4, `09 §3`) | Release criteria `01 §14` | Client, PO | M8, M11 |
| Q-D04 | **Apple Developer ID** owner, notarisation credentials and certificate renewal ownership (18 Q11) | macOS distribution and Gatekeeper | Client / Release | M10 |
| Q-D05 | **Windows code-signing** certificate or signing service, and its owner (18 Q11) | SmartScreen and installer trust | Client / Release | M10 |
| Q-D06 | **Where are installers and update artefacts hosted?** (18 Q10) | Distribution and P1-04 | Client / Release | M10 |
| Q-D07 | **Clean test machines**: Windows 10 and 11 x64, macOS on Intel and Apple Silicon at the minimum OS version | TC-24, TC-25 and the M1 spikes | Tech, Client | M1, M10 |
| Q-D08 | **Named people** for the client representative, the security/privacy reviewer, UAT sign-off authority, and the support SLA and escalation contact (18 Q12, Q13) | Approvals in `19`, the UAT record in `12 §6` | Client, PO | M11 |
| Q-D09 | **Legal and privacy review** of applicable Indian obligations (for example, the Digital Personal Data Protection Act) and of insurer agreements. `06` states that it is not legal advice | Release security gate `06 §7` | Client (qualified reviewer) | M10 |

## E. Technical decisions (recommendation given; Tech decides unless noted)

| ID | Decision | Recommendation | Decide by |
|---|---|---|---|
| E-01 / Q-E01 | Electron version and **minimum OS versions** (18 Q5) | Use the latest stable Electron at M1. If it no longer supports macOS 12, **ask the PO to raise the floor** rather than pin an unpatched Electron. **→ M0: Electron's documentation states that Electron ≥ 44 needs macOS 13; see DM-01** | End of M1 (PO approves an OS-floor change) |
| E-02 | Build toolchain | electron-vite, electron-builder, TypeScript strict mode, Vitest, Playwright for Electron, and ESLint/Prettier/Husky matching the team's other repositories | M2 |
| E-03 | SQLite driver | better-sqlite3 if the S3 spike passes on all targets; otherwise `node:sqlite` | End of M1 |
| E-04 / Q-E04 | **Portal window UX**: insurer views embedded in the Connect board, or a separate "Insurer window" with one tab per insurer? | A separate window with tabs. It keeps untrusted content visually and technically apart from app UI and gives the advisor a full-size view for login, OTP and CAPTCHA | M5 (PO review of mock-up) |
| E-05 | State model | As in C-01 | M3 |
| Q-E06 | **Timeout semantics**: does the per-insurer timeout include time spent waiting for advisor login, OTP or CAPTCHA? | No. Use separate automation-step and advisor-wait timeouts, both configurable | M5 (PO confirms) |
| Q-E07 | **OCR** for HDFC ERGO's canvas UI | Defer. Add tesseract.js in a worker only if the HDFC spike shows it is necessary and the interaction is permitted | M9 |
| Q-E08 | UI component library | Radix with Tailwind and react-hook-form with Zod, matching the team's other frontends | M2 |
| Q-E09 | Documentation location and format | Keep the PDFs as the approved baseline; optionally move them to `docs/`. Record changes as new versions per `19`, not by editing the planning files | M0 (PO) |
| E-10 | Driver approach | In-process `webContents.debugger` (CDP). **No remote debugging port** in any shipped build. **→ M0: DM-04** | M1 |

Comparability questions Q-B01, Q-B02, Q-B03 and Q-B10 now have options and recommended defaults in **DM-06** (§0.2).

## F. Assumptions this plan makes until told otherwise

1. Single advisor, single machine, no cloud sync, no app-level login (D-01, `14` assumptions).
2. Health insurance only (`01 §5`).
3. All eight insurers are **manual-only** until their gate in M8/M9 is passed.
4. Placeholder branding and legal text is clearly marked in builds until Q-B07 and Q-B08 are answered, and such builds are not for customer use.
