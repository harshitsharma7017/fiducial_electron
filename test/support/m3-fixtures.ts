// Synthetic M3 fixtures. Every value is invented: insurer IDs are placeholders, not real insurers,
// and no fixture contains customer data, credentials or insurer session data.
import type { CoverageTerms } from '../../src/shared/contracts/coverage';
import type { InsurerResultInput, QuoteRequestInput } from '../../src/shared/contracts/quote';
import { rupees } from '../../src/shared/money';

export const REQUEST = {
  members: [
    { relationship: 'self', age: 34 },
    { relationship: 'spouse', age: 31 },
  ],
  coverType: 'floater',
  sumInsuredPaise: rupees(5_00_000),
  tenureYears: 1,
  pincode: '110001',
} as const satisfies QuoteRequestInput;

/** Every coverage term known: no co-pay, no deductible, no room-rent limit, base plan only. */
export function knownTerms(): CoverageTerms {
  return {
    coPay: { status: 'known', value: 0 },
    deductible: { status: 'known', value: 0 },
    roomRent: { status: 'known', value: { kind: 'no_limit' } },
    addOns: { status: 'known', value: [] },
  };
}

type Coverage = NonNullable<InsurerResultInput['coverage']>;

/** A completed, valid result that is comparable with REQUEST under the provisional rule. */
export function comparableResult(
  resultId: string,
  insurerId: string,
  totalPaise: number,
  overrides: Partial<InsurerResultInput> & { coverage?: Partial<Coverage> } = {},
): InsurerResultInput {
  const { coverage, ...rest } = overrides;
  return {
    resultId,
    insurerId,
    status: 'completed',
    source: 'automated',
    retrievedAt: '2026-10-27T10:00:00+05:30',
    planLabel: 'Synthetic Floater Plan',
    currency: 'INR',
    premium: { total: { paise: totalPaise }, basis: 'incl_gst' },
    coverage: {
      sumInsured: { paise: REQUEST.sumInsuredPaise },
      coverType: REQUEST.coverType,
      tenureYears: REQUEST.tenureYears,
      members: REQUEST.members.map((member) => ({ ...member })),
      terms: knownTerms(),
      ...coverage,
    },
    ...rest,
  };
}

/** A non-completed result as the orchestrator would record it (no premium). */
export function failedResult(
  resultId: string,
  insurerId: string,
  status: InsurerResultInput['status'] = 'failed',
): InsurerResultInput {
  return {
    resultId,
    insurerId,
    status,
    source: 'automated',
    retrievedAt: '2026-10-27T10:00:00+05:30',
    errorCode: 'PORTAL_UNAVAILABLE',
  };
}

/** Synthetic sensitive-looking values that must never appear in errors or comparison output. */
export const SENSITIVE = {
  name: 'Asha Verma',
  phone: '9876543210',
  email: 'asha.verma@example.com',
  secret: 'hunter2',
  idNumber: '1234 5678 9012',
} as const;

export function expectNoSensitiveValues(output: unknown, values: readonly string[]): void {
  const text = JSON.stringify(output);
  for (const value of values) {
    if (text.includes(value)) throw new Error('output contains a sensitive test value');
  }
}
