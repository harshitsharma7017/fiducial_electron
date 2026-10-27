// Pre-flight check of insurer-specific required fields (FR-04, TC-04). A missing field blocks
// that insurer only; the others can still run. Reports field names, never values.
import type { AdapterMetadata, RequiredField } from '../contracts/adapter';
import type { QuoteDraft } from '../contracts/quote';

export interface PreflightOutcome {
  insurerId: string;
  ready: boolean;
  missing: RequiredField[];
}

function isPresent(field: RequiredField, draft: QuoteDraft): boolean {
  switch (field) {
    case 'customer.phone':
      return draft.customer.phone !== undefined;
    case 'customer.email':
      return draft.customer.email !== undefined;
    case 'request.pincode':
      return draft.request.pincode.length > 0;
    case 'members.dateOfBirth':
      // Not captured in the M3 contracts (C-05).
      return false;
  }
}

export function preflight(
  adapters: readonly Pick<AdapterMetadata, 'id' | 'requiredFields'>[],
  draft: QuoteDraft,
): PreflightOutcome[] {
  return adapters.map((adapter) => {
    const missing = [...new Set(adapter.requiredFields)]
      .filter((field) => !isPresent(field, draft))
      .sort();
    return { insurerId: adapter.id, ready: missing.length === 0, missing };
  });
}
