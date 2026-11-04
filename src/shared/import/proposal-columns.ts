// The proposal-detail columns shared by the health and travel imports, and reading them into the
// app's proposal details. Pure.
import { readChoice, readYesNo, type rowReader } from './cells';
import { HIGH_RISK_CHOICES, listOf, NOMINEE_CHOICES } from './choices';
import type { Column } from './sheet';

export const PROPOSAL_COLUMNS = [
  { key: 'pan', header: 'PAN', help: 'For example ABCDE1234F.' },
  { key: 'address', header: 'Address', help: 'House, street and area, on one line.' },
  { key: 'state', header: 'State', help: 'As the insurer lists it.' },
  { key: 'city', header: 'City', help: 'As the insurer lists it.' },
  { key: 'village', header: 'Village', help: 'If any.' },
  { key: 'highRiskCustomer', header: 'High-risk customer', help: 'Yes or No.' },
  {
    key: 'highRiskType',
    header: 'High-risk type',
    help: `For a high-risk customer: ${listOf(HIGH_RISK_CHOICES)}.`,
  },
  { key: 'landlineStdCode', header: 'Landline STD code', help: '2 to 5 digits.' },
  { key: 'landlineNumber', header: 'Landline number', help: '5 to 8 digits.' },
  { key: 'ckycNumber', header: 'CKYC number', help: '14 digits.' },
  {
    key: 'eInsuranceAccountNumber',
    header: 'e-Insurance account number',
    help: '6 to 20 letters and digits.',
  },
  { key: 'nomineeName', header: 'Nominee name', help: '' },
  {
    key: 'nomineeRelationship',
    header: 'Nominee relationship',
    help: listOf(NOMINEE_CHOICES),
  },
  { key: 'nomineeAddress', header: 'Nominee address', help: '' },
  { key: 'nomineeContact', header: 'Nominee contact', help: '10 to 12 digits.' },
  {
    key: 'intermediaryPlace',
    header: 'Intermediary place',
    help: 'Where you sign the intermediary declaration (a town or city).',
  },
] as const satisfies readonly Column[];

export type ProposalColumnKey = (typeof PROPOSAL_COLUMNS)[number]['key'];

const TEXT_KEYS = [
  'pan',
  'address',
  'state',
  'city',
  'village',
  'landlineStdCode',
  'landlineNumber',
  'ckycNumber',
  'eInsuranceAccountNumber',
  'nomineeName',
  'nomineeAddress',
  'nomineeContact',
  'intermediaryPlace',
] as const satisfies readonly ProposalColumnKey[];

/** The proposal details in the row (raw: the schema checks and tidies them), or undefined. */
export function readProposal<K extends string>(
  r: ReturnType<typeof rowReader<K | ProposalColumnKey>>,
  extra: Partial<Record<string, string>> = {},
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = { ...extra };
  for (const key of TEXT_KEYS) {
    const value = r.text(key);
    if (value !== undefined) out[key] = value;
  }
  const highRisk = r.read('highRiskCustomer', readYesNo);
  if (highRisk !== undefined) out.highRiskCustomer = highRisk;
  const type = r.read('highRiskType', (t) => readChoice(t, HIGH_RISK_CHOICES));
  if (type !== undefined) {
    if (highRisk === false) r.problem('highRiskType', 'given, but High-risk customer is No');
    else {
      out.highRiskType = type;
      out.highRiskCustomer = true;
    }
  }
  const nominee = r.read('nomineeRelationship', (t) => readChoice(t, NOMINEE_CHOICES));
  if (nominee !== undefined) out.nomineeRelationship = nominee;
  return Object.keys(out).length > 0 ? out : undefined;
}
