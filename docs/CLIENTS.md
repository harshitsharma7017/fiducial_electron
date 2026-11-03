# Saved clients (M4 storage, first slice)

Status, 2 November 2026: **built and tested** in development and packaged macOS builds. Off by
default, behind the same switch as the insurer portals (`FQF_INSURER_PORTALS=1`). Not yet run on
Windows outside CI, and the encrypted-storage design (DM-02, Q-M1-01) still awaits its independent
security review.

## What is saved

Decisions of 2 November 2026: start minimal, extend per insurer; encrypted SQLite; keep until the
advisor deletes.

| Part              | Fields                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| Client            | name; mobile, email, notes (optional)                                  |
| Where             | pincode                                                                |
| Members (1 to 12) | relationship and age only: no names, gender or date of birth (C-05)    |
| Quote details     | cover type (floater or individual), sum insured, policy term (optional) |
| Proposal details  | proposer: PAN, address, state, city, village, occupation, high-risk type, landline, CKYC and e-insurance numbers, high-risk customer; nominee: name, relationship, address, contact; intermediary: place of signing (all optional; e-proposal forms, 3 November 2026) |

**The Aadhaar number is kept apart (decision of 3 November 2026).** UIDAI's rules ask that Aadhaar
numbers be kept in a separately secured store, so it is not in the client database:
- **Where:** the secret vault (AES-256-GCM, key wrapped by the OS), the same store as the insurer
  passwords, one entry per client. The entry is named by a one-way hash of the client id.
- **Checked:** 12 digits, not starting with 0 or 1, with a valid Verhoeff check digit.
- **Who sees it:** the screens only learn whether one is saved and its last four digits. Only the
  main process reads the whole number, to fill an insurer's form. It is never logged.
- **Removed:** with **Remove** on the client form, or when the client is deleted.

Since 2 November 2026, members may also have a date of birth and
gender, and the proposer a marital status (United India's calculator needs them).

A client with quote details is **Ready to quote**: `quoteRequestFor()`
(`src/shared/contracts/client.ts`) turns it into the quote request that quote automation will
use. Fields such as date of birth or gender are added per insurer only when that insurer's
recorded quote form requires them.

## Saved vehicles (kept on their own)

Decision of 3 November 2026: vehicles are **not part of a client**. They have their own list
(**Vehicles** screen), and motor quotes run from a vehicle.

- **What:** a name the advisor chooses (for example "Swift – Ramesh") and the details United
  India's Motor calculator asks for:
  - class, new or pre-owned, registration date, zone, IDV and OD discount;
  - the details its class needs: cubic capacity or horse power, seats, gross weight, type of bus or
    special vehicle, battery, long-term cover, claim and previous no-claim bonus.
- **No link to a client.** No owner details are stored with a vehicle.
- **Where:** the same encrypted database as clients, in its own `vehicle` table. It is kept until
  the advisor deletes it.
- **Upgrade from earlier versions (schema version 5):** each vehicle that was saved inside a
  client became a saved vehicle named after that client. Clients that held only a vehicle (no
  members) were removed, with any Aadhaar number saved for them. All of this happens in one commit:
  it all applies or none of it does.

Clients again need at least one member.

## How it is stored

| What               | Where                       | Protection                                                         |
| ------------------ | --------------------------- | ------------------------------------------------------------------ |
| Client database    | `<userData>/data/fqf.db`    | SQLCipher v4 encryption (SQLite3MultipleCiphers); `secure_delete` on |
| Database key       | `<userData>/secrets`        | Random 256-bit key in the vault (AES-256-GCM, key wrapped by the OS) |
| Commit ledger      | `<userData>/ledger`         | HMAC-authenticated sequence of acknowledged saves                  |

The three folders are owner-only. The SQLite files inside them are created with the default file
mode, but their contents are encrypted.

- **Durable saves:** when a save returns, it is in the database file (synchronous=FULL and a
  checkpoint per commit, from M1). A lost, older or swapped database file is **refused**, never
  silently used.
- **Key safety:** a database key is created only together with a new, empty database. If the
  database exists but its key is missing, the app refuses to open it rather than create a new key
  over the data.
- **Deletion:** removes the client and its members, and SQLite overwrites the deleted content.
- **Logs:** they record `client.saved`, `client.deleted` and storage problem codes. Never a name,
  phone number, email, pincode or age.

## Verified

| Check                                                                              | Result |
| ---------------------------------------------------------------------------------- | ------ |
| Client store: round trip, update, delete, restart, refusals (missing key, wrong key, lost ledger, older database, newer schema), validation, no plain text on disk | 19 tests pass |
| Durable commits ported from M1, including real process kills mid-commit            | 13 tests pass |
| Built app, real macOS secure storage: save, list, edit form, restart, delete; 306 profile files scanned, no plain text | pass |
| Packaged macOS app (arm64 and x64): package check (only the module's runtime files and binaries; no sources), fuses | pass |
| Packaged smoke test: the encrypted database opens and encrypts inside the fused app | pass |

## Not done yet

- **Using clients in quotes:** fetching quotes for a saved client needs the insurer quote-form
  walkthroughs (next step).
- **Retention period (Q-B06):** clients stay until deleted. An automatic period can be added once
  it is decided.
- **Backup and restore (Q-B15):** none yet.
- **Windows:** the native module ships in the Windows package, but the packaged Windows app has
  not been run.
