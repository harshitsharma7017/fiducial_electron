# M3 Acceptance Review — Contracts and Business Rules

| | |
|---|---|
| Document status | **Review package. Every decision in it is OPEN and NOT APPROVED.** |
| Prepared | 27 October 2026, by the development agent (automated). It contains no approval by any person |
| Branch / HEAD | `m3/contracts-comparison` at `4f428495fafe9e0bbe49a364ccb35306dc0220c3` (local only, not pushed) |
| Contracts | `CONTRACTS_VERSION` `0.1.0`, `CONTRACTS_STATUS` `draft` (`src/shared/contracts/common.ts`) |
| Rules in force | `dm06-provisional` 0.1.0, status `provisional` (`src/shared/rules/comparison-rule.ts`); `quote-input-placeholder` 0.1.0, status `placeholder` (`src/shared/rules/quote-input-rules.ts`) |
| Source of truth for the questions | [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) §0.2 (DM register, DM-01, DM-06), §0.6 (M3 provisional values), §B (Q-B), §C (C-04, C-05). This document quotes those records; it does not replace or amend them |

## 1. Purpose and scope

This package lets the product owner (PO), the client and the technical and security reviewers make explicit decisions before the M3 contracts are frozen (IMPLEMENTATION_PLAN §4 M3, definition of done: "contracts are reviewed and frozen").

It contains:
- a **decision register** (§4) for Q-B01, Q-B02, Q-B03, Q-B04, Q-B05, Q-B08, Q-B10, Q-B16, C-04, C-05 and DM-01;
- a **contract-review checklist** (§5) and the **freeze and versioning implications** (§6);
- the **acceptance criteria** for M3 (§7);
- the **contradictions, ambiguities and gaps** found in the source documents (§8), and the outstanding evidence (§9).

It is not:
- an approval, a freeze, or a change to any rule, contract, test or code;
- legal, regulatory, actuarial or insurance-product advice. Nothing here establishes what any insurer offers or what any regulation requires. Where the documents are silent this is marked **GAP**.

**How behaviour was established.** "Verified" means read in the source under `src/shared/` and covered by a test named below, or confirmed on 27 Oct 2026 by calling the real `compareQuotes` and `validateQuoteRequest` from a throwaway script outside the repository (marked **probe**). The probe changed no file in the repository.

## 2. Current M3 status

| Item | State |
|---|---|
| Engine and contracts | Committed locally as `4f42849…c3`. **Not pushed.** `src/shared/` is unchanged since that commit |
| Uncommitted on the branch | Development-only Quote Comparison demo (`src/renderer/src/dev/`, `test/comparison-demo.test.ts`, `src/renderer/src/App.tsx`, `tsconfig.node.json`); `.gitattributes` line-ending fix (`* text=auto eol=lf`: committed separately as `cbe74e7` on `fix/windows-ci-eol`; the identical line is applied here but not committed on this branch); documentation updates; the untracked review documents (this review, `docs/M3_DISCREPANCY_RESOLUTION.md`, `docs/M3_STAKEHOLDER_BRIEF.md`, `docs/M3_DECISION_LOG_TEMPLATE.md`) |
| Demo | Development builds only (`import.meta.env.DEV`); excluded from the production renderer bundle. Synthetic data. Its wording is demo copy, not approved text |
| Automated checks (local) | 395 tests in 14 files: 328 committed M3 tests in 13 files plus 67 demo tests; `src/shared` 100% statements, branches, functions and lines; type-check, lint, `npm audit` (0 vulnerabilities), secret scan and M2 smoke pass. **macOS 15.7.2 arm64 only** |
| CI | Never run on this branch (not pushed). CI ran once on the M2 commit: macOS passed, Windows failed at lint (AR-25) |
| Windows | No real Windows CI run and no Windows runtime test. The line-ending fix was validated only on a simulated Windows checkout on macOS |
| Acceptance | **Not accepted.** Contract review and freeze outstanding; every business rule provisional or a placeholder; CI and Windows outstanding |
| M4 | Blocked separately by Q-M1-01 and DM-02 (security reviewer, not yet named, Q-D08). The M1 vault is a spike and is **not production-approved** |

## 3. How to use the register

- Each entry quotes the existing question **verbatim** from OPEN_QUESTIONS.md, then states what the code does today.
- **Options are options, not recommendations made by this document.** Where an existing document already records a recommended default (DM-06, DM-01, the §C proposed resolutions), it is quoted and attributed.
- Each option is tagged by what adopting it would take:
  - **Config**: a change to a rule table value (`src/shared/rules/`). No code change, but the pinned tests are updated in a reviewed diff and the rule `version` is bumped.
  - **Code**: the engine or validators must change.
  - **Contract**: a Zod schema or enum in `src/shared/contracts/` must change. After the freeze this needs a `CONTRACTS_VERSION` bump (AR-24).
- **Decision** and **Approval / evidence** start as `OPEN` and `NOT APPROVED`. Only the named reviewer should change them, recording name, date and the evidence (meeting note, email, signed form). A change to the code or rules must follow the decision, not precede it.

### Register summary

| ID | Topic (as recorded) | Reviewer(s) recorded | Decision | Approval / evidence |
|---|---|---|---|---|
| Q-B01 | Comparability rule for the highlight | PO | OPEN | NOT APPROVED |
| Q-B02 | Definition of "premium" (GST, tenure, add-ons, co-pay, deductible) | PO | OPEN | NOT APPROVED |
| Q-B03 | Sum insured: free entry or list; returned value differs | PO | OPEN | NOT APPROVED |
| Q-B04 | Age limits, relationships, maximum members | PO | OPEN | NOT APPROVED |
| Q-B05 | Floater rules; pincode check | PO | OPEN | NOT APPROVED |
| Q-B08 | Disclaimer and consent wording (as recorded). The highlight label is a separate DM-06 item with no question ID (the §0.6 link was corrected on 27 Oct 2026) | Client, PO | OPEN | NOT APPROVED |
| Q-B10 | Manual results eligible for the highlight | PO | OPEN | NOT APPROVED |
| Q-B16 | Product or plan to quote per insurer (as recorded). Duplicate-plan handling is a separate item with no question ID (the §0.6 link was corrected on 27 Oct 2026) | PO | OPEN | NOT APPROVED |
| — (no ID) | Tie handling; minimum comparable quotes for a highlight | PO (per §0.6) | OPEN | NOT APPROVED |
| C-04 | Company name and member names | PO | OPEN | NOT APPROVED |
| C-05 | Age versus date of birth | PO, Sec | OPEN | NOT APPROVED |
| DM-01 | Electron line and OS support matrix, including the macOS floor | PO (NFR change), project lead | OPEN | NOT APPROVED |

## 4. Decision register

### Q-B01 — Comparability rule

**Existing question (OPEN_QUESTIONS §B):**
> What is the authoritative **comparability rule** for highlighting the cheapest premium? (18 Q9) — Why it matters: FR-12, TC-27 — Owner: PO — Blocks: M3 (final), M7

