// ICICI Lombard's NYSA motor quote (nysa.icicilombard.com/NysaMotor), built from the recording
// icici-lombard-2026-11-20T07-23-41-540Z: dashboard Motor tile → Vehicle Details (New / Rollover /
// Used, ownership change, Registration Number) → Fetch Vehicle Data (ICICI reads the vehicle from
// Vahan itself; a two-wheeler's number switches to the Two Wheeler flow after an OK) → the premium
// page ("Total Premium", the IDV slider). Shared by the request contract and the screens; what is
// filled is in src/main/quotes/run-icici-motor.ts.
import { z } from 'zod';

/**
 * A registration number as written on the vehicle (spaces and hyphens allowed), as NYSA takes it:
 * MH01AB1234, DL1AM1111, or a Bharat series number (22BH1234AB).
 */
export const iciciRegistrationNumber = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(
        /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$/,
        'a registration number like MH01AB1234',
      ),
  );

/** One ICICI Lombard motor run's choices, besides the saved vehicle (not kept by the app). */
export const iciciMotorRunSchema = z
  .object({
    registrationNumber: iciciRegistrationNumber,
    /** NYSA's "ownership change" question (asked for cars renewed with ICICI). */
    ownershipChanged: z.boolean(),
    /**
     * 'insurer': the IDV ICICI works out from the vehicle; 'vehicle': the IDV saved on the
     * vehicle, set on NYSA's IDV box and updated before the premium is read.
     */
    idv: z.enum(['insurer', 'vehicle']),
  })
  .strict();
export type IciciMotorRun = z.infer<typeof iciciMotorRunSchema>;
