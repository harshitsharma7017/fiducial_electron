# Saved clients (M4 storage, first slice)

Status, 2 November 2026: **built and tested** in development and packaged macOS builds. Off by
default until the first release (5 November 2026); now on, behind the same switch as the insurer
portals (switched off with `FQF_INSURER_PORTALS=0`). Not yet run on
Windows outside CI, and the encrypted-storage design (DM-02, Q-M1-01) still awaits its independent
security review.

## What is saved

Decisions of 2 November 2026: start minimal, extend per insurer; encrypted SQLite; keep until the
advisor deletes.

| Part              | Fields                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| Health client     | name; mobile, email, notes (optional)                                  |
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

## Travel clients (kept apart from health clients)

Decision of 3 November 2026: travel clients are **separate records** from health clients, with
their own list (**Travel clients** screen; the client screen is now **Health clients**). Travel
e-proposals (Overseas Travel, Overseas Mediclaim B&H, SCHENGEN, Studies) run from a travel client;
health quotes and health e-proposals from a health client. The same person needing both is entered
in each.

- **What:** one traveller, who is the proposer and insured:
  - name, mobile, e-mail, notes, pincode;
  - date of birth (required: the forms price plans by age), gender, marital status;
  - occupation, as the travel forms list it (self-employed, unemployed, salaried, service,
    professional);
  - proposal details as for health clients (PAN, address, state, city, village, high risk, landline,
    CKYC and e-insurance numbers, nominee, intermediary's place), without the health occupation list;
  - passport: issuing authority, issue and expiry dates (the expiry after the issue).
- **The passport number is kept apart (decision of 3 November 2026),** like the Aadhaar number: in
  the secret vault, one entry per travel client named by a one-way hash of its id
  (`passport.<hash>`). Letters and digits, 6 to 12. The screens only learn its last four
  characters; only the main process reads it, to fill an insurer's form. It is never logged, and is
  removed with **Remove** or when the travel client is deleted. A travel client may also have an
  Aadhaar number, kept the same way as a health client's.
- **Where:** the same encrypted database, in its own `traveller` table (validated JSON). Kept until
  the advisor deletes it.
- **Upgrade (schema version 6):** adds the empty travel client table. Every existing client stays a
  health client; nothing is moved or removed.
- **The trip is not saved:** destination, dates, days and plan are entered for each proposal.

## Rural clients (kept apart from health and travel clients)

Decision of 4 November 2026: rural clients are **separate records**, with their own list on the
**Rural clients** screen. They are for New India's rural quote forms: Cattle Insurance, Farmers
Package, Livestock (BLDA scheme) and Cattle (Non-scheme).

- **The farmer:** name, mobile, e-mail, notes, pincode, and optionally:
  - date of birth, gender and marital status;
  - address;
  - the nominee: name, relationship and address.
- **Animals:** up to 20. Each has:
  - the kind: cattle, horse, donkey, pony, mule, yak, camel, pig, sheep or goat. Rabbits are not
    included, because New India insures them by batch.
  - for cattle, the type: buffalo, bullock, bull, calf or heifer, milch buffalo, milch cow, mithun
    or stud bull;
  - origin, gender, breed, colour and marks, and age in years and months;
  - tag number, purpose of use and market value;
  - optionally, sum insured, fitness certificate date and location of the stable.
- **Farm house** (Farmers Package), optional:
  - the sums insured on the dwelling and on its contents;
  - the house's identification number, location and description, and whether it is katcha;
  - the contents' description;
  - the farmer's existing physical disabilities.
- **Where:** the same encrypted database, in its own `rural_client` table (validated JSON). Kept
  until the advisor deletes it.
- **Upgrade (schema version 7):** adds the empty rural client table. Nothing is moved or removed.
- **Choices for each run are not saved:** scheme, claim ratio, BLDA beneficiary, policy start date
  and excess are entered for each quote.

## Marine clients (kept apart from the others)

Decision of 4 November 2026: marine clients are **separate records**, with their own list on the
**Marine clients** screen. Each is the policy holder of New India's Marine Specific Voyage form.

- **A business (organisation) or a person:**
  - name, mobile, e-mail, notes, pincode, address and PAN;
  - a business adds registration number and date, MSME or not, and type of organisation (from New
    India's list);
  - a person adds date of birth, gender and marital status.
- **Where:** the same encrypted database, in its own `marine_client` table (validated JSON). Kept
  until the advisor deletes it.
- **Upgrade (schema version 8):** adds the empty marine client table. Nothing is moved or removed.
- **The shipment is not saved:** it is entered for each quote.

## Property clients (kept apart from the others)

Decision of 4 November 2026: property clients are **separate records**, with their own list on the
**Property clients** screen. They are for New India's nine fire forms.

- **The owner:** a person or a business, with the same details as a marine client.
- **The property:** a home or business premises, with:
  - building name, landmark, address and pincode;
  - walls, floor and roof (pucca or kutcha);
  - year built, floors, the floor it is on, and height;
  - homes: carpet area and construction cost per sq. m;
  - sums insured: building, furniture, electrical, other contents (with a description), plant and
    machinery, stocks (with a description);
  - type of industry or occupation;
  - claims ratio and maximum ICR;
  - fire protection details, and the fire brigade's distance and response time;
  - answers to the forms' risk questions: lift, basement, fire hydrant or sprinkler, electrical
    upkeep, storm drain, security, basement use, water body, fire brigade access, central AC,
    unoccupied, mortgaged, past fire losses, insured before. Each can be left unanswered.
- **Where:** the same encrypted database, in its own `property_client` table (validated JSON). Kept
  until the advisor deletes it.
- **Upgrade (schema version 9):** adds the empty property client table. Nothing is moved or removed.

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
