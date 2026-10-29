# M3 Discrepancy Resolution — Decision Pack

| | |
|---|---|
| Status | **For review. Every decision is OPEN and NOT APPROVED.** |
| Prepared | 27 October 2026 by the development agent (automated). No person has approved anything in this document |
| Branch / HEAD | `m3/contracts-comparison` at `4f428495fafe9e0bbe49a364ccb35306dc0220c3` (local only, not pushed) |
| Companion | [M3_ACCEPTANCE_REVIEW.md](M3_ACCEPTANCE_REVIEW.md): full decision register (§4), contract checklist (§5), acceptance criteria (§7), contradictions (§8). Question IDs and wording come from [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) and are not changed here |
| Recommendations | **None.** The requirement pack is a draft with every approval pending (`19`; Q-03), and DM-06 is a provisional direction. This document lists options and evidence only |

## 1. Purpose and scope

**Purpose.** To let the product owner and the technical, privacy and security reviewers resolve the outstanding M3 contradictions **before the contract freeze** (IMPLEMENTATION_PLAN §4 M3: "contracts are reviewed and frozen").

**Not in scope:**
- approving a rule;
- freezing a contract;
- accepting a risk;
- changing code, rules, tests, UI or CI;
- starting M4;
- giving legal, regulatory, actuarial or insurance-product advice.

**Current behaviour is not approval.** The current behaviour, described below, was chosen provisionally so that the engine could be built and tested.

**Roles used in this document.** No person is named for any role, and this document does not assign anyone:

| Role | Decides |
|---|---|
| **PO** | Product-owner decisions (business rules, scope, NFR changes) |
| **Client** | Approval of client-facing wording and policy |
| **Tech** | Technical and architecture review, contract review and freeze, versioning |
| **Project lead** | DM-01 (Electron line), as recorded |
| **Privacy/Sec** | Privacy and security review (C-05, PRIV-01, M4). **Not named** (Q-D08) |
| **Product knowledge** | Health-insurance product expertise. DM-06 asks for it, but **no one is assigned** |
| **Legal** | Qualified legal and privacy review of disclaimer and consent text (Q-D09) |

**Change tags.** Each option is tagged by the kind of change it would take:
- **Config**: a rule-table value in `src/shared/rules/`.
- **Code**: engine or validator logic.
- **Contract**: a schema or enum in `src/shared/contracts/`. After the freeze this needs a `CONTRACTS_VERSION` bump (AR-24).

### 1.1 Source findings and contradictions (recorded, not reconciled)

Requirement-PDF findings were re-checked on 27 Oct 2026 by text extraction of `00`–`19` (pypdf). Text inside images would not be found.

| # | Finding | Source |
|---|---|---|
| S1 | `08 §3` states the principle: "Cheapest valid comparable premium may be highlighted; this is not a policy recommendation." The exact label "Lowest premium among comparable quotes — not a recommendation" appears in **no** requirement PDF. It is a DM-06 proposal | `08 §3`; OPEN_QUESTIONS.md:123 |
| S2 | "Tenure", "policy term" and "multi-year" appear in **no** requirement PDF. The request tenure field, the 1–3 year input range and the 1-year ranking rule all come from the planning documents | PDFs `00`–`19`; OPEN_QUESTIONS.md:114, :221 |
| S3 | The PRD's OS line is conditional: "supplied PRD says Windows 10/11 x64 and macOS 12+ Intel/Apple Silicon; confirm compatibility with chosen Electron/runtime dependencies before committing" | `01 §11` |
| S4 | "GST" appears in the requirements only as the advisory firm's licence/GST details, never as a premium basis | `01`, `05`, `07`, `08`, `14`, `18` |
| S5 | The requirements call the compared figure "annual premium". The engine compares the total premium for the quoted tenure | `01 §12`, `08 §2`; `src/shared/comparison/selection.ts` |
| S6 | Ambiguity has two readings. ARCH §3.7 lists "no ambiguity warnings" among the conditions for cheapest eligibility, but states set-level suppression only for the comparability key. OPEN_QUESTIONS §0.6 reads the first as a per-candidate condition and leaves set-level blocking to the PO | ARCHITECTURE_REVIEW.md:118–119; OPEN_QUESTIONS.md §0.6 |
| S7 | IMPLEMENTATION_STATUS says the macOS 12 floor "conflicts with every supported Electron line (≥ 44 needs macOS 13)". ARCHITECTURE_REVIEW lists Electron 43 as "Supported, oldest" with macOS 12 (as of 26 Oct 2026) | IMPLEMENTATION_STATUS.md:58; ARCHITECTURE_REVIEW.md:203 |
| S8 | Q-B08 is recorded as "disclaimer and consent wording", scheduled for M7. OPEN_QUESTIONS §0.6 had linked the highlight label to Q-B08; **that cross-reference was corrected on 27 Oct 2026**, and the label is now recorded as a DM-06 wording item with no question ID. The label remains a literal in the M3 contract | OPEN_QUESTIONS.md:147, :209, :255; `src/shared/contracts/comparison.ts:12` |
| S9 | Q-B16 is recorded as "which product or plan should be quoted" (Track B, R2). OPEN_QUESTIONS §0.6 had linked duplicate handling to it; **that cross-reference was corrected on 27 Oct 2026**. Duplicate-plan handling, tie handling and the two-result minimum have **no question ID** | OPEN_QUESTIONS.md §0.3, :204–205 |
| S10 | Member matching: ARCH §7.7 sketches "relationship+age band per member"; §0.6 and the code use exact age | ARCHITECTURE_REVIEW.md §7.7; OPEN_QUESTIONS.md §0.6 |
| S11 | Q-D08 (named security and privacy reviewer) is scheduled for M11, but C-05 and PRIV-01 need that reviewer before the M3 freeze, and M4 needs them too | OPEN_QUESTIONS.md:294; IMPLEMENTATION_STATUS.md:227 |
| S12 | The values for the PRD's floater case 5 (and cases 1–4) are to be supplied by the client and PO. None are in the pack | `09 §3`; `18` Q4 |
| S13 | The Indian-mobile phone rule is commented "provisional", but it sits in the contract (`customer.ts`), as does the pincode format. Neither is in the rule tables | `src/shared/contracts/customer.ts:33–43`, `quote.ts:21–26` |
| S14 | **Corrected 27 Oct 2026.** M3_ACCEPTANCE_REVIEW §7 E said the `.gitattributes` fix "exists only in the working tree". It now states the facts: the fix is committed as `cbe74e7` on `fix/windows-ci-eol`; the identical line is in the M3 working tree but not committed on `m3/contracts-comparison` (HEAD `4f42849`); the branches have not been integrated; and real Windows verification is outstanding | `git log fix/windows-ci-eol`; M3_ACCEPTANCE_REVIEW §2, §7 D–E |

