# M3 Completion Checklist

| | |
|---|---|
| Status | **M3 is not accepted.** Contracts are `draft`; every business rule is provisional or a placeholder. Every decision referenced here is **OPEN** and **NOT APPROVED** |
| Branch / HEAD | `m3/contracts-comparison` at `4f428495fafe9e0bbe49a364ccb35306dc0220c3` (local only, not pushed) |
| Prepared | 27 October 2026 by the development agent (automated). It records no approval |
| Decisions, options and evidence | [M3_STAKEHOLDER_BRIEF.md](M3_STAKEHOLDER_BRIEF.md) · [M3_DISCREPANCY_RESOLUTION.md](M3_DISCREPANCY_RESOLUTION.md) · [M3_ACCEPTANCE_REVIEW.md](M3_ACCEPTANCE_REVIEW.md) · record each decision with [M3_DECISION_LOG_TEMPLATE.md](M3_DECISION_LOG_TEMPLATE.md) |

`[ ]` not done. `[x]` done, with the scope stated. Ticking an item here does not approve anything.

## A. Safe technical corrections (no business approval needed)

- [x] **Documentation: question IDs restored to their recorded meanings (27 Oct 2026).**
  - OPEN_QUESTIONS §0.6 had filed duplicate handling under Q-B16 and the highlight label under Q-B08.
  - Q-B16 actually asks which product or plan to quote; Q-B08 asks about disclaimer and consent wording.
  - Both items are now recorded as decisions with **no question ID**, and the review documents follow. No rule, behaviour or decision changed.
- [x] **Investigated; no defect found, so no change made:**
  - Smoke runs leave no `fqf-smoke-*` profile directories behind (checked in the macOS temp directory).
  - `scripts/smoke.mjs` tolerates CRLF output: `JSON.parse` ignores a trailing `\r`.
  - `scripts/run-clean-env.mjs` uses a shell on Windows, so `.cmd` shims resolve.
- [x] **No source-code defect** was found that could be fixed without changing provisional behaviour. `src/shared/` and the committed tests are unchanged since `4f42849`.
- [ ] **Committing the uncommitted working tree on this branch** is a person's decision. That covers the development-only demo (with its currency fix), the `.gitattributes` line, and the documentation. **Not committed.**

