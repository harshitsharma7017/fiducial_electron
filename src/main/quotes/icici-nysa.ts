// The steps of ICICI Lombard's NYSA health-site forms, as recorded on 26 November 2026
// (src/shared/insurers/icici-nysa.ts): Elevate for a health client, International Travel and
// Student Medical Travel for a travel client. Angular Material throughout: dropdowns (mat-select,
// their options in an overlay), toggle buttons, calendars. The boxes repeat their ids (every
// adult's relationship and date of birth is "adultDetails"), so each is taken by its place.
import type { ClientInput } from '../../shared/contracts/client';
import type { Traveller } from '../../shared/contracts/traveller';
import {
  ICICI_TRAVEL_DESTINATION_IDS,
  ICICI_TRAVEL_DESTINATION_NAMES,
  type IciciElevateRun,
  type IciciIntlTravelRun,
  type IciciStudentTravelRun,
} from '../../shared/insurers/icici-nysa';
import type { PlanStep } from './uiic-health';

export type IciciNysaPlan =
  { ok: true; steps: PlanStep[]; byHand: string[] } | { ok: false; problems: string[] };

/**
 * Elevate's names for each relationship, tried in order (its lists are in capitals; the recording
 * showed "FATHER", "EMPLOYEE SON", "DAUGHTER-IN-LAW", "EMPLOYEE MOTHER", so a relation may come
 * as itself, as the employee's, or, for a spouse, as wife or husband).
 */
const elevateRelations = (m: ClientInput['members'][number]): string[] => {
  const as = (name: string) => [name, `EMPLOYEE ${name}`];
  switch (m.relationship) {
    case 'self':
      return ['SELF'];
    case 'spouse':
      return [
        'SPOUSE',
        ...(m.gender === 'female' ? ['WIFE'] : m.gender === 'male' ? ['HUSBAND'] : []),
        'EMPLOYEE SPOUSE',
        ...(m.gender ? [] : ['WIFE', 'HUSBAND']),
      ];
    case 'son':
      return as('SON');
    case 'daughter':
      return as('DAUGHTER');
    case 'father':
      return as('FATHER');
    case 'mother':
      return as('MOTHER');
    case 'father_in_law':
      return ['FATHER-IN-LAW', 'FATHER IN LAW', 'EMPLOYEE FATHER-IN-LAW'];
    case 'mother_in_law':
      return ['MOTHER-IN-LAW', 'MOTHER IN LAW', 'EMPLOYEE MOTHER-IN-LAW'];
  }
};
/** Elevate's limits (its messages: "Only 2 Adult are allowed", "Only 3 Child are allowed"). */
const MAX_ADULTS = 2;
const MAX_CHILDREN = 3;
/** A son or daughter this young is one of Elevate's children; older, an adult. */
const CHILD_UNDER = 25;

const lakh = (n: number) => `₹${(n / 100000).toLocaleString('en-IN')} lakh`;