## 2. Current M3 status

| Item | State (27 Oct 2026) |
|---|---|
| Engine and contracts | Committed locally as `4f42849`, **not pushed**. `CONTRACTS_VERSION` 0.1.0, `CONTRACTS_STATUS` **draft** |
| Rules in force | `dm06-provisional` 0.1.0 (**provisional**); `quote-input-placeholder` 0.1.0 (**placeholder**). Neither is approved |
| Uncommitted on the branch | Development-only demo (`src/renderer/src/dev/`, `test/comparison-demo.test.ts`, `App.tsx`, `tsconfig.node.json`); the `.gitattributes` line (identical to `cbe74e7` on `fix/windows-ci-eol`, not committed on this branch); documentation updates; the untracked review documents (`docs/M3_ACCEPTANCE_REVIEW.md`, this document, `docs/M3_STAKEHOLDER_BRIEF.md`, `docs/M3_DECISION_LOG_TEMPLATE.md`). `src/shared/` is unchanged since `4f42849` |
| Local checks | `npm run test:coverage`: **395/395 tests in 14 files** (328 committed M3 tests plus 67 demo tests); `src/shared` 100% statements and branches. **macOS 15.7.2 arm64 only** |
| CI | Never run on the M3 branch. On the M2 commit: macOS passed; Windows failed at lint (AR-25) |
| Windows | Not tested. The line-ending fix was validated only on a **simulated** Windows checkout |
| Acceptance | **Not accepted.** Contract review and freeze open; every rule provisional or a placeholder; CI and Windows open |
| M4 | Not started. Blocked by Q-M1-01 and DM-02; the M1 vault is not production-approved |

## 3. Priority discrepancy register

| Issue | Topic | Linked IDs | Required reviewer | Depends on | Decision | Approval |
|---|---|---|---|---|---|---|
| A | Multi-year requests cannot be highlighted | Q-B02 (tenure), DM-06 | PO; Product knowledge for option 2 | C (premium basis); S2 scope | OPEN | NOT APPROVED |
| B | Ambiguous coverage and the highlight | Q-B01; duplicate-plan handling (no question ID) | PO; Product knowledge for option 3; Tech for contract changes | C | OPEN | NOT APPROVED |
| C | Premium and coverage equivalence | Q-B02a–d, Q-B03, DM-06 | PO; Product knowledge; Client for labels and disclaimers; Tech for contract fields | Reviewer assignment (§5) | OPEN | NOT APPROVED |
| D | macOS minimum version | DM-01, NFR-COMPAT, Q-D07 | PO (NFR change); project lead; Privacy/Sec input | Test machines (Q-D07) | OPEN | NOT APPROVED |
| E | Highlight wording inside the contract | DM-06 (label; no question ID), AR-24; Q-B08 is related only as disclaimer wording (S8) | Client, PO (wording); Tech (placement, versioning); Legal (Q-D09) | B, C (what the highlight means) | OPEN | NOT APPROVED |

### Issue A — Multi-year quote comparison