These look technical, but they change observable behaviour or the contract, so they are **not** safe without a Tech decision (they're listed in C):
- a `completed` result carrying an `errorCode` is accepted (M3_ACCEPTANCE_REVIEW §5 item 16);
- a zero sum insured is reported as `SUM_INSURED_MISMATCH`.

## B. Implementation changes blocked by product decisions

Nothing in this table may change until the decision is recorded and approved. Changing a rule table bumps that table's `version` and `status`. A contract change after the freeze bumps `CONTRACTS_VERSION` (AR-24).

| Decision | Change that would follow (depends on the option chosen) | Source files | Tests pinning the current behaviour |
|---|---|---|---|
| **Q-B01** comparability and suppression (Issue B) | `incomparable` policy; whether validity exclusions suppress; possibly a new no-highlight reason | `rules/comparison-rule.ts:53`; `comparison/compare.ts:91`; `contracts/comparison.ts:97` | `comparison.test.ts:645`, `:663`, `:707`, `:780` |
| **Q-B02** premium: GST basis (C2) | `premiumBasis` | `rules/comparison-rule.ts:47`; `comparison/eligibility.ts` | `comparison.test.ts:720`, `:741` |
| **Q-B02** tenure (Issue A, C3) | Requestable versus ranked tenure; possibly the contract bound 1–5 | `rules/quote-input-rules.ts:76`; `rules/comparison-rule.ts:48`; `contracts/coverage.ts:14` | `quote-validation.test.ts:168`; `comparison.test.ts:287`, `:796` |
| **Q-B02** annual versus total premium (C1) | Only if a per-year figure is approved: new fields and a selection basis | `contracts/quote.ts`; `comparison/selection.ts` | `comparison.test.ts` (selection) |
| **Q-B02** add-ons (C4) | `addOns` policy | `rules/comparison-rule.ts:49`; `comparison/comparability.ts` | `comparison.test.ts:372` |
| **Q-B02** co-pay, deductible, room rent (C5) | `terms` policy per term; any disclaimer | `rules/comparison-rule.ts:50` | `comparison.test.ts:663`, `:683` |
| **Q-B03** sum insured (C6) | Range or list values; per-member versus total basis (possibly a contract field) | `rules/quote-input-rules.ts:70`; `contracts/quote.ts:32`; `comparison/comparability.ts` | `quote-validation.test.ts:138`–`:164`; `comparison.test.ts:758` |
| **Q-B04** ages, relationships, member count | Rule values; the relationship list and age bound are contract-level | `rules/quote-input-rules.ts:57`–`:67`; `contracts/customer.ts:8`, `:23` | `quote-validation.test.ts:75`–`:91` and the age-boundary table |
| **Q-B05** floater, pincode | Floater limits (rule); pincode format (contract); serviceability (adapter) | `rules/quote-input-rules.ts:68`; `contracts/quote.ts:22` | `quote-validation.test.ts:118`–`:124` and the pincode tests |
| **Q-B10** manual results | `manualResults` | `rules/comparison-rule.ts:51` | `comparison.test.ts:267`, `:272`, `:590`, `:707` |
| **Tie policy** (no ID) | `ties` | `rules/comparison-rule.ts:52`; `comparison/selection.ts` | `comparison.test.ts:529`, `:809` |
| **Minimum for a highlight** (no ID) | `minComparableForHighlight` | `rules/comparison-rule.ts:54` | `comparison.test.ts` (`TOO_FEW_COMPARABLE` cases) |
| **Duplicate-plan handling** (no ID) | Which duplicates are excluded, and whether they suppress | `comparison/validity.ts:71`; `contracts/insurer.ts` (`planIdentity`) | `comparison.test.ts:237`, `:780`, `:825` |
| **Highlight label** (DM-06 wording, no ID; Issue E) | Approved text, or move it out of the contract | `contracts/comparison.ts:12`; `comparison/selection.ts` | `domain-contracts.test.ts:208`; `comparison.test.ts` ("never calls anything best") |
| **Q-B08** disclaimer and consent | None in M3 (PDF content, M7) | — | — |
| **Q-B16** product or plan per insurer | None in M3 (adapter specification, M8/M9) | — | — |
| **C-04** customer and member fields; phone format | Fields; `indianMobileSchema` (contract) | `contracts/customer.ts:37` | `quote-validation.test.ts:249`, `:260` |
| **C-05** age versus DOB | DOB field; the `members.dateOfBirth` pre-flight rule | `contracts/customer.ts:25`; `contracts/adapter.ts:21`; `validation/preflight.ts` | `domain-contracts.test.ts:135`; `quote-validation.test.ts:344` |
| **PRIV-01** privacy schema review | Review only; it may lead to C-04 or C-05 changes | `contracts/customer.ts` | — |
| **DM-06** comparability rules as a whole | Rule `status` and `version` after the decisions above | `rules/comparison-rule.ts` | `domain-contracts.test.ts:33` |
| **DM-01** macOS floor (Issue D) | An explicit macOS minimum in packaging (none is set today; 13.0 is inherited), or a change of Electron line | `electron-builder.yml`; `package.json` (`electron`) | Packaging and runtime evidence, not unit tests |

Source paths are under `src/shared/` unless shown otherwise; test paths are under `test/`.

## C. Contract review and freeze

- [ ] Tech reviews every item in [M3_ACCEPTANCE_REVIEW §5](M3_ACCEPTANCE_REVIEW.md#5-contract-review-checklist) and records findings.
- [ ] Items marked "evidence missing" in §5 are resolved or explicitly accepted:
  - **7**: sum-insured meaning (Q-B03);
  - **16**: `completed` with `errorCode` (Tech);
  - **28**: the modelled coverage-term set (Tech, with Product knowledge);
  - **42**: an approved explanation for each finding code (Client, PO).
- [ ] Contract-level items are decided, or deferred with the version-bump cost accepted in writing:
  - the relationship list (Q-B04);
  - the pincode format (Q-B05);
  - phone and fields (C-04);
  - DOB (C-05);
  - the highlight label (DM-06 / Issue E).
- [ ] A contract versioning policy is written (M3_ACCEPTANCE_REVIEW §6).
- [ ] Only on the reviewer's written instruction: `CONTRACTS_STATUS` changes from `draft` (`src/shared/contracts/common.ts:6`), and the test `domain-contracts.test.ts:28` is updated in the same reviewed change. **Not done.**

## D. CI and cross-platform verification

**The workflow, as checked on 27 Oct 2026 (no change needed for M3):**
- **Jobs:** `.github/workflows/ci.yml` runs a matrix of `macos-latest` and `windows-latest`, with `fail-fast: false`.
- **Steps, in order:**
  1. checkout and setup-node (Node 24, npm cache);
  2. `npm ci --ignore-scripts`;
  3. `npx install-electron` (a bin of `electron@45.0.0`);
  4. `npm run secrets:scan`;
  5. `npm run lint`;
  6. `npm run typecheck`;
  7. `npm run test:coverage`;
  8. `npm run test:smoke`, which runs `npm run build` and then the in-app smoke checks and the launch guard.
- **Script names:** every one exists in `package.json`.
- **Secrets:** the workflow references no secrets, variables or tokens, and its permissions are `contents: read`.
- **Binary rules:** the working-tree `.gitattributes` keeps all 9 binary rules; for those files `text` is unset, so `eol=lf` does not apply to them.

**Steps (each needs a person's authorisation where marked):**
- [ ] **Commit the `.gitattributes` line on the M3 branch, or integrate `cbe74e7` from `fix/windows-ci-eol`, before any push** *(person's decision)*. CI runs the committed tree, and `4f42849` still has `* text=auto`. Pushing it as it stands would repeat the Windows lint failure (AR-25).
- [ ] **Decide what to commit with it** *(person's decision)*. The uncommitted demo and documentation are not in CI unless committed.
- [ ] **Push the branch so CI runs** *(person's authorisation; not done)*.
- [ ] **Windows CI passes** secrets scan, lint, type-check, tests with coverage, build and smoke. **Never run.**
- [ ] **macOS CI passes on the M3 branch.** Only the M2 commit has run in CI.
- [ ] **Windows runtime** (dev and packaged) on real Windows 10/11 x64 machines (Q-D07). **Outstanding.**
- [ ] **macOS evidence at the floor chosen in DM-01**, on Intel and Apple Silicon (Q-D07, Q-M1-02). **Outstanding.**

**Gaps the current workflow cannot close.** These are listed for decision, not changed:
- Packaging (`build:mac`, `build:win`, `scripts/check-package.mjs`) is not run in CI.
- `npm audit` is not run in CI.
- GitHub-hosted images are not clean Windows 10/11 client machines, nor macOS at a chosen minimum version. TC-24 and TC-25 (clean installs) need real machines.
- Signing and notarisation remain blocked (S6).

**A passing workflow would establish CI results only.** It would not establish Windows runtime compatibility or any macOS floor.

## E. Formal M3 acceptance

- [ ] Sections B (decisions recorded and approved, then implemented), C and D are complete, or each remaining item is explicitly accepted in writing by its owner.
- [ ] Rule tables updated to the approved decisions in reviewed changes, with tests re-run.
- [ ] [M3_ACCEPTANCE_REVIEW §7](M3_ACCEPTANCE_REVIEW.md#7-m3-acceptance-criteria) A–F walked through and signed by the named reviewers (Tech, PO; Client for wording; Privacy/Sec for C-05 and PRIV-01).
- [ ] Known limitations (§7 F) fixed or accepted in writing. **None is accepted today.**

**Do not mark M3 accepted until every item above is recorded with its evidence.**

## Out of M3 scope: the M4 entry gate

M3 acceptance does **not** make M4 ready. M4 (storage, settings, SecretStore) must not start until all of these are complete. The M1 vault is an experiment and is **not production-approved**.

| Prerequisite | Record | Needs |
|---|---|---|
| Named independent security reviewer | Q-D08 | Client, PO |
| Independent review of the secret-vault design | Q-M1-01 | Security reviewer |
| Encrypted database with OS-protected keys approved, with the AR-13 key-loss consequence accepted | DM-02 | Security reviewer |
| Loss of the OS key store: recovery behaviour | Vault design L5; AR-13 | Security reviewer; PO |
| Rollback protection and keyring integrity | Vault design L1, L2 | Security reviewer |
| Same-user process access risk | Vault design L3 | Security reviewer |
| Windows credential-storage and file-system evidence | Q-M1-01 (outstanding items); Q-M1-02 | Tech, Client (machines) |
| Supervised macOS Keychain tests | Q-M1-03 | Tech, with a person present |
| Crash and power-loss testing | Vault design L7; Q-M1-01 | Tech |
| Retention period and deletion scope | Q-B06 | PO, Sec |
| Backup and restore | Q-B15 | Client |
| SQLite driver | DM-07 remaining item; E-03 | Project lead (DM-07); Tech (E-03) |

The details are in [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) (§0.2, §0.4, §0.5) and `docs/evidence/M1/Q-M1-01-secret-vault.md` (the L items).