**Current behaviour (verified):**
- A result is highlighted only if it passes, in order, **validity**, **eligibility** and **comparability** (`src/shared/comparison/compare.ts`).
- Comparability requires exact equality with the request on sum insured (to the paisa), cover type, member set (relationship and exact age, order ignored) and tenure. **An unknown value never matches** (`comparability.ts`; tests "never assumes an unknown attribute matches the request", "compares sums insured exactly, to the paisa", "compares member sets regardless of order but including age").
- `incomparable: 'suppress_highlight'`: any valid result that fails eligibility or comparability withholds the highlight for the whole set (`INCOMPARABLE_CANDIDATES`; test "suppresses the highlight when a valid result covers something else (TC-27)").
- **Validity exclusions do not suppress.** A cheaper result excluded as a duplicate, flagged for review (for example `ambiguous_coverage`), unreadable or not completed does not stop a dearer valid result being highlighted (test "does not let validity exclusions suppress the highlight…"; probe P4 confirmed with `ambiguous_coverage`).
- Comparable results that disagree on a matched term produce `TERMS_DIFFER` and a list of differences instead of a highlight.

**Existing documentation:** OPEN_QUESTIONS §0.6 rows "Sum insured, cover type, members", "Incomparable or ineligible valid results", "Validity exclusions and the highlight"; DM-06 rows "Sum insured", "Members and cover type"; ARCHITECTURE_REVIEW §3.7, §7.7, §10; TC-27 (as quoted in §0.6: "suppressed **or** differences shown").

**Consequence if unresolved:** FR-12 cannot be accepted (IMPLEMENTATION_STATUS FR-12: "PARTIAL (rule not approved)"). The PDF (M7) cannot state which rule produced a highlight as approved. With the strict default, real quotes may rarely or never be highlighted (AR-23).

**Options:**

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| 1a. Keep `suppress_highlight` | Current; ARCH §3.7 | — | A single incomparable quote hides the highlight for every quote. Conservative: never highlights a cheaper quote that covers something different. Increases "no highlight" outcomes |
| 1b. `exclude_and_rank_rest` | Supported by the rule schema | Config | Highlights the cheapest comparable quote even when other valid quotes cover something different. The advisor sees a highlight next to a cheaper, non-comparable quote, so the UI and PDF must explain the exclusion |
| 1c. Keep "validity exclusions do not suppress" | Current; §0.6 | — | A cheaper quote that is merely flagged or duplicated does not block the highlight. Risk: a genuinely cheaper quote with an `ambiguous_coverage` flag sits beside a highlighted dearer one |
| 1d. Treat duplicates and `ambiguous_coverage` as suppressing | Named as the alternative in §0.6 | Code | More conservative. No rule-table switch exists for this today |
| 1e. Match members by age band instead of exact age | ARCH §7.7 sketch ("relationship+age band"); not implemented | Code, possibly Contract | Fewer mismatches on age; but the bands themselves are a product decision with no source in the documents (**GAP**) |

**Dependencies:** Q-B02 (what is compared), Q-B03 (sum-insured matching), Q-B10, Q-B16 (which plan is quoted affects comparability, as recorded), the DM-06 highlight label (no question ID) and any disclaimer wording (Q-B08).

**Reviewer:** PO.

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### Q-B02 — What "premium" means

**Existing question (OPEN_QUESTIONS §B):**
> **What exactly is "premium"?** GST-inclusive or exclusive? Annual only, or are multi-year tenures allowed? Base plan only, or with add-ons and riders? Do deductibles or co-pay count? — Why it matters: Results are not comparable otherwise. The PDF says "annual premium" (`08 §2`) but does not define the basis — Owner: PO — Blocks: M3, M7

The question has four parts. Each is registered separately below because each maps to a separate rule setting.

#### Q-B02a — GST basis

**Current behaviour (verified):** `premiumBasis: 'incl_gst'`. A GST-exclusive or unknown basis is not ranked (`PREMIUM_BASIS_NOT_RANKED`, `PREMIUM_BASIS_UNKNOWN`, eligibility stage, `eligibility.ts`). The engine never assumes a GST rate. Premium parts are checked for consistency according to the basis (inclusive: base + GST = total; exclusive: base = total; unknown: no check) (`validity.ts`; tests "does not rank GST-exclusive or unknown-basis premiums…", "treats a GST-exclusive quote with a GST breakdown as not ranked, not inconsistent").

**Existing documentation:** DM-06 "Premium basis (Q-B02)": options (a) total including GST, (b) base excluding GST; recommended default (a).

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| (a) Rank GST-inclusive totals only | DM-06 recommended default; current | — | Matches "total payable". Quotes shown only excluding GST are never ranked |
| (b) Rank GST-exclusive base premiums only | DM-06 | Config | Inclusive-only quotes are never ranked. The figure differs from what the customer pays |
| Rank across bases by deriving one from the other | Not proposed in any document | Code | Requires assuming or capturing a GST rate, which the engine deliberately never does. Rate source is a **GAP** |

#### Q-B02b — Tenure

**Current behaviour (verified):** only 1-year premiums are ranked (`rankedTenureYears: [1]`), and the quoted tenure must also equal the requested tenure. The input rules accept a requested tenure of 1, 2 or 3 years. **Probe P1:** a valid 2-year request can never produce a highlight under the current rules: matching 2-year quotes fail eligibility (`TENURE_NOT_RANKED`) and 1-year quotes fail comparability (`TENURE_MISMATCH`), giving `NO_COMPARABLE_RESULTS`.

**Existing documentation:** DM-06 "Tenure (Q-B02)": options (a) rank 1-year only, (b) annualise multi-year quotes, (c) rank within the same tenure; recommended default (a), "because annualising hides multi-year discounts". `08 §2` says "annual premium".

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| (a) Rank 1-year quotes only | DM-06 recommended default; current | — | Multi-year requests are accepted but never highlighted (P1). Either the input rule should stop offering 2–3 years, or the UI must explain this |
| (b) Annualise multi-year quotes | DM-06 | Code | DM-06 notes it hides multi-year discounts. No rounding or proration rule exists (**GAP**) |
| (c) Rank within the same tenure | DM-06 | Config (`rankedTenureYears`) | Comparability already requires the tenure to equal the request. The PDF's "annual premium" label (`08 §2`) would then be wrong for multi-year rankings |
| Restrict requestable tenure to 1 year | Implied by (a); not proposed | Config (input rule `tenureYears`) | Removes the dead end in P1; removes multi-year quoting entirely. Interacts with Q-B04/Q-B05 input rules |

#### Q-B02c — Add-ons and riders

**Current behaviour (verified):** `addOns: 'base_only'`. Add-ons must be known **and** empty; any add-on gives `ADD_ONS_PRESENT`, unknown add-ons give `TERM_UNKNOWN` (`comparability.ts`; test "keeps base-plan-only: add-ons present are not comparable (DM-06)").

