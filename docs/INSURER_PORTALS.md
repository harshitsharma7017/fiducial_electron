# Insurer portals: sign-in autofill (phase 1)

Status, 2 November 2026: **built and tested against local copies of the sign-in pages; not yet
verified with a real sign-in.** Off by default.

## Scope decisions (2 November 2026)

- **Quotes only.**
  - **What it automates:** getting premiums, from premium calculators, and from E-Proposal forms
    only up to the point where the premium shows.
  - **What it never does:** submit a proposal, create a customer, save a draft or start a payment.
  - **Later:** proposal submission would be a separate phase, after senior approval.
- **E-proposals, filled only (decision of 3 November 2026).** The app may fill an E-Proposal form
  from the saved client and then stops. The advisor completes it, checks it and presses Save As
  Draft or Submit. The app never presses them. The Aadhaar number is filled when saved for the client
  (kept apart in the secret vault: see `docs/CLIENTS.md`).
- **Product lines:** health, motor and travel.
  - **Health** uses the saved client data (members, ages, sum insured).
  - **Motor** uses a saved vehicle. Vehicles are kept on their own, not as part of a client
    (decision of 3 November 2026; see `docs/CLIENTS.md`).
  - **Travel** needs trip details (destination, dates, traveller ages), designed once the
    insurer's recorded forms show which fields are required.
- **Per insurer:** every product is recorded once with dummy data (form recorder), then automated
  and tested. United India first.

## United India: health quote (calculator)

Automated exactly as recorded on 2 November 2026, and nothing more (`src/main/quotes/`).
From the signed-in home page the app:
1. Opens the **Health Policy Premium Calculator** (a pop-up in the same session).
2. Chooses **Base** and **Floater**, the client's **sum insured** and the **pincode**.
3. Fills the **proposer**: date of birth (picked on the calendar), gender, marital status, and
   good health **No**, then **Ok**.
4. Adds the **spouse**, if any: date of birth, gender, relation, marital status, good health
   **No**, then **Ok** and **Save**.
5. Adds the **children**, if any, in **Add Children**. For each child it works in a new row, pressing
   **Add Child** only when there is no empty row: date of birth, gender, **Son** or **Daughter**,
   marital status **Unmarried**, and good health **No**, then **Ok**. Then **Save**.
6. Presses **Get Quote**, then **stops at "User Details"**. The advisor checks the email and mobile
   and presses **Check Premium**; the app never presses it.

**Refused before anything is touched, with the reason:**
- parents, individual cover, or Super Topup;
- a sum insured United India does not offer;
- a member's missing date of birth or gender, or the proposer's missing marital status;
- no good-health confirmation from the advisor, which is given for each quote and never stored.

United India's own ERRORS pop-up stops the run, and its message is shown.

