# M3 Evidence — contracts and quote comparison

| | |
|---|---|
| Milestone | M3 (IMPLEMENTATION_PLAN §4 M3; status in §17) |
| Date | 27 October 2026 |
| Branch | `m3/contracts-comparison` (created from `37879c5`), **uncommitted working tree** |
| New dev dependencies | fast-check 4.10.0 (property tests), @vitest/coverage-v8 5.0.3 (coverage gate). Both pinned exactly; no new runtime dependency |
| Platform tested | **macOS 15.7.2, Apple M4 (arm64) only** |
| Not tested | Windows; CI (M3 changes have not been pushed or run) |
| Rules in force | `dm06-provisional` 0.1.0 (**provisional**) and `quote-input-placeholder` 0.1.0 (**placeholder**). Neither is approved; see OPEN_QUESTIONS §0.6 |

## Results

| Check | Command | Result | Raw |
|---|---|---|---|
| Unit tests with coverage gate | `npm run test:coverage` | **328/328 in 13 files**; `src/shared` 100% statements, branches (322/322), functions and lines | `raw/unit-tests-coverage.txt` |
| Type-check (node and web) | `npm run typecheck` | exit 0 | `raw/typecheck.txt` |
| Lint (ESLint `--max-warnings=0`, Prettier `--check`) | `npm run lint` | exit 0 | `raw/lint.txt` |
| Build and M2 smoke regression | `npm run test:smoke` | build exit 0; **13/13 checks; guard 3/3 refused** | `raw/smoke-dev.txt` |
| Dependency audit | `npm audit` | 0 vulnerabilities | `raw/audit.txt` |
| Secret scan | `npm run secrets:scan` | exit 0, no findings | `raw/secrets-scan.txt` |

The M2 packaging checks (`build:mac`, `build:win`) were **not re-run**. M3 adds no runtime code to the app bundle: no IPC channel imports the engine.

## Pre-commit review (27 October 2026)

**Defects found and fixed**, each with regression tests:

| # | Defect | Effect before the fix | Fix |
|---|---|---|---|
| 1 | The premium consistency check assumed total = base + GST for **every** basis | A GST-exclusive quote that showed its GST separately was reported as `PREMIUM_INCONSISTENT` (validity), so it **did not suppress** the highlight | The check now depends on the basis: base + GST for an inclusive total, base for an exclusive one, and no sum check when the basis is unknown. The result is now `PREMIUM_BASIS_NOT_RANKED` (eligibility) |
| 2 | An unreadable sum insured was a validity finding | A cheaper quote with an unreadable sum insured was dropped and another quote highlighted, whereas a *missing* sum insured suppressed the highlight | New comparability code `SUM_INSURED_UNPARSEABLE`, which suppresses like `SUM_INSURED_UNKNOWN` (the sum insured is part of the comparability key, ARCH §3.7) |

**Test-quality changes:**
- The order-independence property now uses true random permutations (`fc.shuffledSubarray`); the earlier deterministic pseudo-shuffle could leave the order unchanged.
- **Mutation check:** 12 deliberately injected rule bugs, each caught by 1–13 failing tests. The injected bugs were:
  - suppression disabled;
  - term differences ignored;
  - most expensive picked;
  - tie order changed;
  - tie rule ignored;
  - missing premium accepted;
  - duplicates accepted;
  - unknown sum insured matching;
  - unknown terms matching;
  - manual policy ignored;
  - any digit grouping accepted;
  - three decimals accepted.

  The sources were restored and verified byte-identical afterwards.

**Recorded, not changed (needs a PO decision):** validity exclusions do not suppress the highlight. These are duplicates, review flags such as `ambiguous_coverage`, and unreadable premiums (OPEN_QUESTIONS §0.6).

## What the tests cover

| Area | Tests |
|---|---|
| **Money** (`money.test.ts`) | Indian grouping, `₹`/`Rs.`/`INR`, `/-`, no-break spaces; rejections with reason codes (empty, negative, ranges, Western grouping, more than two decimals, non-ASCII digits, out of range); exact boundary at `MAX_SAFE_INTEGER`. **Properties:** format–parse round trip over the whole safe range, Indian-format shape, exact decimal parsing, Western grouping rejected, never throws |
| **Request validation, TC-01 to TC-03** (`quote-validation.test.ts`) | Valid and normalised input; invalid pincodes; age boundaries at 17, 18, 65, 66, 0, 25, 26, 80 and 81; contract bounds; relationships and counts; floater minimum and maximum; individual versus floater; sum insured as range (bounds, step, one paisa off) or list; tenure; invalid rule tables; customer normalisation; issues never echo values |
| **Pre-flight, TC-04** (`quote-validation.test.ts`) | A missing required field blocks only that insurer; a date of birth is always missing (C-05) |
| **Comparison, TC-09, TC-10, TC-27** (`comparison.test.ts`) | Normalisation never invents values; validity (status, premium missing, zero or negative, unparseable, inconsistent parts, currency, plan label, review flags, duplicates); eligibility (manual, GST basis, tenure); comparability (sum insured, cover type, members, tenure, unknown terms, add-ons, individual versus floater); co-pay, deductible and room-rent differences; selection (empty, too few, one-paisa difference, ties, refusing invalid premiums); both incomparable policies; no "best", "winner" or "recommend" wording; no sensitive values in output |
| **Determinism** (`comparison.test.ts`) | Same output for any order and subset of results (property, both policies); input not mutated; a highlighted result is never excluded and always has the lowest comparable premium |
| **Contracts** (`domain-contracts.test.ts`) | States match ARCH §3.4; progress events reject member data, OTPs, tokens and screenshots; adapter origins are HTTPS-only; members have no name, gender or DOB; result envelope invariants; fixed highlight label |
| **Lint** (`lint-rules.test.ts`) | Shared code rejects Electron and Node imports, `fetch`, `Date`, `Math.random` and `localeCompare` |

All fixtures are synthetic: placeholder insurer IDs (`insurer-a` and so on), invented ages and amounts. Values that look sensitive (for example `hunter2`) appear only in negative tests, which assert that they never reach the output.

## Limitations and open items

- **Contracts are draft.** The review and freeze have not happened.
- **Every business rule is provisional or a placeholder** (OPEN_QUESTIONS §0.6): Q-B01–B05, Q-B10 and Q-B16 are unanswered. The strict default makes unknown co-pay, deductible, room rent or add-ons non-comparable, so real results may never be highlighted until the terms are captured or the policy changes (AR-23).
- **Not modelled:**
  - infant ages in months;
  - age bands (members match on exact age);
  - conditional co-pay (recorded as unknown);
  - waiting periods and other benefits (the highlight compares premium only and makes no statement about coverage);
  - pincode serviceability.
- **CI:** the M2 commit ran once. macOS passed. Windows failed at lint, so the Windows type-check, tests and smoke have never run.
  - **Root cause, reproduced locally:** a CRLF checkout under `* text=auto` with no `eol`; Prettier then flags all 50 checked files (AR-25).
  - **Proposed separately:** `* text=auto eol=lf`.
  - M3 has not run in CI.
- **Windows runtime** is untested.
- **Not checked:** a `completed` result that carries an `errorCode` is accepted as completed. The contradiction is not flagged.
- **TC-01 "saved with stable ID"** is persistence (M4); M3 covers the schema level only.
- **Q-M1-01 and DM-02 remain unapproved.** M3 uses no storage.