**Existing documentation:** DM-06 "Add-ons and riders (Q-B02)": options (a) base plan without optional add-ons, (b) the same advisor-chosen add-on set; recommended (a) for v1.

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| (a) Base plan only | DM-06 recommended for v1; current | — | Any quote that includes an add-on is never ranked. Add-ons must be captured as an explicit empty list, or the quote is not comparable |
| (b) Same add-on set across quotes | DM-06 | Config (`must_match`) | Comparing identical add-on sets depends on add-on identifiers meaning the same thing across insurers. No shared add-on vocabulary exists (**GAP**) |
| Ignore add-ons | Supported by the schema; not proposed in DM-06 | Config (`ignore`) | Premiums with and without add-ons would be ranked together |

#### Q-B02d — Co-pay, deductible and room rent

**Current behaviour (verified):** each of `coPay`, `deductible` and `roomRent` is `must_match`: it must be **known** and identical across the comparable set. Unknown gives `TERM_UNKNOWN` (not comparable); a known difference gives `TERMS_DIFFER` with the differences listed (tests "honours ignore and must_match term policies", "shows differences instead of a highlight when co-pay, deductible or room rent differ"). Co-pay is a single flat whole percentage; conditional terms (for example age-based co-pay) must be recorded as unknown (`coverage.ts`).

**Existing documentation:** DM-06: "**No default.** This needs product knowledge. (a) would need the plan-features disclaimer". Options (a) show but ignore for ranking; (b) require equality. §0.6 records that M3 chose the strictest option because DM-06 gives no default. AR-23 (High/Medium): the strict rule may mean no highlight in practice.

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| (a) Show but ignore for ranking (per term) | DM-06 | Config (`ignore`, per term) | More highlights. Premiums with different cost-sharing are ranked together, so DM-06 requires a plan-features disclaimer (wording: Q-B08) |
| (b) Require equality (per term) | DM-06; current for all three | — | Like-for-like only. Every quote must state all three terms, or none is highlighted (AR-23). Depends on the manual form (M6) and adapters capturing them |
| Mixed: some terms (a), others (b) | Supported by the schema | Config | Each term needs its own product judgement (**GAP**: no product guidance in the documents) |

**Q-B02 dependencies:** Q-B01; Q-B08 (disclaimer if any term is ignored); M6 manual form and M8/M9 adapters (which terms are captured); 08 §2 "annual premium" label (M7).

**Reviewer:** PO; "product knowledge" for Q-B02d per DM-06 (the documents do not name who supplies it: **GAP**).

**Decision (Q-B02a, b, c, d):** OPEN · **Approval / evidence:** NOT APPROVED

---

### Q-B03 — Sum insured

**Existing question (OPEN_QUESTIONS §B):**
> Is **sum insured** free entry or a fixed list? What happens when an insurer returns a different sum insured from the one requested? — Why it matters: FR-03, comparability — Owner: PO — Blocks: M3

**Current behaviour (verified):**
- Input: free entry from ₹1,00,000 to ₹1,00,00,000 in steps of ₹50,000 (`PLACEHOLDER_QUOTE_INPUT_RULES.sumInsured`, `kind: 'range'`). A fixed list (`kind: 'list'`) is supported by configuration (test "supports a fixed list of sums insured"). Boundaries and one-paisa-off values are tested.
- Contract: the request comment says the sum insured is "per member for individual cover, shared for floater" (`quote.ts`). The insurer-result `sumInsured` has no such note.
- Comparison: a returned sum insured must equal the request to the paisa, otherwise `SUM_INSURED_MISMATCH`; missing gives `SUM_INSURED_UNKNOWN`; unreadable text gives `SUM_INSURED_UNPARSEABLE`. All are comparability findings and suppress the highlight under 1a.

**Existing documentation:** DM-06 "Sum insured (Q-B03)": "Rank only when the returned sum insured equals the requested one — Equal; otherwise show but do not rank". §0.6 "Sum insured" (placeholder values).

**GAP:** no document gives the allowed range, step or list. The placeholder values were chosen only to make the engine testable and are not derived from any insurer or regulatory source.

**Ambiguity:** for **individual** cover with several members, the documents do not say whether an insurer result's sum insured is per member or a total. **Probe P7:** a 2-member individual request at ₹5,00,000 compared with a quote showing ₹10,00,000 gives `SUM_INSURED_MISMATCH`. Whether that is correct depends on how the figure is captured.

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| Free entry within an approved range and step | Current mechanism | Config (values) | Flexible. Values must be supplied by the PO |
| Fixed list of approved values | Q-B03; supported | Config | Simpler entry; insurers may not offer every listed value (**GAP**) |
| Returned value must equal the request | DM-06 default; current | — | Quotes for a nearby sum insured are shown but never ranked |
| Any other handling of a different returned value | Not proposed in any document | Code | Would rank different cover against each other; no basis in the documents |
| Define per-member versus total for individual cover | Ambiguity above | Contract (field meaning) and possibly Code | Must be settled before the manual form (M6) and adapters capture the figure |

**Dependencies:** Q-B01, Q-B04 (individual multi-member requests), M6 manual form.

**Reviewer:** PO.

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### Q-B04 — Ages, relationships and member count

**Existing question (OPEN_QUESTIONS §B):**
> What are the **age limits** (minimum and maximum, adult and child), the allowed **relationships**, and the maximum number of members? — Why it matters: FR-02, TC-03 — Owner: PO — Blocks: M3

**Current behaviour (verified):**
- **Contract (fixed until a contract change):** eight relationships: `self`, `spouse`, `son`, `daughter`, `father`, `mother`, `father_in_law`, `mother_in_law` (`customer.ts`); age is a whole number 0–120 (`MAX_CONTRACT_AGE`); 1–12 members (`MAX_CONTRACT_MEMBERS`). Infants under one are age 0; months are not modelled.
- **Rule table (placeholder):** self and spouse 18–65, one each; son and daughter 0–25, up to four each; father, mother, father-in-law and mother-in-law 18–80, one each; at most six members (`quote-input-rules.ts`). Every rule problem is reported at once with path and code only. Boundary ages 17, 18, 65, 66, 0, 25, 26, 80 and 81 are tested (`quote-validation.test.ts`, TC-03).
- Comparison matches members by relationship and **exact** age (see Q-B01 1e).

**Existing documentation:** §0.6 "Ages: self and spouse", "Ages: son and daughter", "Ages: parents and parents-in-law", "Relationships and counts". §0.6 records also: "Main member versus dependants … Not defined in the documents … Not modelled".

**GAP:** no document gives any of these values or the allowed relationships. Whether limits are per insurer or global is not stated.

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| Approve values for the existing eight relationships | — | Config | Fastest; values must come from the PO |
| Remove relationships from the allowed set | Supported (absent from table = not allowed) | Config | No contract change |
| Add relationships outside the eight (for example siblings or grandparents) | Not proposed in any document | Contract | Must be decided before the freeze, or needs a `CONTRACTS_VERSION` bump later |
| Model infant ages in months | §0.6 / evidence limitation | Contract | Affects member matching and storage (M4) |
| Introduce a main member / dependant distinction | §0.6 record; not defined | Contract | Not defined in the documents (**GAP**) |

