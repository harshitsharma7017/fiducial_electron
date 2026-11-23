// ICICI Lombard's partner API (request of 21 November 2026: ICICI premiums by API, not by filling
// NYSA). Built from ICICI's partner API kits: "Authentication Access Token & Encryption Key",
// "Generic 4W" and the two-wheeler kit (motor-fw / motor-tw premium), and "Elevate Fresh API Kit
// V3" with its masters (Elevate and Activate Booster, the super top-up). Shared by the request
// contract, the settings screen and the quote screens; the calls are in src/main/icici-api/.
// Only the premium endpoints are used: never a proposal, payment, KYC or policy endpoint.
import { z } from 'zod';
import { iciciRegistrationNumber } from './icici';

/** ICICI's two environments, as its API kits give them. */
export const ICICI_API_MODES = ['uat', 'production'] as const;
export type IciciApiMode = (typeof ICICI_API_MODES)[number];
export const ICICI_API_BASE: Record<IciciApiMode, string> = {
  uat: 'https://ilesbapigee.insurancearticlez.com',
  production: 'https://janus.icicilombard.com',
};
export const ICICI_API_MODE_NAMES: Record<IciciApiMode, string> = {
  uat: 'UAT (testing)',
  production: 'Production',
};

/**
 * The partner login for one environment, as ICICI issued it. ICICI's kits ask for the password
 * already encrypted with the AES key it shares: it is entered as ICICI gave it (the app does not
 * encrypt it). The IMID code is sent with health premiums.
 */
export const iciciApiLoginSchema = z
  .object({
    login: z.string().trim().min(1).max(120),
    encryptedPassword: z.string().trim().min(1).max(1024),
    imidCode: z.string().trim().max(40).optional(),
  })
  .strict();
export type IciciApiLogin = z.infer<typeof iciciApiLoginSchema>;

/** What the settings screen shows: never a login or password, only whether one is saved. */
export const iciciApiStatusSchema = z
  .object({
    /** The environment premiums are fetched from; null: the API is not used. */
    mode: z.enum(ICICI_API_MODES).nullable(),
    saved: z.object({ uat: z.boolean(), production: z.boolean() }).strict(),
  })
  .strict();
export type IciciApiStatus = z.infer<typeof iciciApiStatusSchema>;

// Motor ---------------------------------------------------------------------------------------

export type IciciMotorVehicle = '4w' | '2w';
export const ICICI_MOTOR_COVERS = ['package', 'own-damage', 'liability'] as const;
export type IciciMotorCover = (typeof ICICI_MOTOR_COVERS)[number];

/**
 * The kits' product masters: the product code for a vehicle, cover and term. New and used
 * vehicles are one year, package cover; own damage and liability are one-year rollovers.
 */
export function iciciMotorProductCode(
  vehicle: IciciMotorVehicle,
  kind: 'new' | 'rollover' | 'used',
  cover: IciciMotorCover,
  years: 1 | 2 | 3,
): number | null {
  const four = vehicle === '4w';
  if (cover === 'own-damage') return kind === 'rollover' && years === 1 ? (four ? 22 : 16) : null;
  if (cover === 'liability') return kind === 'rollover' && years === 1 ? (four ? 25 : 24) : null;
  if (kind === 'new') return years === 1 ? (four ? 20 : 10) : null;
  if (kind === 'used') return years === 1 ? (four ? 29 : 26) : null;
  const rollover = four ? { 1: 21, 2: 36, 3: 53 } : { 1: 13, 2: 14, 3: 15 };
  return rollover[years];
}

