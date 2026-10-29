// DEVELOPMENT-ONLY synthetic scenarios for the M3 comparison demonstration. Every value is
// invented: the insurers, plans, customer and prices are fictional and do not represent any real
// insurer, product or market price. Scenarios describe their inputs only; what the engine does
// with them is computed at run time by `compareQuotes` and is never stored here.
import type { CustomerInput } from '../../../shared/contracts/customer';
import type { Insurer } from '../../../shared/contracts/insurer';
import type { InsurerResultInput, QuoteRequestInput } from '../../../shared/contracts/quote';
import { rupees } from '../../../shared/money';

export const DEMO_DISCLAIMER =
  'Demonstration only — all customer and quote data is synthetic. No real insurer quotes are retrieved.';

export interface DemoScenario {
  id: string;
  title: string;
  /** One line on what the scenario exercises, for the scenario picker. */
  focus: string;
  /** What the inputs contain. Deliberately says nothing about the engine's outcome. */
  description: string;
  customer: CustomerInput;
  request: QuoteRequestInput;
  insurers: readonly Insurer[];
  /** Raw insurer results as an adapter or manual entry would supply them. May be malformed. */
  quotes: readonly unknown[];
}

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
type Letter = (typeof LETTERS)[number];

export const DEMO_INSURERS: readonly Insurer[] = LETTERS.map((letter) => ({
  id: `demo-insurer-${letter}`,
  displayName: `Demo Insurer ${letter.toUpperCase()}`,
}));

const CUSTOMER: CustomerInput = {
  name: 'Demo Customer (synthetic)',
  notes: 'Synthetic record for the M3 comparison demonstration.',
};

const REQUEST = {
  members: [
    { relationship: 'self', age: 34 },
    { relationship: 'spouse', age: 31 },
  ],
  coverType: 'floater',
  sumInsuredPaise: rupees(5_00_000),
  tenureYears: 1,
  pincode: '110001',
} as const satisfies QuoteRequestInput;

/** Fixed timestamp: the demo must not depend on the clock. */
const RETRIEVED_AT = '2026-10-27T10:00:00+05:30';

type Coverage = NonNullable<InsurerResultInput['coverage']>;
type QuoteOverrides = Partial<Omit<InsurerResultInput, 'coverage'>> & {
  coverage?: Partial<Coverage>;
};

/**
 * A completed synthetic quote that matches REQUEST exactly, with every coverage term shown
 * (no co-pay, no deductible, no room-rent limit, base plan only). Overrides introduce the
 * differences each scenario is about.
 */
function quote(letter: Letter, premiumRupees: number, overrides: QuoteOverrides = {}) {
  const { coverage, ...rest } = overrides;
  return {
    resultId: `demo-${letter}-1`,
    insurerId: `demo-insurer-${letter}`,
    status: 'completed',
    source: 'automated',
    retrievedAt: RETRIEVED_AT,
    planLabel: `Demo Floater Plan ${letter.toUpperCase()}`,
    currency: 'INR',
    premium: { total: { paise: rupees(premiumRupees) }, basis: 'incl_gst' },
    coverage: {
      sumInsured: { paise: REQUEST.sumInsuredPaise },
      coverType: REQUEST.coverType,
      tenureYears: REQUEST.tenureYears,
      members: REQUEST.members.map((member) => ({ ...member })),
      terms: {
        coPay: { status: 'known', value: 0 },
        deductible: { status: 'known', value: 0 },
        roomRent: { status: 'known', value: { kind: 'no_limit' } },
        addOns: { status: 'known', value: [] },
      },
      ...coverage,
    },
    ...rest,
  } satisfies InsurerResultInput;
}

/** A quote run that did not complete, as the orchestrator would record it (no premium). */
function notCompleted(letter: Letter, status: InsurerResultInput['status']) {
  return {
    resultId: `demo-${letter}-1`,
    insurerId: `demo-insurer-${letter}`,
    status,
    source: 'automated',
    retrievedAt: RETRIEVED_AT,
    errorCode: 'PORTAL_UNAVAILABLE',
  } satisfies InsurerResultInput;
}