**Dependencies:** Q-B05 (floater size), C-05 (age versus DOB), Q-B01 1e (exact age versus bands).

**Reviewer:** PO.

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### Q-B05 — Floater rules and pincode

**Existing question (OPEN_QUESTIONS §B):**
> **Floater rules**: minimum members and allowed relationship combinations. **Pincode**: six-digit format check only, or also serviceability? — Why it matters: FR-03, TC-02 — Owner: PO — Blocks: M3

**Current behaviour (verified):**
- Floater: 2–6 members; a single-member floater is rejected; there are **no relationship-combination rules** (the rule table has only `minMembers` and `maxMembers`) (tests "requires at least two members for floater cover (placeholder rule)", "caps floater size independently of the overall cap").
- Pincode: the **contract** (not the rule table) accepts six digits with the first digit 1–9, after removing spaces (`pincodeSchema`, `quote.ts`; TC-02 tests). No serviceability check. The contract comment says serviceability "is insurer-specific".

**Existing documentation:** §0.6 "Floater" and "Pincode" rows.

**GAP:** no document lists floater combinations or a pincode serviceability source.

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| Approve floater member limits only | Current mechanism | Config | No combination rules |
| Add relationship-combination rules | Q-B05 | Code (rule schema and validator) | Combination rules are not given in any document (**GAP**) |
| Pincode format check only | Current | — | Unserviceable pincodes are found only when an insurer rejects the quote |
| Pincode serviceability check | Q-B05 | Code and data; per insurer | Needs a data source per insurer (**GAP**); belongs with adapters (M8/M9) rather than the shared request contract |
| Change the pincode format | — | Contract | The format lives in the contract, so a change after the freeze needs a version bump |

**Dependencies:** Q-B04; adapter feasibility (M8/M9) for serviceability.

**Reviewer:** PO.

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### Q-B08 — Disclaimer and consent wording (as recorded), and the separate highlight-label item

**Existing question (OPEN_QUESTIONS §B):**
> What is the approved **disclaimer and consent wording**? (18 Q8) — Why it matters: FR-15, release gate `06 §7` — Owner: Client, PO — Blocks: M7 (content)

**Label mismatch (recorded, not resolved):** this review was requested as "Q-B08: approved wording for the comparison highlight". The recorded Q-B08 is about **disclaimer and consent wording** for the PDF (FR-15, M7). The highlight label was linked to Q-B08 only in §0.6 ("Highlight label … Needs: Q-B08 (wording, Client)"; that cross-reference was corrected on 27 Oct 2026); DM-06 separately says "Highlight wording (proposed, for client approval) … Approvers: PO; client for the wording". This entry covers both, without merging them.

**Current behaviour (verified):** the comparison result contract accepts only the fixed literal `HIGHLIGHT_LABEL` = "Lowest premium among comparable quotes — not a recommendation" (`comparison.ts`, `z.literal`; test "only accepts the fixed, non-advisory highlight label"). Tests assert the engine output never says "best" or "recommended". No disclaimer or consent text exists in M3. The development demo's explanatory text is demo copy and is not covered by any approval.

**Consequence if unresolved:** FR-15 stays BLOCKED (IMPLEMENTATION_STATUS). Because the label is a **contract literal**, freezing the contracts now would freeze unapproved wording; changing it afterwards needs a contract version bump.

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| Approve the proposed label verbatim | DM-06, `08 §3` | — | Freeze can include the literal |
| Supply different label wording before the freeze | — | Contract (literal) | Must stay non-advisory (no "best" or "recommended", per DM-06 and 08 §3) |
| Defer the label to M7 | §0.3 lists Q-B08 at W7 (M7) | Contract (move the label out of the frozen schema) or accept a later version bump | Freeze proceeds; wording changes remain possible at a known cost |
| Disclaimer and consent wording | Q-B08 as recorded | Content (M7) | Also needs the legal and privacy review Q-D09 |
| Plan-features disclaimer if Q-B02d option (a) is chosen | DM-06 | Content | Wording not drafted (**GAP**) |

**Dependencies:** Q-B02d, Q-D09 (legal review), Q-B07 (branding, M7).

**Reviewer:** Client and PO (as recorded); Q-D09 qualified reviewer for legal text.

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### Q-B10 — Manual results in ranking

**Existing question (OPEN_QUESTIONS §B):**
> **Can manual results be highlighted as cheapest?** The documents say a manual result is "not insurer-verified" but do not say whether it is eligible for ranking — Why it matters: FR-12, R-09 — Owner: PO — Blocks: M3

**Current behaviour (verified):** `manualResults: 'rank'`. Manual results are ranked and carry `source: 'manual'` in `comparable[]` (tests "ranks GST-inclusive one-year results, automated or manual (DM-06, Q-B10)", "labels a cheapest manual result as manual (TC-11)"). `'exclude'` is supported and produces `MANUAL_NOT_RANKED` (eligibility), which suppresses the highlight under 1a. The contract has an optional `evidenceRef`, but the engine does not look at it.

**Existing documentation:** DM-06 "Manual quotes (Q-B10)": options (a) eligible, labelled "Manual"; (b) never eligible; (c) eligible only with an evidence screenshot; recommended (a), because "In R1 every quote is manual, so (b) would mean R1 never highlights a cheapest premium". DM-05 (manual-first R1) is itself only a recommendation awaiting PO approval.

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| (a) Eligible, labelled Manual | DM-06 recommended; current | — | The highlight may rest on advisor-typed figures that are "not insurer-verified" |
| (b) Never eligible | DM-06 | Config (`'exclude'`) | Under a manual-first R1 nothing is ever highlighted; under 1a every manual quote also suppresses the highlight for the set |
| (c) Eligible only with evidence | DM-06 | Code (engine must read `evidenceRef`) | Depends on Q-B11 (screenshot optional or mandatory) and M4 evidence storage |

**Dependencies:** DM-05, Q-B11, Q-B01, M6 manual form, M7 PDF labelling.

**Reviewer:** PO.

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### Q-B16 — Product or plan per insurer (as recorded), and the separate duplicate-handling item

**Existing question (OPEN_QUESTIONS §B):**
> **For each insurer, which product or plan should be quoted?** Each insurer offers several health products. The documents do not say which one — Why it matters: Adapters cannot be specified. Comparability depends on it — Owner: PO — Blocks: M8, M9

**Label mismatch (recorded, not resolved):** this review was requested as "Q-B16: tie and duplicate-plan handling". The recorded Q-B16 asks **which product or plan to quote**. §0.6 linked only the **duplicates** row to Q-B16 (that cross-reference was corrected on 27 Oct 2026); the **ties** row and the **minimum for a highlight** row name "PO" with **no question ID**. They are registered separately below so that no ID is invented. §0.3 places Q-B16 in "Track B (R2)", while §0.6 cites it for M3 duplicate handling.