export function planIciciElevate(client: ClientInput, run: IciciElevateRun): IciciNysaPlan {
  const problems: string[] = [];
  const isChild = (m: ClientInput['members'][number]) =>
    (m.relationship === 'son' || m.relationship === 'daughter') && m.age < CHILD_UNDER;
  const adults = client.members.filter((m) => !isChild(m));
  const children = client.members.filter(isChild);
  if (adults.length === 0) problems.push('Elevate needs at least one adult member.');
  if (adults.length > MAX_ADULTS) {
    problems.push(`Elevate takes at most ${MAX_ADULTS} adults (this client has ${adults.length}).`);
  }
  if (children.length > MAX_CHILDREN) {
    problems.push(
      `Elevate takes at most ${MAX_CHILDREN} children (this client has ${children.length}).`,
    );
  }
  for (const m of client.members) {
    if (!m.dateOfBirth) {
      problems.push(`Add the date of birth of the ${m.relationship.replace(/_/g, ' ')}.`);
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  const steps: PlanStep[] = [
    {
      label: 'Policy type: New',
      op: { op: 'toggle', name: 'productType', text: 'New', timeoutMs: 5000 },
      optional: true,
    },
    { label: 'PIN code', op: { op: 'setField', selector: '#pincode', value: client.pincode } },
    {
      label: 'State & city (ICICI looks the PIN code up)',
      op: {
        op: 'waitForValue',
        selector: 'input[formcontrolname="cityState"]',
        timeoutMs: 15000,
        soft: true,
      },
    },
    {
      label: 'Adults',
      op: { op: 'countTo', label: 'Adult', count: adults.length, timeoutMs: 10000 },
    },
    {
      label: 'Children',
      op: { op: 'countTo', label: 'Child', count: children.length, timeoutMs: 10000 },
    },
    ...adults.flatMap((m, i): PlanStep[] => [
      {
        label: `Adult ${i + 1}: relationship`,
        op: {
          op: 'matSelect',
          selector: 'mat-select#adultDetails',
          nth: i,
          pick: { anyOf: elevateRelations(m) },
          timeoutMs: 10000,
        },
      },
      {
        label: `Adult ${i + 1}: date of birth`,
        op: { op: 'matDate', selector: 'input#adultDetails', nth: i, date: m.dateOfBirth! },
      },
    ]),
    // A son's or daughter's gender is their relationship: Elevate asks it only of others.
    ...children.flatMap((m, i): PlanStep[] => [
      {
        label: `Child ${i + 1}: relationship`,
        op: {
          op: 'matSelect',
          selector: 'mat-select#childDetails',
          nth: i,
          pick: { anyOf: elevateRelations(m) },
          timeoutMs: 10000,
        },
      },
      {
        label: `Child ${i + 1}: date of birth`,
        op: { op: 'matDate', selector: 'input#childDetails', nth: i, date: m.dateOfBirth! },
      },
    ]),
    {
      label: `Policy tenure: ${run.tenure} year${run.tenure > 1 ? 's' : ''}`,
      op: { op: 'toggle', question: 'Policy Tenure', text: String(run.tenure), timeoutMs: 5000 },
    },
    {
      label: 'Sum insured range',
      op: {
        op: 'toggle',
        question: 'SI Range',
        text: run.sumInsured >= 10_000_000 ? '1Cr-Unlimited' : '7.5L-50L',
        timeoutMs: 5000,
      },
      optional: true,
    },
    {
      label: `Sum insured: ${lakh(run.sumInsured)}`,
      op: {
        op: 'matSelect',
        selector: '#applicantAnnualSum',
        pick: { amount: run.sumInsured },
        timeoutMs: 10000,
      },
    },
    {
      label: "Applicant's annual income",
      op: {
        op: 'matSelect',
        selector: '#applicantAnnualIncome',
        pick: { range: run.annualIncome },
        timeoutMs: 10000,
      },
    },
    {
      label: `Pre-existing medical condition: ${run.preExistingDisease ? 'Yes' : 'No'}`,
      op: {
        op: 'toggle',
        question: 'pre-existing medical condition',
        text: run.preExistingDisease ? 'Yes' : 'No',
        timeoutMs: 5000,
      },
    },
    {
      label: 'NRI discount: No',
      op: { op: 'toggle', question: 'NRI discount', text: 'No', timeoutMs: 3000 },
      optional: true,
    },
    // Allowed by the advisor (26 November 2026): the plans' premiums show only after it.
    {
      label: 'Generate Quote',
      op: { op: 'clickButton', text: 'Generate Quote', timeoutMs: 10000 },
      finish: true,
    },
    {
      label: 'Plans and premiums',
      op: { op: 'readCards', ids: ['Basic', 'Essential', 'Recommended'], timeoutMs: 60000 },
    },
  ];
  return { ok: true, steps, byHand: [] };
}

/** Days of cover for a trip, both days counted. */
export function tripDays(departure: string, ret: string): number {
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((day(ret) - day(departure)) / 86_400_000) + 1;
}

/** The steps both travel forms share: the traveller (one, the applicant), then the plan. */
const travellerSteps = (traveller: Traveller, plan: string | undefined): PlanStep[] => [
  {
    label: "Traveller's date of birth",
    op: { op: 'matDate', selector: 'input#members', nth: 0, date: traveller.dateOfBirth },
  },
  {
    label: 'Relationship with the applicant: Self',
    op: {
      op: 'matSelect',
      selector: 'mat-select#members',
      nth: 0,
      pick: { text: 'Self' },
      timeoutMs: 10000,
    },
  },
  // ICICI lists the plans once the trip and traveller are in: the plan by its exact name (names
  // alike are other plans: "GOLD_W50", "GOLD_W_50"). Without one, the advisor chooses it.
  ...(plan
    ? [
        {
          label: `Plan: ${plan}`,
          op: {
            op: 'matSelect',
            selector: '#plan',
            pick: { text: plan, exact: true },
            timeoutMs: 20000,
          },
          keep: 'plan',
        } satisfies PlanStep,
      ]
    : []),
  // Allowed by the advisor (26 November 2026): the premium shows only after it.
  {
    label: 'Get quote',
    op: { op: 'clickButton', text: 'Get quote', timeoutMs: 10000 },
    finish: true,
  },
  {
    label: 'Total premium',
    op: {
      op: 'readAmount',
      label: 'Total premium',
      alsoLabels: ['Total Premium', 'Premium'],
      timeoutMs: 60000,
      fresh: true,
    },
    keep: 'premium',
  },
];

export function planIciciIntlTravel(traveller: Traveller, run: IciciIntlTravelRun): IciciNysaPlan {
  const id = ICICI_TRAVEL_DESTINATION_IDS[run.destination];
  const steps: PlanStep[] = [
    // One traveller: the Individual policy.
    {
      label: 'Product subtype: Individual',
      op: {
        op: 'matSelect',
        selector: '#productSubtype',
        pick: { text: 'Individual' },
        timeoutMs: 10000,
      },
    },
    {
      label: `State: ${run.state}`,
      op: { op: 'matSelect', selector: '#state', pick: { text: run.state }, timeoutMs: 15000 },
    },
    {
      label: 'Trip type: Round Trip',
      op: { op: 'toggle', name: 'tripType', text: 'Round Trip', timeoutMs: 5000 },
      optional: true,
    },
    {
      label: `Travelling to: ${ICICI_TRAVEL_DESTINATION_NAMES[run.destination]}`,
      op: {
        op: 'clickSelector',
        selector: `label[for="${id}"], td:has(#${id}) label`,
        timeoutMs: 5000,
      },
    },
    {
      label: 'Immigrant visa: No',
      op: { op: 'toggle', question: 'Immigrant Visa', text: 'No', timeoutMs: 5000 },
    },
    {
      label: 'Leaving India on',
      op: { op: 'matDate', selector: '#leavingDate', date: run.departureDate },
    },
    {
      label: 'Returning to India on',
      op: { op: 'matDate', selector: '#returningDate', date: run.returnDate },
    },
    ...travellerSteps(traveller, run.plan),
  ];
  return { ok: true, steps, byHand: [] };
}

export function planIciciStudentTravel(
  traveller: Traveller,
  run: IciciStudentTravelRun,
): IciciNysaPlan {
  const steps: PlanStep[] = [
    {
      label: `State: ${run.state}`,
      op: { op: 'matSelect', selector: '#state', pick: { text: run.state }, timeoutMs: 15000 },
    },
    {
      label: 'Student already left India: No',
      op: { op: 'toggle', question: 'already traveled from India', text: 'No', timeoutMs: 5000 },
    },
    {
      label: 'Leaving India on',
      op: { op: 'matDate', selector: '#leavingIndiaOn', date: run.departureDate },
    },
    {
      label: `Policy duration (at least ${tripDays(run.departureDate, run.returnDate)} days)`,
      op: {
        op: 'matSelect',
        selector: '#policyDuration',
        pick: { atLeastDays: tripDays(run.departureDate, run.returnDate) },
        timeoutMs: 10000,
      },
      keep: 'duration',
    },
    {
      label: `Visiting USA / Canada during studies: ${run.visitingUsaCanada ? 'Yes' : 'No'}`,
      op: {
        op: 'toggle',
        question: 'Visiting USA / Canada',
        text: run.visitingUsaCanada ? 'Yes' : 'No',
        timeoutMs: 5000,
      },
    },
    ...travellerSteps(traveller, run.plan),
  ];
  // No plan given: everything else is filled, and the advisor chooses it (Get quote then theirs).
  return {
    ok: true,
    steps,
    byHand: run.plan ? [] : ["Plan: choose it in ICICI's list, then press Get quote."],
  };
}
