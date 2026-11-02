# Insurer portals: sign-in autofill (phase 1)

Status, 2 November 2026: **built and tested against local copies of the sign-in pages; not yet
verified with a real sign-in.** Off by default.

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
| HDFC ERGO     | password | opens the portal only                 | signs in by hand (see note) |
| Star Health   | OTP      | opens the portal only (OTP: later)    | signs in with the OTP       |
| Tata AIG      | OTP      | opens the portal only (OTP: later)    | signs in with the OTP       |

HDFC ERGO's portal draws its sign-in page on a canvas (Flutter), so there are no form fields to
fill.

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
- **Quitting the app:** ends the sign-in for portals that use session cookies (Bajaj does, and
  most likely others). Electron does not write session cookies to disk. The 12-hour clock and any
  lasting cookies or site storage are kept; expired sessions are wiped at start-up.
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