**Current behaviour (verified):**
- The contracts allow several plans per insurer (`insurer.ts`). **Probe P3:** two different plans from the same insurer are both ranked, and either can be the highlight. They also count towards the two-result minimum, so one insurer alone can produce a highlight.
- Duplicates: results sharing a `resultId`, and completed results with the same insurer and plan label (case- and whitespace-insensitive, `planIdentity`), are **all** excluded at validity (`DUPLICATE_RESULT_ID`, `DUPLICATE_PLAN`, `validity.ts`; test "marks every result that shares an ID or a completed insurer plan"). Being validity findings, they do not suppress the highlight (probe P3: the next comparable quote was highlighted).

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| Name the product or plan per insurer | Q-B16 | Adapter specification (M8/M9) | Product knowledge needed (**GAP**) |
| Allow several plans per insurer (current) | §0.6 / `insurer.ts` | — | One insurer can satisfy the two-result minimum alone |
| One plan per insurer in a comparison | Not proposed | Code | Simpler comparison; loses plan choice |
| Exclude all duplicates without suppressing (current) | §0.6 M3 proposal | — | See Q-B01 1c |
| Duplicates suppress the highlight | §0.6 alternative under Q-B01 | Code | See Q-B01 1d |

**Dependencies:** Q-B01, Q-D01 (portal permission), M8/M9 adapters.

**Reviewer:** PO.

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

### (No ID) — Tie handling and minimum for a highlight

Recorded in §0.6 with "Needs: PO" and no question ID. A question ID should be assigned by the document owner; this review does not create one.

**Current behaviour (verified):**
- Ties: `ties: 'highlight_all'`. Every result at the lowest premium is highlighted, `tie: true`, ordered by insurer ID, then result ID (probe P6; test "highlights every tied result in a fixed order, or none, by rule"). The order uses identifiers, not display names.
- Minimum: `minComparableForHighlight: 2`. A single comparable quote gives `TOO_FEW_COMPARABLE` (probe P2).

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| Highlight all tied quotes | DM-06 recommended ("All tied"); current | — | Several quotes carry the highlight; UI and PDF must say none is preferred |
| No highlight on a tie (`no_highlight`) | Supported | Config | Exact ties produce `TIE_NOT_HIGHLIGHTED` |
| Minimum of 2 (current) | §0.6 "M3 proposal (not in DM-06)" | — | A lone quote is never labelled "lowest" |
| Minimum of 1, or higher than 2 | Supported (1–20) | Config | 1 labels a lone quote "lowest"; higher values reduce highlights |

**Reviewer:** PO. **Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### C-04 — Company name and member names

**Existing conflict (OPEN_QUESTIONS §C):**
> **Data model vs. FR-01/FR-02.** `05 §2` adds `customers.company_name` and `insured_members.name`, which FR-01 and FR-02 do not list — Proposed resolution: Leave both out unless the PO or an insurer requires them (data minimisation, `06 §4`) — Owner: PO

**Current behaviour (verified):** the customer has a required `name` (single line, up to 100 characters) and optional `phone`, `email` and `notes`; there is **no company name** (`customer.ts`). Members have **no name or gender** (test "has no name, gender or date of birth on members (C-04, C-05)"). The phone must be an Indian mobile number (ten digits starting 6–9; `+91`, `91` or a leading `0` removed); landlines are rejected. The contract comment marks this "provisional", but it is part of the contract, not a rule table.

**Existing documentation:** §0.6 "Customer fields", "Member fields"; IMPLEMENTATION_STATUS PRIV-01 ("prefer age over DOB", schema review).

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| Keep company name and member names out | §C proposed resolution; current | — | Data minimisation; an insurer that needs them is blocked or handled manually |
| Add either field | `05 §2` | Contract; M4 storage | More personal data to store, export and delete (PRIV-01) |
| Accept landline or international phone numbers | Not proposed | Contract | Settle before the freeze |

**Dependencies:** M4 storage schema (C-04 fields affect tables), adapter required fields (M8/M9).

**Reviewer:** PO (as recorded); PRIV-01 names a schema review, reviewer not named (**GAP**).

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### C-05 — Age versus date of birth

**Existing conflict (OPEN_QUESTIONS §C):**
> **Age vs. DOB.** FR-02 allows "age or DOB"; `05` says avoid storing both. Some insurer portals may require DOB — Proposed resolution: Store age by default. Store DOB only for insurers whose required fields demand it, and document why per adapter — Owner: PO, Sec

**Current behaviour (verified):** members carry relationship and age only (`memberSchema`). An adapter may declare `members.dateOfBirth` as required, and pre-flight then **always** blocks that insurer, because DOB is not captured (`preflight.ts`; test "always blocks an insurer that requires a date of birth (not captured; C-05)").

| Option | Source | Takes | Trade-offs and risks |
|---|---|---|---|
| Age by default; DOB only where an insurer requires it | §C proposed resolution | Contract (add an optional DOB field when approved) | Minimal data; per-adapter justification needed |
| Age only, permanently | Current | — | Insurers that require DOB stay blocked or manual |
| DOB for all members | FR-02 permits | Contract; M4 | More sensitive data; conflicts with `05` ("avoid storing both") if age is also stored |

**Dependencies:** C-04, Q-B04, adapter required fields (M8/M9), M4 storage and retention (Q-B06).

**Reviewer:** PO and security/privacy reviewer (as recorded; the reviewer is not named, Q-D08).

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

---

### DM-01 — Electron line and OS support matrix (macOS floor)

**Existing record (OPEN_QUESTIONS §0.2 register):**
> DM-01 — Provisional direction: Electron 45.x; Windows 10 22H2 and 11 x64; macOS 13+ on Intel and Apple Silicon — Still pending: Compatibility testing (S1, S3); PO confirmation of the macOS floor change from 12 to 13 (`01 §11`) — Approver(s): **PO** — Work that may proceed now: M1 spikes on Electron 45.x

The DM-01 option table records: **A (recommended)** Electron 45.x, macOS 13+ ("Raises the PRD macOS floor from 12 to 13, which is a P0 NFR change and needs PO approval"); **B** Electron 43.x keeping macOS 12 ("Not recommended"); **C** an older, unsupported Electron ("Rejected on security grounds"). "Approvers: project lead, and PO for the NFR change."

**Relation to M3:** DM-01 is not an engine or contract decision. It is included because platform acceptance (§7 E) depends on it.

**Current state (verified):** `electron` is pinned to `45.0.0` (`package.json`). `electron-builder.yml` sets no macOS minimum explicitly; the packaged macOS apps in `release/` (built 27 Oct 2026 at 10:28, before the M3 commit, and not rebuilt since) declare `LSMinimumSystemVersion` **13.0** in `Info.plist`. This value was not set by the project's configuration, so it presumably comes from Electron's defaults (not verified). Testing so far: **macOS 15.7.2 arm64 only**. No macOS 13, Intel Mac or Windows run. IMPLEMENTATION_STATUS NFR-COMPAT: BLOCKED, "Awaiting DM-01".