**Current behaviour.**
- The input rules accept a requested tenure of 1, 2 or 3 years.
- The comparison rule ranks only 1-year premiums, and a quote's tenure must equal the requested tenure.
- So a valid 2- or 3-year request can **never** produce a highlight:
  - matching multi-year quotes fail eligibility (`TENURE_NOT_RANKED`);
  - 1-year quotes fail comparability (`TENURE_MISMATCH`);
  - the result is the generic `NO_COMPARABLE_RESULTS`, with no reason specific to tenure.

**Evidence.**
- Code:
  - `src/shared/rules/quote-input-rules.ts:76` (`tenureYears: [1, 2, 3]`);
  - `src/shared/rules/comparison-rule.ts:48` (`rankedTenureYears: [1]`);
  - `src/shared/contracts/coverage.ts:14` (contract bound 1–5);
  - `src/shared/comparison/eligibility.ts:25` and `comparability.ts:55`;
  - `compare.ts:109`.
- Tests: `test/comparison.test.ts:796`; `test/quote-validation.test.ts:168` pins that a 3-year request is valid.
- Probe: M3_ACCEPTANCE_REVIEW §4 Q-B02b, probe P1.
- Records: DM-06 Tenure options (a), (b), (c), with default (a) noted as "annualising hides multi-year discounts" (OPEN_QUESTIONS.md:114). S2: the requirements never mention tenure.

**Implications.**
- An advisor can enter a request the tool can never highlight, and nothing tells them why.
- Any method for ranking multi-year quotes that isn't valid could misrepresent price.
- Supporting multi-year quotes at all is a **scope** question (S2), not only a rule question.

**Options** (none selected):

| # | Option | Change | Notes |
|---|---|---|---|
| 1 | Restrict the initial workflow to 1-year requests | Config (`tenureYears: [1]`); optionally Contract (narrow the 1–5 bound before the freeze) | Removes the dead end. Insurer quotes captured with another tenure are still shown, but not ranked. The pinned test changes |
| 2 | Design and approve a valid multi-year comparison method | Config and/or Code; possibly Contract (insurer-stated per-year figures) | Variants recorded in DM-06: rank only within the same tenure (c), or normalise to a per-year figure (b). **Neither is established as valid.** Dividing a multi-year total by the number of years is **not assumed** to give a valid annual premium: discounts, instalments and rounding are undefined (GAP) |
| 3 | Permit multi-year requests, but state explicitly that the engine cannot highlight them | UI wording (approval needed); optionally Contract (a dedicated no-highlight reason) | The dead end remains but is explained. Advisors may read it as the tool failing |

**Trade-offs.**
- Option 1 is the smallest and most reversible change, but narrows scope.
- Option 2 depends on product knowledge nobody has supplied, and on Issue C's "annual premium" decision.
- Option 3 needs approved wording and leaves advisors with no highlight for these requests.

**Dependencies:** Issue C (what "premium" means); the scope decision in S2.

**Required reviewer:** PO for scope and option; Product knowledge for option 2; Client and PO for the option 3 wording; Tech for any contract change.

| Selected option | Decided by (role, name) | Date | Evidence reference | Status |
|---|---|---|---|---|
| | | | | **OPEN — NOT APPROVED** |

### Issue B — Ambiguous coverage

**Current behaviour.**
- A quote carrying a review flag (`ambiguous_premium`, `ambiguous_coverage`, `partial_page`) is excluded at **validity** (`REVIEW_REQUIRED`).
- Validity exclusions do **not** suppress the highlight, so another quote can still be highlighted.
- Probe P4 shows a cheaper quote flagged `ambiguous_coverage` sitting beside a dearer clean quote, and the dearer quote is highlighted.
- Duplicates and unparseable premiums behave the same way.

**Evidence.**
- Code: `src/shared/contracts/quote.ts:62`; `src/shared/comparison/validity.ts:45`; `compare.ts:91`, where only *valid* results that fail eligibility or comparability count towards suppression.
- Tests: `test/comparison.test.ts:780`, `:825`.
- Records: ARCHITECTURE_REVIEW.md:118–119 and OPEN_QUESTIONS §0.6, with the two readings in S6.
- Requirements: `02` ("Mark ambiguous parse results for review"); `05 §3` ("Never rank … ambiguous amounts"); `16 §5` (`PARSE_FAILED`: "Do not rank; review"). None says whether one ambiguous quote blocks the highlight for the whole set.

**Implications.**
- Under the current behaviour, "lowest premium" can be shown while a possibly lower but unconfirmed quote sits among the exclusions.
- Under stricter policies, any one doubtful record removes the highlight for everyone. With manual entry and early adapters, that may be frequent.

**Options** (none selected; option 2 is the current behaviour, not an approved policy):

| # | Policy | Change | Notes |
|---|---|---|---|
| 1 | Any relevant ambiguity blocks all highlighting | Code (count flagged results towards suppression; new rule setting); Contract (a new no-highlight reason; reusing `INCOMPARABLE_CANDIDATES` would misstate the cause) | "Relevant" must be defined |
| 2 | Only the ambiguous quote is excluded | None | The UI and PDF must show the exclusion next to the highlight |
| 3 | Handling depends on the type and severity of ambiguity | Code; Contract (a reason code or finding severity); a rule schema per type | Needs a classification of each type, which no document provides (GAP). The candidate types are the three flags, duplicates and unreadable amounts |

