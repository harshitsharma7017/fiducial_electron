// A health client's quote choices, per insurer (request of 24 November 2026: "not a single detail
// should be asked during selection, everything should be saved in client details, just leave the
// product type"). The quote screens ask only the product (plan, policy, form); everything else a
// quote needs is saved here, in the client's Additional details, and the request is built from it.
// A choice never saved takes the default the quote screens used to start with; a declaration never
// saved is "not confirmed" (never assumed), and ICICI's pre-existing disease answer is required.
import { z } from 'zod';
import { singleLineText } from './common';
import { NIVA_HEALTH_PLANS, type NivaHealthPlan, type NivaRun } from '../insurers/niva-health';
import { NIA_PA_EXCESS, NIA_PA_SUMS, type NiaPaForm, type NiaPaRun } from '../insurers/nia-pa';
import {
  HDFC_CITIES,
  HDFC_RETAIL_PRODUCTS,
  type HdfcMstRun,
  type HdfcRetailProduct,
  type HdfcRetailRun,
} from '../insurers/hdfc';
import {
  BAJAJ_OCCUPATIONS,
  type BajajOccupation,
  type BajajPaPlan,
  type BajajPaRun,
} from '../insurers/bajaj';
import {
  ICICI_BOOSTER_DEDUCTIBLES,
  ICICI_ELEVATE_SUMS,
  type IciciApiHealthRun,
  type IciciHealthProduct,
} from '../insurers/icici-api';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const years3 = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** The insurers whose quotes take choices, in the order the client form shows them. */
export const QUOTE_CHOICE_INSURERS = [
  'united-india',
  'new-india',
  'niva-bupa',
  'hdfc-ergo',
  'icici-lombard',
  'bajaj-allianz',
] as const;
export type QuoteChoiceInsurer = (typeof QUOTE_CHOICE_INSURERS)[number];
export const QUOTE_CHOICE_INSURER_NAMES: Record<QuoteChoiceInsurer, string> = {
  'united-india': 'United India',
  'new-india': 'New India',
  'niva-bupa': 'Niva Bupa',
  'hdfc-ergo': 'HDFC ERGO',
  'icici-lombard': 'ICICI Lombard',
  'bajaj-allianz': 'Bajaj Allianz',
};

export const clientQuoteChoicesSchema = z.strictObject({
  'united-india': z
    .strictObject({
      /** The health calculator's good-health declaration. */
      goodHealth: z.boolean().optional(),
    })
    .optional(),
  'new-india': z
    .strictObject({
      /** The health forms' questions: no diabetes, hypertension, chronic illness… */
      goodHealth: z.boolean().optional(),
      // Personal accident (Sukshma, Janata: sum insured, status, years; Janata: excess).
      paSumInsured: z.enum(NIA_PA_SUMS).optional(),
      paStatus: z.enum(['earning', 'non-earning', 'minor']).optional(),
      paTerm: z.int().min(1).max(3).optional(),
      paExcess: z.enum(NIA_PA_EXCESS).optional(),
      // Personal accident, Pension.
      monthlyPensionRupees: z.int().min(1).max(10_000_000).optional(),
      pensionOrganisation: singleLineText(30).optional(),
      /** No claim in the previous three years. */
      noClaims: z.boolean().optional(),
      /** No physical disabilities or defects. */
      noDisabilities: z.boolean().optional(),
    })
    .optional(),
  'niva-bupa': z
    .strictObject({
      sumInsured: z.int().min(100000).max(100000000).optional(),
      years: years3.optional(),
      addOns: z.array(z.string().trim().min(2).max(80)).max(12).optional(),
      tieredNetwork: z.boolean().optional(),
      medicalPractitioner: z.boolean().optional(),
      /** Porting a current policy: its end date. */
      previousPolicyEndDate: isoDate.optional(),
    })
    .strict()
    .optional(),
  'hdfc-ergo': z
    .strictObject({
      mstCover: z.enum(['individual', 'family-floater']).optional(),
      mstYears: years3.optional(),
      // Optima Secure, Optima Restore, Energy.
      cover: z.enum(['individual', 'family']).optional(),
      years: years3.optional(),
      sumInsuredLacs: z.int().min(1).max(500).optional(),
      optimaSecurePlan: z.string().trim().min(2).max(60).optional(),
      energyPlan: z.string().trim().min(2).max(60).optional(),
      city: z.enum(HDFC_CITIES).optional(),
      existingSumInsured: z.int().positive().max(100_000_000).optional(),
    })
    .optional(),
  'icici-lombard': z
    .strictObject({
      sumInsured: z.int().min(100000).max(100_000_000).optional(),
      deductible: z.int().min(0).max(100_000_000).optional(),
      tenure: z.int().min(1).max(5).optional(),
      preExistingDisease: z.boolean().optional(),
      paymentOption: z.enum(['annual', 'monthly', 'quarterly']).optional(),
    })
    .optional(),
  // Personal Accident (recording of 25 November 2026).
  'bajaj-allianz': z
    .strictObject({
      paTenureYears: years3.optional(),
      /** The family's income, a year (₹). */
      familyIncome: z.int().positive().max(1_000_000_000).optional(),
      /** The proposer's gross monthly income (₹). */
      monthlyIncome: z.int().positive().max(1_000_000_000).optional(),
      occupation: z
        .enum(Object.keys(BAJAJ_OCCUPATIONS) as [BajajOccupation, ...BajajOccupation[]])
        .optional(),
      deathSumInsured: z.int().positive().max(1_000_000_000).optional(),
      partialDisabilitySumInsured: z.int().positive().max(1_000_000_000).optional(),
      totalDisabilitySumInsured: z.int().positive().max(1_000_000_000).optional(),
    })
    .optional(),
});
export type ClientQuoteChoices = z.infer<typeof clientQuoteChoicesSchema>;