**Observation:** the packaged build already enforces macOS 13 while the PRD floor (`01 §11`) is macOS 12 and the PO has not confirmed the change.

**Consequence if unresolved:** NFR-COMPAT cannot be closed; TC-24/TC-25 have no agreed target; Q-D07 cannot be scoped.

**Dependencies:** Q-D07 / Q-M1-02 (test machines), AR-15 (Electron support window).

**Reviewer:** PO (NFR change), project lead.

**Decision:** OPEN · **Approval / evidence:** NOT APPROVED

## 5. Contract-review checklist

Legend for **Basis**: **V** verified in code and tests; **D** documented intent only; **O** unresolved product decision (see §4); **E** evidence missing, reviewer input required. Paths are under `src/shared/` unless stated.

### 5.1 Customer and member data

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 1 | Customer: `name` required (1–100 chars, whitespace collapsed, control characters rejected); `phone`, `email`, `notes` (≤1000) optional | `contracts/customer.ts`, `contracts/common.ts` | V | `quote-validation.test.ts` "quote draft" |
| 2 | Phone: Indian mobile only, normalised; landlines rejected | `customer.ts` `indianMobileSchema` | V, O | Contract-level, marked provisional (C-04) |
| 3 | No company name; no member name, gender or DOB | `customer.ts` | V, O | C-04, C-05 |
| 4 | Eight relationships; age 0–120 whole years; 1–12 members | `customer.ts`, `quote.ts` | V, O | Business limits are the rule table (Q-B04) |
| 5 | Infant months, age bands, main member | — | D, O | Not modelled (§0.6, evidence README) |

### 5.2 Quote request

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 6 | Request: members, `coverType` (`individual`/`floater`), `sumInsuredPaise` (positive integer), `tenureYears` (1–5), `pincode` | `contracts/quote.ts` `quoteRequestSchema` | V | Strict object; unknown keys rejected |
| 7 | Sum insured meaning: per member (individual) or shared (floater) | `quote.ts` comment | D, E | Result-side meaning undefined (Q-B03 ambiguity) |
| 8 | Business rules applied after schema: relationships, counts, ages, floater size, sum insured, tenure | `validation/quote-request.ts`, `rules/quote-input-rules.ts` | V, O | Placeholder values (Q-B03, Q-B04, Q-B05) |
| 9 | Pincode format in the contract, not the rule table | `quote.ts` `pincodeSchema` | V, O | Q-B05 |
| 10 | Requested tenure 1–3 accepted, but only 1-year ranked | input and comparison rules | V, O | Probe P1; Q-B02b |
| 11 | Pre-flight per insurer; DOB always missing | `validation/preflight.ts`, `contracts/adapter.ts` | V | TC-04 |

### 5.3 Insurer result input and normalised result

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 12 | Input: `resultId`, `insurerId`, `status`, `source`, `retrievedAt` (ISO with offset) required; plan, currency, premium, coverage, review flags, error code, evidence ref optional | `quote.ts` `insurerResultInputSchema` | V | Same shape from adapters and manual entry |
| 13 | Amounts accepted as whole paise or text; text parsed strictly; negative paise allowed so they can be reported | `quote.ts`, `money.ts` | V | |
| 14 | Normalisation never fills values: missing amounts `null`, missing terms `unknown`, unparseable text dropped and reason kept | `comparison/normalize.ts` | V | "never fills in missing values…" |
| 15 | Malformed record becomes `MALFORMED_RESULT` with paths only; IDs kept only if well-formed | `comparison/compare.ts` | V | TC-09 |
| 16 | A `completed` result that also carries an `errorCode` is accepted | `validity.ts` | V, E | Probe P5; recorded as "not checked" in evidence README. Reviewer to decide whether this should be a finding |

### 5.4 Currency and money

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 17 | Money is integer paise within the safe-integer range; no floats | `money.ts` | V | Property-tested round trip |
| 18 | Parser accepts plain or Indian grouping, `₹`/`Rs.`/`INR`, `/-`, ≤2 decimals; rejects ranges, negatives, Western grouping with a reason code | `money.ts` | V | `money.test.ts` |
| 19 | Currency field accepts any three letters (upper-cased); only `INR` is valid for comparison, otherwise `CURRENCY_UNSUPPORTED` or `CURRENCY_MISSING` | `quote.ts`, `validity.ts` | V | Probe P8 |
| 20 | Request amounts carry no currency field; INR is implied | `quote.ts` | V, D | Freeze implication: adding currency later is a contract change |

### 5.5 Validity, eligibility and comparability

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 21 | **Validity**: usable at all (status, plan label, currency, premium present/positive/consistent, review flags, duplicates). Failing it **does not** suppress the highlight | `validity.ts`, `compare.ts` | V, O | Q-B01 1c/1d |
| 22 | **Eligibility**: rule gates (manual, premium basis, ranked tenure). Failing it **does** suppress under `suppress_highlight` | `eligibility.ts` | V, O | Q-B02a/b, Q-B10 |
| 23 | **Comparability**: equal to the request (sum insured, cover type, members, tenure) and required terms known. Failing it **does** suppress | `comparability.ts` | V, O | Q-B01, Q-B02d |
| 24 | Eligibility and comparability are evaluated only for valid results | `compare.ts` | V | The demo labels this "not assessed" |
| 25 | Member eligibility (ages, relationships) is a request check, not a result check | `eligibility.ts` comment | V | |
| 26 | ARCH §3.7 lists "no ambiguity warnings" as a cheapest-eligibility condition; code treats review flags as validity | ARCH §3.7 vs `validity.ts` | D vs V | §8 item 4 |

### 5.6 Coverage terms, GST basis and tenure

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 27 | Every term is explicitly `known` or `unknown`; unknown never matches | `contracts/coverage.ts` | V | |
| 28 | Terms modelled: co-pay (flat whole %), deductible (paise), room rent (no limit, per-day cap, % of sum insured, room category `shared`/`single_private`), add-ons (slugs) | `coverage.ts` | V, E | Waiting periods and other benefits not modelled; reviewer to confirm the set before freeze |
| 29 | Premium basis `incl_gst`/`excl_gst`/`unknown`; parts checked per basis | `coverage.ts`, `validity.ts` | V, O | Q-B02a |
| 30 | Tenure contract bound 1–5; ranked tenure 1 | `coverage.ts`, `comparison-rule.ts` | V, O | Q-B02b |
| 31 | Add-ons base-only; co-pay, deductible, room rent must match | `comparison-rule.ts` | V, O | Q-B02c/d, AR-23 |
| 32 | Term amounts (deductible, room-rent cap) carry no currency of their own; they are in the result's currency | `coverage.ts` | V, D | Demo formats them in the result's currency |