**Trade-offs.**

| | Policy 1 | Policy 2 | Policy 3 |
|---|---|---|---|
| Risk of a highlight while a possibly cheaper quote is unresolved | Lowest | Highest | Depends on classification |
| How often there is no highlight | Highest | Lowest | Middle |
| Change size | Code and Contract | None | Code, Contract and classification work |

**Dependencies:** Issue C. The definition of "ambiguity" (scope: flags only, or also duplicates and unreadable amounts).

**Required reviewer:** PO (Q-B01); Product knowledge for policy 3; Tech for contract changes.

| Selected policy | Scope of "ambiguity" | Decided by (role, name) | Date | Evidence reference | Status |
|---|---|---|---|---|---|
| | | | | | **OPEN — NOT APPROVED** |

### Issue C — Premium and coverage equivalence

**Why it affects validity.** A "lowest premium" highlight is only meaningful if every ranked premium buys equivalent cover on an equivalent basis. Each row below is a separate definition. If one is wrong, the highlight can compare unlike things. If one is too strict, there may be no highlight at all (AR-23). `08 §3` requires that unlike coverage is not compared "silently". **No row below states an approved insurance rule.**

| # | Question | Current provisional behaviour | Recorded options | Open points | Reviewer |
|---|---|---|---|---|---|
| C1 | **Annual premium versus total premium for the quoted tenure** | The engine compares the total for the quoted tenure. Because only 1-year premiums are ranked, the two coincide **only under this provisional rule** (S5) | DM-06 Tenure (b) annualise; Issue A | Whether "annual premium" in `08 §2` / `01 §12` (requirement text under `19` change control) is kept, defined or relabelled; any derivation method (GAP) | PO; Product knowledge; Client and PO for the PDF label |
| C2 | **GST inclusion** | Only GST-inclusive totals are ranked; exclusive or unknown basis is not ranked; no GST rate is assumed | DM-06 basis (a) inclusive, (b) exclusive | The requirements are silent (S4). Whether the PDF must state the basis | PO |
| C3 | **Tenure matching** | The quoted tenure must equal the requested tenure | DM-06 Tenure (a), (b), (c) | See Issue A | PO |
| C4 | **Add-on matching** | Base plan only: add-ons must be known and none | DM-06 (a) base plan, (b) the same advisor-chosen set. The schema also supports `ignore` | No shared add-on vocabulary across insurers (GAP) | PO; Product knowledge |
| C5 | **Co-pay, deductible, room rent** | Each must be known and identical (the strictest option). Unknown blocks the highlight | DM-06: "**No default.** This needs product knowledge"; (a) show but ignore, which needs a disclaimer; (b) require equality | Per-term choice. Conditional terms (for example age-based co-pay) are recorded as unknown | PO; Product knowledge; Client for any disclaimer |
| C6 | **Individual versus floater sum insured** | Request: "per member for individual cover, shared for floater" (`quote.ts:31`). Insurer result: no definition; compared exactly to the request value | DM-06 Sum insured: equal, otherwise not ranked | For multi-member individual cover, it is unknown whether an insurer reports per member or total (GAP; probe P7). The floater case 5 values are not supplied (S12) | PO; Product knowledge; Tech if a contract field is added |

**Options.** For each row, the options recorded in DM-06, plus the values the schema supports (M3_ACCEPTANCE_REVIEW §4 Q-B02a–d, Q-B03). None is selected here.

**Trade-offs.**
- Stricter choices give fewer misleading comparisons and fewer highlights, and require more data from manual entry and adapters.
- Looser choices give more highlights, but compare different cover, which needs visible differences or an approved disclaimer.

**Dependencies:** a named Product-knowledge reviewer (§5). Issues A, B and E depend on this issue.

**Required reviewer:** PO for each row; Product knowledge where marked; Client for labels and disclaimers; Tech for contract fields.

| Row | Selected option | Decided by (role, name) | Date | Evidence reference | Status |
|---|---|---|---|---|---|
| C1 | | | | | **OPEN — NOT APPROVED** |
| C2 | | | | | **OPEN — NOT APPROVED** |
| C3 | | | | | **OPEN — NOT APPROVED** |
| C4 | | | | | **OPEN — NOT APPROVED** |
| C5 co-pay | | | | | **OPEN — NOT APPROVED** |
| C5 deductible | | | | | **OPEN — NOT APPROVED** |
| C5 room rent | | | | | **OPEN — NOT APPROVED** |
| C6 | | | | | **OPEN — NOT APPROVED** |

### Issue D — macOS compatibility