/** The defaults the quote screens started with, for a choice never saved. */
export const QUOTE_DEFAULTS = {
  nivaSumInsured: 500000,
  nivaYears: 1,
  paSumInsured: '100000',
  paStatus: 'earning',
  paTerm: 1,
  paExcess: '0',
  mstCover: 'family-floater',
  mstYears: 1,
  hdfcCover: 'individual',
  hdfcYears: 1,
  hdfcSumInsuredLacs: 10,
  hdfcCity: 'Mumbai',
  iciciSumInsured: 500000,
  iciciDeductible: 500000,
  iciciTenure: 1,
  iciciPayment: 'annual',
} as const;

/** A request built from the saved choices, or what to fill in the client's details first. */
export type FromChoices<T> = { ok: true; value: T } | { ok: false; missing: string[] };

const where = (insurer: QuoteChoiceInsurer) =>
  `(Edit client, Additional details, ${QUOTE_CHOICE_INSURER_NAMES[insurer]})`;

export function nivaRunFromChoices(
  plan: NivaHealthPlan,
  choices: ClientQuoteChoices | undefined,
): FromChoices<NivaRun> {
  const c = choices?.['niva-bupa'] ?? {};
  return {
    ok: true,
    value: {
      plan: (NIVA_HEALTH_PLANS as readonly string[]).includes(plan) ? plan : 'reassure-2',
      sumInsured: c.sumInsured ?? QUOTE_DEFAULTS.nivaSumInsured,
      years: c.years ?? QUOTE_DEFAULTS.nivaYears,
      addOns: c.addOns ?? [],
      tieredNetwork: c.tieredNetwork ?? false,
      medicalPractitioner: c.medicalPractitioner ?? false,
      ...(c.previousPolicyEndDate ? { previousPolicyEndDate: c.previousPolicyEndDate } : {}),
    },
  };
}

export function niaPaFromChoices(
  form: NiaPaForm,
  choices: ClientQuoteChoices | undefined,
): FromChoices<{ run: NiaPaRun; noClaims: boolean; noDisabilities: boolean }> {
  const c = choices?.['new-india'] ?? {};
  const declarations = { noClaims: c.noClaims ?? false, noDisabilities: c.noDisabilities ?? false };
  if (form === 'pension') {
    const missing = [
      ...(c.monthlyPensionRupees ? [] : [`the monthly pension ${where('new-india')}`]),
      ...(c.pensionOrganisation
        ? []
        : [`the organisation before retirement ${where('new-india')}`]),
    ];
    if (missing.length > 0) return { ok: false, missing };
    return {
      ok: true,
      value: {
        run: {
          form,
          monthlyPensionRupees: c.monthlyPensionRupees!,
          organisation: c.pensionOrganisation!,
        },
        ...declarations,
      },
    };
  }
  const janata = {
    sumInsured: c.paSumInsured ?? QUOTE_DEFAULTS.paSumInsured,
    status: c.paStatus ?? QUOTE_DEFAULTS.paStatus,
    term: c.paTerm ?? QUOTE_DEFAULTS.paTerm,
  };
  return {
    ok: true,
    value: {
      run:
        form === 'janta'
          ? { form, ...janata, excess: c.paExcess ?? QUOTE_DEFAULTS.paExcess }
          : { form, ...janata },
      ...declarations,
    },
  };
}

export function hdfcMstFromChoices(choices: ClientQuoteChoices | undefined): HdfcMstRun {
  const c = choices?.['hdfc-ergo'] ?? {};
  return {
    cover: c.mstCover ?? QUOTE_DEFAULTS.mstCover,
    years: c.mstYears ?? QUOTE_DEFAULTS.mstYears,
  };
}

