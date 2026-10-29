# M3 Stakeholder Brief — Decisions Needed Before Contract Freeze

| | |
|---|---|
| Status | **Briefing for a review meeting. Every decision is OPEN and NOT APPROVED.** |
| Prepared | 27 October 2026 by the development agent (automated). It records no approval by any person |
| Branch / HEAD | `m3/contracts-comparison` at `4f428495fafe9e0bbe49a364ccb35306dc0220c3` (local only, not pushed) |
| Detail and evidence | [M3_DISCREPANCY_RESOLUTION.md](M3_DISCREPANCY_RESOLUTION.md) (options, trade-offs, file and line evidence, source contradictions S1–S14). [M3_ACCEPTANCE_REVIEW.md](M3_ACCEPTANCE_REVIEW.md) (full register, contract checklist, acceptance criteria). Question IDs come from [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) |
| Recommendations | **None.** This brief summarises questions and evidence; it does not choose options |

## Read first: what this brief does not establish

| This | Is not |
|---|---|
| What the code does today (provisional rules chosen so the engine could be built and tested) | An approved business requirement |
| These review documents | Formal approval. Only a named owner's recorded decision (§6) counts |
| Local test results (macOS 15.7.2 arm64) | CI results. The M3 branch has never run in CI |
| The simulated Windows checkout (Git `core.autocrlf=true` on macOS) | Real Windows verification. No Windows CI or runtime test has run |
| The development-only Quote Comparison demo (dev builds only, synthetic data, demo wording) | A product screen or approved wording |
| The M1 vault spike | Production-approved secure storage |
| M3 acceptance (contract review, freeze, PO approvals) | M4 readiness. M4 is separately blocked by Q-M1-01 and DM-02 |

## 1. Current M3 status

**Verified (locally, macOS 15.7.2 arm64, 27 Oct 2026):**
- **Tests:** `npm run test:coverage` passes **395/395 in 14 files**: the 328 committed M3 tests plus 67 tests for the development-only demo. `src/shared` has 100% statement and branch coverage.
- **Other checks:** type-check, lint, `npm audit` (0 vulnerabilities), secret scan and the M2 smoke checks pass, as recorded in [docs/evidence/M3/](evidence/M3/README.md).
- **Demo and production bundle:** the demo runs the real engine on synthetic data, and the production renderer bundle contains none of it. A demo currency fix (non-INR amounts are no longer shown with ₹) is in the uncommitted working tree; the engine is unchanged.

**Not verified or not done:**

| Item | State |
|---|---|
| Push and CI | The M3 commit `4f42849` is **not pushed**; CI has **never run** on the M3 branch |
| Uncommitted working tree | Not committed on the M3 branch:<ul><li>the development-only demo (`src/renderer/src/dev/`, `test/comparison-demo.test.ts`, `App.tsx`, `tsconfig.node.json`), including its currency fix;</li><li>the `.gitattributes` line;</li><li>updates to the planning and evidence documents;</li><li>the untracked review documents (`docs/M3_ACCEPTANCE_REVIEW.md`, `docs/M3_DISCREPANCY_RESOLUTION.md`, this brief, `docs/M3_DECISION_LOG_TEMPLATE.md`).</li></ul>`src/shared/` is unchanged since `4f42849` |
| Windows line-ending fix | **Committed** as `cbe74e7` on the separate branch `fix/windows-ci-eol`. The identical `.gitattributes` line is in the M3 working tree but **not committed on the M3 branch**. The branches have not been integrated. Validated only on a simulated checkout |
| Windows | No real Windows CI run and no Windows runtime test |
| Other macOS versions | macOS 12, macOS 13 and Intel Macs untested (Issue D) |
| Contracts | **Draft** (`CONTRACTS_STATUS = 'draft'`): not reviewed and not frozen |
| Business rules | `dm06-provisional` and `quote-input-placeholder` are **unapproved** |
| M3 acceptance | **Not accepted** |

## 2. The five priority decisions

