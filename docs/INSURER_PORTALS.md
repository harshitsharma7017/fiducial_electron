# Insurer portals: sign-in autofill (phase 1)

Status, 2 November 2026: **built and tested against local copies of the sign-in pages; not yet
verified with a real sign-in.** On by default since the first release (1.0.0, 5 November 2026);
`FQF_INSURER_PORTALS=0` switches it off.

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
6. Presses **Get Quote**, fills **User Details** with the client's own e-mail and mobile, presses
   **Check Premium** (decision of 11 November 2026: United India may send the quote to that e-mail
   and mobile) and reads the premium. What United India shows after Check Premium was not
   recorded: if the premium is not found, the run says what the page showed instead.

Before a United India run, the quote drawer asks for any detail the form requires that the
client's record lacks (e-mail, mobile, marital status, occupation, PAN, Aadhaar or passport number,
state, city, village, address, nominee, the intermediary's place), saves it to the client, and the
run fills it (src/shared/insurers/uiic-required.ts).

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

## Niva Bupa: premium calculator, ReAssure 2.0, ReAssure 3.0 and Health Recharge (premium worked out)

Built from the advisor's path in the recording of 5 November 2026
(`niva-bupa-2026-11-05T08-20-27-977Z`), made with the recorder that sees Ionic's controls. The
earlier recording (`07-37-29-027Z`) and the advisor's screenshots show the same first step. The
calculator is built with Ionic and Angular Material:
0. **UNO's home page** (`#/landing-page`): the **Premium Calculator** tile.
1. **Basic Details:**
   - **I Know My Plan:** the toggle then reads "Plan Recommendation". The plan is chosen by name in
     a box suggesting plans: "ReAssure2.0 Individual", "ReAssure2.0 Family Floater".
   - **Members:** Adult and Child counters. The date of birth boxes are read-only, so the date is
     picked in Material's calendar, and Niva Bupa then shows it month first without zeros
     (8/1/1981). An Individual plan asks one box per member ("Adult1 DOB"); a Family Floater asks
     only one ("Eldest Member DOB").
   - **Customer's details:** the city (suggested) and "Phone no. (optional)".
   - **Three NO/YES questions:** transferring a current policy (YES adds "Previous Policy End
     Date"), a medical practitioner among the insured, "Only for Child Policy". Then Continue.
2. **Customize Your Plan** (`third-step`):
   - the sum insured (₹ 500,000 to ₹ 10,000,000);
   - the policy period, whose radios show the premium ("1 Year ₹…");
   - the Acute Care Option, Room Category and Deductable dropdowns;
   - **Key Add-Ons:** "+ Add" in each add-on's row. Tiered Network's row has "Show more", which
     opens a list to opt in.

   The footer reads Continue, and Calculate Premium once Key Add-Ons is scrolled to. Calculate
   Premium works the premium out again and shows it by the policy period. The Continue after it
   leads to a summary asking the customer's name, email and phone.

A health client has a **Niva Bupa health quote** button. The advisor chooses:
- the plan, sum insured and policy period;
- the add-ons: the two seen in the recording (Safeguard, Prolonged treatment assistance cover), or
  others typed as Niva Bupa names them;
- Tiered Network, a medical practitioner, and a transfer with the previous policy's end date.

From UNO's home page (or the calculator's first step), the app does all of the above, presses
**Calculate Premium** and reads the premium with its policy period. It never presses the Continue
after it.
- **Plan:** Individual for one member, Family Floater for several.
- **Dates of birth:** eldest first. On a Family Floater only the eldest member's box is asked, and
  the app skips the boxes Niva Bupa does not show.
- **Questions:** answered from the advisor's choices; "Only for Child Policy" is answered NO.
- **Left as Niva Bupa sets them:** Acute Care Option, Room Category and Deductable. They are listed
  for the advisor to check.

**Health Recharge (top-up):** not in the recording. The app picks "HealthRechargeV2 …" (or "Health
Recharge …") in the plan box when Niva Bupa offers it. Boxes of its own that the app does not know
stop the run at Continue, with Niva Bupa's message.

The run refuses or stops with the reason:
- a page that is neither UNO's home page nor the calculator's first step;
- a client without an adult or without dates of birth, or an "adult" under 18;
- a plan, sum insured or policy period Niva Bupa does not offer (with what it does offer);
- the counters' limit.

An add-on not found as written is listed for the advisor, and the run goes on.

**Verified:** against a local copy of the calculator, with Material calendars and Ionic dropdowns
and radios as custom elements with shadow roots (`npm run test:nia -- niva`). Checked for:
- a family floater from the home page, with add-ons and Tiered Network;
- an individual with a transfer and a practitioner;
- a plan and a sum insured not offered;
- the counters' limit;
- a refusal on another step;
- the premium read matching the one shown;
- the recorder seeing the dropdowns, their captions and a click on one.

**Not yet run on the live portal.**

## HDFC ERGO: PIE motor, health and travel forms, new business (premium worked out, never saved)

Built from the recordings of 5 November 2026 (`hdfc-ergo-2026-11-05T11-37-58-944Z`, motor;
`hdfc-ergo-2026-11-05T11-50-09-251Z`, health). HDFC's 1up portal is a Flutter app drawn on a
canvas. A product tile signs the tab in to **PIE** (`pie.hdfcergo.com`), where the quote forms are
ordinary AngularJS forms.

**Opening a form** (request of 24 November 2026):
- **From 1up's home page,** the app opens PIE itself, as the advisor does: **Issue Quotes & Policy**,
  then **Private Car** (any product signs the tab in). It turns on Flutter's semantics (the page's
  "Enable accessibility" placeholder, as a screen reader would), which lays labelled elements over
  the canvas, and clicks the tiles by their labels. Only click events are sent, never a pointer
  press, which Flutter would take for a tap on the canvas. It then waits up to 45 seconds for PIE's
  redirect (`/WrapperApi/RedirectToDashboardGet`) to load.
