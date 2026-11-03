// United India Family Medicare e-proposal: what the app fills, what it leaves to the advisor, and
// that it never saves or submits.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { planUiicFamilyMedicareProposal } from '../src/main/quotes/uiic-fm-proposal';
import { clientInputSchema } from '../src/shared/contracts/client';

const FULL = {
  customer: { name: 'Synthetic Proposer', phone: '9876543210', email: 'proposer@example.test' },
  pincode: '560001',
  proposerMaritalStatus: 'married',
  members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-04-12', gender: 'female' }],
  proposal: {
    pan: 'ABCDE1234F',
    address: '12 Synthetic Street',
    occupation: 'Software Professional',
    nomineeRelationship: 'spouse',
    highRiskCustomer: false,
  },
};

function plan(change: Record<string, unknown> = {}, aadhaar: string | null = null) {
  const result = planUiicFamilyMedicareProposal(clientInputSchema.parse({ ...FULL, ...change }), {
    aadhaar,
  });
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result;
}
const ops = (change: Record<string, unknown> = {}): PageOp[] => plan(change).steps.map((s) => s.op);
const valueOf = (list: PageOp[], selector: string) =>
  list.find(
    (o): o is Extract<PageOp, { op: 'setField' }> => o.op === 'setField' && o.selector === selector,
  )?.value;
const checks = (list: PageOp[]) =>
  list
    .filter((o): o is Extract<PageOp, { op: 'check' }> => o.op === 'check')
    .map((o) => o.selector);