**Verified:** against a local copy of the calculator built from the recordings (same ids,
calendar, pop-ups, and the child rows' shared radio name): the full flow for a couple with three
children, and a stop on United India's error message. **Not yet run on
the live portal.**

## United India: health e-proposals (filled, never saved)

Five forms, with the same sections I and II:
- **Family Medicare** and **Individual Health:** automated as recorded on 3 November 2026. Only the
  intermediary's declaration differs: section XI on Family Medicare, section X on Individual Health.
- **Arogya Sanjeevani** and **Super Top-up:** not recorded. The advisor says their forms are the
  same as Individual Health's. Their tiles' names come from the recorded home page, but not their
  pages' addresses or section numbers. So the app accepts any of United India's proposal pages
  (`/CustomerAppLive/data/Proposal…home.html`) and finds the intermediary's section by its name. If a
  tile opens some other page, the run stops and says which page it opened.
- **Yuvaan Health Insurance Policy:** not recorded. The advisor says it is the same as Arogya
  Sanjeevani; handled the same way (its tile's name from the recorded home page).

The app fills sections I, II and the intermediary's declaration; the advisor records the other
sections later. A client has a button for each form. From the signed-in home page the app:
1. Opens the form's tile (a pop-up, shown as a tab) and closes **Important Instructions**.
2. Chooses **Filled by: agent**, then a **New** proposal. "Filled by customer" opens a short form
   that sends the proposal to the client; the app never uses it.
3. **I. Proposer Details:**
   - **Is High Risk Customer?** It answers **No**, or **Yes** for a client marked high-risk. The
     advisor then chooses the risk type.
   - Name, date of birth (on the calendar) and gender.
   - Marital status: Single or Married only. Widowed or divorced is left to the advisor.
   - Occupation, PAN, Aadhaar (when saved), e-insurance account number, PIN code, address,
     landline, mobile, e-mail and CKYC number.
   - State, city and village, chosen by name among what United India's PIN lookup lists. A name it
     does not list is left to the advisor, who is told which; the run goes on.
4. **II. Nomination:** the nominee's name, relationship, address and contact number. Opening the
   section may make United India show its ERRORS pop-up for what section I still lacks. The app
   closes the pop-up once it has faded out, keeps the message (each one once), and goes on.
5. **Declaration from Intermediary** (XI, X, or found by name): the intermediary's place of signing,
   opened the same way.
6. **Stops.** The result lists what the advisor still fills by hand, with United India's messages:
   - anything the client record lacks (Aadhaar, the high-risk type, state, city or village, and
     so on);
   - a state, city or village United India's lookup did not list.

It never presses Save As Draft or Submit.

**Verified:** against local copies of both forms built from the recordings (same ids, duplicate
ids, models, option lists, calendar and ERRORS pop-up). The two forms give the same ids to
different radios, so the app picks them by value. The two forms not recorded are copies of
Individual Health with made-up page names and differently numbered sections. Checked for (Family
Medicare all, Individual Health the first three, Arogya Sanjeevani, Super Top-up and Yuvaan Health
the first two):
- a full client with Aadhaar: every field is filled, and only United India's message about section
  III is left;
- a sparse client: what it lacks is listed;
- high-risk clients with and without a type: the ERRORS pop-up fades out, is closed and listed;
- a village the lookup does not list: the advisor is told which.

Nothing is ever saved. **Not yet run on the live portal.**

## United India: Overseas Travel Insurance e-proposal (filled, premium read, never saved)

Automated as recorded on 3 November 2026 (`/CustomerAppLive/data/ProposalOTIhome.html`). A travel client
(docs/CLIENTS.md; kept apart from health clients) has an **Overseas Travel proposal** button. The
advisor enters the trip for that run: destination, sum insured, start date and days. The trip is used
for that proposal only, never saved. The traveller is the proposer and insured ("Self"); their
occupation and passport come from the travel client, the passport number read from the secret vault
for that run only, never logged or returned. From the signed-in home page the app:
1. Opens the **Overseas Travel Insurance E-Proposal Form** (a tab), chooses **Filled by: agent**,
   then a **New proposal**.
2. **I. General Information:**
   - Purpose (Business & Holiday, the only one listed), then destination.
   - Plan, by sum insured: plans B1–B4 for Worldwide, A1–A3 (up to 2,50,000) excluding USA and
     Canada.
   - Travel start date (calendar) and days.
3. **II. Proposer Information:**
   - Is High Risk Customer? and its type.
   - Title, worked out from gender, age and marital status. United India then sets the gender. A
     widowed or divorced woman's title is left to the advisor.
   - Name, PIN code, and state, district and village by name after the lookup.
   - Address, landline, mobile, e-mail, e-insurance account number, Aadhaar (when saved), PAN and CKYC
     number.
4. **III. Insured Information:**
   - Relationship **Self**: United India copies the title and name.
   - Occupation, date of birth (calendar), marital status, and the passport: number, issuing
     authority, issue and expiry dates (calendars), whichever the travel client holds. A passport that
     expires before the trip starts is refused before anything is filled.
   - The nominee. Relations the form does not list (in-laws, brother, sister) become **Others**.
5. **IX. Declaration from Intermediary:** the intermediary's place of signing. The hidden "filled by
   customer" form has a box with the same id; the visible one is filled.
6. **VIII. Premium Details:** presses **View Premium** and reads the total premium (including GST).
   If United India first lists what is missing, no premium is read and its message is listed.
7. **Stops**, showing the premium and listing what the advisor still does. The app never touches:
   - **IV. Medical History** and **V. Declaration**: the client's own answers and consent;
   - signatures and documents (uploads);
   - the payment mode;
   - anything the record or trip lacks.

It never presses Save As Draft or Submit. Opening a section may show United India's ERRORS pop-up;
it is closed and its message kept, as on the health forms.

**Verified:** against a local copy of the form built from the recording (same ids and duplicate ids,
lists loaded one after another, calendars, Self copying the proposer, ERRORS pop-ups, View
Premium). Checked for:
- a full client and trip: every field filled and the premium read, with the medical answers and
  payment untouched;
- excluding USA and Canada without a passport number: plan A3, no premium, and United India's
  reason listed;
- a sparse client: what it lacks is listed.

Nothing is ever saved. **Not yet run on the live portal.**

## United India: Overseas Mediclaim e-proposals, B&H, SCHENGEN and Studies (filled, premium read, never saved)

Automated as recorded for **B&H** on 3 November 2026 (`/CustomerAppLive/data/ProposalOMPBHhome.html`,
models under `OMPBHProposalFormData`). The advisor says **SCHENGEN** and **Studies** have the same
fields; they were not recorded. Their tiles' names come from the recorded home page. The app accepts
any of United India's proposal pages for them and finds fields by the end of their model names or by
id, so it does not depend on B&H's prefix.

A travel client has a button for each form: **Overseas Mediclaim B&H proposal**, **… SCHENGEN
proposal** and **… Studies proposal**. The advisor enters the trip for that run: destination, start
date, days and the plan's place in United India's list. None of this is saved. The traveller is the
proposer and insured ("Self"), with their date of birth (United India prices the plans by age),
occupation and passport from the travel client.
From the signed-in home page the app:
1. Opens the form's tile (a tab) and chooses **Filled by: agent** (and **New**, if offered).
2. **I. General Information:** destination, travel days, travel start date and the insured's date of
   birth (calendars). Then it presses **Click here to choose plan**:
   - United India lists the plans for that trip and age by code (A-1, A-2… with their premiums);
   - the app picks the one in the advisor's place, lowest first;
   - if fewer are offered, the run stops and says how many there are.
3. **II. Proposer Information:** as on the Overseas Travel form. The village box is `#villageCode`.
4. **III. Insured Information:**
   - **Self**, with the title and name filled. The form may already have copied them.
   - Occupation, marital status, nationality (Indian), the passport (as on Overseas Travel) and the
     nominee.
5. **X. Premium Details:** reads the total premium. The page repeats the id, and the total comes
   after the net premium. The result names the plan chosen, for example "plan A-2".
6. **Stops.** IX. Declaration from Intermediary has nothing to type here: its place is the
   proposer's city and the signature is an upload. The app never touches:
   - IV. Medical History, V. Assignment and VIII. Medical Examination;
   - signatures and documents;
   - the payment mode.

It never presses Save As Draft or Submit.

**Verified:** against local copies of the three forms built from the B&H recording. SCHENGEN and
Studies use made-up model prefixes and page names. Checked for:
- B&H and SCHENGEN with a full client: every field filled, the 2nd plan chosen, the total premium
  read;
- Studies, including USA, the 4th plan;
- a sparse client: what it lacks is listed;
- a plan place not offered: the run stops at the plan.

Nothing is ever saved. **Not yet run on the live portal**, and SCHENGEN and Studies not recorded.

## What it does

The advisor saves each insurer's user ID and password once. When they open that insurer's portal
from the app, the app fills both into the insurer's own sign-in page. The advisor completes any
CAPTCHA and presses the insurer's sign-in button. The app never presses it, and never reads or
solves a CAPTCHA.

| Insurer       | Sign-in  | What the app does                     | Advisor still does          |
| ------------- | -------- | ------------------------------------- | --------------------------- |
| United India  | password | fills user ID and password            | image CAPTCHA, LOGIN        |
| New India     | password | fills user ID and password            | "I'm not a robot", Login    |
| ICICI Lombard | password | fills user ID and password            | CAPTCHA, LOGIN              |
| Niva Bupa     | password | fills user ID and password            | checks the role, LOGIN      |
| Bajaj Allianz | password | fills user ID and password            | Sign In                     |
| HDFC ERGO     | password | types user ID, Tab, password on ⌘⇧L (Ctrl+Shift+L on Windows) | clicks Username first, then presses Login |
| Star Health   | OTP      | opens the portal only (OTP: later)    | signs in with the OTP       |
| Tata AIG      | OTP      | opens the portal only (OTP: later)    | signs in with the OTP       |

HDFC ERGO's portal is a Flutter app that draws its sign-in page on a canvas: there are no form fields
to find. So the advisor clicks into the Username box and presses the fill shortcut. The app then
types as a keyboard would, checking before each step:
- **Before the user ID:** the cursor is in an empty text box. Otherwise nothing is typed.
- **Before the password:** after Tab, the cursor is in an empty password box. Otherwise the password is
  not typed.

It never clicks. On HDFC's live page, with synthetic details and the network sealed, the user ID
and password appeared in the right boxes (2 November 2026).

The portal list and login types came from Fiducial. The form details came from a read-only
inspection of each public sign-in page (2 November 2026): the pages were loaded with no
credentials, and nothing was typed, clicked or submitted.

## Sessions (12 hours)

The advisor signs in once per insurer and keeps working in that portal, for as many quotes as
needed:

- **While the app is open:** the session is kept for up to 12 hours, even if the insurer's tab is
  closed. Closing the insurer's tab only hides it; **Show portal** brings back the same page.
- **After 12 hours:** the app ends the session and wipes that insurer's cookies and storage, even
  if the advisor is still working. The 12 hours count from the first open, not the sign-in. The
  next open starts at the login page, which the app fills again.
- **Sign out:** ends the session at once, with the same wipe.
- **Quitting or restarting the app:** the sign-in is kept for the rest of the 12 hours, so OTP
  portals do not need the client's OTP again. Most portals (Bajaj, United India) sign in with
  session cookies, which Electron never writes to disk. The app keeps them itself
  (`src/main/insurers/session-keeper.ts`):
  - **What:** only the session cookies, plus the page the insurer was on, so it reopens
    there and not on the login page.
  - **Where:** `<userData>/insurer-sessions/<insurer>.session`, encrypted with the OS key (the same
    key as the saved sign-in details), owner-only.
  - **When:** saved shortly after the portal's cookies or page change, only while the session runs.
    Put back at start-up.
  - **Deleted:** on sign out, after the 12 hours, or when a session is wiped at start-up. A file that
    cannot be read is deleted and ignored.

  Lasting cookies, site storage and the 12-hour clock are kept on disk as before. Expired sessions
  are wiped at start-up.
- **The insurer's own timeout still applies.** If a portal signs the advisor out after inactivity,
  it shows its login page and the app fills it again. The app does not keep sessions alive
  artificially.

Verified in the built app (scratch profile; Bajaj and New India login pages only, no sign-in):
- **Session clock:** it starts on open.
- **Session cookie kept:** Bajaj's session cookie had the same fingerprint (hash) after the window
  was destroyed and reopened.
- **Expiry:** a 13-hour-old session was wiped at start-up and logged `expired`; a 1-hour-old one
  was kept.
- **Sign out:** it wipes the session and clears the clock.
- **Quit:** closing the app window quits the app, even with an insurer window open.
- **Not verified:** hiding on the window's close button. Only a page-initiated close was tested,
  and it destroys the window; the session cookie was still kept.

## How to switch it on

```sh
npm run dev:prod
```

This is `npm run dev` with `FQF_INSURER_PORTALS=1` set, and works the same on macOS and Windows.
Without the variable the screen is hidden and every insurer channel refuses (`UNSUPPORTED_FLOW`).

## Safeguards

- **Storage:** sign-in details are kept only in the encrypted vault (`<userData>/secrets`), the
  AES-256-GCM vault proven in M1 (S5) on macOS and the Windows CI runner. Keys are wrapped by OS
  secure storage. If that is unavailable, nothing is saved; there is no plain-text fallback.
- **Read access:** the app screen can save and forget details, but never read them back. Only the
  portal window code in the main process reads them, just before filling.
- **Where filling happens:**
  - **Origin:** only on the insurer's exact sign-in origin and page (`mayFillLogin` in
    `src/shared/insurers/portals.ts`). The in-page agent checks the origin again before typing.
  - **Fields:** it needs exactly one visible user field, and one real password field.
  - **Advisor input:** it never overwrites what the advisor typed.
  - **Locked boxes:** United India locks its boxes until they are focused (against browser
    autofill). The agent focuses them as a click would; it never removes a lock itself, and a box
    that stays locked is refused.
- **Insurer pages (tabs of the app window, decision of 3 November 2026):**
  - **Where:** each insurer page is a separate view laid over the app window's content area
    (`src/main/insurers/portal-host.ts`), shown as a tab in the top bar. The pop-ups it opens
    (calculators, proposal forms) become more tabs of the same insurer, not windows. Only the shown
    tab is attached to the window; the others keep running in the background.
  - **Bridge and session:** each page has no preload and so no bridge to the app; it runs in its
    own process with its own session (partition), so being drawn inside the app window gives it no
    access to the app's page. Checked end to end: `node test/insurer-login-e2e/run-motor.mjs tabs`.
  - **Permissions:** permissions and downloads are denied; pop-ups are allowed only within the
    insurer's own origins, as tabs.
  - **Navigation:** pages may navigate only within the insurer's own origins, and sub-frames
    also to its CAPTCHA provider.
- **Logs:** only the insurer id and what happened (for example `filled`, `field-not-found`).
  Never a user ID, password or URL.

## Verified

| Check                                                                        | Result      |
| ---------------------------------------------------------------------------- | ----------- |
| Unit tests: registry rules, credential store on the real vault, service, IPC  | pass        |
| Vault (ported from M1, with `delete` added): 36 tests                         | pass        |
| Agent in Electron on local copies of the 5 forms, plus refusals (`test/insurer-login-e2e`) | 12 of 12 |
| Negative control: an agent that clicks sign-in is caught                      | caught      |
| Production build and smoke test (bridge shape, sandbox, CSP, demo isolation)  | pass        |
| Built app, scratch profile, real macOS secure storage: save, no plain text on disk, forget | pass |
| Live pages, no login saved: Bajaj redirect recognised as its sign-in page; New India reCAPTCHA loads | pass |

Run the agent check with `node test/insurer-login-e2e/run.mjs`.

## Not verified yet (needs the real passwords: the advisor does this)

For each of the five autofill insurers:
1. Run `npm run dev:prod`, choose **Save sign-in** and enter the real details.
2. Choose **Open portal**.
   - **Expect:** "Sign-in details filled".
   - **Then:** complete the CAPTCHA and sign in.
3. Record whether sign-in worked.
   - **If the portal rejects the details** although they are right, the form may not have
     registered them: report the insurer.
   - **If anything is blocked after sign-in** (blank page, a link that does nothing), note which
     insurer and what you clicked. The window allows only the origins listed in the registry.
     Post-sign-in pages may use others, which then need adding.

Known open points:
- **Niva Bupa:** the "I am an" role (Agent, Employee, …) is left to the advisor. Confirm which one
  Fiducial's ID uses.
- **New India:** reCAPTCHA asked for `storage-access`, which the window denies. If the checkbox
  keeps asking for image challenges, this permission may need to be allowed for that frame.
- **Windows:** not run on Windows yet. The vault itself passed on the Windows CI runner.
- **OTP (Star Health, Tata AIG):** a later phase. Who receives the OTP, and how, is still to be
  confirmed.
- **Quotes:** filling quote forms and reading premiums need each insurer's form walkthrough.
