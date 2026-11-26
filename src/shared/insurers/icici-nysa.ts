// ICICI Lombard's products on NYSA's health site (nysa-health.icicilombard.com), as the advisor
// recorded them on 26 November 2026 (icici-lombard-2026-11-26T06-19-41-899Z and the next three):
// NYSA's dashboard → Health (ICICI's server hands the tab to the health site, its /swap page) →
//   Elevate (/health/elevate): pincode, adults and children, each one's relationship and date of
//     birth, policy tenure, sum insured, the applicant's annual income, the pre-existing disease
//     question → Generate Quote → three plans with their premiums (Basic, Essential, Recommended);
//   International Travel (/travel/international-travel): subtype, state, round trip, where to,
//     the immigrant visa question, the dates, the traveller, the plan → Get quote → Total premium;
//   Student Medical Travel (/travel/student-medical-travel): state, whether the student has left,
//     the departure, the policy duration, the student, USA / Canada, the plan → Get quote.
// The advisor allowed pressing Generate Quote and Get quote (26 November 2026: the premium shows
// only after them); never Save & Proceed, KYC or payment. Trip Secure (/travel/tripsecure) is not
// automated: its form is drawn where the recorder (and the app) cannot see it.
import { z } from 'zod';

export const NYSA_HEALTH_ORIGIN = 'https://nysa-health.icicilombard.com';
export const NYSA_HEALTH_DASHBOARD = '/health/dashboard';

export const ICICI_NYSA_PRODUCTS = ['elevate', 'international-travel', 'student-travel'] as const;
export type IciciNysaProduct = (typeof ICICI_NYSA_PRODUCTS)[number];

/**
 * Each product's page, the box that shows once it is ready, and its tile on the health dashboard.
 * `viaHealthTile`: opened only by NYSA's own Health tile (Elevate: the tile leads there through
 * the health dashboard, as recorded; its address loaded directly shows ICICI's "Oops! your page
 * could not be found", 26 November 2026). The travel forms open by their address.
 */
export const ICICI_NYSA_PAGES: Record<
  IciciNysaProduct,
  { path: string; ready: string; tile: string; name: string; viaHealthTile?: boolean }
> = {
  elevate: {
    path: '/health/elevate',
    ready: '#pincode',
    tile: 'Elevate',
    name: 'Elevate',
    viaHealthTile: true,
  },
  'international-travel': {
    path: '/travel/international-travel',
    ready: '#productSubtype',
    tile: 'International Travel',
    name: 'International Travel',
  },
  'student-travel': {
    path: '/travel/student-medical-travel',
    ready: '#leavingIndiaOn',
    tile: 'Student Medical Travel',
    name: 'Student Medical Travel',
  },
};

