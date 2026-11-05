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

## New India: health quote forms (filled, never calculated)

Built from the recording of 4 November 2026 (`new-india-2026-11-04T09-24-53-914Z`). In it, the
advisor opened the quote form of every New India health policy from the dashboard, opened its
sections and added its members. Nothing was typed and no premium was worked out, so two things are
assumed:
- dates of birth are typed as dd/mm/yyyy (the boxes are labelled so and are not read-only);
- each dashboard tile reads as the form's heading without "Insurance", or without the
  "(Cashless facility available)" note.

The twelve policies:
- Arogya Pragati Plus, Arogya Sanjeevani, Jan Arogya Bima, Janata Mediclaim;
- Asha Kiran, Cancer Guard, Criti Protect, New India Mediclaim;
- Premier Mediclaim, TOP-UP Mediclaim, Universal Health Insurance Scheme (APL), Yuva Bharat.

A health client has a **New India health quote** button. The advisor picks the policy and may
confirm good health for that quote. From the dashboard (or with the form already open) the app:
1. Opens **HEALTH**, then the policy's tile. Before Premier Mediclaim, New India asks whether anyone
   has a listed condition:
   - with the good health confirmation, the app answers **No**;
   - without it, the run is refused before anything is touched.
2. Opens each section only if it is closed. The section links toggle, and a count follows their
   text.
3. Fills what the client record answers:
   - the policy period (2 or 3 years);
   - Arogya Sanjeevani's pincode, choosing the first postal code New India lists;
   - the floater sum insured (Arogya Sanjeevani, Asha Kiran, Yuva Bharat), or each member's sum
     insured on individual cover (Janata, New India Mediclaim);
   - each member through its own **Add …** button, with the date of birth;
   - each member's gender (Cancer Guard);
   - "Normal" as the dependent type of a child under 18;
   - "No" to diabetes and hypertension (Arogya Sanjeevani, with the confirmation);
   - Criti Protect: the proposer only, with the type of member, good health and the sum insured
     in lakhs.
4. **Stops**, and lists what is left to the advisor: threshold limits of the top-ups, plans, zones,
   payment frequency, smoking and tobacco, earning member and occupation, height and weight, and
   New India's terms box.

It never presses **Save & Calculate Premium** (that saves a quote on New India) or **Continue**.
A member the form does not take (a son on Asha Kiran, parents-in-law outside Arogya Sanjeevani) is
refused with the reason.

**Verified:** against local copies of five of the forms (Arogya Sanjeevani, Jan Arogya Bima,
Premier Mediclaim, Cancer Guard, New India Mediclaim) and the dashboard
(`npm run test:nia -- health`). **Not yet run on the live portal.**

## New India: overseas travel quote forms (filled, never calculated)

Built from the recording of 4 November 2026 (`new-india-2026-11-04T09-43-08-482Z`). In it, the
advisor opened each form from the dashboard, clicked through its trip choices and opened its
sections. Nothing was typed and no premium was worked out. As with the health forms, dates are typed
as dd/mm/yyyy, and each tile is assumed to read as the form's heading without "Insurance".

The forms:
- **Overseas Mediclaim (Employment & Studies):** destination, studies or employment, leaving date,
  duration in months (New India works out the return date) and date of birth. Then the plans New
  India offers for them, picked by place (D, D1…).
- **Overseas Mediclaim (Business & Holiday):** destination E-1 or E-2 CFT, business or holiday,
  leaving date and date of birth. This form has Travel Details only.
- **Overseas Travel Ease (Business & Holiday):** destination, purpose, leaving and return dates,
  date of birth and the plan by sum insured (Basic $25,000 to Supreme $5,00,000).

A travel client has a **New India travel quote** button. The advisor picks the form and enters the
trip for that run; the trip is not saved. The advisor also confirms New India's question.
1. **The pre-existing illness question.** On the dashboard, before any travel form opens, New
   India asks whether anyone has a pre-existing illness, disease or disability, or has had an
   accident. It does not sell to them online.
   - With the advisor's confirmation, the app answers **No**.
   - Without it, the run is refused before anything is touched.
2. **The PAN question.** On Employment & Studies and Travel Ease, New India then asks whether the
   client has a PAN, with the client's consent for KYC. The app stops there and says so. The
   advisor answers it and presses Fill again; the run carries on in the open form.