Details, options and trade-offs are in [M3_DISCREPANCY_RESOLUTION.md §3](M3_DISCREPANCY_RESOLUTION.md#3-priority-discrepancy-register).

| ID | Decision needed | What the code does today (not approved) | Options on the table (none selected) |
|---|---|---|---|
| **A** | **Multi-year quote comparison:** should 2- and 3-year requests be supported, and if so how are they compared? | Requests accept 1–3 years, but only 1-year premiums are ranked, so a multi-year request can **never** produce a highlight (generic `NO_COMPARABLE_RESULTS`) | (1) Restrict to 1-year requests; (2) approve a valid multi-year method (dividing by tenure is **not assumed** valid); (3) allow them, but explain that no highlight is possible |
| **B** | **Ambiguous coverage:** does an ambiguous quote block the highlight for the whole set? | The flagged quote is excluded; another quote can still be highlighted, even if the flagged one looked cheaper | (1) Any relevant ambiguity blocks all highlighting; (2) only the ambiguous quote is excluded (current behaviour); (3) handling depends on the type and severity of ambiguity |
| **C** | **Premium and coverage equivalence:** what makes two premiums comparable? Six sub-decisions: C1 annual versus total premium; C2 GST inclusion; C3 tenure matching; C4 add-ons; C5 co-pay, deductible and room rent; C6 individual versus floater sum insured | Total for the quoted tenure; GST-inclusive only; tenure must match; base plan only; every term must be known and identical; sum insured compared exactly | Per row, the options recorded in DM-06. **No option is established insurance or actuarial practice** |
| **D** | **Minimum supported macOS:** keep macOS 13, or restore macOS 12? | Electron 45; packaged apps declare macOS 13.0 (inherited, not configured). The PRD's "macOS 12+" is itself conditional | Retain 13 (supported Electron line); restore 12 (Electron 43, recorded as near end of support, with re-verification). No compatibility is claimed for either without testing |
| **E** | **Highlight wording and contract stability:** fix the label before the freeze? | The label "Lowest premium among comparable quotes — not a recommendation" is a literal in the M3 contract. Its approval is scheduled for M7 | (1) Approve the wording before the freeze; (2) move presentation wording out of the domain contract (if Tech agrees); (3) freeze now and accept a later version bump |

**Why these come first:**
- Issue C decides what a "lowest premium" highlight means, and Issues A, B and E depend on it.
- Issue D has the longest lead time, because it needs test machines.
- Issue E is coupled to the freeze itself.

## 3. Remaining decisions

Full entries are in [M3_DISCREPANCY_RESOLUTION.md §4](M3_DISCREPANCY_RESOLUTION.md#4-remaining-decision-register).

**Product decisions (PO, with Client or Product knowledge where noted):**
- **Q-B01:** the comparability rule, including the suppression policy (Issue B).
- **Q-B02:** what "premium" means (Issues A and C).
- **Q-B03:** sum insured as free entry or a list, and what happens when the returned value differs. Placeholder today: ₹1 lakh–₹1 crore in steps of ₹50,000.
- **Q-B04:** age limits, relationships, maximum members (placeholders).
- **Q-B05:** floater rules; pincode format only, or serviceability too (placeholders).
- **Q-B08:** disclaimer and consent wording for the PDF (Client, PO; Legal, Q-D09; M7). The highlight label (Issue E) is a separate DM-06 wording item with **no question ID**. Earlier M3 documents linked the two; that link has been corrected.
- **Q-B10:** whether manual results can be highlighted. Today they are ranked and labelled "manual".
- **Q-B16:** which product or plan to quote for each insurer (as recorded; adapter scope, M8/M9).
- **Duplicate-plan handling** (no question ID): today every duplicate is excluded as ambiguous. It is related to Q-B16 but is not the same question.
- **Tie policy** (no question ID): today all tied quotes are highlighted.
- **Minimum number of comparable quotes for a highlight** (no question ID): today two.
- **DM-06:** the comparability rules as a whole.
- **DM-01:** the OS floor and Electron line (PO for the NFR change; the project lead for the Electron line). This is Issue D.

**Technical decisions (Tech):**
- **Contract review and freeze.** This includes the contract-level items: the relationship list, the pincode format, the phone format, finding and reason codes, and the label (Issue E).
- **A contract versioning policy.** None is written.
- **A `completed` result carrying an `errorCode`.** It is accepted today and not flagged.
- **The modelled coverage-term set** (M3_ACCEPTANCE_REVIEW §5 item 28): co-pay, deductible, room rent and add-ons. Waiting periods and other benefits are not modelled. To be confirmed before the freeze, with Product knowledge.

**Wording decisions (Client, PO):**
- **User-facing explanations for each finding code** (M3_ACCEPTANCE_REVIEW §5 item 42, §7 C). None is drafted for approval. The demo's text is not approved wording.

**Privacy and security decisions (Privacy/Sec; reviewer not named, Q-D08):**
- **C-04:** company name, member names and phone format. The recorded owner is the PO; the privacy aspect is reviewed through PRIV-01.
- **C-05:** age versus date of birth. Recorded owners: PO and Sec.
- **PRIV-01:** data-minimisation schema review. No owner is recorded; it needs the privacy reviewer.

**Missing evidence for input rules.** No document supplies any of these; the current values are placeholders chosen for testability:
- the sum-insured range or list;
- ages per relationship;
- the allowed relationships;
- floater limits and combinations;
- a pincode serviceability source;
- whether the limits are global or per insurer;
- the PRD test-case values (cases 1–5, including floater case 5).

## 4. Evidence and reviewer roles

No person is named for any role in the project records. This brief does not assign anyone.

| Decision | Decision owner (role) | Other required reviewers | Evidence required before approval | Available today |
|---|---|---|---|---|
| A Multi-year | PO | Product knowledge (option 2); Client (option 3 wording); Tech (contract change) | Issue C decided; position on scope (tenure appears in no requirement PDF); a validated method if option 2 | No |
| B Ambiguity | PO (Q-B01) | Product knowledge (option 3); Tech | Definition of "ambiguity" (flags, duplicates, unreadable amounts); Issue C decided | No |
| C1–C6 Equivalence | PO | Product knowledge; Client (labels and disclaimers); Tech (contract fields) | Product-knowledge input on GST basis, multi-year quoting, add-on vocabulary, cost-sharing terms and per-member versus total sum insured | No; Product-knowledge reviewer unassigned |
| D macOS floor | PO (NFR change) | Project lead (Electron line); Privacy/Sec; Tech and Client (machines, Q-D07) | Runs on real machines at the chosen floor, on Intel and Apple Silicon, in dev and packaged builds; current Electron support dates | No |
| E Label | Client and PO (wording) | Tech (placement, versioning); Legal (Q-D09) | Approved text, or a written acceptance of a later version bump; a versioning policy | No |
| Q-B03, Q-B04, Q-B05 | PO | Tech (contract-level lists and formats) | Rule values; PRD case data | No |
| Q-B10, tie policy, minimum, duplicate-plan handling | PO | — | PO decision with evidence | No |
| Q-B16 (plan per insurer) | PO | Product knowledge | Product or plan named per insurer | No |
| C-04 | PO (as recorded) | Privacy (via PRIV-01); Tech (contract fields, phone format) | Privacy schema review | No; reviewer unnamed |
| C-05 | PO and Sec (as recorded) | Privacy/Sec | Privacy schema review; insurer DOB requirements (FR-04) | No; reviewer unnamed |
| PRIV-01 | No owner recorded ("Schema review") | Privacy/Sec | Privacy schema review | No; reviewer unnamed |
| Coverage-term set (M3_ACCEPTANCE_REVIEW §5 item 28) | Tech | Product knowledge; PO | Confirmation that the modelled terms are the right set before the freeze (waiting periods and other benefits are not modelled) | No |
| Finding-code explanations (M3_ACCEPTANCE_REVIEW §5 item 42, §7 C) | Client, PO (wording) | Tech | Drafted explanations for each finding code, for the UI (M6) and PDF (M7) | No; not drafted |
| Freeze and versioning | Tech | PO | All of the above decided or explicitly deferred | No |

## 5. Proposed meeting agenda

Ordered by dependency, then risk. The full version is in [M3_DISCREPANCY_RESOLUTION.md §6](M3_DISCREPANCY_RESOLUTION.md#6-proposed-review-meeting-agenda). No dates or attendees are proposed.

| # | Item | Owner | Blocks |
|---|---|---|---|
| 1 | **Roles and baseline:** name the Privacy/Sec reviewer and a Product-knowledge source; confirm decisions are made against the draft pack (Q-03) | PO, Client | Every Product-knowledge and privacy item; the M4 security gates |
| 2 | **Platform (Issue D):** choose the floor or commission evidence first; request test machines; decide whether to push so CI and Windows can run | PO, project lead, Tech, Client | Packaging minimum, release, any Windows claim |
| 3 | **Premium and coverage equivalence (Issue C)** | PO, Product knowledge | Issues A, B and E; manual-entry fields; adapter parsing; PDF table |
| 4 | **Multi-year (Issue A)** | PO | Input rules; New Quote form |
| 5 | **Ambiguity (Issue B, Q-B01)** | PO, Tech | Engine suppression logic; reason codes |
| 6 | **Manual results, duplicates, tie policy, minimum** | PO | Rule values; manual labelling |
| 7 | **Contract-shape items:** label placement (Issue E), C-04, C-05, the relationship list, pincode and phone formats, reason codes, versioning policy | Tech, Privacy/Sec, Client, PO | **The contract freeze**, and therefore M4 storage schemas |
| 8 | **Input rule values (Q-B03–B05)** | PO | Form validation; UI tests TC-01 to TC-04 |
| 9 | **Freeze readiness:** record what remains open. This does not freeze | Tech, PO | M3 acceptance |

## 6. Decision-recording template

Copy one block per decision. Only the named decision owner completes it. A change to code, rules or contracts follows the record; it never precedes it. A fuller per-decision template, with verification and contract-version fields, is in [M3_DECISION_LOG_TEMPLATE.md](M3_DECISION_LOG_TEMPLATE.md).

| Field | Entry |
|---|---|
| Decision ID | *(for example A, C2, Q-B10)* |
| Question | |
| Options considered | |
| Decision | |
| Rationale | |
| Decision owner (role and name) | |
| Required reviewers (role and name; each sign-off) | |
| Approval evidence (meeting note, email or signed form; location) | |
| Date | |
| Follow-up implementation tasks (rules, contract, tests, docs; each as a separate reviewed change) | |
| Status | OPEN — NOT APPROVED *(change only when the owner and every required reviewer have signed)* |

Record each completed decision in the decision log in [M3_DISCREPANCY_RESOLUTION.md §7](M3_DISCREPANCY_RESOLUTION.md#7-decision-log) as well.

## 7. Issues that must remain unresolved if the owner or evidence is unavailable

If the condition in the middle column isn't met, the decision stays **OPEN**. The current code behaviour stays **provisional, not approved**: it must not be cited as a decision.

| Issue | Stays OPEN unless | Consequence while open |
|---|---|---|
| C1–C6, Issue A option 2, Issue B option 3, Q-B16 | A Product-knowledge reviewer is assigned and supplies input | The strict provisional rule stays; real results may rarely be highlighted (AR-23) |
| A, B, Q-B01, Q-B02, Q-B10, the tie policy, the minimum and duplicate-plan handling | The PO records a decision with evidence | Rule tables stay `provisional`; no M6 or M7 wording relies on them |
| Q-B03, Q-B04, Q-B05 | The PO supplies values (and PRD case data) | Input tables stay `placeholder` |
| E (highlight label; no question ID) | The Client and PO approve the wording, or the PO and Tech accept a later version bump in writing | The label is unapproved; the freeze stays coupled to wording |
| Q-B08 (disclaimer and consent) | The Client and PO approve the wording, after Legal review (Q-D09) | PDF disclaimer and consent text stay placeholders (M7) |
| C-04, C-05, PRIV-01 | A Privacy/Sec reviewer is named (Q-D08) and reviews the schema | Contract-level privacy items cannot be frozen |
| D, DM-01 | Test machines (Q-D07) and runs exist at the chosen floor | No macOS 12 or 13 support may be claimed; NFR-COMPAT stays blocked |
| Windows support | A real Windows CI run (lint, type-check, tests, coverage, smoke) and Windows runtime tests pass | No Windows claim. The simulated checkout is not evidence |
| Contract freeze | Tech completes the review and a versioning policy exists | Contracts stay `draft` |
| M4 start | Q-M1-01 passes its independent security review of the vault design, and DM-02 passes security validation and review, with the AR-13 key-loss consequence accepted, all by the security reviewer (not yet named, Q-D08) | M4 does not start; the M1 vault stays a spike and is not production-approved |

---

**Statement of status.** All decisions in this brief remain **OPEN** and **NOT APPROVED**. This brief:
- recommends no option and approves nothing;
- accepts no risk;
- freezes no contract;
- does not mark M3 accepted;
- does not start M4.