**Current behaviour.**
- The PRD states macOS 12+, with a condition attached (S3).
- DM-01 proposes macOS 13+ and remains a provisional direction awaiting PO confirmation.
- The packaged apps in `release/mac/` and `release/mac-arm64/` (built 27 Oct 2026, before the M3 commit) declare `LSMinimumSystemVersion` **13.0**. `electron-builder.yml` sets no minimum, so the value is inherited, not chosen.
- Only macOS 15.7.2 arm64 has been tested.

**Evidence.**
- Requirements: `01 §11`; `02` ("verify all target OS versions/architectures against actual runtime/native dependencies"); `18` Q5.
- Records: OPEN_QUESTIONS.md:46 and :62–64 (DM-01 options A, B, C); ARCHITECTURE_REVIEW.md:201–203 (support table as of 26 Oct 2026); IMPLEMENTATION_STATUS.md:58 and :200 (NFR-COMPAT BLOCKED; see S7).
- Code: `package.json:49` (`"electron": "45.0.0"`).

**Implications.**
- Advisors on macOS 12 could not run a macOS 13+ build. How many advisors use macOS 12 is unknown (GAP).
- The Electron line decides Chromium security patching for an app that renders untrusted insurer content, and it fixes the upgrade cadence (AR-15).
- Changing the floor is a P0 NFR change under `19`.

**Options** (none selected):

| | Retain macOS 13 (DM-01 option A) | Restore macOS 12 support |
|---|---|---|
| Electron line | 45.x (current) | 43.x (DM-01 option B, "Not recommended" as recorded), the only supported line recorded with macOS 12. Option C (an unsupported older line) is recorded as "Rejected on security grounds" |
| Support window (as recorded 26 Oct 2026; re-check at decision time) | 45.x patched to about April 2027 | 43.x likely out of support when 46 ships (about 16 Dec 2026) |
| Rework | None for the floor itself; set the minimum explicitly in configuration | Re-run the M1 and M2 evidence on Electron 43 (fuses, smoke, launch guard, packaging, native SQLite); async `safeStorage` on 43 is **not verified** |
| Users excluded | macOS 12 users (number unknown) | None, if testing confirms it |

**Trade-offs.**
- Retaining macOS 13 keeps a supported Electron line and the existing evidence valid, but departs from the PRD's stated figure.
- Restoring macOS 12 meets that figure on a line near end of support. It means re-verification now and likely a forced upgrade soon after release, which may drop macOS 12 anyway.

**Evidence needed to substantiate macOS 12 support.** This is required before any compatibility is claimed; **none is claimed today**.
- Real machines on macOS 12, both Intel and Apple Silicon (Q-D07, Q-M1-02).
- Development and packaged builds on those machines: launch, the M2 smoke checks, launch guard, fuses, CSP and navigation.
- The packaged `Info.plist` minimum set deliberately in configuration and matching the decision.
- Native module loading (SQLite, M4); `safeStorage` and Keychain behaviour (the M1 vault; Q-M1-03).
- Rupee-sign PDF rendering (TC-17); installer runs (TC-25).
- Confirmation of the Electron 43 support window at decision time.

The same evidence list applies to macOS 13 if the floor is retained: macOS 13 is untested too.

**Dependencies:** test machines (Q-D07); this issue doesn't depend on Issues A–C or E.

**Required reviewer:** PO (NFR change); project lead (Electron line, DM-01); Privacy/Sec input on running a line near end of support; Tech and Client for machines.

| Selected floor | Electron line | Decided by (role, name) | Date | Test evidence reference | Status |
|---|---|---|---|---|---|
| | | | | | **OPEN — NOT APPROVED** |

### Issue E — Highlight wording and contract stability

**Current behaviour.**
- The comparison result accepts only the literal "Lowest premium among comparable quotes — not a recommendation" (`src/shared/contracts/comparison.ts:12`, `:147`), and the engine emits it (`selection.ts:49`).
- The wording is a DM-06 proposal (S1). Its approval is scheduled for M7 (S8).
- After a freeze, changing the literal needs a `CONTRACTS_VERSION` bump (AR-24).

**Evidence.**
- Tests: `test/domain-contracts.test.ts:208`, `test/comparison.test.ts:883`.
- Demo: `src/renderer/src/dev/ComparisonDemo.tsx:576` (development only).
- Records: OPEN_QUESTIONS.md:123, :147, :209, :255.
- Review: M3_ACCEPTANCE_REVIEW §6 (no versioning policy written).

**Implications.**
- Freezing now fixes wording the client has not approved.
- Changing it later touches stored comparisons (M4) and regenerated PDFs (M7), and there is no versioning policy yet.

**Options** (none selected):

| # | Option | Change before the freeze | Cost if the wording changes later | Notes |
|---|---|---|---|---|
| 1 | Approve the wording before the contract freeze | None | Version bump | Client approval is needed ahead of the M7 schedule. Later legal review (Q-D09) could still force a change |
| 2 | Move presentation wording outside the versioned domain contract | Contract and tests (for example a wording key and version instead of the literal) | None to the domain contract | **Only if Tech finds it architecturally appropriate.** The "never best or recommended" guarantee must move to the presentation layer with its own tests. Stored results and PDFs must record which wording version applied |
| 3 | Freeze the current contract and accept a possible future version bump | None | Version bump plus handling of stored comparisons | Needs written acceptance and a versioning policy |

