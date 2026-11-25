// Additional details per insurer (request of 24 November 2026): each insurer keeps its own set,
// filled in separately (nothing is copied from one insurer to another); a client saved before then
// (one `proposal`, drawn from United India's e-proposal) is United India's; a run sees only its
// insurer's; the form saves only the fields each insurer's forms use. Synthetic data only.
import { describe, expect, it } from 'vitest';
import {
  clientForInsurer,
  clientInputSchema,
  detailsFor,
  insurerDetailsOf,
  type ClientInput,
} from '../src/shared/contracts/client';
import { uiicMissingForClient } from '../src/shared/insurers/uiic-required';
import {
  EMPTY_PROPOSAL,
  insurerProposalToInput,
  proposalFromRecord,
} from '../src/renderer/src/clients/proposal-draft';

const BASE = {
  customer: { name: 'Synthetic Insured', phone: '9876543210', email: 'synthetic@example.test' },
  pincode: '380001',
  members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-01-25', gender: 'male' }],
} as const;

const SHARED = {
  pan: 'ABCDE1234F',
  address: '1 Synthetic Road',
  city: 'Ahmedabad',
  occupation: 'Service',
  nomineeName: 'Synthetic Nominee',
  nomineeRelationship: 'spouse',
  intermediaryPlace: 'Ahmedabad',
} as const;

describe('additional details per insurer', () => {
  it('keeps a set per insurer, and refuses an insurer it does not know', () => {
    const client = clientInputSchema.parse({
      ...BASE,
      insurerDetails: {
        'united-india': { occupation: 'Software Professional', pan: 'abcde1234f' },
        'new-india': { occupation: 'Professional' },
        'niva-bupa': { city: 'Gandhinagar' },
      },
    });
    expect(client.insurerDetails?.['united-india']?.pan).toBe('ABCDE1234F');
    expect(
      clientInputSchema.safeParse({ ...BASE, insurerDetails: { 'hdfc-ergo': { city: 'X' } } })
        .success,
    ).toBe(false);
  });

  it("reads a client saved before as United India's, and copies it to no other insurer", () => {
    const client = clientInputSchema.parse({ ...BASE, proposal: SHARED });
    expect(insurerDetailsOf(client)).toEqual({ 'united-india': SHARED });
    expect(detailsFor(client, 'new-india')).toBeUndefined();
    expect(detailsFor(client, 'niva-bupa')).toBeUndefined();
    expect(clientForInsurer(client, 'niva-bupa')).not.toHaveProperty('proposal');
  });

  it('prefers the per-insurer sets once saved, and gives other insurers none', () => {
    const client = clientInputSchema.parse({
      ...BASE,
      proposal: SHARED,
      insurerDetails: { 'niva-bupa': { city: 'Surat' } },
    });
    expect(detailsFor(client, 'niva-bupa')).toEqual({ city: 'Surat' });
    expect(detailsFor(client, 'united-india')).toBeUndefined();
    expect(detailsFor(client, 'hdfc-ergo')).toBeUndefined();
  });

  it("gives a run only its insurer's details, as the proposal it reads", () => {
    const client: ClientInput = clientInputSchema.parse({
      ...BASE,
      proposerMaritalStatus: 'married',
      insurerDetails: {
        'united-india': { pan: 'ABCDE1234F', city: 'Ahmedabad' },
        'niva-bupa': { city: 'Surat' },
      },
    });
    const niva = clientForInsurer(client, 'niva-bupa');
    expect(niva.proposal).toEqual({ city: 'Surat' });
    expect(niva).not.toHaveProperty('insurerDetails');
    expect(niva.proposerMaritalStatus).toBe('married');
    expect(clientForInsurer(client, 'united-india').proposal?.pan).toBe('ABCDE1234F');
    // New India has none saved: its run sees no other insurer's.
    expect(clientForInsurer(client, 'new-india')).not.toHaveProperty('proposal');
    expect(clientForInsurer(client, 'hdfc-ergo')).not.toHaveProperty('proposal');
  });

  it("checks United India's required fields against United India's details", () => {
    const client = clientInputSchema.parse({
      ...BASE,
      proposerMaritalStatus: 'married',
      insurerDetails: { 'new-india': { occupation: 'Service', address: '1 Synthetic Road' } },
    });
    const missing = uiicMissingForClient('proposal', client, { aadhaar: true });
    expect(missing).toContain('occupation');
    expect(missing).toContain('address');
  });

  it('saves only the fields each insurer uses, and nothing for an empty tab', () => {
    const draft = proposalFromRecord(SHARED);
    expect(insurerProposalToInput('niva-bupa', draft)).toEqual({ city: 'Ahmedabad' });
    expect(insurerProposalToInput('new-india', draft)).toEqual({
      address: '1 Synthetic Road',
      occupation: 'Service',
      nomineeName: 'Synthetic Nominee',
      nomineeRelationship: 'spouse',
    });
    expect(insurerProposalToInput('united-india', EMPTY_PROPOSAL)).toBeNull();
  });

  it("saves each insurer's tab on its own: one insurer's values never reach another's", () => {
    const united = proposalFromRecord({ city: 'Ahmedabad', pan: 'ABCDE1234F' });
    expect(insurerProposalToInput('united-india', united)).toEqual({
      city: 'Ahmedabad',
      pan: 'ABCDE1234F',
    });
    // Niva Bupa's tab is its own draft: empty until filled in there.
    expect(insurerProposalToInput('niva-bupa', EMPTY_PROPOSAL)).toBeNull();
  });
});