3. **What it fills:**
   - **Travel Details:** the trip and the date of birth.
   - **Policy Holder Information, as a new customer:**
     - title, from gender and marital status;
     - first, middle and last name, split from the saved name;
     - gender, date of birth, the address line, mobile, e-mail, landline and e-insurance account.
   - **Traveller Details:**
     - occupation, only Professional (New India's list differs from the travel client's);
     - passport number (8 characters at most) and expiry date;
     - on Travel Ease, the passport as the ID document.
   - **Other Details:** the nominee's name and relationship; relationships New India does not list
     go in as "Others".
4. **Stops**, and lists what is left:
   - state, city and PIN code;
   - bank details and their declaration;
   - visa, sponsor and university;
   - the overseas address;
   - the nominee's date of birth;
   - an active New India policy.

It never presses **Save & Calculate Premium** or **Calculate Premium**, and never answers the PAN
question, the bank details or any consent.

**Verified:** against local copies of the three forms and the dashboard
(`npm run test:nia -- travel`). Checked for:
- the illness question answered;
- the PAN question stopping the run, then the run carrying on after it is answered;
- each form filled;
- a plan place New India does not offer stopping at Plan;
- a run without the confirmation refused.

**Not yet run on the live portal.**

## New India: rural quote forms (filled, never calculated)

Built from the recording of 4 November 2026 (`new-india-2026-11-04T09-57-52-227Z`). In it, the
advisor opened four rural forms, answered New India's PAN question, and opened their sections and
lists. Nothing was typed and no premium was worked out, so dates are typed as dd/mm/yyyy.

A rural client (see CLIENTS.md) has a **New India rural quote** button. The advisor picks the form
and enters that run's choices:
- **Cattle Insurance** (tile "Cattle"): the scheme and, optionally, the claim ratio. The app chooses
  **New Quote/Policy issuance** and ticks **Cattle** and/or **Calf Heifer Insurance** to match the
  animals. The animals' own fields under those boxes were not recorded, so they are listed for the
  advisor.
- **Farmers Package** (tile "Farmers Package Insurance"): the policy start date and the excess. The
  app fills:
  - Risk Details: disabilities, the nominee, the sums insured on the dwelling and contents;
  - Fire Allied Perils Earthquake: the house's identification, location and description, katcha
    or not, and the contents.
- **Livestock (BLDA scheme)** and **Cattle (Non-scheme)**: the recording shows no heading or tile
  name for these, so the advisor opens the form, and the app recognises it by its **Add Animal** or
  **Add Cattle** button.
  - **Livestock (BLDA):** the BLDA scheme, the beneficiary type and, optionally, the claim ratio.
    Then one row per animal through **Add Animal**, each with its kind's own fields.
  - **Cattle (Non-scheme):** the scheme. Then one row per head of cattle through **Add Cattle**:
    type, gender, age, origin, breed, purpose, tag, fitness certificate date and market value.
- **On every form:** Policy Holder Information as a new customer, as on the travel forms. The two
  unnamed forms use another version of that section, so a field there that is not found is listed
  rather than stopping the run.
- **New India's PAN question** includes the client's KYC consent, so it is left to the advisor. The
  run stops with a note; the advisor answers it and presses Fill again, and the run carries on in
  the open form.
- **Refused, with the reason:** animals a form does not take. Cattle Insurance and the Non-scheme
  form are for cattle only, and the Non-scheme form lists fewer types.

It never presses **Save & Calculate Premium**, **Approve** or **Send Quote**.

**Verified:** against local copies of the four forms and the dashboard
(`npm run test:nia -- rural`). Checked for:
- the PAN question, at New Quote and when the form loads;
- each form filled;
- the unnamed forms refused from the dashboard;
- cattle-only forms refusing other animals.

**Not yet run on the live portal.**

## New India: Marine Specific Voyage (filled, never calculated)

Built from the recording of 4 November 2026 (`new-india-2026-11-04T10-22-36-040Z`). In it, the
advisor opened the form from the dashboard (MARINE, Specific Voyage), looked at the policy holder as
an individual and as an organisation, and opened its sections. Nothing was typed and no premium was
worked out, so dates are typed as dd/mm/yyyy.

A marine client (see CLIENTS.md) has a **New India Specific Voyage quote** button. The advisor
enters the shipment for that quote; it is not saved. The app fills:
- **Policy Holder Information**, as a new customer:
  - a business: the Organization category, business name, registration number and date, MSME,
    type of organisation, address, mobile, e-mail and PAN;
  - a person: as on the travel forms.
- **Transit Details:**
  - type of voyage, start date, transit type and mode of transport;
  - from and to country, picked from New India's suggestions;
  - ports, bill type, number and date, mark number, and whether the certificate shows the premium.