**Trade-offs.**
- Option 1 couples the freeze to the client's timetable.
- Option 2 decouples them, but moves an enforced safeguard out of the contract.
- Option 3 defers the cost and accepts it in advance.

**Dependencies:** Issues B and C, which decide what the highlight means. A versioning policy (Tech).

**Required reviewer:** Client and PO for the wording; Legal (Q-D09) for disclaimer and consent text; Tech for placement and versioning; PO and Tech to accept a future bump (option 3).

| Selected option | Approved wording (if any) | Decided by (role, name) | Date | Evidence reference | Status |
|---|---|---|---|---|---|
| | | | | | **OPEN — NOT APPROVED** |

## 4. Remaining decision register

"Decision type" separates what the PO decides from what needs technical, privacy or security review. Full entries are in M3_ACCEPTANCE_REVIEW §4.

| ID | Open point (as recorded) | Current provisional behaviour | Decision type | Status |
|---|---|---|---|---|
| Q-B01 | Authoritative comparability rule | `suppress_highlight` for valid results that fail eligibility or comparability; Issue B | **PO** | OPEN — NOT APPROVED |
| Q-B02 | What "premium" means | Issue C rows C1–C5; Issue A | **PO**; Product knowledge (C4, C5) | OPEN — NOT APPROVED |
| Q-B03 | Sum insured: free entry or list; the returned value differs | Range ₹1 lakh–₹1 crore in steps of ₹50,000; must equal the request; C6 | **PO**; Tech if a contract field changes | OPEN — NOT APPROVED |
| Q-B04 | Age limits, relationships, maximum members | Placeholder ages; 8 relationships (in the **contract**); at most 6 members | **PO** for values; **Tech** for the contract list | OPEN — NOT APPROVED |
| Q-B05 | Floater rules; pincode format or serviceability | Floater 2–6; six-digit format only (in the **contract**) | **PO**; **Tech** for contract or adapter changes | OPEN — NOT APPROVED |
| Q-B08 | Disclaimer and consent wording for the PDF (as recorded; M7). The highlight label is a separate item (Issue E; S8) | No disclaimer or consent text in M3 | **Client, PO**; **Legal** (Q-D09); **Tech** for placement | OPEN — NOT APPROVED |
| Q-B10 | Manual results eligible for the highlight | Ranked, labelled `manual` | **PO** | OPEN — NOT APPROVED |
| Q-B16 | Product or plan to quote per insurer (as recorded; M8/M9) | No plan selection in M3 (adapter scope) | **PO**; Product knowledge | OPEN — NOT APPROVED |
| (no ID) | **Duplicate-plan handling** (related to, but not answered by, Q-B16; S9) | All duplicates excluded as ambiguous | **PO**; an ID should be assigned by the register owner | OPEN — NOT APPROVED |
| (no ID) | **Tie policy** | `highlight_all`, in a fixed order | **PO**; an ID should be assigned by the register owner | OPEN — NOT APPROVED |
| (no ID) | Minimum comparable quotes for a highlight | Two | **PO**; an ID should be assigned | OPEN — NOT APPROVED |
| C-04 | Company name and member names (data minimisation); the phone format is in the contract (S13) | Not collected; Indian mobile only | **PO**; **Privacy** (PRIV-01); **Tech** for the contract | OPEN — NOT APPROVED |
| C-05 | Age versus date of birth | Age only; DOB-requiring adapters blocked | **PO and Privacy/Sec** (as recorded) | OPEN — NOT APPROVED |
| DM-01 | Electron line and OS matrix | Electron 45; packaged minimum macOS 13.0; Issue D | **PO** (NFR); **project lead**; Privacy/Sec input | OPEN — NOT APPROVED |
| DM-06 | Comparability rules as a whole | `dm06-provisional` 0.1.0 | **PO**; Client for wording; Product knowledge | OPEN — NOT APPROVED |
| PRIV-01 | "Collect only the fields needed; prefer age over DOB": schema review | Data-minimised schema, not reviewed | **Privacy** (reviewer **not named**) | OPEN — NOT APPROVED |
| (Tech) | Contract versioning policy (M3_ACCEPTANCE_REVIEW §6) | None written | **Tech** | OPEN — NOT APPROVED |
| (Tech) | A `completed` result carrying an `errorCode` is accepted (M3_ACCEPTANCE_REVIEW §5 item 16) | Accepted, not flagged | **Tech** | OPEN — NOT APPROVED |
| (Tech) | The modelled coverage-term set, to be confirmed before the freeze (M3_ACCEPTANCE_REVIEW §5 item 28) | Co-pay, deductible, room rent, add-ons; waiting periods and other benefits not modelled | **Tech**; Product knowledge; PO | OPEN — NOT APPROVED |
| (Wording) | User-facing explanation for each finding code (M3_ACCEPTANCE_REVIEW §5 item 42, §7 C) | None drafted; demo text is not approved | **Client, PO**; Tech | OPEN — NOT APPROVED |