/** The add-ons each kit lists (eligibility is ICICI's: it may refuse one for a vehicle). */
export const ICICI_MOTOR_ADDONS: Record<IciciMotorVehicle, Record<string, string>> = {
  '4w': {
    RSA: 'Roadside assistance',
    ZD: 'Zero depreciation',
    EP: 'Engine protect',
    KP: 'Key protect',
    GC: 'Garage cash',
    LOPB: 'Loss of personal belongings',
    CS: 'Consumables',
    TP: 'Tyre protect',
    ATD: 'Anti-theft discount',
    'VD-2500': 'Voluntary deductible ₹2,500',
    'VD-5000': 'Voluntary deductible ₹5,000',
  },
  '2w': {
    RSA: 'Roadside assistance',
    ZD: 'Zero depreciation',
    RTI: 'Return to invoice',
    EP: 'Engine protect',
    LDBP: 'Battery protect',
    KP: 'Key protect',
    TP: 'Tyre protect',
    DA: 'Driving accessories',
    CS: 'Consumables',
  },
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date (YYYY-MM-DD)');
const masterCode = z.int().positive().max(999_999_999);

/** One ICICI motor premium request's choices, besides the saved vehicle (not kept by the app). */
export const iciciApiMotorRunSchema = z
  .object({
    cover: z.enum(ICICI_MOTOR_COVERS),
    years: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** A pre-owned vehicle bought without a running policy (ICICI's "Used" products). */
    used: z.boolean(),
    /**
     * ICICI's master codes (its make, model and RTO masters). ICICI's kits mark them mandatory;
     * they are optional here (request of 23 November 2026) so that a premium can be asked by the
     * registration number alone, to see whether ICICI looks the vehicle up itself. ICICI's answer
     * says if it does not.
     */
    makeCode: masterCode.optional(),
    modelCode: masterCode.optional(),
    rtoCode: masterCode.optional(),
    /** Optional for a new vehicle. */
    registrationNumber: iciciRegistrationNumber.optional(),
    /** The previous policy, for a rollover. */
    previous: z
      .object({
        expiryDate: isoDate,
        type: z.enum(['comprehensive', 'tp']),
        insurerCode: z.string().trim().max(40).optional(),
      })
      .strict()
      .optional(),
    /** The running third-party policy, for own damage cover. */
    activeTp: z
      .object({
        policyNumber: z.string().trim().min(1).max(30),
        startDate: isoDate,
        endDate: isoDate,
        insurerCode: z.string().trim().min(1).max(40),
      })
      .strict()
      .optional(),
    /** ICICI's lowest, highest or middle IDV, or the vehicle's own. */
    idv: z.enum(['min', 'max', 'avg', 'vehicle']),
    addOns: z.array(z.string().max(20)).max(15),
    hasExistingPaCover: z.boolean(),
    pincode: z
      .string()
      .regex(/^[1-9]\d{5}$/)
      .optional(),
  })
  .strict();
export type IciciApiMotorRun = z.infer<typeof iciciApiMotorRunSchema>;

// Health --------------------------------------------------------------------------------------

export const ICICI_HEALTH_PRODUCTS = ['elevate', 'activate-booster'] as const;
export type IciciHealthProduct = (typeof ICICI_HEALTH_PRODUCTS)[number];
export const ICICI_HEALTH_NAMES: Record<IciciHealthProduct, string> = {
  elevate: 'Elevate',
  'activate-booster': 'Activate Booster (super top-up)',
};
/** The kit's ProductCode: Elevate Health 18, Activate Booster 19. */
export const ICICI_HEALTH_PRODUCT_CODE: Record<IciciHealthProduct, number> = {
  elevate: 18,
  'activate-booster': 19,
};
/** Elevate's sums insured, as its kit lists them. */
export const ICICI_ELEVATE_SUMS = [500000, 1000000, 2500000] as const;
/** Activate Booster's deductibles (the masters' "Activate Booster Standalone" sheet). */
export const ICICI_BOOSTER_DEDUCTIBLES = [
  300000, 400000, 500000, 750000, 1000000, 1500000, 2000000,
] as const;

/** One ICICI health premium request's choices, besides the saved client (not kept by the app). */
export const iciciApiHealthRunSchema = z
  .object({
    product: z.enum(ICICI_HEALTH_PRODUCTS),
    sumInsured: z.int().min(100000).max(100_000_000),
    tenure: z.int().min(1).max(5),
    /** Activate Booster: the deductible (the base cover it tops up). */
    deductible: z.int().min(0).max(100_000_000).optional(),
    /**
     * The advisor's answer for this quote: whether any member has a pre-existing disease (ICICI
     * asks it per member; the app gives the same answer for all).
     */
    preExistingDisease: z.boolean(),
    paymentOption: z.enum(['annual', 'monthly', 'quarterly']),
  })
  .strict()
  .refine(
    (r) =>
      r.product !== 'elevate' || (ICICI_ELEVATE_SUMS as readonly number[]).includes(r.sumInsured),
    { message: 'Elevate is offered for ₹5, 10 or 25 lakh', path: ['sumInsured'] },
  )
  .refine(
    (r) =>
      r.product !== 'activate-booster' ||
      (r.deductible !== undefined &&
        (ICICI_BOOSTER_DEDUCTIBLES as readonly number[]).includes(r.deductible)),
    { message: 'Activate Booster needs one of its deductibles', path: ['deductible'] },
  );
export type IciciApiHealthRun = z.infer<typeof iciciApiHealthRunSchema>;
