# M3 Decision Record — Template

Use one copy of the record below for **one** decision.
- **Valid decision IDs** are listed in [M3_DISCREPANCY_RESOLUTION.md §7](M3_DISCREPANCY_RESOLUTION.md#7-decision-log): Issues A–E, C1–C6, the Q-B items, C-04, C-05, DM-01, DM-06, PRIV-01, and the technical and wording items.
- **Background and options** for each decision are in [M3_STAKEHOLDER_BRIEF.md](M3_STAKEHOLDER_BRIEF.md) and [M3_DISCREPANCY_RESOLUTION.md](M3_DISCREPANCY_RESOLUTION.md).

This template records decisions; it does not make them. As provided it contains **no decisions**.

## How to use it

1. **Copy the blank record** (below the line) and fill in the decision ID, the question and scope, and the options considered **before** the discussion.
2. **Record only what the decision owner explicitly decides.** Do not infer a decision from:
   - current code behaviour;
   - a provisional rule;
   - a document, including these review documents;
   - silence or absence in a meeting.
3. **A decision is not approved until the appropriate person has explicitly approved it.** Change **Approval** to `APPROVED` only when all three are true:
   - the decision owner has recorded the decision;
   - **every** required reviewer has signed off;
   - each sign-off has its evidence reference (meeting note, email or signed form, with its location).
4. **Missing reviewer or evidence means the decision stays open.** If a required reviewer is unavailable or not yet named (for example, the privacy/security reviewer, Q-D08, or a product-knowledge reviewer), or the required evidence is missing:
   - leave **Status** `OPEN` and **Approval** `NOT APPROVED`;
   - write what is missing in "Blocked by".
   Do not substitute another person, and do not approve "subject to" later evidence.
5. **No implementation before approval.** Implementation tasks start only after Approval is `APPROVED`. Each is a separate, reviewed change that cites this record.
6. **Record a contract-version impact.** Any change to `src/shared/contracts/` after the freeze needs a `CONTRACTS_VERSION` bump (AR-24). Rule-table changes bump the rule's own `version` and `status`.
7. **Never edit a decided record to change its outcome.** To reverse or replace a decision, create a new record that names the one it supersedes.

**Status values:**
- `OPEN` (default): no decision recorded by the owner.
- `DECIDED`: the owner has recorded a decision; reviewer sign-off may still be pending.

**Approval values:**
- `NOT APPROVED` (default).
- `APPROVED`: only when rule 3 is met.

`DECIDED` with `NOT APPROVED` is a valid state, but it does not authorise any implementation.

---

## Decision record: `<Decision ID>`

| Field | Entry |
|---|---|
| **Decision ID** | |
| **Question and scope** | *(the exact question as recorded, and what is in and out of scope)* |
| **Options considered** | *(each option, with the reference to where it is described)* |
| **Final decision** | |
| **Rationale** | |
| **Decision owner** (role and name) | |
| **Required reviewers** (roles) | |
| **Evidence reviewed** | *(documents, data, test runs or product information actually examined; list it even when it is insufficient)* |
| **Blocked by** (if still open) | *(missing reviewer, missing evidence or dependency on another decision)* |
| **Approval date** | |
| **Implementation tasks** | *(rules, contracts, code, docs; each a separate reviewed change. None may start before approval)* |
| **Tests or verification required** | *(tests to add or update; CI, Windows or macOS runs; review checks)* |
| **Contract-version impact** | ☐ None ☐ Rule table only (rule `version` bump) ☐ Contract change before freeze ☐ Contract change after freeze (`CONTRACTS_VERSION` bump) ☐ Not yet known |
| **Status** | **OPEN** |
| **Approval** | **NOT APPROVED** |

### Reviewer sign-off

One row per required reviewer. A blank row means that reviewer has **not** approved.

| Reviewer role | Name | Approves / does not approve | Date | Evidence reference |
|---|---|---|---|---|
| | | | | |
| | | | | |

### Supersedes / superseded by

| Record | Relationship |
|---|---|
| | |

---

**Default state.** A record created from this template is `OPEN` and `NOT APPROVED` until rule 3 above is met. Filling in fields does not approve a decision. Neither does this template, the review documents, or a meeting taking place.
