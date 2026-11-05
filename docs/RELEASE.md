# Fiducial Quote Fetcher 1.0.0: release notes and install guide

First release, 5 November 2026. For Fiducial's advisors and whoever installs the app for them;
the last section is for the developers who make the next release.

## What the app does

The app keeps your clients, vehicles, properties and travellers on this computer (encrypted), opens
each insurer's portal inside the app, fills its quote forms from a saved record, and, where the
form shows one, reads the premium back. It never submits a proposal, saves a quote, or pays:
the last press on an insurer's site is always yours.

| Insurer | What the app does |
|---|---|
| United India | Health calculator; Family Medicare, Individual Health, Arogya Sanjeevani, Super Top-up and Yuvaan e-proposals (filled, never saved); Overseas Travel and Overseas Mediclaim e-proposals (premium read); motor calculator (premium read) |
| New India Assurance | Fills the quote forms: Private Car and Two Wheeler (vehicle details), 12 health policies, 3 travel, 4 rural, Marine Specific Voyage, 3 Personal Accident, 9 fire. You press Calculate Premium |
| Niva Bupa | Premium calculator for ReAssure 2.0, ReAssure 3.0 and Health Recharge: fills everything, presses Calculate Premium, reads the premium |
| HDFC ERGO | PIE forms, new business: Private Car, Two Wheeler, GCV, PCV, Tractor, MST, Optima Secure, Optima Restore, Energy, Retail Travel; premium read |
| Bajaj Allianz, ICICI Lombard | Opens the portal and fills your sign-in details |
| Star Health, Tata AIG | Opens the portal (they sign in with an OTP, which you enter) |

Signed-in portals are kept signed in while you are away from them, for up to 12 hours; the app
then signs out and wipes that insurer's session.

## Install

**macOS** (Apple Silicon: `Fiducial Quote Fetcher-1.0.0-arm64.dmg`; Intel:
`Fiducial Quote Fetcher-1.0.0.dmg`):
1. Open the .dmg and drag **Fiducial Quote Fetcher** to **Applications**.
2. Open it from Applications. This release is not signed by Apple yet, so macOS stops it the
   first time ("cannot be opened because Apple cannot check it", or "unidentified developer").
   Open **System Settings → Privacy & Security**, scroll to the message about Fiducial Quote
   Fetcher, and choose **Open Anyway**, then **Open**.
3. If macOS instead says the app "is damaged and can't be opened", that is the same missing
   signature. In Terminal, run
   `xattr -dr com.apple.quarantine "/Applications/Fiducial Quote Fetcher.app"`, then open it.
4. When macOS asks whether Fiducial Quote Fetcher may use **"Fiducial Quote Fetcher Safe
   Storage"** in your keychain, choose **Always Allow**. The app keeps its encryption keys there.
   An unsigned app asks again after each update; choose Always Allow again.

**Windows** (`Fiducial Quote Fetcher Setup 1.0.0.exe`, 64-bit):
1. Run the installer. Windows SmartScreen may say "Windows protected your PC" because the
   installer is not signed yet: choose **More info**, then **Run anyway**.
2. Install for your user (the default), in the suggested folder or another.

## First run

1. **Insurers:** for each insurer, choose **Save sign-in** and enter your user ID and password.
   They are encrypted with this computer's secure storage and never leave it.
2. **Open portal:** the app fills the sign-in form; you complete any CAPTCHA or OTP and sign in.
3. Add your **clients** (health), **vehicles**, **travellers**, **rural**, **marine** and
   **property** clients, then choose **Get quote** on a record and pick the insurer's product.
4. HDFC ERGO: open any product once from HDFC's 1up (Issue Quotes & Policy), so the tab is signed
   in to PIE; the app then opens the forms it needs.

## Where things are kept

| | macOS | Windows |
|---|---|---|
| Clients, sign-ins, sessions, recordings | `~/Library/Application Support/Fiducial Quote Fetcher` | `%APPDATA%\Fiducial Quote Fetcher` |
| Log file (for support) | `~/Library/Logs/Fiducial Quote Fetcher/fqf.log` | `%APPDATA%\Fiducial Quote Fetcher\logs\fqf.log` |

- **The log** records what the app did (for example "quote run ready", "sign-in filled"),
  never a client's details, a password or a web address. It is kept to about 10 MB (the current
  file and four older ones).
- **Backups:** quit the app and copy the data folder. The encryption keys are kept by the
  operating system for your user account (macOS keychain, Windows DPAPI). A backup can be read
  only by the same user on the same computer; it is a safeguard against deleting files, not a
  way to move clients to another computer.
- **Uninstalling** leaves the data folder. Delete it to remove every client and sign-in.

## Updating

Install the new version over the old one: clients, sign-ins and sessions are kept. On macOS,
allow the keychain again (Always Allow) after the update, as above.

## Check each automation in the first week

Every automation was built from recordings of the insurers' own forms and checked against local
copies of those forms. Most have not yet been run end to end on the live sites, and the insurers
change their forms. In the first week, have an advisor run each product you use once, with a
real client, and note:
- the result the app shows (ready, or where it stopped and why);
- the premium against the one on the insurer's page;
- anything the app listed under "Still to do by hand" that it should have done.

Report anything that stops, with the insurer, product and the message the app gave. Where a
form was not recorded up to its premium, the app says so and stops safely:
- HDFC ERGO: Energy, Optima Secure, Optima Restore, Retail Travel;
- Niva Bupa: Health Recharge;
- New India: steps after the form opens are filled, never calculated.

## Known limitations of 1.0.0

- **Unsigned** on macOS and Windows: the warnings above, and the keychain question after each
  macOS update. Signing needs an Apple Developer ID (with notarization) and a Windows
  code-signing certificate.
- **No automatic updates:** new versions are installed by hand.
- **No app icon yet:** the app uses Electron's default icon.
- **Windows** has been checked by the automated builds, not yet by an advisor on a Windows PC.
- **OTP insurers** (Star Health, Tata AIG) and HDFC ERGO's own renewals (they need the old policy
  number) are not automated.
- **Sessions:** a portal that ends every session after a fixed time of its own still signs you
  out; the app fills the sign-in again.

## Support switch

To start the app with every insurer and client feature switched off (for example while looking
into a problem), start it with the environment variable `FQF_INSURER_PORTALS=0`. Nothing is
deleted; start it normally to switch them back on.

## Making a release (developers)

1. Set the version in `package.json` (and `package-lock.json`'s own version), and commit.
2. Push a tag `vX.Y.Z` (for example `git tag v1.0.0 && git push origin v1.0.0`). The `release`
   workflow (`.github/workflows/release.yml`) checks the code on macOS and Windows, builds the
   installers, checks each package (contents, security fuses, no demo code), runs the smoke test
   on the packaged app, and drafts a GitHub release with the installers attached.
3. Check the draft (download, install, open) and publish it.

Running the workflow by hand (Actions → release → Run workflow) gives the installers as
artifacts without a release. Locally, `npm run build:mac` builds and checks the macOS installers;
the Windows installer has to be built on Windows (the encrypted database module is not
cross-compiled). Never change `appId` (`in.fiducial.quotefetcher`): the operating systems would
treat the app as a different one.
