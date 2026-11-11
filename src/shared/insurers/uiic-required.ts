// What United India's forms require that a client's record may lack. The quote drawer asks for these
// before a run (decision of 11 November 2026), so that the run fills every required field the app
// can fill and United India works the premium out. The lists follow what each form's plan
// (src/main/quotes/uiic-*.ts) would otherwise leave for the advisor; the client's own answers
// (medical questions, declarations), signatures, uploads and payment stay with the advisor.
import type { ClientInput } from '../contracts/client';
import type { Traveller } from '../contracts/traveller';

/** A required detail, by where it is kept. */
export type UiicRequiredKey =
  // The customer.
  | 'email'
  | 'phone'
  // The proposer ("self" member) of a health client; a traveller's own.
  | 'dateOfBirth'
  | 'gender'
  | 'maritalStatus'
  // Health forms' occupation list; travel forms' own list.
  | 'occupation'
  | 'travelOccupation'
  // Proposal details.
  | 'pan'
  | 'address'
  | 'state'
  | 'city'
  | 'village'
  | 'nomineeName'
  | 'nomineeRelationship'
  | 'nomineeAddress'
  | 'intermediaryPlace'
  | 'highRiskType'
  // Kept apart, in the secret vault.
  | 'aadhaar'
  | 'passportNumber';

export type UiicClientForm = 'health' | 'proposal';
export type UiicTravelForm = 'travel' | 'omp';

const PLACES = ['state', 'city', 'village'] as const;

/** What a health client lacks for United India's health calculator or a health e-proposal. */
export function uiicMissingForClient(
  form: UiicClientForm,
  client: ClientInput,
  saved: { aadhaar: boolean },
): UiicRequiredKey[] {
  const missing: UiicRequiredKey[] = [];
  if (!client.customer.email) missing.push('email');
  if (!client.customer.phone) missing.push('phone');
  if (form === 'health') return missing;

  const p = client.proposal ?? {};
  const self = client.members.find((m) => m.relationship === 'self');
  if (self && !self.dateOfBirth) missing.push('dateOfBirth');
  if (self && !self.gender) missing.push('gender');
  if (!client.proposerMaritalStatus) missing.push('maritalStatus');
  if (!p.occupation) missing.push('occupation');
  if (!p.pan) missing.push('pan');
  if (!saved.aadhaar) missing.push('aadhaar');
  for (const k of PLACES) if (!p[k]) missing.push(k);
  if (!p.address) missing.push('address');
  if (!p.nomineeName) missing.push('nomineeName');
  if (!p.nomineeRelationship) missing.push('nomineeRelationship');
  if (!p.nomineeAddress) missing.push('nomineeAddress');
  if (!p.intermediaryPlace) missing.push('intermediaryPlace');
  if (p.highRiskCustomer && !p.highRiskType) missing.push('highRiskType');
  return missing;
}

/** What a travel client lacks for Overseas Travel Insurance or an Overseas Mediclaim form. */
export function uiicMissingForTraveller(
  form: UiicTravelForm,
  traveller: Traveller,
  saved: { passport: boolean },
): UiicRequiredKey[] {
  const missing: UiicRequiredKey[] = [];
  const p = traveller.proposal ?? {};
  // The title (Mr, Mrs, Miss…) is worked out from the gender and marital status.
  if (!traveller.gender) missing.push('gender');
  if (!traveller.maritalStatus) missing.push('maritalStatus');
  for (const k of PLACES) if (!p[k]) missing.push(k);
  if (!p.address) missing.push('address');
  if (!traveller.customer.phone) missing.push('phone');
  if (!traveller.customer.email) missing.push('email');
  if (!traveller.occupation) missing.push('travelOccupation');
  if (!saved.passport) missing.push('passportNumber');
  if (!p.nomineeName) missing.push('nomineeName');
  if (!p.nomineeRelationship) missing.push('nomineeRelationship');
  // Overseas Mediclaim has no box for the intermediary's place.
  if (form === 'travel' && !p.intermediaryPlace) missing.push('intermediaryPlace');
  if (p.highRiskCustomer && !p.highRiskType) missing.push('highRiskType');
  return missing;
}
