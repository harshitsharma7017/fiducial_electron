# Insurer portals: sign-in autofill (phase 1)

Status, 2 November 2026: **built and tested against local copies of the sign-in pages; not yet
verified with a real sign-in.** Off by default.

## Scope decisions (2 November 2026)

- **Quotes only.**
  - **What it automates:** getting premiums, from premium calculators, and from E-Proposal forms
    only up to the point where the premium shows.
  - **What it never does:** submit a proposal, create a customer, save a draft or start a payment.
  - **Later:** proposal submission would be a separate phase, after senior approval.
- **Product lines:** health, motor and travel.
  - **Health** uses the saved client data (members, ages, sum insured).
  - **Motor** needs vehicle details, and **travel** needs trip details (destination, dates,
    traveller ages). Their client records are designed once each insurer's recorded forms show which
    fields are required.
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

- **While the app is open:** the session is kept for up to 12 hours, even if the insurer window is
  closed. Closing hides the window; **Show portal** brings back the same page.
- **After 12 hours:** the app ends the session and wipes that insurer's cookies and storage, even
  if the advisor is still working. The 12 hours count from the first open, not the sign-in. The
  next open starts at the login page, which the app fills again.
- **Sign out:** ends the session at once, with the same wipe.
- **Quitting or restarting the app:** the sign-in is kept for the rest of the 12 hours, so OTP
  portals do not need the client's OTP again. Most portals (Bajaj, United India) sign in with
  session cookies, which Electron never writes to disk. The app keeps them itself
  (`src/main/insurers/session-keeper.ts`):
  - **What:** only the session cookies, plus the page the insurer window was on, so it reopens
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
FQF_INSURER_PORTALS=1 npm run dev
```

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
- **Portal windows:**
  - **Bridge and session:** each window has no bridge to the app, and its own in-memory session
    (the sign-in is forgotten on quit).
  - **Permissions:** permissions and downloads are denied, and popups are blocked.
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
1. Run `FQF_INSURER_PORTALS=1 npm run dev`, choose **Save sign-in** and enter the real details.
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