### 5.7 Duplicates, selection and ties

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 33 | Duplicate result IDs and duplicate insurer+plan (normalised label) all excluded | `validity.ts` `findDuplicates`, `contracts/insurer.ts` | V, O | Duplicate-plan handling (no question ID; related to Q-B16) |
| 34 | Several plans per insurer allowed and ranked | `insurer.ts` | V, O | Probe P3 |
| 35 | Selection: lowest total premium; deterministic order premium → insurer ID → result ID; any input order gives the same output | `selection.ts` | V | Property-tested |
| 36 | Ties highlighted together (`tie: true`); minimum two comparable results | `comparison-rule.ts`, `selection.ts` | V, O | §4 "(No ID)" |
| 37 | Exactly one of `cheapest` and `noHighlightReason` is set | `contracts/comparison.ts` refine | V | |
| 38 | Fixed non-advisory label literal | `comparison.ts` | V, O | Highlight label (DM-06; no question ID) |

### 5.8 Finding codes and no-highlight reasons

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 39 | 14 validity codes, 4 eligibility codes, 11 comparability codes, each with a stage and optional path | `comparison.ts` | V | Meanings in code comments; user-facing text is not yet approved (M6/M7) |
| 40 | Six no-highlight reasons: `NO_RESULTS`, `NO_COMPARABLE_RESULTS`, `TOO_FEW_COMPARABLE`, `INCOMPARABLE_CANDIDATES`, `TERMS_DIFFER`, `TIE_NOT_HIGHLIGHTED` | `comparison.ts` | V | |
| 41 | Findings carry codes and paths only, never values | `contracts/issues.ts`, `compare.ts` | V | Tested with synthetic sensitive values |
| 42 | Approved user-facing explanation per code | — | E | Wording for UI (M6) and PDF (M7) not drafted for approval |

### 5.9 Validation boundaries and error states

| # | Item | Where | Basis | Note |
|---|---|---|---|---|
| 43 | Issues are `{ path, code }`, at most 20, path at most 100 characters | `contracts/issues.ts` | V | |
| 44 | Invalid request or rule: `compareQuotes` returns issues prefixed `request.` / `rule.` and runs no comparison | `compare.ts` | V | |
| 45 | Rule tables are themselves schema-validated; an invalid table gives `RULES_INVALID` | `rules/`, `validation/quote-request.ts` | V | |
| 46 | Run statuses (11), connection statuses (7), result sources, app error codes (17) | `contracts/status.ts`, `ipc/errors.ts` | V | C-01 and C-02 reconciliations; part of the freeze |
| 47 | Progress event schema (no member data, tokens or screenshots) | `status.ts` | V | Nothing emits it until M5 |

## 6. Freeze and versioning implications

**What a freeze would fix.** Everything in `src/shared/contracts/`. Changing any of the following afterwards needs a `CONTRACTS_VERSION` bump (AR-24):
- the relationship list, age and member bounds, cover types, tenure bound 1–5;
- the pincode format and the Indian-mobile phone format;
- the coverage-term set and room categories, premium bases, review flags;
- finding codes, no-highlight reasons, run and connection statuses, app error codes;
- the `HIGHLIGHT_LABEL` literal (DM-06 wording; no question ID).

**What stays configurable after a freeze.** The values in `src/shared/rules/` (comparison rule and input limits), each with its own `id`, `version` and `status`. Today both are unapproved.

**GAP: no versioning policy is written.** The documents do not define:
- what counts as a breaking versus compatible contract change;
- how data stored under one contract version is read under the next (M4 migrations);
- how a stored comparison or PDF records the contract and rule versions (ARCH §7.7 says "The rule version is stored with each generated PDF"; the result already carries `contractsVersion` and `rule {id, version, status}`).

**Recommended order (from AR-24):** hold the contract review before M4 storage schemas are written.

## 7. M3 acceptance criteria

`[ ]` = not met. `[x]` = met, with the scope stated. Nothing in this list is met merely because this document exists.

### A. Contract review and freeze
- [ ] Technical reviewer has reviewed every checklist item in §5 and recorded findings.
- [ ] Items marked **E** in §5 are resolved or explicitly accepted (16, 28, 42, and 7).
- [ ] Contract-level items that depend on open decisions (Q-B04 relationships, Q-B05 pincode, C-04 phone and fields, C-05 DOB, the DM-06 highlight label) are decided or explicitly deferred with the version-bump cost accepted.
- [ ] A versioning policy is written (§6 GAP).
- [ ] `CONTRACTS_STATUS` changed from `draft` by the reviewer's instruction (not done; not to be done by this document).

### B. Product-owner approval of business rules
- [ ] Q-B01, Q-B02a–d, Q-B03, Q-B04, Q-B05, Q-B10, Q-B16 and the unnumbered tie, minimum and duplicate-plan handling items in §4 each have a recorded decision and evidence.
- [ ] Rule values supplied for every **GAP** marked in §4, or the gap explicitly accepted.
- [ ] The rule tables are updated to match the decisions in a reviewed change, with their `status` and `version` changed accordingly (currently `provisional` and `placeholder`).
- [ ] DM-06 register entry updated by its owner.

### C. Approved user-facing wording
- [ ] Highlight label approved by the client and PO (DM-06; no question ID), or deferral recorded (§4, Q-B08 entry).
- [ ] Plan-features disclaimer drafted and approved, if Q-B02d option (a) is chosen.
- [ ] User-facing explanations for finding codes approved (M6/M7). The demo's text is **not** approved wording.
- [ ] Legal and privacy review (Q-D09) for disclaimer and consent text (M7).

### D. Automated verification
- [x] Unit tests, coverage gate, type-check, lint, `npm audit`, secret scan and M2 smoke pass **locally on macOS 15.7.2 arm64** (27 Oct 2026): 395 tests in 14 files (328 committed M3 tests plus 67 development-demo tests); `src/shared` 100% coverage.
- [x] Production renderer bundle excludes the development-only demo and its synthetic data (checked locally).
- [ ] Tests updated and re-run after the rule and contract decisions are applied.
- [ ] The uncommitted work on the M3 branch (demo, `.gitattributes`, documentation) committed by a person after review. **Not committed on this branch.** The `.gitattributes` line is already committed separately on `fix/windows-ci-eol` (`cbe74e7`); see E.

### E. CI and cross-platform verification
- [ ] The M3 engine commit `4f42849…c3` pushed. **It is local only.**
- [ ] The `.gitattributes` line-ending fix committed **on the M3 branch**. **Not met.** The facts:
  - **Separate fix branch:** committed as `cbe74e7` on `fix/windows-ci-eol`, whose parent is the M2 commit `37879c5`.
  - **M3 branch:** HEAD remains `4f428495fafe9e0bbe49a364ccb35306dc0220c3`. The identical line (`* text=auto eol=lf`) is present in the M3 working tree but has **not been committed on `m3/contracts-comparison`**.
  - **Integration:** the branches have not been merged, rebased or otherwise integrated.
  - **Verification:** the fix was validated only on a simulated Windows checkout on macOS. Real Windows CI and Windows runtime verification remain outstanding (items below).
  - *(Corrected 27 Oct 2026. This item previously said the fix "exists only in the working tree", which omitted the commit on the fix branch.)*