describe('planUiicFamilyMedicareProposal', () => {
  it('fills the first part, the proposer details and the nominee relationship', () => {
    const list = ops();
    expect(valueOf(list, '#OCCUPATION_CODE')).toBe('Software Professional');
    expect(valueOf(list, '#proposerPANCardNo')).toBe('ABCDE1234F');
    expect(valueOf(list, '#proposerPINCode')).toBe('560001');
    expect(valueOf(list, '#proposerAddress')).toBe('12 Synthetic Street');
    expect(valueOf(list, '#nomineeRelationship')).toBe('Spouse');
    expect(list).toContainEqual({ op: 'pickDate', input: 'input#proposerDOB', date: '1986-04-12' });
    const checked = checks(list).join(' ');
    expect(checked).toContain('input[value="agent"][ng-model="formData.proposalFilledBy"]');
    expect(checked).toContain('input[value="new"][ng-model="formData.chooseProposal"]');
    expect(checked).toContain('input[value="Female"][ng-model="formData.proposerGender"]');
    expect(checked).toContain('input[value="Married"][ng-model="formData.proposerMaritalStatus"]');
    expect(JSON.stringify(list)).toContain('"value":"No"'); // not a high-risk customer
  });

  it('never saves or submits: no Save As Draft, Submit or payment step', () => {
    const text = JSON.stringify(plan().steps).toLowerCase();
    for (const word of ['save', 'submit', 'pay', 'proceed']) expect(text).not.toContain(word);
  });

  it('fills the Aadhaar number from the vault when saved, else leaves it to the advisor', () => {
    const withIt = plan({}, '999941057058');
    expect(
      valueOf(
        withIt.steps.map((s) => s.op),
        '#proposerAadhaarCard_PassportNo',
      ),
    ).toBe('999941057058');
    expect(withIt.byHand.join(' ')).not.toMatch(/Aadhaar/);
    const without = plan();
    expect(JSON.stringify(without.steps)).not.toMatch(/proposerAadhaar/);
    expect(without.byHand).toContain('Aadhaar number (none saved for this client)');
  });

  it('closes United India’s ERRORS pop-up when opening Nomination, and keeps going', () => {
    const steps = plan().steps;
    const open = steps.find((s) => s.op.op === 'clickLink');
    expect(open).toMatchObject({ op: { text: 'II. Nomination' }, closeErrors: true });
  });

  it('leaves what the client record lacks to the advisor', () => {
    const result = plan({
      customer: { name: 'Synthetic Proposer' },
      proposerMaritalStatus: 'widowed',
      proposal: { highRiskCustomer: true },
    });
    expect(result.byHand).toEqual(
      expect.arrayContaining([
        'mobile number',
        'e-mail',
        'customer high risk type',
        'marital status',
        'occupation',
        'PAN',
        'address',
        'nominee relationship',
      ]),
    );
    const list = result.steps.map((s) => s.op);
    expect(JSON.stringify(list)).toContain('"value":"Yes"'); // high-risk customer
    expect(valueOf(list, '#proposerPANCardNo')).toBeUndefined();
  });

  it('fills every recorded proposer, nominee and intermediary detail the client holds', () => {
    const result = plan(
      {
        proposal: {
          ...FULL.proposal,
          state: 'Karnataka',
          city: 'Bengaluru',
          village: 'Koramangala',
          landlineStdCode: '080',
          landlineNumber: '22223333',
          ckycNumber: '12345678901234',
          eInsuranceAccountNumber: 'eia1234567',
          nomineeName: 'Synthetic Nominee',
          nomineeAddress: '12 Synthetic Street',
          nomineeContact: '98765 00000',
          intermediaryPlace: 'Bengaluru',
        },
      },
      '999941057058',
    );
    const list = result.steps.map((s) => s.op);
    expect(valueOf(list, '#STATE_CODE1')).toBe('Karnataka');
    expect(valueOf(list, '#STATE_CODE2')).toBe('Bengaluru');
    // A place the lookup does not list is left to the advisor, who is told which.
    expect(result.steps.find((s) => s.label === 'Village')).toMatchObject({
      optional: true,
      ifMissed:
        'Village "Koramangala" is not in United India\'s list for this PIN code: choose it by hand',
    });
    expect(valueOf(list, '#Village_Code')).toBe('Koramangala');
    expect(valueOf(list, '#proposerTelNoSTDCode')).toBe('080');
    expect(valueOf(list, '#proposerTelNoHome')).toBe('22223333');
    expect(valueOf(list, '#proposerCKYCNo')).toBe('12345678901234');
    expect(valueOf(list, '#proposerEInsuranceAccountNo')).toBe('EIA1234567');
    expect(valueOf(list, '#nomineeName')).toBe('Synthetic Nominee');
    expect(valueOf(list, '#nomineeAddress')).toBe('12 Synthetic Street');
    expect(valueOf(list, '#nomineeContactNo')).toBe('9876500000');
    expect(valueOf(list, '#IntermediaryDeclarationPlace')).toBe('Bengaluru');
    // Section XI is opened like Nomination, closing United India's ERRORS pop-up.
    expect(
      result.steps.find(
        (s) => s.op.op === 'clickLink' && s.op.text === 'XI. Declaration from Intermediary',
      ),
    ).toMatchObject({ closeErrors: true });
    // Everything the form asks in these sections is in the record: nothing left by hand.
    expect(result.byHand).toEqual([]);
  });

  it('rejects malformed CKYC, landline or e-insurance numbers', () => {
    for (const bad of [
      { ckycNumber: '1234' },
      { landlineStdCode: '0' },
      { landlineNumber: '12ab' },
      { eInsuranceAccountNumber: 'E-1' },
      { nomineeContact: '123' },
    ]) {
      expect(() => clientInputSchema.parse({ ...FULL, proposal: bad })).toThrow();
    }
  });

  it('chooses the high-risk type after Yes, or leaves it to the advisor when not saved', () => {
    const typed = plan({ proposal: { highRiskCustomer: true, highRiskType: 'trust-ngo' } });
    expect(
      valueOf(
        typed.steps.map((s) => s.op),
        'select[ng-model="formData.highRiskType"], select[data-ng-model="formData.highRiskType"], select[x-ng-model="formData.highRiskType"]',
      ),
    ).toBe('4');
    expect(typed.byHand).not.toContain('customer high risk type');
    expect(plan({ proposal: { highRiskCustomer: true } }).byHand).toContain(
      'customer high risk type',
    );
  });

  it('maps unmarried to Single', () => {
    expect(checks(ops({ proposerMaritalStatus: 'unmarried' })).join(' ')).toContain(
      'input[value="Single"]',
    );
  });

  it('refuses a client without the proposer ("self")', () => {
    const client = clientInputSchema.parse({
      ...FULL,
      members: [{ relationship: 'spouse', age: 38 }],
    });
    expect(planUiicFamilyMedicareProposal(client).ok).toBe(false);
  });
});