- **On PIE,** the app opens the form it needs by its PIE address in that tab, for example
  `/PrivateCar/CreateQuote`.
- **When a tile is not found** (1up on another page, or a message covering it), the run is refused
  and the advisor opens a product from 1up by hand. A tab on neither 1up nor PIE is told to sign in
  to 1up first.

**Motor**, for a saved vehicle (its HDFC section in the vehicle's quote panel):
- **Forms:** Private Car, Two Wheeler (PIE's Blaze form; `/TwoWheeler/CreateQuote` answers "404 Page
  Not Found"), GCV, PCV, Tractor. The form follows the vehicle class.
- **New vehicle,** or **renewal from another insurer** (pre-owned). A renewal takes the previous
  policy's end date and type, and optionally the insurer, from the panel; claims and NCB come from
  the vehicle. HDFC's own renewals need the old policy number and are not covered.
- **The app fills:**
  - the product type (Comprehensive, Liability, Standalone OD), customer type and transaction type;
  - the registration number, in PIE's four boxes;
  - the make, model (with variant) and RTO city, picked in PIE's suggestion lists;
  - the first registration date (typed dd/mm/yyyy), year of manufacture, IDV, engine and chassis
    numbers;
  - the previous policy;
  - the customer's name, email and mobile. PIE asks for these before it works the premium out;
    they are entered for the run and not saved.
- **Then:** it presses **Calculate Premium** and reads **Total Payable Premium**. If PIE complains
  instead (for example "User Idv should be in between 794295 - 1323825"), the run stops with PIE's
  words.
- **Recorded vs borrowed:** only the Private Car form was filled in the recording. The other forms
  share its names, and their steps are taken from it, with optional steps listed for the advisor
  when a form does not take them. GCV and PCV work the IDV out from body and chassis IDV (left to
  the advisor). GCV also takes the gross vehicle weight; PCV takes the bus type.
- **Covers and add-ons** are left as PIE sets them and listed for the advisor.

**MST (Medisure Super Top-up)**, for a health client:
- **The app fills:** New business, the cover (Individual, Family Floater), the term, Member Detail
  (Adult and Child counters; each member's tab, date of birth and relation; adults first), then
  Cover Detail.
- **Then:** PIE shows the premium there (it did in the recording, before any customer detail), and
  the app reads it. The sum insured and deductible are left as PIE sets them (the recording did not
  change them) and are listed.

**Never pressed:** **Generate Quote** (it saved a quote in the recording: "Success"), **Generate
Proposal**, or anything after Calculate Premium.

**Energy, Optima Secure, Optima Restore** (new business), for a health client:
- **Layout:** one shared layout. A questionnaire, then PRODUCT DETAILS, then BASIC DETAILS. Most
  answers are boxes that open a list of links when pressed: Business Type, Plan Type, Policy
  Period, sum insured in lakh, I stay in, members ("2Adult+1Child"), POSP or not.
- **The app answers:** New Business; Individual or Family; the plan (Optima Secure's variants,
  Energy's Silver/Gold plans); the eldest member's age; the city; the period and sum insured;
  Energy's existing health insurance; the members; and the advisor's SP/POSP name or code, which
  the panel remembers on this computer.
- **Then:** BASIC DETAILS, and it reads the premium.
- **Unrecorded parts:** the recording reached BASIC DETAILS on Energy and Optima Secure but no
  premium, and showed Optima Restore for renewals only. So the premium is read under the captions
  PIE uses elsewhere ("Total Payable Premium", "Total Premium", "Net Premium"), and steps the
  recording did not show are optional and listed for the advisor. Riders and add-ons are left as
  PIE sets them.

**Retail Travel** (new business), for a travel client (one traveller):
- **The app fills:** New, Individual, the dates of departure and return, the plan (PIE's suggestion
  list, for example "Gold"), Member Detail, and the traveller's date of birth and relation
  (borrowed from MST).
- **Then:** it presses Calculate Premium and reads the premium.
- **Unrecorded parts:** the recording opened the form for a renewal only, so these steps follow
  PIE's other forms.

**Not automated:**
- **HDFC's own renewals** (they need the old policy number).
- **health.hdfcergo.com** (it registers each quote as a lead under the customer's email and
  mobile).

**Verified:** against a local copy of PIE's Private Car, Two Wheeler, MST, Optima Secure and Retail
Travel forms (`npm run test:nia -- pie`). Checked for:
- a new car, opened from another PIE page;
- a renewal from another insurer;
- PIE's IDV complaint;
- a liability-only two-wheeler;
- the refusal off PIE;
- an MST family floater;
- an Optima Secure family;
- a Retail Travel trip.

**Not yet run on the live portal.**

## When a form cannot be filled completely (every insurer)

Added on 20 November 2026, on request. The run fills whatever it can and hands the rest to the
advisor; once the advisor has the premium, the app saves the PDF. See `src/main/quotes/hand-over.ts`
and `finish` in `src/main/quotes/service.ts`.

**While filling:**
- **A box the run cannot fill is skipped.** This covers a dropdown without the saved value, a date
  the calendar refuses, a radio or a box not found. It is listed for the advisor, and the run goes
  on with the next box.
- **Missing values are left, not refused.** If the client or vehicle record lacks a value, that box
  is left for the advisor instead of the run being refused. This covers United India health (e-mail,
  mobile, the proposer's and spouse's date of birth and gender, marital status, a child's gender)
  and United India motor (CC/HP, seats, weight, bus type, special type, previous NCB). What doesn't
  fit the recorded flow is still refused: parents, individual cover, a sum insured United India
  doesn't offer.
- **The filling ends early** at a step that moves the form along (opening a section, a pop-up's Ok)
  or at an insurer's error pop-up. The form is then handed over, with the insurer's message.

**At the premium:**
- **The app never presses the premium button once anything is left.** That button is Calculate
  Premium, Check Premium, Click To See Premium or View Premium. The run's result is "handed over".
  It lists what to fill and names the button the advisor presses.
- **The app then watches the form for 30 minutes.** The drawer and the top bar show "Watching for
  the premium". Once the insurer shows a premium that wasn't there when the form was handed over,
  the app reads it and saves the PDF.
- **How the premium is read:** with the form's own recorded reading where there is one (United
  India's quotes table, PIE's Total Payable Premium, Niva Bupa's period and premium, ICICI's Total
  Premium). Otherwise it looks for a common caption (Total Payable Premium, Total Premium, Net
  Premium…), never a bare "Premium". This applies to New India's forms, the health e-proposals, and
  failures before a premium step.
- **The advisor can also type the premium** shown on the insurer's page, and the PDF says it was
  read by the advisor.
- **Stopping and restarting:** "Stop watching" keeps the typed-premium option. A new run discards
  the form left to finish.

## ICICI Lombard: partner API premiums (UAT and production)

Added on 21 November 2026. The source documents are ICICI's partner API kits:
- "Authentication Access Token & Encryption Key";
- "Generic 4W" and the two-wheeler kit;
- "Elevate Fresh API Kit V3", with its masters.

The code is in `src/main/icici-api/` and `src/shared/insurers/icici-api.ts`.

**What it is:** premiums asked from ICICI's servers directly. No portal is opened and nothing is
filled. Only the premium endpoints are called, never proposal, payment, KYC or policy.

**Environments:** chosen on Insurer portals → ICICI Lombard → **Partner API**.
- UAT: `https://ilesbapigee.insurancearticlez.com`
- Production: `https://janus.icicilombard.com`

**Logins:** one partner login per environment, kept in the encrypted vault.
- The password is entered **already encrypted**, as ICICI gave it: the kits ask for it encrypted
  with ICICI's AES key, without saying how.
- An optional IMID code is sent with health premiums.
- **Check sign-in** tests the login. Logins are never shown again.

**Sign-in:** `auth-api/access/token` returns a JWT. It is kept until a minute before it expires,
and requested again once if ICICI answers 401.

**Motor (car and two-wheeler):** `generic/motor-fw|motor-tw/generic/premium`.
- **Product codes, from the kits' product masters:**

  | Cover | Car | Two-wheeler |
  |---|---|---|
  | Rollover package, 1, 2 or 3 years | 21, 36, 53 | 13, 14, 15 |
  | New | 20 | 10 |
  | Used | 29 | 26 |
  | Own damage | 22 | 16 |
  | Third party | 25 | 24 |

- **Make, model and RTO codes** are typed in the panel for now. ICICI's motor masters were not
  in the kit.
- **IDV:** ICICI's minimum, maximum or average, or the vehicle's own.
- **Previous policy:** NCB and claim from the vehicle; expiry date and type from the run.
- **Add-ons:** from each kit's list.
- **Dates** are sent as midnight in India, in UTC, as in ICICI's samples.

**Health:** `health-fresh/elevate/generic/premium`.
- **Elevate** is product 18, for ₹5, 10 or 25 lakh.
- **Activate Booster**, the super top-up, is product 19. It is sent with its deductible
  (VoluntaryDeductible, ₹3 to 20 lakh) and IsCombo false.
- **Members:** relationship from the kit's master, date of birth as dd-MMM-yyyy, Adult or Kid,
  Male or Female.
- **Names:** ICICI asks each member's name, but the app keeps only the client's. Other members are
  named by relationship, which does not change the premium.
- **Pre-existing disease:** the advisor answers it once for all members.

**Result:** the final premium, including GST. ICICI's breakdown goes on the screen and in the PDF:
- **Motor:** IDV and its range, OD, TP, NCB, add-ons and GST.
- **Health:** zone, premium before tax, tax and add-ons.
- **UAT premiums** are marked as test premiums in the PDF.

**Not done yet:**
- Travel (no ICICI travel kit was provided).
- ICICI's motor masters (codes are typed for now).
- Production from advisors' computers. ICICI allow-lists fixed IP addresses only, so production
  needs a fixed-IP server or each office's IP allow-listed.

**Verified:** with a fake ICICI server (`test/icici-api.test.ts`):
- the sign-in and token reuse;
- errors in plain words;
- every request built;
- the settings kept in the vault;
- car and Elevate premiums through the quote service, with their PDFs;
- that nothing sent or received is logged.

**Not yet run against ICICI's UAT.**

## ICICI Lombard: NYSA motor quote, renewals (premium worked out, never bought)

Built from the recording `icici-lombard-2026-11-20T07-23-41-540Z` (a two-wheeler renewal through to
the premium).

**A new vehicle** (26 November 2026, "ICICI is still locked"): the recording chose New and went
straight back to Rollover, so NYSA's New Business fields are not known. The app opens Motor's quote
form, chooses **New Business** (no registration number needed) and hands the form to the advisor,
who fills the vehicle on NYSA, gets the premium and presses Stop & make PDF. Offered on the
vehicle's screen and in Compare quotes. A recording of a New Business quote would let it be filled
through to the premium.

**The flow:**
1. On NYSA's dashboard, the **Motor** tile asks ICICI's server for the product's address
   (ProductRedirect) and goes there: `/NysaMotor/quote`. The tile is on NYSA's own dashboard only:
   when the tab is on NYSA's health site (`nysa-health.icicilombard.com`, where a health or travel
   quote leaves it), the app opens `https://nysa.icicilombard.com/#/dashboard` first. A run that does
   not end ready saves a trace (`diagnostics/icici-lombard-…json`).
2. **Vehicle Details:** the app picks **Rollover**, answers the **ownership change** question (car
   flow only), types the **registration number** and presses **Fetch Vehicle Data**.
3. ICICI looks the vehicle up in **Vahan itself**, so make, model, fuel, registration date and RTO
   are not typed. A two-wheeler's number on the car flow shows "Entered vehicle registration
   belongs to Two Wheeler. Switching to the Two Wheeler buying flow". The app presses **OK**, as
   recorded.
4. **Premium page:** the app reads the **Total Premium** at ICICI's own IDV. If the advisor chose
   the vehicle's saved IDV, it types it in the IDV box, presses **Update** and reads the new
   premium. ICICI keeps the IDV within its own limits, and the advisor is told when it does.

**Asked in the panel each run (not saved):** the registration number, whether the ownership
changed, and which IDV to use.

**Not automated:** new vehicles (ICICI's New Business form was not recorded), and Used.

**Never pressed:** **Buy Now** (it saves the quote: GenericSaveQuote), **Share Quote**, discounts,
or anything on the proposal (KYC).

**Other products:** Health, Corporate and Home/Travel/Cyber leave nysa.icicilombard.com for other
icicilombard.com addresses. They were blocked until 20 November 2026, when the portal was allowed
the whole icicilombard.com domain. They are not automated.

**Verified:** against a local copy of NYSA (`npm run test:nia -- icici`). Checked for:
- a car from the dashboard;
- a two-wheeler's number switching flow;
- the vehicle's IDV, inside and above ICICI's limit;
- a number Vahan does not know;
- a new vehicle refused.

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
- **Kept signed in while the advisor is away** (decision of 5 November 2026, replacing "the app
  does not keep sessions alive artificially"; `src/main/insurers/session-alive.ts`). Portals end
  idle sessions in two ways, and the app answers both while a session runs and the portal is past
  its login page:
  - **Their page counts down** from the last mouse or key event, often with a "Your session is
    about to expire" warning. Every 30 seconds the app presses a shown session warning's
    **Continue** / **Stay signed in** / **OK**. It never presses Log out, Sign out, No or Cancel,
    never a pop-up that is not about the session, and never Yes to "Are you sure you want to log
    out?". After 4 minutes without the advisor's own mouse or keys in that portal, it sends
    harmless activity (mouse movement, Shift pressed and released) to every page of the insurer,
    and again every 4 minutes after that.
  - **Their server forgets a quiet session** (often after 15 to 30 minutes without a request).
    When neither the advisor nor the portal has sent a request for 4 minutes, the app fetches the
    portal's current page again in the background, with its cookies. The page shown does not
    change. Only a page opened with GET and answered normally is fetched, never one reached by
    sending a form (a second request could send it again) or an address with a one-time code.
  - **While any session runs,** macOS is kept from suspending the app (App Nap would hold back its
    timers).

  It cannot change a portal that ends every session after a fixed time of its own, or the app's
  12-hour limit, which still ends the session. A portal that signs the advisor out anyway shows
  its login page, which the app fills as usual. Each answered warning is logged with the insurer's
  id only. Checked against a local page that signs out after 3 seconds without activity
  (`npm run test:nia -- alive`). Not yet observed on a live portal.

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

On by default since the first release (decision of 5 November 2026): the installed app and
`npm run dev` both show it. `npm run dev:prod` still works and does the same.

To switch it off (for example while supporting a user), start the app with
`FQF_INSURER_PORTALS=0`. Then the screen is hidden and every insurer and client channel refuses
(`UNSUPPORTED_FLOW`).

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
    also to its CAPTCHA provider. HDFC ERGO also has its own domain (decision of 5 November
    2026): its tiles go through other HDFC ERGO addresses handed out by its server at the time
    (`ams.hdfcergo.com` for policy issuance, PIE, payment, KYC), which were blocked. Any https
    address on `hdfcergo.com` (default port) is allowed for it. Look-alikes such as
    `hdfcergo.com.evil.example`, plain http and other ports are not. Its sign-in details are still
    typed on `1up.hdfcergo.com` only. A domain must be the login address's own
    (`allowedDomains` in `src/shared/insurers/portals.ts`); other insurers keep exact origins.
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

## Bajaj Allianz: Personal Accident (partner portal), new business (premium worked out, never saved)

Built from the recording of 25 November 2026 (`bajaj-allianz-2026-11-25T06-17-21-912Z`). The form
is `partner.bajajgeneral.com/health/IssuePolicy/PersonalAccident`; the app opens it by its address in
a tab signed in to the partner portal. For a health client's proposer ("Self"). The quote screen
asks only the plan; the rest is the client's Additional details, Bajaj Allianz tab (tenure, family
income, gross monthly income, occupation from Bajaj's list, and the covers' sums insured).

- **The app fills:** Policy Plan (by Bajaj's code: Global Personal Guard 8428 was recorded; the other
  five share the form, and what they ask besides is left to the advisor), Policy Tenure (a
  vue-select: 1Y, 2Y, 3Y with its discount; the choice is checked where vue-select shows it),
  Pincode (Bajaj fills the city and GST state), Family Income, First Name (and the rest of the name
  as Last Name if the form has one), Gender, Date of Birth (typed dd/mm/yyyy), Gross Monthly Income,
  Occupation (by Bajaj's code), and the death, permanent partial and permanent total disability sums
  insured given (at least one, as Bajaj asks).
- **Then:** it presses **Calculate Premium** (Bajaj's quick quote: nothing is saved or sent) and reads
  the premium by the captions premiums commonly have. **The recording did not reach a premium**
  (Bajaj answered "Timeout occurred in getting response", then "Please select atleast one cover
  between Death/Permanent Partial Disability/Permanent Total Disability"), so where Bajaj shows it
  is not known yet: if no premium is read, the run says what the page shows about premiums.
- **Bajaj's messages** (a toast ending "Reference code : '…'") stop the run with Bajaj's words.
- **A box Bajaj does not take** (a date of birth that takes no typing, for example) is left for the
  advisor, and Calculate Premium is then left to them too; the app saves the PDF when the premium
  shows.

**Verified:** against a local copy of the form drawn from the recording (`npm run test:nia --
bajaj`): the details filled, the premium read (where the copy shows it, assumed), Bajaj's timeout
message reported, a date of birth box that takes no typing left, and no signed-in tab refused.
Unit tests: `test/bajaj-pa-plan.test.ts`.

**Not yet run on the live portal.**

## Every quote starts and ends at the insurer's home page

Requests of 25 November 2026: a quote continued from where an earlier one left off caused trouble.
Each portal has its signed-in home page (`homeUrl` in `src/shared/insurers/portals.ts`: United
India's HomeAction.do, New India's NonCustomerDashboard.html, HDFC ERGO's 1up dashBoardScreen, ICICI
Lombard's NYSA dashboard, Niva Bupa's UNO landing page, Bajaj Allianz's partner portal), and the
quote service (`src/main/quotes/service.ts`, `resetPortal`) sends the insurer's tab there:

- **before every quote** (and waits for the home page to load), so it always starts from there;
- **after every quote**, whatever its outcome (completed, failed, refused, cancelled);
- when a **handed-over** form is finished (its premium read or typed in, and saved), or the wait for
  it is cancelled.

A form handed over to the advisor stays as it is until they finish it. A quote asked for while
another runs is refused as busy, and the running one's tab is not touched. The ICICI partner API has
no tab. The advisor stays signed in; a tab that cannot be sent home is left as it is.

## Comparing insurers for a health client

A health client's quote options start with **Compare insurers** (`src/renderer/src/quote/ComparePanel.tsx`).
The advisor ticks one insurer or several (United India, Niva Bupa, HDFC ERGO, New India, and ICICI Lombard once its
API is set up), picks each one's product, and runs them. They all run at the same time: each run has its own scope
(`runScoped` in `run-uiic-health.ts`: its own cancel, its own last page), and the service allows one run per insurer.
While several run, the app does not bring their tabs forward; the advisor opens one with its card's **Open tab**.

The screen follows `quotes:progress` (a long poll): a card per insurer shows the step it is on, then its premium, its
message and its PDF. A form handed over to the advisor shows what is left to fill; the app watches it for the premium
(`quotes:finish` with the insurer) or takes the premium typed on the card, while the other insurers keep going. Once
every insurer has finished, `quotes:compare` saves one PDF comparing the premiums (cheapest first), naming each
insurer's own PDF and those with no premium. Nothing is ever submitted.

**Let me change it before the PDF.** Ticked for an insurer (not ICICI's API), its run carries `adjust`: the app fills
the form as usual and hands it over even when it read a premium (Niva Bupa stays on Customize Your Plan). It reads
the form's values by caption then (page op `formValues`; never a password, OTP, captcha, card or Aadhaar box). The
advisor changes what they need in the insurer's tab and gets the premium there, then presses **Generate PDF** on the
card (`quotes:finish` with `waitMs: 0`): the premium shown then is the quote, whatever the run read before. The PDF
names the boxes whose value changed ("Sum Insured: 5 Lakh → 10 Lakh", `form-changes.ts`), and its premium goes into
the comparison. Such a form is never watched; **Discard** puts it away without a PDF and sends the tab home.

## HDFC ERGO: how PIE is opened (and why it used to be Private Car)

PIE has no sign-in of its own for the app: a tab is signed in to PIE only by opening a product from 1up (PIE's
`WrapperApi/RedirectToDashboardGet` page, which then sends the tab on to that product's form). The app used to press
Private Car for every product, as the only 1up tile it knew, then open its own form on PIE. Since 26 November 2026:

- **The product's own tile first.** The recording of 5 November 2026 went from 1up straight to PIE's MST, Optima
  Restore, Energy and Optima Secure forms by their own tiles (`PIE_TILES` in `run-hdfc.ts`, matched as whole words,
  since 1up may name a tile "my:Optima Secure"). If the tile is not there, Private Car is pressed on the products
  shown; if it leads elsewhere, or PIE does not open within 15 seconds, 1up's home page again and Private Car. Travel
  keeps Private Car: 1up's Travel tile opened HDFC's public travel site in the recording.
- **A PIE tab stays on PIE.** The reset after (and before) every quote sends a tab on PIE to PIE's dashboard
  (`siteHomeUrls`), not to 1up, so PIE stays signed in and the next quote opens its form directly.
- When PIE still does not open, the message lists the tiles 1up showed (short labels without digits, so never a saved
  quote's customer), to tell the real tile names.

## ICICI Lombard: NYSA's health site (Elevate, International Travel, Student Medical Travel)

Recorded on 26 November 2026 (`icici-lombard-2026-11-26T06-19-41-899Z` and the next three). NYSA's dashboard Health tile
has ICICI's server hand the tab to `nysa-health.icicilombard.com` (its `/swap` page). **Elevate opens only that way**: the Health tile leads to it through the health dashboard, and its address loaded directly shows ICICI's "Oops! your page could not be found" (so a tab already on the health site is sent back to NYSA's dashboard and its Health tile). For the travel forms the app loads the form's
address (the health dashboard's tile if that does not show it). Code: `src/shared/insurers/icici-nysa.ts`,
`src/main/quotes/icici-nysa.ts` (steps), `run-icici-nysa.ts` (runner); local copy and checks:
`npm run test:nia -- nysa`.

- **Elevate** (health client; Additional details → ICICI Lombard: sum insured on NYSA, term, the applicant's annual
  income, the pre-existing disease answer): PIN code, NYSA's "Adult n" / "Child n" buttons (two adults, three
  children at most; a son or daughter under 25 is a child), each member's relationship and date of birth, tenure, sum
  insured, income band, the pre-existing disease and NRI questions, **Generate Quote**, then the three plans'
  premiums (Basic, Essential, Recommended; Basic is the quote's premium, all three in the PDF).
- **International Travel** (travel client; one traveller, Self): subtype Individual, state, round trip, where to,
  immigrant visa No, the dates, the traveller, the plan by its exact name as ICICI lists it for the destination (`ICICI_INTL_TRAVEL_PLANS`: W plans for USA / Canada, S for Schengen, A and ASIA for Asia, X for Other;
  "GOLD_W_50", "PLATINUM_W100"…; names alike are other plans, so never by the cover they carry), **Get quote**, then
  the Total premium. A plan ICICI does not list is left for the advisor, before Get quote.
- **Student Medical Travel**: state, not yet left India, the departure, the shortest policy duration covering the
  studies, USA / Canada, the student, the plan (by its name, if the advisor gives one; else they choose it), **Get
  quote**. Its plan list never filled when recorded: if it stays
  empty the form is handed over before Get quote, and the app watches for the premium.
- The advisor allowed pressing Generate Quote and Get quote (the premium shows only after them); Save & Proceed, KYC
  and payment are never pressed.
- **Trip Secure** is not automated: its form is not in the page's document (no box, button or frame was seen by the
  recorder, only its pop-ups), most likely drawn behind a shadow root the app cannot reach.
- NYSA's controls are Angular Material: page ops `matSelect` (options matched by text, amount, income band, plan
  number or duration), `toggle` (by its question), `countTo`, `readCards`, and `matDate` by its box.
- A tab on the health site is reset to its dashboard (`siteHomeUrls`), staying signed in there.

**Trace of every HDFC run** (26 November 2026, to tell why a form opens through Private Car): each HDFC ERGO run
saves a trace in the app's diagnostics folder (`<userData>/diagnostics/hdfc-ergo-….json`, readable by the user only,
the latest 20 kept), named in the run's result. It holds each move with its time: where the tabs were at the start,
whether a tab was already on PIE (1up then not needed), what 1up's home and product list showed (short labels, never one
with digits), the tile looked for and tapped, whether it led to PIE, why the app fell back to Private Car, PIE's own
landing, each load of the form and whether it showed; and every address the tabs went through (origin and path only,
never a query: PIE's redirect carries a token there). No client data.

**ICICI: when the Health tile stops at the health dashboard** (26 November 2026, live: "ICICI's Health tile did not lead
to Elevate within 45 seconds"). As recorded, the health site goes on to Elevate by itself; if it stays on its dashboard
for 8 seconds, the app presses the dashboard's Elevate tile, found by its text or its hover label (page op
`clickTile`; ICICI names its tiles by tooltip, "TripSecure+" on International Travel). No such tile: the run says so,
listing the tiles it saw. Every ICICI NYSA run saves a trace like HDFC's (`src/main/quotes/run-trace.ts`): where it
started, NYSA's dashboard, the Health tile pressed, where the health site went, the tile pressed, and every address the
tab went through.

**HDFC: PIE Dashboard, not Private Car** (26 November 2026; the first HDFC trace,
`hdfc-ergo-2026-11-26T09-02-59-511Z`). Under Issue Quotes & Policy, 1up now lists quick quotes ("NEW Health", "Private
Car", "Two-wheeler"), Policy Issuance ("Health", "Motor", …) and **"PIE Dashboard"**, 1up's link to PIE. Its Private Car
quick quote opens 1up's own quote screen ("What is the Registration Number ?"), not PIE as on 5 November: that is why
every HDFC quote went through Private Car, and why it then failed. The app now presses PIE Dashboard (PIE's sign-in
redirect, then its dashboard) and opens the form itself; on older 1up screens without it, the form's own tile, then
Private Car. Each try is in the run's trace.

**Niva Bupa stops on Customize Your Plan** (26 November 2026): the premium is read on the sum insured page and the run
ends there. It no longer continues to Plan Summary (asked for on 24 November, withdrawn: "why go to the last page if the
premium is on the sum insured page"). Generate Quote is never pressed.

**ICICI's dropdowns, one list at a time** (26 November 2026, live Elevate): a relationship ICICI's list did not offer
left that list open, and the next dropdowns then read its options (the sum insured and income "not offered"). `matSelect`
now closes every other open list before opening its own (backdrop, Escape on the dropdown), reads only its own list, and
closes it for sure. A relation is chosen by the names ICICI's lists may give it ("SPOUSE", "WIFE"/"HUSBAND", "EMPLOYEE
SPOUSE"…). A value not offered is left for the advisor with what the list offers. The ICICI and HDFC traces also record
each form step's result.

## No PDF by itself: Stop & make PDF (26 November 2026)

Every quote (single quotes from a client's Quote menu, and Compare quotes) fills the insurer's form and keeps it: no PDF
is made by itself, and the app no longer watches a form to save one. The advisor checks the form in the insurer's tab,
fills or changes anything, and presses **Stop & make PDF** (in the quote drawer, in the top bar while the insurer's page
is shown, or on the insurer's card in Compare quotes). The app then reads the premium the page shows and saves the PDF,
naming what the advisor changed on the form. When the page cannot be read again (ICICI's partner API has no page; a form
whose reading was not recorded), the premium the run read is saved. The advisor may type the premium instead; Discard
puts the form away without a PDF (the tab goes back home).

**Compare quotes** is its own page in the sidebar (Quotes → Compare quotes), no longer an option in a client's quote
drawer: choose a health client, then the insurers, and run them together. Each Stop & make PDF saves that insurer's PDF
and makes the comparison PDF again from every insurer saved so far.

**The kept form stays on screen** (26 November 2026: "the insurer resets and the user does not see the premium"). After a
single quote that kept its form, the insurer's tab stays in front (it no longer switches back to the app), with **Stop &
make PDF** in the top bar; the top bar offers it for whichever insurer's tab is in front with a kept form, Compare quotes'
included (Compare quotes then makes the comparison PDF again). A run refused before filling anything leaves the tab as it
is. The tab goes back home only after Stop & make PDF (once the PDF is saved) or Discard.

**Combined runs: the insurers' tabs keep drawing** (26 November 2026: "Niva Bupa and HDFC broken in combined automation,
fine alone"). Measured: a tab that loads a page while detached from the window draws no frame at all (0 animation frames a
second, background throttling off or not), so 1up's Flutter never shows its buttons, Niva Bupa's Ionic loading overlay
never closes, ICICI's Material dropdowns and calendars stall. A solo run brings its tab to the front, which is why it
worked. Now the quote service tells the portal host which insurers are being filled (`setWorking`): their tabs stay
attached at full size in the page area, the one in front on top and the others drawing behind it (measured: 60 frames a
second, also after loading a new page); while any is filled, the page area shows one of them and the top bar says so.
Checked by `npm run test:nia -- tabs`.

**Several plans: the advisor chooses** (26 November 2026: "if there are multiple quotes, ask which one to show"). When Stop
& make PDF reads several plans on the insurer's page (ICICI Elevate's Basic, Essential and Recommended; United India's
calculator list), nothing is saved yet: the result asks (`choose`), and the app shows "Which plan for the PDF?" with each
plan and its premium (quote/PlanChoice.tsx), wherever Stop was pressed. The PDF then holds only the plans ticked, the first
of them (in the page's order) as its premium, and the comparison uses it. The reading the advisor chose from is kept, so
the PDF is what they saw. Cancel keeps the form as it was.

**Compare quotes for a vehicle** (26 November 2026): the Compare quotes page has tabs for a health client, a vehicle and a travel client. For a
vehicle: United India and New India (motor forms; New India's for new private cars and two-wheelers only), HDFC ERGO (PIE),
ICICI Lombard (NYSA, renewals; its partner API once set up). What the motor forms ask beyond the saved vehicle
(registration number, RTO city, the previous policy for a renewal, the owner's name, email and mobile for PIE, the cover,
ICICI's IDV) comes from the vehicle's Additional details (its quote details), read again when Run is pressed: the page
asks only which insurers and each one's plan, as for a health client. An insurer that lacks something says what to add
in the vehicle's Additional details, and is skipped. Then as for a health client: filled forms kept, Stop & make PDF per
insurer, and the comparison PDF ("Motor insurance quotes compared", with the vehicle's details) made again after each.
The page's working part is shared (`CompareRunner` in quote/ComparePanel.tsx; the vehicle's in quote/VehicleCompare.tsx).

**Compare quotes for a travel client** (26 November 2026): a third tab, Travel client. The trip is saved with the travel
client (Additional details → Trip: departure, return, destination as ICICI groups countries, and whether to study);
without it the tab asks for it. The page asks only each insurer's plan:
- **United India:** Overseas Travel by sum insured (destination: worldwide for USA / Canada, else worldwide excluding
  USA and Canada; 500000 only worldwide), or the Overseas Mediclaim form that fits the trip (Studies to study,
  SCHENGEN for Schengen, else B&H) by its plan's place, lowest first. Trips of a year or less.
- **HDFC ERGO:** Retail Travel, Silver, Gold or Platinum (typed into PIE's plan box; a name PIE does not list hands the
  form over).
- **ICICI Lombard:** International Travel by ICICI's own plan names for the destination (its default first), or Student
  Medical Travel when studying (the plan picked in NYSA). Needs the traveller's state (proposal details).
New India's travel form is not offered here: it asks the advisor to confirm the traveller's health. The comparison PDF
is "Travel insurance quotes compared". HDFC's and ICICI's own travel drawers start from the saved trip too
(quote/TravelCompare.tsx).

## Paused insurers: New India, Star Health, Tata AIG (26 November 2026)

Taken out of the product "such that they can be brought back any time": one list, `PAUSED_INSURERS` in
`src/shared/insurers/availability.ts`. A paused insurer is not listed on Insurer portals, its products are left out of
every quote drawer and "Quote with" menu (health, travel, vehicles), of Compare quotes (health and vehicle) and of a
client's Additional details tabs, and the quote service refuses its runs before touching its tab. Rural, Marine and
Property clients are quoted with New India only: their sidebar pages and Overview cards are paused with it (the records
stay saved). Nothing is deleted: the automation, the saved sign-ins, the clients' details and the tests stay as they are.

**To bring one back**, remove its id from `PAUSED_INSURERS` (the pages that depend on New India come back with it).

## Travel clients and vehicles: Basic details, Additional details (26 November 2026)

As a health client's form ("the UI is very bad for other clients than health"): two tabs.

- **Travel client:** Basic details (name, mobile, email, pincode, date of birth, gender, marital status, occupation,
  notes); Additional details (the passport, the proposal details and Aadhaar the travel e-proposals ask).
- **Vehicle:** Basic details (its name and the vehicle's details); Additional details: its **quote details**, saved with
  it (`vehicle.quoteDetails`: registration number, RTO city, the previous policy for a renewal, the owner's name, email and
  mobile, the cover, ICICI's IDV), and New India's further details when New India is offered. HDFC ERGO's and ICICI's
  vehicle quotes and Compare quotes start from the quote details, so a quote asks nothing more (they can still be changed
  there). Saved inside the vehicle's JSON: older vehicles load as they were.

A problem in the other tab shows that tab, as on a health client. (Rural, Marine and Property clients, paused with New
India, keep their single form.)

## Reset (sidebar, 26 November 2026)

**Reset**, at the foot of the sidebar, puts everything back to a clean start after asking first:
- every quote being filled is stopped (and waited for, up to 15 seconds);
- every form kept for Stop & make PDF is put away: no PDF is saved, and its card shows it was reset;
- every insurer's pop-up tabs (calculators, e-proposal forms) are closed; each insurer's own tab
  stays, signed in;
- every open insurer goes back to its main home page (ICICI's NYSA dashboard even when the tab was
  on its health site), and the app's own screens are shown.

Saved clients, vehicles, travellers and PDFs are not touched. The log records only how many of each
were reset (`quote.reset`). Code: `resetAll` in `src/main/quotes/service.ts`, `closePopups` in
`src/main/insurers/portal-host.ts`, the button in `src/renderer/src/shell/AppShell.tsx`.
