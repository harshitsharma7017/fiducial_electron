# Open Questions and Decisions — Fiducial Quote Fetcher

| | |
|---|---|
| Date | 26 October 2026 |
| Extends | `18_GLOSSARY_AND_OPEN_QUESTIONS` and the open decisions in `14_RISKS_ASSUMPTIONS_ISSUES_DECISIONS`. Where a question already appears there, its original number is cited, e.g. "(18 Q9)" |
| Owner key | **PO** = product owner (Nitinthilak L) · **Client** = client representative (not yet named) · **Tech** = technical owner (Harshit Sharma) · **Sec** = security/privacy reviewer (not yet named) · **Release** = release owner |

"Blocks" refers to milestones in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## A. Must be answered before any implementation

| ID | Question | Why it matters | Owner | Blocks |
|---|---|---|---|---|
| Q-00 | **What is the revised delivery schedule and scope?** `15 §2` set feature freeze at 26 Oct 2026 12:00 and handover on 27 Oct 2026. The repository has no code as of 26 Oct 2026 | Neither date can be met. The scope for the first delivery must be agreed. The manual-first baseline is recommended | PO, Client | Everything |
| Q-01 | **Does an existing codebase, "frozen SDK" or set of Zod schemas exist elsewhere?** Docs 02, 03, 04, 15 and 16 defer to an existing repository, driver/CDP approach, helper library and smoke runner. None are in this workspace or in `../fiducial/` | If they exist, the plan must be re-based on them to avoid "a competing contract" (`04 §1`). If not, M3 creates the single contract | Tech, PO | M2, M3 |
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
| Q-B17 | **Local data protection:** is the OS account plus full-disk encryption (FileVault, BitLocker) acceptable for the SQLite database and evidence files, or are database encryption and an app lock required? `06 §1` names "unauthorized local access" as a threat but defines no control | AR-06; adding encryption later would require a data migration | Sec, Client | M4 |

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
| C-08 | **"Persistent session" vs. secret handling.** FR-05 requires persistent insurer sessions, which means Chromium stores authenticated cookies on disk. `05 §4` and `06 §3` forbid storing cookies in app data. They do not address the browser profile | Accept partition persistence, with cookie encryption enabled, a "Forget session" action and retention clearing. Record this as an accepted risk | Sec, PO |
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
| E-01 / Q-E01 | Electron version and **minimum OS versions** (18 Q5) | Use the latest stable Electron at M1. If it no longer supports macOS 12, **ask the PO to raise the floor** rather than pin an unpatched Electron | End of M1 (PO approves an OS-floor change) |
| E-02 | Build toolchain | electron-vite, electron-builder, TypeScript strict mode, Vitest, Playwright for Electron, and ESLint/Prettier/Husky matching the team's other repositories | M2 |
| E-03 | SQLite driver | better-sqlite3 if the S3 spike passes on all targets; otherwise `node:sqlite` | End of M1 |
| E-04 / Q-E04 | **Portal window UX**: insurer views embedded in the Connect board, or a separate "Insurer window" with one tab per insurer? | A separate window with tabs. It keeps untrusted content visually and technically apart from app UI and gives the advisor a full-size view for login, OTP and CAPTCHA | M5 (PO review of mock-up) |
| E-05 | State model | As in C-01 | M3 |
| Q-E06 | **Timeout semantics**: does the per-insurer timeout include time spent waiting for advisor login, OTP or CAPTCHA? | No. Use separate automation-step and advisor-wait timeouts, both configurable | M5 (PO confirms) |
| Q-E07 | **OCR** for HDFC ERGO's canvas UI | Defer. Add tesseract.js in a worker only if the HDFC spike shows it is necessary and the interaction is permitted | M9 |
| Q-E08 | UI component library | Radix with Tailwind and react-hook-form with Zod, matching the team's other frontends | M2 |
| Q-E09 | Documentation location and format | Keep the PDFs as the approved baseline; optionally move them to `docs/`. Record changes as new versions per `19`, not by editing the planning files | M0 (PO) |
| E-10 | Driver approach | In-process `webContents.debugger` (CDP). **No remote debugging port** in any shipped build | M1 |

## F. Assumptions this plan makes until told otherwise

1. Single advisor, single machine, no cloud sync, no app-level login (D-01, `14` assumptions).
2. Health insurance only (`01 §5`).
3. All eight insurers are **manual-only** until their gate in M8/M9 is passed.
4. Placeholder branding and legal text is clearly marked in builds until Q-B07 and Q-B08 are answered, and such builds are not for customer use.