**Missing evidence for input rules.** No document supplies any of these; the current values are placeholders chosen for testability:
- the sum-insured range, step or list;
- age limits per relationship;
- the allowed relationships;
- floater member limits and allowed combinations;
- a pincode serviceability source;
- whether the limits are global or per insurer.

## 5. Required evidence and reviewer assignments

### 5.1 Reviewer assignments

| Role | Needed for | Assigned person |
|---|---|---|
| PO | All Q-B items, the tie and minimum items, C-04, C-05, DM-01 (NFR), DM-06 | Not recorded in this document |
| Client | Q-B08 wording, DM-06 label, any C5 disclaimer, test machines (Q-D07) | Not recorded |
| Tech (contract reviewer) | Contract review and freeze, versioning policy, Issue E placement, contract-level items in §4 | Not recorded (IMPLEMENTATION_PLAN §18 names the role only) |
| Project lead | DM-01 Electron line | Not recorded |
| Privacy/Sec reviewer | C-05, PRIV-01, Issue D input, M4 (Q-M1-01, DM-02) | **Not named** (Q-D08, scheduled M11; S11) |
| Product knowledge | C1, C4, C5, C6, Issue A option 2, Issue B policy 3, Q-B16 | **No one assigned** (DM-06) |
| Legal | Disclaimer and consent text (Q-D09) | Not recorded ("qualified reviewer") |

### 5.2 Evidence required before approval

| Evidence | Needed for | Provided by (role) | Status |
|---|---|---|---|
| Written decision with date and evidence for each register entry | §3, §4 | Named decision-maker | Not provided |
| Product-knowledge input: GST basis in insurer quotes, multi-year quoting, add-on vocabulary, co-pay, deductible and room-rent semantics, per-member versus total sum insured | Issues A, B and C; Q-B16 | Product knowledge | Not provided; reviewer unassigned |
| Rule values: sum insured, ages, relationships, floater limits and combinations, tenure range | Q-B03, Q-B04, Q-B05 | PO | Not provided |
| PRD case 1–5 inputs and expected values (including floater case 5) | Q-B05, regression pack | Client, PO (`09 §3`) | Not provided |
| Pincode serviceability source, if required | Q-B05 | PO; per insurer | Not provided |
| Client-approved highlight label, disclaimer and consent text | Issue E, Q-B08 | Client, PO, Legal | Not provided |
| Contract review record and versioning policy | Freeze; Issue E | Tech | Not provided |
| Privacy schema review | C-04, C-05, PRIV-01 | Privacy/Sec | Not provided; reviewer unnamed |
| macOS (12 and/or 13, Intel and Apple Silicon) and Windows test runs | Issue D, DM-01, NFR-COMPAT | Tech, Client (Q-D07) | Not provided |
| CI run on the M3 branch, including a real Windows job | Acceptance §7 E | Tech, after a person decides to push | Not run |

## 6. Proposed review-meeting agenda

Ordered by dependency first, then risk. The meeting records decisions and evidence. Each resulting change to rules, contracts or code is a separate, reviewed piece of work afterwards. **No meeting dates or attendee names are proposed here.**

| # | Decision to be made | Decision-maker / reviewer | Evidence needed before approval | Downstream work blocked |
|---|---|---|---|---|
| 1 | **Roles and baseline:** name the Privacy/Sec reviewer and a Product-knowledge source; confirm decisions are made against the draft requirement pack (Q-03) | PO, Client | Availability of named people; Q-03 status | Every Product-knowledge item; C-05 and PRIV-01; M4 security gates |
| 2 | **Platform floor (Issue D):** choose the floor, or commission evidence first. Request test machines; decide whether to push the branch so CI and Windows can run. High risk and long lead; independent of items 3–8 | PO (NFR), project lead; Privacy/Sec input; Tech, Client (machines) | §5.2 platform runs; current Electron support dates | Packaging minimum, M10 release, TC-24 and TC-25, any Electron change, all Windows claims |
| 3 | **Comparison basis (Issue C, rows C1–C6)** | PO; Product knowledge; Client for labels | Product-knowledge input (§5.2) | Issues A, B and E; manual-entry fields (M6); adapter parse targets (M6/M8); PDF comparison table (M7); rule-table update |
| 4 | **Multi-year requests (Issue A)** | PO; Product knowledge for option 2 | Item 3 decided; scope position on S2 | Input rules and pinned tests; New Quote form tenure field (M6); any no-highlight reason in the contract |
| 5 | **Ambiguity and suppression (Issue B; Q-B01)** | PO; Product knowledge for policy 3; Tech | Item 3 decided; definition of "ambiguity" | Engine suppression logic; reason codes (contract); UI and PDF exclusion text |
| 6 | **Manual results, duplicate-plan handling, tie policy, minimum (Q-B10 and the unnumbered items)** | PO | Item 5 decided; plan-per-insurer position | Rule-table values; manual-entry labelling (M6, TC-11) |
| 7 | **Contract-shape items before the freeze:** Issue E placement and wording; C-04 fields and phone format; C-05 DOB; Q-B04 relationship list; Q-B05 pincode format; reason codes from items 4–5; versioning policy | Tech; Privacy/Sec (C-04, C-05, PRIV-01); Client, PO, Legal (wording) | Items 1 and 3–6 decided; privacy schema review; approved wording or accepted bump | **Contract freeze**, and therefore M4 storage schemas (AR-24) |
| 8 | **Input rule values (Q-B03, Q-B04, Q-B05 gaps)** | PO | Rule values and PRD case data (§5.2) | Placeholder tables; M6 form validation; TC-01 to TC-04 UI tests |
| 9 | **Freeze readiness:** walk M3_ACCEPTANCE_REVIEW §7 A–F and record what remains open. This item records status; it does not freeze | Tech, PO | Items 1–8 recorded | M3 acceptance; the start of M4 (which is also gated by Q-M1-01 and DM-02) |

