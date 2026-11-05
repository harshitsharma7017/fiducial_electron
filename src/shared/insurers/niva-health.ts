// Niva Bupa's health plans the app fills a premium calculator for (recording
// niva-bupa-2026-11-05T07-37-29-027Z: the calculator in UNO, #/new-premiumcalculator, walked
// through for individual and family cover and a top-up). Shared by the request contract and the
// client screen; what is filled is in src/main/quotes/niva-health.ts.
export const NIVA_HEALTH_PLANS = ['reassure-2', 'reassure-3', 'health-recharge'] as const;
export type NivaHealthPlan = (typeof NIVA_HEALTH_PLANS)[number];

/** The plan's name, as the advisor knows it. */
export const NIVA_HEALTH_PLAN_NAMES: Record<NivaHealthPlan, string> = {
  'reassure-2': 'ReAssure 2.0',
  'reassure-3': 'ReAssure 3.0',
  'health-recharge': 'Health Recharge (top-up)',
};

/**
 * How Niva Bupa's plan list names the plan: the start of the option, before "Individual" or
 * "Family Floater" (as recorded: "ReAssure2.0 Individual", "ReAssure3.0 Family Floater",
 * "HealthRechargeV2 Individual").
 */
export const NIVA_HEALTH_PLAN_OPTION: Record<NivaHealthPlan, string> = {
  'reassure-2': 'ReAssure2.0',
  'reassure-3': 'ReAssure3.0',
  'health-recharge': 'HealthRecharge',
};
