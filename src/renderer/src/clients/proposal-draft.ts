// The client form's proposal details as typed (drafts), and their conversion to and from a saved
// record, per insurer (request of 24 November 2026). No UI here: proposal-fields.tsx draws them.
import {
  INSURER_DETAIL_FIELDS,
  type ClientDetailInsurer,
  type HighRiskType,
  type MaritalStatus,
  type NomineeRelationship,
  type ProposalDetails,
} from '../../../shared/contracts/client';

export const MARITAL_LABELS: Record<MaritalStatus, string> = {
  married: 'Married',
  unmarried: 'Unmarried',
  widowed: 'Widow / widower',
  divorced: 'Divorced',
};

export const NOMINEE_LABELS: Record<NomineeRelationship, string> = {
  spouse: 'Spouse',
  father: 'Father',
  mother: 'Mother',
  son: 'Son',
  daughter: 'Daughter',
  father_in_law: 'Father-in-law',
  mother_in_law: 'Mother-in-law',
  brother: 'Brother',
  sister: 'Sister',
};

/** The proposal details kept as text in the form (all but the relationship and the flag). */
export const PROPOSAL_TEXT = [
  'pan',
  'address',
  'state',
  'city',
  'village',
  'occupation',
  'landlineStdCode',
  'landlineNumber',
  'ckycNumber',
  'eInsuranceAccountNumber',
  'nomineeName',
  'nomineeAddress',
  'nomineeContact',
  'intermediaryPlace',
] as const;
export type ProposalTextKey = (typeof PROPOSAL_TEXT)[number];

export type ProposalDraft = Record<ProposalTextKey, string> & {
  nomineeRelationship: NomineeRelationship | '';
  highRiskCustomer: boolean;
  highRiskType: HighRiskType | '';
};

export const HIGH_RISK_LABELS: Record<HighRiskType, string> = {
  hni: 'High-net-worth individual (HNI)',
  pep: 'Politically exposed person (PEP) or close relative',
  'nri-hni': 'NRI / foreign resident who is also HNI',
  'trust-ngo': 'Trust / NGO paying over ₹10 lakh premium a year',
};

export const EMPTY_PROPOSAL: ProposalDraft = {
  ...(Object.fromEntries(PROPOSAL_TEXT.map((k) => [k, ''])) as Record<ProposalTextKey, string>),
  nomineeRelationship: '',
  highRiskCustomer: false,
  highRiskType: '',
};

/** The Aadhaar number, kept apart (secret vault): the form only knows its last four digits. */
export interface AadhaarDraft {
  lastFour: string | null;
  /** A new number typed in (replaces any saved one). */
  input: string;
  remove: boolean;
}

/** The details given, for saving: empty boxes are not saved. */
export function proposalToInput(
  d: ProposalDraft,
  options: { occupation?: boolean } = {},
): Record<string, unknown> {
  const keys = PROPOSAL_TEXT.filter((k) => options.occupation !== false || k !== 'occupation');
  return {
    ...Object.fromEntries(keys.filter((k) => d[k].trim()).map((k) => [k, d[k].trim()])),
    ...(d.nomineeRelationship ? { nomineeRelationship: d.nomineeRelationship } : {}),
    highRiskCustomer: d.highRiskCustomer,
    ...(d.highRiskCustomer && d.highRiskType ? { highRiskType: d.highRiskType } : {}),
  };
}

/**
 * One insurer's details, for saving: only the fields its forms use, empty boxes left out; null
 * when nothing is given.
 */
export function insurerProposalToInput(
  insurer: ClientDetailInsurer,
  d: ProposalDraft,
): Record<string, unknown> | null {
  const fields = new Set<string>(INSURER_DETAIL_FIELDS[insurer]);
  const given = Object.fromEntries(
    Object.entries(proposalToInput(d)).filter(([k]) => fields.has(k)),
  );
  // "Not a high-risk customer" alone is no detail.
  if (given['highRiskCustomer'] === false) delete given['highRiskCustomer'];
  return Object.keys(given).length > 0 ? given : null;
}

/** Whether a draft has anything given among an insurer's fields. */
export function hasInsurerDetails(insurer: ClientDetailInsurer, d: ProposalDraft): boolean {
  return insurerProposalToInput(insurer, d) !== null;
}

/** A saved record's details, for the form. */
export function proposalFromRecord(p: Partial<ProposalDetails> | undefined): ProposalDraft {
  return {
    ...(Object.fromEntries(PROPOSAL_TEXT.map((k) => [k, p?.[k] ?? ''])) as Record<
      ProposalTextKey,
      string
    >),
    nomineeRelationship: p?.nomineeRelationship ?? '',
    highRiskCustomer: p?.highRiskCustomer ?? false,
    highRiskType: p?.highRiskType ?? '',
  };
}

/** The Aadhaar change to send with a save: a new number, null to remove it, or nothing. */
export function aadhaarChange(a: AadhaarDraft): { aadhaar?: string | null } {
  return a.input.trim() ? { aadhaar: a.input.trim() } : a.remove ? { aadhaar: null } : {};
}
