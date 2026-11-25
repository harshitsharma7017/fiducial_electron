// Bajaj Allianz (Bajaj General Insurance) partner portal: its Personal Accident form, for a health
// client's proposer (request of 25 November 2026, recording bajaj-allianz-2026-11-25T06-17-21-912Z).
// The form is partner.bajajgeneral.com/health/IssuePolicy/PersonalAccident: Policy Plan, Policy
// Tenure (1Y/2Y/3Y, with a discount), Pincode (Bajaj fills the city and GST state), Family Income,
// the member (Self: first name, gender, date of birth, gross monthly income, occupation), the covers'
// sums insured (death, permanent partial and permanent total disability), then Calculate Premium
// (Bajaj's quick quote; nothing is saved). The recording did not reach a premium (Bajaj answered
// "Timeout occurred in getting response", then "Please select atleast one cover between
// Death/Permanent Partial Disability/Permanent Total Disability"), so where the premium shows is
// not known yet: the run reads it by the captions premiums commonly have.
import { z } from 'zod';

export const BAJAJ_PA_PATH = '/health/IssuePolicy/PersonalAccident';

/** Bajaj's Personal Accident plans, by its code, as its Policy Plan list names them. */
export const BAJAJ_PA_PLANS = {
  '8428': 'Global Personal Guard Policy (Individual)',
  '9901': 'Personal Accident Insurance Policy',
  '6403': 'Premium Personal Guard',
  '6402': 'Sankat Mochan',
  '6401': 'Loan Care',
  '9991': 'Saral Suraksha Bima',
} as const;
export type BajajPaPlan = keyof typeof BAJAJ_PA_PLANS;
/** The plan recorded (the others share the form; what they ask more is left to the advisor). */
export const BAJAJ_PA_RECORDED_PLAN: BajajPaPlan = '8428';

/** Bajaj's occupations, by its code, as its Occupation list names them. */
export const BAJAJ_OCCUPATIONS = {
  '100': 'Accountants',
  '101': 'Doctors',
  '102': 'Lawyers',
  '103': 'Architects',
  '104': 'IT Professional',
  '105': 'Consulting Engineers',
  '106': 'Teachers',
  '107': 'Bankers, Clerical Staff',
  '108': 'Persons engaged in administrative functions',
  '109': 'Agriculture',
  H: 'Housewife',
  R: 'Student',
  '112': 'Farmer',
  '113': 'Builders',
  '114': 'Contractors and Engineers engaged in superintending functions only',
  '115': 'Drivers',
  '116': 'All persons engaged in manual labour (Except those falling under Group III)',
  '117': 'Cash Carrying Employees',
  '118': 'Garage and Motor Mechanics',
  '119': 'Machine Operators',
  '120': 'Professional Athletics and Sportsmen',
  '121': 'Carpenter',
  '122': 'Insurance Advisor',
  '123': 'Retired Persons',
  '124': 'Electricians',
  '125': 'Others',
  '126': 'Persons Working in underground mines, explosives, magazines',
  '127': 'Workers involved in electrical installation with high tension supply',
  '128': 'Police/CRPF/BSF/Army/Navy/Airforce Professional',
  '129': 'Jockeys',
  '130': 'Adventure Sports Professional',
  '131': 'Merchant Navy',
  '132': 'Commercial Pilot',
  '133': 'Other Class 1',
  '134': 'Other Class 2',
  '135': 'No Occupation',
} as const;
export type BajajOccupation = keyof typeof BAJAJ_OCCUPATIONS;

const rupees = z.int().positive().max(1_000_000_000);

/** One Personal Accident quote: the plan, and the client's details for it. */
export const bajajPaRunSchema = z
  .strictObject({
    plan: z.enum(Object.keys(BAJAJ_PA_PLANS) as [BajajPaPlan, ...BajajPaPlan[]]),
    tenureYears: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** The family's income, a year (₹). */
    familyIncome: rupees,
    /** The insured's gross monthly income (₹). */
    monthlyIncome: rupees,
    occupation: z.enum(Object.keys(BAJAJ_OCCUPATIONS) as [BajajOccupation, ...BajajOccupation[]]),
    /** The covers' sums insured (₹): at least one, as Bajaj asks. */
    deathSumInsured: rupees.optional(),
    partialDisabilitySumInsured: rupees.optional(),
    totalDisabilitySumInsured: rupees.optional(),
  })
  .refine(
    (r) =>
      r.deathSumInsured !== undefined ||
      r.partialDisabilitySumInsured !== undefined ||
      r.totalDisabilitySumInsured !== undefined,
    { message: 'at least one cover (death, partial or total disability)' },
  );
export type BajajPaRun = z.infer<typeof bajajPaRunSchema>;