/** The sums insured Elevate's list offered (₹; "₹ 7.5 L" to "₹ 50 L", the 7.5L-50L range). */
export const ICICI_NYSA_ELEVATE_SUMS = [
  750000, 1000000, 1500000, 2000000, 2500000, 5000000,
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const iciciElevateRunSchema = z
  .object({
    /** ₹, as Elevate lists it. */
    sumInsured: z.int().min(100000).max(100_000_000),
    tenure: z.int().min(1).max(5),
    /** The applicant's annual income (₹): Elevate asks its band. */
    annualIncome: z.int().positive().max(1_000_000_000),
    preExistingDisease: z.boolean(),
  })
  .strict();
export type IciciElevateRun = z.infer<typeof iciciElevateRunSchema>;

/** Where the trip goes, as International Travel's choices name it (and their boxes' ids). */
export const ICICI_TRAVEL_DESTINATIONS = ['usa-canada', 'schengen', 'asia', 'other'] as const;
export type IciciTravelDestination = (typeof ICICI_TRAVEL_DESTINATIONS)[number];
export const ICICI_TRAVEL_DESTINATION_NAMES: Record<IciciTravelDestination, string> = {
  'usa-canada': 'USA / Canada',
  schengen: 'Schengen',
  asia: 'Asia',
  other: 'Other countries',
};
export const ICICI_TRAVEL_DESTINATION_IDS: Record<IciciTravelDestination, string> = {
  'usa-canada': 'USAorCanada',
  schengen: 'schengenCountries',
  asia: 'asia',
  other: 'otherCountries',
};

/**
 * International Travel's plans for each destination, as ICICI's list names them (the advisor's
 * screenshots of 26 November 2026; ICICI's own spelling, "Gold_X50" beside "GOLD_X50" included).
 * Names alike are different plans ("GOLD_W50" and "GOLD_W_50"): a plan is chosen by its exact
 * name, never by the cover it carries.
 */
export const ICICI_INTL_TRAVEL_PLANS: Record<IciciTravelDestination, readonly string[]> = {
  'usa-canada': [
    'SILVER_W_50',
    'SILVER_W_100',
    'GOLD1',
    'GOLD_W50',
    'GOLD_W_50',
    'GOLD_W100',
    'GOLD_W_100',
    'GOLD_W250',
    'GOLD_W_250',
    'GOLD_W500',
    'GOLD_W_500',
    'PLATINUM_W50',
    'PLATINUM_W_50',
    'PLATINUM_W100',
    'PLATINUM_W_100',
    'PLATINUM_W250',
    'PLATINUM_W_250',
    'PLATINUM_W500',
    'PLATINUM_W_500',
  ],
  schengen: ['GOLD_S50', 'GOLD_S_50', 'PLATINUM_S100', 'PLATINUMS_100', 'PLATINUM_S_500'],
  asia: ['ASIA', 'GOLD_A25', 'GOLD_A_25'],
  other: [
    'SILVER_X_50',
    'SILVER_X_100',
    'Gold_X50',
    'GOLD_X50',
    'GOLD_X_50',
    'GOLD_X100',
    'GOLD_X_100',
    'GOLD_X250',
    'GOLD_X_250',
    'GOLD_X500',
    'GOLD_X_500',
    'PLATINUM_X50',
    'PLATINUM_X_50',
    'PLATINUM_X100',
    'PLATINUM_X_100',
    'PLATINUM_X250',
    'PLATINUM_X_250',
    'PLATINUM_X500',
    'PLATINUM_X_500',
  ],
};
/** The plan first offered for each destination. */
export const ICICI_INTL_TRAVEL_DEFAULT_PLAN: Record<IciciTravelDestination, string> = {
  'usa-canada': 'GOLD_W_50',
  schengen: 'GOLD_S_50',
  asia: 'GOLD_A_25',
  other: 'GOLD_X_50',
};

/** A plan's name as ICICI spells it (letters, digits, underscores; its capitals kept). */
const planName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{2,40}$/);

const trip = {
  departureDate: isoDate,
  returnDate: isoDate,
  /** The traveller's state, as ICICI lists it (its list is in capitals; matched ignoring case). */
  state: z.string().trim().min(3).max(60),
};
const datesInOrder = {
  check: (t: { departureDate: string; returnDate: string }) => t.departureDate <= t.returnDate,
  message: 'the return is after the departure',
};

export const iciciIntlTravelRunSchema = z
  .object({ ...trip, destination: z.enum(ICICI_TRAVEL_DESTINATIONS), plan: planName })
  .strict()
  .refine(datesInOrder.check, { message: datesInOrder.message, path: ['returnDate'] });
export type IciciIntlTravelRun = z.infer<typeof iciciIntlTravelRunSchema>;

export const iciciStudentTravelRunSchema = z
  .object({
    ...trip,
    visitingUsaCanada: z.boolean(),
    /** Its plans were never listed when recorded: without one, the advisor chooses it. */
    plan: planName.optional(),
  })
  .strict()
  .refine(datesInOrder.check, { message: datesInOrder.message, path: ['returnDate'] });
export type IciciStudentTravelRun = z.infer<typeof iciciStudentTravelRunSchema>;
