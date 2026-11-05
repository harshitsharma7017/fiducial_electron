// Niva Bupa's health plans the app fills the premium calculator for, and the choices of one run.
// Built from the recording niva-bupa-2026-11-05T08-20-27-977Z: UNO's Premium Calculator, "I Know
// My Plan", the plan by name, members, customer's details and questions, then Customize Your Plan
// (sum insured, policy period, add-ons, Tiered Network) and Calculate Premium. Shared by the
// request contract and the client screen; what is filled is in src/main/quotes/niva-health.ts.
import { z } from 'zod';

export const NIVA_HEALTH_PLANS = ['reassure-2', 'reassure-3', 'health-recharge'] as const;
export type NivaHealthPlan = (typeof NIVA_HEALTH_PLANS)[number];

/** The plan's name, as the advisor knows it. */
export const NIVA_HEALTH_PLAN_NAMES: Record<NivaHealthPlan, string> = {
  'reassure-2': 'ReAssure 2.0',
  'reassure-3': 'ReAssure 3.0',
  'health-recharge': 'Health Recharge (top-up)',
};

/**
 * How Niva Bupa's plan list names the plan, before "Individual" or "Family Floater" (as recorded:
 * "ReAssure2.0 Individual", "ReAssure2.0 Family Floater"; "ReAssure3.0 Family Floater" and
 * "HealthRechargeV2 Individual" on the calculator's other lists).
 */
export const NIVA_HEALTH_PLAN_OPTION: Record<NivaHealthPlan, string> = {
  'reassure-2': 'ReAssure2.0',
  'reassure-3': 'ReAssure3.0',
  'health-recharge': 'HealthRechargeV2',
};

/** Sums insured Niva Bupa offered for ReAssure 2.0 (rupees), as recorded. */
export const NIVA_SUMS_INSURED = [
  500000, 750000, 1000000, 1500000, 2000000, 2500000, 5000000, 10000000,
] as const;

/** Add-ons seen in the recording (Key Add-Ons); others are typed by name. */
export const NIVA_KNOWN_ADD_ONS = ['Safeguard', 'Prolonged treatment assistance cover'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One run's choices. */
export const nivaRunSchema = z
  .object({
    plan: z.enum(NIVA_HEALTH_PLANS),
    /** Rupees; Niva Bupa's list for the plan must offer it. */
    sumInsured: z.int().min(100000).max(100000000),
    years: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Key Add-Ons, by the name Niva Bupa shows. */
    addOns: z.array(z.string().trim().min(2).max(80)).max(12),
    /** Opt for the Tiered Network (Niva Bupa: a discount with a co-pay). */
    tieredNetwork: z.boolean(),
    /** "Is any of the insured member a medical practitioner?" */
    medicalPractitioner: z.boolean(),
    /** Porting a current policy: its end date (YYYY-MM-DD). Absent: no transfer. */
    previousPolicyEndDate: isoDate.optional(),
  })
  .strict();
export type NivaRun = z.infer<typeof nivaRunSchema>;