- **Cargo Details:**
  - cargo type, sum insured, rate and % extra;
  - invoice number and date;
  - excess (applicable on, %, minimum);
  - the Inland Transit Clause A, B or C.

Some lists may depend on the type of voyage. A transit type, mode, country or clause New India does
not offer is listed for the advisor rather than stopping the run. Also left to the advisor:
- the cities, packaging, basis of valuation, state, PIN code and GST;
- the bank details;
- Vessel Details.

It never presses **Save & Calculate Premium** or **Approve**.

**Verified:** against a local copy of the form and the dashboard (`npm run test:nia -- marine`).
Checked for:
- a business with a full shipment;
- a person, with a country New India does not list;
- a start date in the past, refused.

**Not yet run on the live portal.**

## New India: Personal Accident forms (filled, never calculated)

Built from the recording of 4 November 2026 (`new-india-2026-11-04T10-41-14-769Z`). In it, the
advisor opened three forms from the dashboard (PERSONAL ACCIDENT, then the policy's tile), answered
the PAN question, and opened their sections. Answering "Yes" to a claim in the previous three years
brought New India's alert that the policy cannot be issued through the portal. Nothing was typed and
no premium was worked out, so dates are typed as dd/mm/yyyy.

They run from a **health client**: its proposer ("Self") is the insured. The **New India PA quote**
button takes:
- the policy: Janata PA Sukshma Bima, Personal Janta or Pension Protect;
- that run's choices: sum insured, status, years and excess, or the monthly pension and the
  organisation before retirement;
- two confirmations: no claim in the previous three years (required, as New India refuses
  otherwise), and no physical disabilities or defects.

The app fills:
- the policy holder, as on the travel forms;
- the previous claim (No) and the duration;
- the insured's status, date of birth and gender;
- the occupation, when the client's matches New India's Gramin list;
- disabilities ("None") or physical defects (No), with the confirmation;
- the nominee, within New India's lengths: 20 characters for the Janata forms' name;
- the sum insured and excess;
- Pension Protect: new policy, the insured's name and date of birth, the monthly pension and the
  organisation.

Left to the advisor:
- the type of group;
- the owner or beneficiary;
- details of relationship;
- the nominee's date of birth;
- the medical certificate and special conditions;
- the bank details.

It never presses **Save & Calculate** (**Save & Calculate Premium**) or **Approve & Pay**.

**Verified:** against local copies of the three forms and the dashboard (`npm run test:nia -- pa`).
Checked for:
- each form filled;
- the PAN question stopping the run, then the run carrying on after it is answered;
- a run without the no-claims confirmation, refused.

**Not yet run on the live portal.**

## New India: fire forms (filled, never calculated)

Built from the recording of 4 November 2026 (`new-india-2026-11-04T10-59-31-695Z`). In it, the
advisor opened nine forms from the dashboard (FIRE, then the policy's tile) and opened their
sections. Nothing was typed and no premium was worked out.
- **Homes:** Bharat Griha Raksha, Flexi Griha Raksha, Flexi Griha Raksha (Long Term).
- **Business premises:** Bharat Sookshma Udyam Suraksha, Flexi Sookshma Udyam, Bharat Laghu Udyam
  Suraksha, Flexi Laghu Udyam Suraksha.
- **Either:** Standard Fire and Special Perils, Standalone War.

A property client (see CLIENTS.md) has a **New India fire quote** button. The advisor picks the
form and the cover: building and contents, building, contents, or (business) with stocks.

**How the fields are found:** the forms ask much the same, under different field ids and
spellings. The app keeps, for each form, the fields it showed in the recording
(`src/main/quotes/nia-fire-fields.ts`, generated from it). Each property detail goes into the field
its form has; a detail the form does not ask is skipped.

The app:
1. Fills the owner, as on the marine form.
2. Opens every closed section, never closing an open one.
3. Fills what the property client holds:
   - the type of policy and the cover;
   - location, building and sums insured;
   - construction, year and age, floors and height;
   - the industry and the risk answers;
   - fire protection;
   - mortgage and past losses.

A field the form asks but the client lacks is listed for the advisor, along with:
- the earthquake state and district;
- the pre-acceptance inspection;
- the add-on covers and the remaining underwriting questions.

It never presses **Save & Calculate Premium**. A home form for business premises, a business form
for a home, or stocks for a home is refused with the reason.

**Verified:** against local copies of the nine forms, drawn from the recording's fields and lists,
and the dashboard (`npm run test:nia -- fire`). Checked for:
- a home on Griha Raksha;
- a business on Flexi Laghu Udyam, Standard Fire and Standalone War;
- a refusal.

**Not yet run on the live portal.**

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
