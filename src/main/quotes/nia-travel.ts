// New India: the overseas travel quote forms (QuoteNonCustomer.html) of three policies, for a
// travel client and a trip entered for the run. Built from the recording
// new-india-2026-11-04T09-43-08-482Z, in which each form was opened from the dashboard (Product
// Selection, TRAVEL, the policy's tile) after New India's question "Has any person suffering from
// pre-existing illness / disease / disability and/or had met with an accident…?", its trip choices
// clicked through and its sections opened. Nothing was typed and no premium worked out, so dates
// are typed as dd/mm/yyyy (the boxes are labelled so) and the run stops before Save & Calculate
// Premium (or Calculate Premium).
//
// The forms (one model, detailQuote.detailQuoteOMPObj):
//   Overseas Mediclaim (Employment & Studies): destination and purpose radios, leaving date,
//     duration in months (the return date follows), date of birth, then the plans New India
//     offers for them (radios named Plan: D, D1…); sections Policy Holder Information, Traveller
//     Details (occupation, passport, visa, sponsor, university) and Other Details (nominee).
//   Overseas Mediclaim (Business & Holiday): Travel Details only (destination E-1 or E-2 CFT,
//     purpose, leaving date, date of birth).
//   Overseas Travel Ease (Business & Holiday): destination and purpose radios, leaving and return
//     dates, date of birth, plan by sum insured, an existing New India policy; the same sections,
//     with an ID document, the overseas address and the nominee's date of birth.
// New India first asks, on the form, whether the client has a PAN (KYC, with the client's
// consent): the advisor answers it (see run-nia-health.ts).
import type { Traveller } from '../../shared/contracts/traveller';
import {
  NIA_TRAVEL_EASE_PLAN_NAMES,
  NIA_TRAVEL_FORM_NAMES,
  type NiaTravelForm,
  type NiaTrip,
} from '../../shared/insurers/nia-travel';
import type { NiaHealthStep } from './nia-health';
import type { PageOp } from './page-ops';
import { iso } from './uiic-travel-proposal';

const HEADINGS: Record<NiaTravelForm, string> = {
  'studies-employment': 'Overseas Mediclaim Insurance Policy (Employment & Studies) Insurance',
  'business-holiday': 'Overseas Mediclaim Insurance Policy (Business & Holiday) Insurance',
  'travel-ease': 'Overseas Travel Ease Policy (Business & Holiday) Insurance',
};

/** The form New India opens: its heading and the dashboard tile that likely opens it. */
export function niaTravelForm(form: NiaTravelForm): {
  name: string;
  heading: string;
  tiles: string[];
} {
  const heading = HEADINGS[form];
  return {
    name: NIA_TRAVEL_FORM_NAMES[form],
    heading,
    tiles: [heading.replace(/\s*Insurance$/, '')],
  };
}

/** Radio values, as recorded: the Employment & Studies form names destinations by area. */
const DESTINATION = {
  'studies-employment': { worldwide: 'Area2', 'worldwide-excluding-usa-canada': 'Area1' },
  'travel-ease': { worldwide: 'WIUC', 'worldwide-excluding-usa-canada': 'WEUC' },
} as const;
const PURPOSE = {
  studies: 'STUDY',
  employment: 'EMPMENT',
  business: 'BUSINESS',
  holiday: 'HOLIDAY',
} as const;
/** The nominee's relationship as the forms list it (by text); others are "Others". */
const NOMINEE = {
  spouse: 'Spouse',
  father: 'Father',
  mother: 'Mother',
  son: 'Son',
  daughter: 'Daughter',
} as const;

export type NiaTravelPlan =
  { ok: true; steps: NiaHealthStep[]; byHand: string[] } | { ok: false; problems: string[] };

const radio = (name: string, value: string): string =>
  `input[type="radio"][name="${name}"][value="${value}"]`;