## 7. Decision log

Only the named decision-maker fills a row, recording their name, the date and the evidence (a meeting note, email or signed form). A change to code or rules follows the decision; it never precedes it. Record the full details of each decision with [M3_DECISION_LOG_TEMPLATE.md](M3_DECISION_LOG_TEMPLATE.md).

| Ref | Decision | Option / value chosen | Decided by (role, name) | Date | Evidence reference | Follow-up change reference | Status |
|---|---|---|---|---|---|---|---|
| A | Multi-year comparison | | | | | | OPEN — NOT APPROVED |
| B | Ambiguity policy and scope | | | | | | OPEN — NOT APPROVED |
| C1 | Annual versus total premium | | | | | | OPEN — NOT APPROVED |
| C2 | GST inclusion | | | | | | OPEN — NOT APPROVED |
| C3 | Tenure matching | | | | | | OPEN — NOT APPROVED |
| C4 | Add-on matching | | | | | | OPEN — NOT APPROVED |
| C5 | Co-pay, deductible, room rent | | | | | | OPEN — NOT APPROVED |
| C6 | Individual versus floater sum insured | | | | | | OPEN — NOT APPROVED |
| D | macOS floor and Electron line (DM-01) | | | | | | OPEN — NOT APPROVED |
| E | Highlight wording and placement | | | | | | OPEN — NOT APPROVED |
| Q-B01 | Comparability rule | | | | | | OPEN — NOT APPROVED |
| Q-B03 | Sum insured | | | | | | OPEN — NOT APPROVED |
| Q-B04 | Ages, relationships, members | | | | | | OPEN — NOT APPROVED |
| Q-B05 | Floater; pincode | | | | | | OPEN — NOT APPROVED |
| Q-B08 | Disclaimer and consent wording | | | | | | OPEN — NOT APPROVED |
| Q-B10 | Manual results in ranking | | | | | | OPEN — NOT APPROVED |
| Q-B16 | Product or plan per insurer | | | | | | OPEN — NOT APPROVED |
| (no ID) | Duplicate-plan handling | | | | | | OPEN — NOT APPROVED |
| (no ID) | Tie policy | | | | | | OPEN — NOT APPROVED |
| (no ID) | Minimum for a highlight | | | | | | OPEN — NOT APPROVED |
| C-04 | Company and member names; phone format | | | | | | OPEN — NOT APPROVED |
| C-05 | Age versus DOB | | | | | | OPEN — NOT APPROVED |
| DM-06 | Comparability rules (register entry) | | | | | | OPEN — NOT APPROVED |
| PRIV-01 | Privacy schema review | | | | | | OPEN — NOT APPROVED |
| Tech | Versioning policy | | | | | | OPEN — NOT APPROVED |
| Tech | `completed` with `errorCode` | | | | | | OPEN — NOT APPROVED |
| Tech | Coverage-term set (§5 item 28) | | | | | | OPEN — NOT APPROVED |
| Wording | Finding-code explanations (§5 item 42) | | | | | | OPEN — NOT APPROVED |
| Roles | Privacy/Sec reviewer named (Q-D08) | | | | | | OPEN — NOT APPROVED |
| Roles | Product-knowledge reviewer assigned | | | | | | OPEN — NOT APPROVED |

## 8. Statement of status

**All decisions in this document remain OPEN and NOT APPROVED.**

This document:
- recommends no business rule;
- approves nothing and accepts no risk;
- freezes no contract;
- does not mark M3 accepted;
- treats no current behaviour as approved.

The comparison rule (`dm06-provisional`) and the input limits (`quote-input-placeholder`) remain unapproved. The development-only demo is not a product screen, and its wording is not approved text. No macOS or Windows compatibility is claimed beyond the local macOS 15.7.2 arm64 runs. The M1 vault is not production-approved, and M4 has not started: it remains blocked by Q-M1-01 and DM-02.