const base = { customer: CUSTOMER, request: REQUEST, insurers: DEMO_INSURERS };

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    ...base,
    id: 'distinct-premiums',
    title: 'Matching quotes with different premiums',
    focus: 'Lowest-premium selection across automated and manual quotes',
    description:
      'Three completed quotes match the request; one is a manual entry. A fourth insurer timed out.',
    quotes: [
      quote('a', 18_450),
      quote('b', 21_300),
      quote('c', 0, {
        source: 'manual',
        premium: { total: { text: '₹19,980' }, basis: 'incl_gst' },
      }),
      notCompleted('d', 'timed_out'),
    ],
  },
  {
    ...base,
    id: 'tied-premiums',
    title: 'Two quotes share the lowest premium',
    focus: 'Handling of an exact premium tie',
    description: 'Three matching quotes; two of them show exactly the same premium.',
    quotes: [quote('a', 18_450), quote('b', 18_450), quote('c', 20_100)],
  },
  {
    ...base,
    id: 'mismatched-cover',
    title: 'Some quotes do not match the request',
    focus: 'Quotes whose cover, tenure or tax basis differs from the request',
    description:
      'Two quotes match the request. Others show a smaller sum insured, a GST-exclusive premium, an add-on, or a two-year tenure.',
    quotes: [
      quote('a', 18_450),
      quote('b', 21_300),
      quote('c', 16_200, { coverage: { sumInsured: { paise: rupees(3_00_000) } } }),
      quote('d', 17_900, { premium: { total: { paise: rupees(17_900) }, basis: 'excl_gst' } }),
      quote('e', 19_250, {
        coverage: {
          terms: {
            coPay: { status: 'known', value: 0 },
            deductible: { status: 'known', value: 0 },
            roomRent: { status: 'known', value: { kind: 'no_limit' } },
            addOns: { status: 'known', value: ['demo-room-upgrade'] },
          },
        },
      }),
      quote('f', 34_600, { coverage: { tenureYears: 2 } }),
    ],
  },
  {
    ...base,
    id: 'terms-differ',
    title: 'Matching quotes with different co-pay',
    focus: 'Matching quotes whose coverage terms differ',
    description: 'Both quotes match the request, but one has a 20% co-pay and the other has none.',
    quotes: [
      quote('a', 18_450),
      quote('b', 15_900, {
        coverage: {
          terms: {
            coPay: { status: 'known', value: 20 },
            deductible: { status: 'known', value: 0 },
            roomRent: { status: 'known', value: { kind: 'no_limit' } },
            addOns: { status: 'known', value: [] },
          },
        },
      }),
    ],
  },
  {
    ...base,
    id: 'invalid-quotes',
    title: 'Invalid and malformed quote records',
    focus: 'Incomplete, unreadable and malformed quote records',
    description:
      'One clean quote. Others have no premium, an unreadable premium range, a review flag, a non-INR currency, or a malformed timestamp.',
    quotes: [
      quote('a', 18_450),
      quote('b', 0, { premium: { basis: 'incl_gst' } }),
      quote('c', 0, { premium: { total: { text: '₹17,000 - ₹19,000' }, basis: 'incl_gst' } }),
      quote('d', 16_800, { reviewFlags: ['ambiguous_premium'] }),
      quote('e', 230, { currency: 'USD' }),
      // Deliberately malformed: the timestamp is not an ISO date-time.
      { ...quote('f', 17_500), retrievedAt: 'not-a-date' },
    ],
  },
  {
    ...base,
    id: 'no-usable-quotes',
    title: 'No insurer returned a completed quote',
    focus: 'A run where no insurer completed a quote',
    description: 'One insurer failed and another does not support the request.',
    quotes: [notCompleted('a', 'failed'), notCompleted('b', 'unsupported')],
  },
  {
    ...base,
    id: 'no-quotes',
    title: 'No quotes supplied',
    focus: 'An empty quote set',
    description: 'The request is valid but the quote set is empty.',
    quotes: [],
  },
  {
    ...base,
    id: 'invalid-request',
    title: 'Request outside the input rules',
    focus: 'Customer input that fails the request rules',
    description:
      'The primary member is 70, above the placeholder maximum adult age. Two quotes are present.',
    request: {
      ...REQUEST,
      members: [
        { relationship: 'self', age: 70 },
        { relationship: 'spouse', age: 31 },
      ],
    },
    quotes: [quote('a', 18_450), quote('b', 21_300)],
  },
];