export function hdfcRetailFromChoices(
  product: HdfcRetailProduct,
  choices: ClientQuoteChoices | undefined,
  /** The advisor's SP/POSP name or code (kept on this computer, not with the client). */
  posp: string,
): FromChoices<HdfcRetailRun> {
  const c = choices?.['hdfc-ergo'] ?? {};
  if (posp.trim().length < 2) {
    return { ok: false, missing: [`your SP/POSP name or code ${where('hdfc-ergo')}`] };
  }
  const plan =
    product === 'optima-secure'
      ? c.optimaSecurePlan
      : product === 'energy'
        ? c.energyPlan
        : undefined;
  return {
    ok: true,
    value: {
      product: (HDFC_RETAIL_PRODUCTS as readonly string[]).includes(product)
        ? product
        : 'optima-secure',
      cover: product === 'energy' ? 'individual' : (c.cover ?? QUOTE_DEFAULTS.hdfcCover),
      years: c.years ?? QUOTE_DEFAULTS.hdfcYears,
      city: c.city ?? QUOTE_DEFAULTS.hdfcCity,
      posp: posp.trim(),
      ...(product !== 'energy'
        ? { sumInsuredLacs: c.sumInsuredLacs ?? QUOTE_DEFAULTS.hdfcSumInsuredLacs }
        : {}),
      ...(plan ? { plan } : {}),
      ...(product === 'energy' && c.existingSumInsured
        ? { existingSumInsured: c.existingSumInsured }
        : {}),
    },
  };
}

/** The sums insured the client form offers for an ICICI plan. */
export const iciciSumsFor = (product: IciciHealthProduct): readonly number[] =>
  product === 'elevate' ? ICICI_ELEVATE_SUMS : [500000, 1000000, 2000000, 2500000, 5000000];

export function iciciHealthFromChoices(
  product: IciciHealthProduct,
  choices: ClientQuoteChoices | undefined,
): FromChoices<IciciApiHealthRun> {
  const c = choices?.['icici-lombard'] ?? {};
  const missing: string[] = [];
  if (c.preExistingDisease === undefined) {
    missing.push(`whether any member has a pre-existing disease ${where('icici-lombard')}`);
  }
  const sumInsured = c.sumInsured ?? QUOTE_DEFAULTS.iciciSumInsured;
  if (!iciciSumsFor(product).includes(sumInsured)) {
    missing.push(
      `a sum insured ${product === 'elevate' ? 'Elevate offers (₹5, 10 or 25 lakh)' : 'for Activate Booster'} ${where('icici-lombard')}`,
    );
  }
  const deductible = c.deductible ?? QUOTE_DEFAULTS.iciciDeductible;
  if (
    product === 'activate-booster' &&
    !(ICICI_BOOSTER_DEDUCTIBLES as readonly number[]).includes(deductible)
  ) {
    missing.push(`one of Activate Booster's deductibles ${where('icici-lombard')}`);
  }
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    value: {
      product,
      sumInsured,
      tenure: c.tenure ?? QUOTE_DEFAULTS.iciciTenure,
      ...(product === 'activate-booster' ? { deductible } : {}),
      preExistingDisease: c.preExistingDisease!,
      paymentOption: c.paymentOption ?? QUOTE_DEFAULTS.iciciPayment,
    },
  };
}

/** Bajaj Allianz's Personal Accident run, from the client's details (the plan chosen here). */
export function bajajPaFromChoices(
  plan: BajajPaPlan,
  choices: ClientQuoteChoices | undefined,
): FromChoices<BajajPaRun> {
  const c = choices?.['bajaj-allianz'] ?? {};
  const missing = [
    ...(c.familyIncome ? [] : [`the family income ${where('bajaj-allianz')}`]),
    ...(c.monthlyIncome ? [] : [`the gross monthly income ${where('bajaj-allianz')}`]),
    ...(c.occupation ? [] : [`the occupation ${where('bajaj-allianz')}`]),
    ...(c.deathSumInsured || c.partialDisabilitySumInsured || c.totalDisabilitySumInsured
      ? []
      : [`a sum insured for at least one cover ${where('bajaj-allianz')}`]),
  ];
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    value: {
      plan,
      tenureYears: c.paTenureYears ?? 1,
      familyIncome: c.familyIncome!,
      monthlyIncome: c.monthlyIncome!,
      occupation: c.occupation!,
      ...(c.deathSumInsured ? { deathSumInsured: c.deathSumInsured } : {}),
      ...(c.partialDisabilitySumInsured
        ? { partialDisabilitySumInsured: c.partialDisabilitySumInsured }
        : {}),
      ...(c.totalDisabilitySumInsured
        ? { totalDisabilitySumInsured: c.totalDisabilitySumInsured }
        : {}),
    },
  };
}
