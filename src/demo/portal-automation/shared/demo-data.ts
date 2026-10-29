// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The test proposal the demo fills in. The insured is either clearly made up (its name says
// "Demo", "Synthetic" or "Sample") or an approved test client, by its exact name. Contact details
// use the reserved example.test domain; the dates and sums insured are made up.
import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SYNTHETIC_MARKER = /\b(demo|synthetic|sample)\b/i;

/**
 * Test clients set up in the live portal, accepted by their exact name. Adding one is a reviewed
 * change, and must never name a real customer. "Deccan Cold Chain LLP": supplied by the team on
 * 2026-10-29 as the client for the live test (its GSTIN, 29ZZZZZ0003Z1ZJ, is a placeholder);
 * to be confirmed as a test record with the portal owners before the live creation test.
 */
export const APPROVED_TEST_CLIENTS: readonly string[] = ['Deccan Cold Chain LLP'];

const isoDate = z
  .string()
  .regex(ISO_DATE, 'Use a date as YYYY-MM-DD')
  .refine((value) => {
    // A real calendar day: 31 Feb would roll over into March and read back differently.
    const day = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }, 'Not a real date');
const rupees = z
  .string()
  .trim()
  .regex(/^\d{1,13}$/, 'Whole rupees, digits only')
  .or(z.literal(''));

export const DemoProposalSchema = z
  .object({
    caseType: z.enum(['NEW', 'RENEWAL']),
    insuredName: z
      .string()
      .trim()
      .min(3, 'Enter the insured’s name')
      .max(120)
      .refine(
        (name) => SYNTHETIC_MARKER.test(name) || APPROVED_TEST_CLIENTS.includes(name),
        'Test data only: the name must contain Demo, Synthetic or Sample, or be an approved test client',
      ),
    policyStart: isoDate,
    policyEnd: isoDate,
    quotesNeededBy: isoDate,
    /** A staff member's name as the portal lists it; empty keeps the signed-in user. */
    assignedTo: z.string().trim().max(120),
    contactEmail: z
      .string()
      .trim()
      .regex(/^[^@\s]+@example\.test$/i, 'Demo data only: use an address at example.test'),
    risk: z
      .object({
        occupancy: z.string().trim().max(120),
        location: z.string().trim().max(200),
        buildingSumInsured: rupees,
        plantSumInsured: rupees,
        stockSumInsured: rupees,
      })
      .strict(),
  })
  .strict()
  .refine((data) => data.policyEnd > data.policyStart, {
    path: ['policyEnd'],
    message: 'The policy must end after it starts',
  });

export type DemoProposal = z.infer<typeof DemoProposalSchema>;

/** The prefilled test proposal (dates are fixed so the demo always shows the same values). */
export const SYNTHETIC_DEMO_PROPOSAL: DemoProposal = {
  caseType: 'NEW',
  insuredName: 'Deccan Cold Chain LLP',
  policyStart: '2026-12-01',
  policyEnd: '2027-11-30',
  quotesNeededBy: '2026-11-20',
  assignedTo: '',
  contactEmail: 'risk.manager@example.test',
  risk: {
    occupancy: '4007 — Cold Storage premises',
    location: 'Peenya cold store, 45 Peenya Phase 2, Bengaluru 560058',
    buildingSumInsured: '20000000',
    plantSumInsured: '15000000',
    stockSumInsured: '5000000',
  },
};

/** Field paths with the first message for each, for the demo screen. */
export function demoDataErrors(input: unknown): Record<string, string> {
  const result = DemoProposalSchema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.');
    errors[key] ??= issue.message;
  }
  return errors;
}