export function planNiaTravelQuote(
  traveller: Traveller,
  trip: NiaTrip,
  options: { passportNumber: string | null; today: Date },
): NiaTravelPlan {
  const today = iso(options.today);
  const problems: string[] = [];
  if (trip.leavingDate < today) problems.push('The leaving date has passed.');
  if (trip.form === 'travel-ease' && trip.returnDate < trip.leavingDate) {
    problems.push('The return date is before the leaving date.');
  }
  if (traveller.passport?.expiryDate && traveller.passport.expiryDate <= trip.leavingDate) {
    problems.push("The traveller's passport expires before the trip starts.");
  }
  if (problems.length > 0) return { ok: false, problems };

  const steps: NiaHealthStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, more: Partial<NiaHealthStep> = {}) =>
    steps.push({ label, op, ...more });
  const section = (link: string, probe: string) =>
    add(link, {
      op: 'ensureShown',
      shown: { selector: probe },
      open: { link },
      timeoutMs: 8000,
    });

  // Travel Details.
  section('Travel Details', '#leavingIndia');
  if (trip.form === 'business-holiday') {
    add('Travel destination', {
      op: 'setField',
      selector: 'select[name="TravelDestination"]',
      value: trip.destination,
      waitMs: 10_000,
    });
  } else {
    add('Travel destination', {
      op: 'check',
      selector: radio('TravelDestination', DESTINATION[trip.form][trip.destination]),
      checked: true,
    });
  }
  add('Purpose of travel', {
    op: 'check',
    selector: radio('TravelPurpose', PURPOSE[trip.purpose]),
    checked: true,
  });
  // New India loads the plans for the destination and purpose.
  add('Purpose of travel', { op: 'pause', ms: 1500 });
  add('Leaving India on', { op: 'typeDate', input: '#leavingIndia', date: trip.leavingDate });
  if (trip.form === 'studies-employment') {
    add('Travel duration (months)', {
      op: 'setField',
      selector: '#travelDuration',
      value: String(trip.months),
    });
  }
  if (trip.form === 'travel-ease') {
    add('Returning to India on', {
      op: 'typeDate',
      input: '#returningIndia',
      date: trip.returnDate,
    });
  }
  add('Date of birth', { op: 'typeDate', input: '#ompDateOfBirth', date: traveller.dateOfBirth });
  add('Date of birth', { op: 'pause', ms: 800 });
  if (trip.form === 'studies-employment') {
    add(
      'Plan',
      { op: 'pickNth', name: 'Plan', index: trip.plan, timeoutMs: 10_000 },
      { keep: 'plan' },
    );
  }
  if (trip.form === 'travel-ease') {
    add('Plan', {
      op: 'setField',
      selector: '#Plan',
      value: NIA_TRAVEL_EASE_PLAN_NAMES[trip.plan],
    });
    byHand.push('whether the traveller holds an active New India policy');
  }
  if (trip.form === 'business-holiday') {
    // This form has Travel Details only.
    return { ok: true, steps, byHand };
  }

  policyHolderSteps(
    {
      name: traveller.customer.name,
      gender: traveller.gender,
      maritalStatus: traveller.maritalStatus,
      dateOfBirth: traveller.dateOfBirth,
      address: traveller.proposal?.address,
      phone: traveller.customer.phone,
      email: traveller.customer.email,
      landline:
        traveller.proposal?.landlineStdCode && traveller.proposal.landlineNumber
          ? traveller.proposal.landlineStdCode + traveller.proposal.landlineNumber
          : undefined,
      eInsuranceAccountNumber: traveller.proposal?.eInsuranceAccountNumber,
    },
    steps,
    byHand,
  );
  const { proposal } = traveller;

  // Traveller Details.
  section('Traveller Details', '#passport');
  if (traveller.occupation === 'Professional') {
    add(
      'Occupation',
      {
        op: 'setField',
        selector: '#occupation',
        value: 'Professional / Administrative / Managerial',
      },
      { optional: true, ifMissed: 'occupation' },
    );
  } else byHand.push("occupation (New India's list differs from the travel client's)");
  const passport = options.passportNumber;
  if (passport && passport.length <= 8) {
    add('Passport no.', { op: 'setField', selector: '#passport', value: passport });
  } else byHand.push('passport number');
  if (traveller.passport?.expiryDate) {
    add('Passport expiry date', {
      op: 'typeDate',
      input: '#passportExpDt',
      date: traveller.passport.expiryDate,
    });
  } else byHand.push('passport expiry date');
  if (trip.form === 'travel-ease') {
    if (passport && passport.length <= 30) {
      add(
        'Nature of ID',
        { op: 'setField', selector: '#natureOfId', value: 'Passport' },
        { optional: true, ifMissed: 'nature of ID and ID document number' },
      );
      add(
        'ID document no.',
        { op: 'setField', selector: '#propIdDocNo', value: passport },
        { optional: true, ifMissed: 'nature of ID and ID document number' },
      );
    } else byHand.push('nature of ID and ID document number');
    byHand.push('overseas address for correspondence');
  } else {
    byHand.push(
      trip.purpose === 'studies'
        ? 'visa type, sponsor name and address, university name and address'
        : 'visa type, sponsor name and address',
    );
  }

  // Other Details: the nominee.
  section('Other Details', '#nameOftheNominee');
  if (proposal?.nomineeName) {
    add("Nominee's name", {
      op: 'setField',
      selector: '#nameOftheNominee',
      value: proposal.nomineeName.slice(0, 50),
    });
  } else byHand.push("nominee's name");
  if (proposal?.nomineeRelationship) {
    const relation = NOMINEE[proposal.nomineeRelationship as keyof typeof NOMINEE] ?? 'Others';
    add("Nominee's relationship", {
      op: 'setField',
      selector: '#relationshipNominee',
      value: relation,
    });
  } else byHand.push("nominee's relationship");
  if (trip.form === 'travel-ease') {
    byHand.push("nominee's date of birth (and an appointee for a nominee under 18)");
  }
  return { ok: true, steps, byHand };
}