- [ ] CI run on the M3 branch. **M3 has never run in CI.**
- [ ] A real Windows CI run passes lint, type-check, tests, coverage and smoke. **Outstanding.**
- [ ] Windows runtime testing (dev and packaged). **Outstanding.** Local macOS tests are not evidence of Windows compatibility.
- [ ] macOS 13 and Intel Mac runs, subject to DM-01 (Q-D07, Q-M1-02). **Outstanding.**

### F. Known limitations and explicitly accepted risks
- [ ] Each limitation below is either fixed or accepted in writing by the named owner. **None is accepted today.**
  - Strict rule may mean no highlight in practice (AR-23).
  - Multi-year requests are accepted but never highlighted (probe P1).
  - Validity exclusions do not suppress the highlight (Q-B01 1c).
  - `completed` with an `errorCode` is accepted (checklist 16).
  - Infant months, age bands, conditional co-pay, waiting periods and pincode serviceability are not modelled.
  - Individual-cover sum insured is ambiguous for multi-member requests (Q-B03).
  - Contracts may be built on before the freeze (AR-24).
  - Packaged macOS build declares macOS 13 before DM-01 is confirmed (§4 DM-01).
- Out of M3 scope but recorded so it is not mistaken for acceptance: **M4 remains blocked** by Q-M1-01 (independent security review of the vault design) and DM-02 (security reviewer approval and acceptance of AR-13 key loss). The security reviewer is not named (Q-D08). **The M1 vault is a spike and is not production-approved.**

## 8. Contradictions, ambiguities and gaps found

Recorded as found; none is resolved here.

1. **Q-B08 label.** Requested as "highlight wording"; recorded as "disclaimer and consent wording" (FR-15, M7). Only §0.6 links the highlight label to Q-B08; DM-06 assigns the label to "client for the wording" without a question ID. *(27 Oct 2026: the §0.6 cross-reference was corrected; the label now has no question ID, and Q-B08 keeps its recorded meaning.)*
2. **Q-B16 label and timing.** Requested as "tie and duplicate-plan handling"; recorded as "which product or plan should be quoted". §0.6 links duplicates to Q-B16, but ties and the two-result minimum have no question ID. §0.3 lists Q-B16 under Track B (R2), while §0.6 cites it for M3. *(27 Oct 2026: the §0.6 cross-reference was corrected; duplicate handling now has no question ID, and Q-B16 keeps its recorded meaning.)*
3. **Member matching.** ARCH §7.7 sketches `memberSetKey` as "relationship+age band per member"; §0.6 and the code use exact age; the evidence README lists age bands as "not modelled".
4. **Ambiguity warnings.** ARCH §3.7 lists "there are no ambiguity warnings" among the conditions for cheapest eligibility. The code treats review flags as validity exclusions, which exclude the flagged quote but do not suppress the highlight. §0.6 records this as pending Q-B01.
5. **"Annual premium."** `08 §2` (as quoted in Q-B02) calls the figure "annual premium"; the engine compares the total premium for the quoted tenure. Equivalent only under the 1-year ranking default.
6. **Requestable versus rankable tenure.** Input rules accept 1–3 years; the comparison rule ranks only 1 year. A valid multi-year request cannot be highlighted (probe P1). Not recorded in any document before this review.
7. **Individual-cover sum insured.** The request contract defines it as per member for individual cover; the result side does not say (probe P7).
8. **Highlight label in the frozen contract.** §0.3 schedules Q-B08 for W7 (M7), but the label is a literal in the M3 contract, so the freeze and the wording decision are coupled.
9. **Contract-level "provisional" rules.** The Indian-mobile phone rule and the pincode format are in the contracts, not the rule tables, although the phone rule is commented "provisional".
10. **macOS floor.** The PRD states macOS 12+ (`01 §11`, NFR-COMPAT); DM-01 proposes 13; the packaged macOS build in `release/` already declares 13.0.
11. **Product-knowledge owner.** DM-06 says co-pay, deductible and room rent need "product knowledge" but names no source or reviewer.
12. **No versioning policy** for contract changes after the freeze (§6).
13. **PRIV-01 reviewer.** IMPLEMENTATION_STATUS PRIV-01 requires a "Schema review" for data minimisation; no reviewer is named.
14. **Status-table convention.** IMPLEMENTATION_STATUS §2–§9 keep audit-time values (for example FR-12 "BLOCKED"), while §1d records "PARTIAL". This is the file's stated convention, not an error, but readers should use §1d.

## 9. Outstanding evidence

| Evidence | Needed for | Owner (as recorded) |
|---|---|---|
| Written PO decisions for every §4 entry | §7 B | PO |
| Rule values (sum insured, ages, relationships, floater, tenure) | Q-B03–Q-B05 | PO |
| Product knowledge on co-pay, deductible, room rent, add-on vocabulary | Q-B02c/d | Not named (**GAP**) |
| Product or plan per insurer | Q-B16 | PO |
| Client-approved highlight label | DM-06 label (no question ID) | Client, PO |
| Client-approved disclaimer and consent wording | Q-B08 | Client, PO; Q-D09 |
| Contract review record | §7 A | Tech, PO (IMPLEMENTATION_PLAN §18) |
| CI run on the M3 branch, including Windows | §7 E | Tech (requires pushing; a person's decision) |
| Windows runtime and macOS 13 / Intel runs | §7 E, DM-01 | Tech, Client (Q-D07) |
| Named security and privacy reviewer | C-05, PRIV-01, M4 | Client, PO (Q-D08) |

## 10. Statement of status

**All decisions in this document remain OPEN and NOT APPROVED until the named reviewer records a decision with evidence.** This document does not approve any business rule, does not accept any risk, does not freeze any contract and does not mark M3 accepted. The provisional comparison rule and the placeholder input limits remain unapproved. The development-only demo is not a product screen, and its wording is not approved. The M1 vault is not production-approved, and M4 remains blocked by Q-M1-01 and DM-02.

## Sources

OPEN_QUESTIONS.md §0.2 (register, DM-01, DM-06), §0.3, §0.4, §0.6, §B, §C, §D, §E; IMPLEMENTATION_PLAN.md §4 M3, §17, §18; IMPLEMENTATION_STATUS.md §1d and rows FR-01–FR-04, FR-12, FR-15, NFR-COMPAT, PRIV-01; ARCHITECTURE_REVIEW.md §3.7, §7.2, §7.7, §10, AR-13, AR-15, AR-23, AR-24, AR-25; README.md; docs/evidence/M3/README.md; `src/shared/contracts/*.ts`, `src/shared/rules/*.ts`, `src/shared/validation/*.ts`, `src/shared/comparison/*.ts`, `src/shared/money.ts`, `src/shared/ipc/errors.ts`; `test/comparison.test.ts`, `test/quote-validation.test.ts`, `test/domain-contracts.test.ts`, `test/money.test.ts`; `package.json`, `electron-builder.yml`, packaged `release/mac*/…/Info.plist`. The requirement PDFs (`00`–`19`) were not re-read for this review; references to them (for example `08 §2`, `01 §11`) are as quoted in the planning documents.