/** The policy holder, as New India's Policy Holder Information section asks it. */
export interface NiaPolicyHolder {
  name: string;
  gender?: 'male' | 'female' | 'transgender' | undefined;
  maritalStatus?: string | undefined;
  dateOfBirth?: string | undefined;
  address?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  landline?: string | undefined;
  eInsuranceAccountNumber?: string | undefined;
}

/**
 * Policy Holder Information, as a new customer (the advisor switches to Existing Customer and
 * finds the client if New India already has them). `optional`: every step may be missed (a form
 * whose section was not recorded field by field): what is missed is listed for the advisor.
 */
export function policyHolderSteps(
  person: NiaPolicyHolder,
  steps: NiaHealthStep[],
  byHand: string[],
  options: { optional?: boolean } = {},
): void {
  const add = (label: string, op: PageOp, more: Partial<NiaHealthStep> = {}) =>
    steps.push({
      label,
      op,
      ...(options.optional
        ? { optional: true, ifMissed: `policy holder: ${label.toLowerCase()}` }
        : {}),
      ...more,
    });
  add('Policy Holder Information', {
    op: 'ensureShown',
    shown: { selector: '#firstNameCreate' },
    open: { link: 'Policy Holder Information' },
    timeoutMs: 8000,
  });
  add(
    'New customer',
    { op: 'check', selector: '#policyHolder1', checked: true },
    { optional: true, ifMissed: 'policy holder: New or Existing Customer' },
  );
  const title =
    person.gender === 'male'
      ? 'Mr.'
      : person.gender === 'female'
        ? person.maritalStatus === 'married'
          ? 'Mrs.'
          : 'Ms.'
        : null;
  if (title) add('Title', { op: 'setField', selector: '#typeOfOrg', value: title });
  else byHand.push("policy holder's title");
  const words = person.name.trim().split(/\s+/);
  add('First name', { op: 'setField', selector: '#firstNameCreate', value: words[0]! });
  if (words.length > 2) {
    add('Middle name', {
      op: 'setField',
      selector: '#middleNameCreate',
      value: words.slice(1, -1).join(' '),
    });
  }
  if (words.length > 1) {
    add('Last name', { op: 'setField', selector: '#lastNameCreate', value: words.at(-1)! });
  } else byHand.push("policy holder's last name (the saved name is one word)");
  if (person.gender) {
    const g = { male: 0, female: 1, transgender: 2 }[person.gender];
    add('Gender', { op: 'check', selector: `#gender${g}`, checked: true });
  } else byHand.push("policy holder's gender");
  if (person.dateOfBirth) {
    add("Policy holder's date of birth", {
      op: 'typeDate',
      input: '#dob',
      date: person.dateOfBirth,
    });
  } else byHand.push("policy holder's date of birth");
  if (person.address) {
    add('Building no., Street', {
      op: 'setField',
      selector: '#buildingNo',
      value: person.address.slice(0, 100),
    });
  } else byHand.push('address (building no., street)');
  byHand.push('state, city and PIN code');
  if (person.phone) {
    add('Mobile no.', { op: 'setField', selector: '#mobileInd', value: person.phone });
  } else byHand.push('mobile number');
  if (person.email) {
    add('Email ID', { op: 'setField', selector: '#emailInd', value: person.email });
  }
  if (person.landline && person.landline.length <= 11) {
    add('Landline no.', { op: 'setField', selector: '#landLineNo', value: person.landline });
  }
  if (person.eInsuranceAccountNumber) {
    add('E-Insurance account no.', {
      op: 'setField',
      selector: '#eAccount',
      value: person.eInsuranceAccountNumber,
    });
  }
  byHand.push('bank details (IFSC, bank, branch, account number) and the bank details declaration');
}
