// New India health quote forms for a saved client: the request, which clients each policy's form
// takes, what is filled, what is left to the advisor, and that nothing is saved.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { niaHealthForm, planNiaHealthQuote } from '../src/main/quotes/nia-health';
import { clientInputSchema } from '../src/shared/contracts/client';
import { NIA_HEALTH_POLICIES, type NiaHealthPolicy } from '../src/shared/insurers/nia-health';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 4);
const member = (relationship: string, age: number, dateOfBirth: string, gender = 'female') => ({
  relationship,
  age,
  dateOfBirth,
  gender,
});
const FAMILY = {
  customer: { name: 'Synthetic Family' },
  pincode: '560001',
  members: [
    member('self', 40, '1986-04-12'),
    member('spouse', 42, '1984-02-01', 'male'),
    member('daughter', 10, '2016-05-05'),
    member('son', 19, '2007-07-07', 'male'),
  ],
  proposerMaritalStatus: 'married',
  preferences: { coverType: 'floater', sumInsuredPaise: 15_000_000, tenureYears: 1 },
};

function plan(policy: NiaHealthPolicy, client: Record<string, unknown> = {}, goodHealth = true) {
  return planNiaHealthQuote(clientInputSchema.parse({ ...FAMILY, ...client }), {
    policy,
    goodHealth,
    today: TODAY,
  });
}
function ok(...args: Parameters<typeof plan>) {
  const result = plan(...args);
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result;
}
const ops = (...args: Parameters<typeof plan>): PageOp[] => ok(...args).steps.map((s) => s.op);
const valueOf = (list: PageOp[], selector: string) =>
  list.find(
    (o): o is Extract<PageOp, { op: 'setField' }> => o.op === 'setField' && o.selector === selector,
  )?.value;
const dateOf = (list: PageOp[], input: string) =>
  list.find(
    (o): o is Extract<PageOp, { op: 'typeDate' }> => o.op === 'typeDate' && o.input === input,
  )?.date;

describe('the New India health request', () => {
  it('names a client, the policy and the good health confirmation', () => {
    const request = {
      product: 'nia-health',
      clientId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      insurerId: 'new-india',
      policy: 'arogya-sanjeevani',
      goodHealthConfirmed: true,
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    expect(quoteRunRequestSchema.safeParse({ ...request, policy: 'family-medicare' }).success).toBe(
      false,
    );
    const { policy: _policy, ...noPolicy } = request;
    expect(quoteRunRequestSchema.safeParse(noPolicy).success).toBe(false);
  });

  it('opens each policy by its recorded heading, trying the tile with and without the note', () => {
    for (const policy of NIA_HEALTH_POLICIES) {
      const form = niaHealthForm(policy);
      expect(form.heading).toMatch(/Insurance$/);
      expect(form.tiles[0]).toBe(form.heading.replace(/\s*Insurance$/, ''));
    }
    expect(niaHealthForm('jan-arogya-bima').tiles).toEqual([
      'Jan Arogya Bima Policy (Cashless facility available)',
      'Jan Arogya Bima Policy',
    ]);
    expect(niaHealthForm('premier-mediclaim').askedOnOpen).toBe(true);
  });
});

describe('planNiaHealthQuote', () => {
  it('Arogya Sanjeevani: pincode, floater sum insured, each member, health "No"', () => {
    const list = ops('arogya-sanjeevani', {
      members: [...FAMILY.members, member('father_in_law', 70, '1956-01-01', 'male')],
    });
    expect(valueOf(list, '#pincodeAdd')).toBe('560001');
    expect(list).toContainEqual({
      op: 'clickButton',
      text: '560001',
      within: 'Please select one of the following postal codes',
      timeoutMs: 5000,
    });
    expect(valueOf(list, '#propSumInsuredFloater')).toBe('150000');
    expect(dateOf(list, '#proposerDob')).toBe('1986-04-12');
    expect(dateOf(list, '#spouseDob')).toBe('1984-02-01');
    expect(dateOf(list, '#childDob1, #daughterDob1')).toBe('2007-07-07');
    expect(dateOf(list, '#parentInLawDob0')).toBe('1956-01-01');
    expect(list).toContainEqual({ op: 'radio', name: 'childSufferingDiabetes0', value: 'N' });
    expect(list).toContainEqual({
      op: 'radio',
      name: 'parentInLawSufferingHyperTension0',
      value: 'N',
    });
    // Normal for the child under 18; the 19-year-old's dependent type is the advisor's.
    expect(valueOf(list, '#childDepType0')).toBe('Normal');
    expect(valueOf(list, '#childDepType1')).toBeUndefined();
    expect(ok('arogya-sanjeevani').byHand).toContain(
      'dependent type of each child aged 18 or over',
    );
  });

  it('never presses Save & Calculate Premium or Continue, on any form', () => {
    // Without the son: Asha Kiran covers daughters only.
    const members = FAMILY.members.filter((m) => m.relationship !== 'son');
    for (const policy of NIA_HEALTH_POLICIES) {
      const json = JSON.stringify(ops(policy, { members }, true));
      expect(json).not.toMatch(/Save & Calculate Premium|"Continue"|acceptTerms/);
    }
  });

  it('leaves health answers to the advisor unless good health is confirmed', () => {
    const result = ok('arogya-sanjeevani', {}, false);
    expect(JSON.stringify(result.steps)).not.toMatch(/Suffering/);
    expect(result.byHand).toContain('diabetes and hypertension answers of each member');
  });

  it('refuses Premier Mediclaim without the confirmation (New India asks before opening it)', () => {
    const result = plan('premier-mediclaim', {}, false);
    expect(result.ok).toBe(false);
    expect(ok('premier-mediclaim', {}, true).steps.length).toBeGreaterThan(0);
  });

  it('refuses members a form does not take, and members without a date of birth', () => {
    expect(plan('asha-kiran')).toEqual({
      ok: false,
      problems: ['Asha Kiran covers daughters only, not sons.'],
    });
    expect(
      plan('jan-arogya-bima', { members: [...FAMILY.members, member('mother', 65, '1961-01-01')] }),
    ).toEqual({ ok: false, problems: ['Jan Arogya Bima does not cover parents.'] });
    const noDate = plan('janata-mediclaim', {
      members: [member('self', 40, '1986-04-12'), { relationship: 'spouse', age: 42 }],
    });
    expect(noDate).toEqual({ ok: false, problems: ["Add the spouse's date of birth."] });
  });

  it('Jan Arogya Bima and Janata: a son and a daughter by their own buttons, one numbering', () => {
    const list = ops('janata-mediclaim', {
      members: [...FAMILY.members, member('father', 68, '1958-03-03', 'male')],
    });
    const buttons = list
      .filter((o): o is Extract<PageOp, { op: 'ensureShown' }> => o.op === 'ensureShown')
      .map((o) => o.open.button)
      .filter(Boolean);
    expect(buttons).toEqual([
      'Add Proposer',
      'Add Spouse',
      'Add Daughter',
      'Add Son',
      'Add Father',
    ]);
  });

  it('a sum insured per member on individual cover; floater clients leave it to the advisor', () => {
    const individual = ops('mediclaim', {
      preferences: { coverType: 'individual', sumInsuredPaise: 20_000_000, tenureYears: 2 },
    });
    expect(valueOf(individual, '#spouseSumInsured')).toBe('200000');
    expect(valueOf(individual, '#childSumInsured1')).toBe('200000');
    expect(individual).toContainEqual({ op: 'check', selector: '#policyPeriod2', checked: true });
    expect(ok('mediclaim').byHand[0]).toMatch(/^sum insured of each member/);
    // A sum New India does not list is never chosen.
    const odd = ok('janata-mediclaim', {
      preferences: { coverType: 'individual', sumInsuredPaise: 20_000_000, tenureYears: 1 },
    });
    expect(JSON.stringify(odd.steps)).not.toMatch(/SumInsured/);
    expect(odd.byHand[0]).toContain('₹50,000, ₹75,000');
  });

  it('Cancer Guard: each member’s gender (needed)', () => {
    const list = ops('cancer-guard');
    expect(list).toContainEqual({ op: 'check', selector: '#gender1', checked: true });
    expect(list).toContainEqual({ op: 'check', selector: '#childGender01', checked: true });
    const noGender = plan('cancer-guard', {
      members: [{ relationship: 'self', age: 40, dateOfBirth: '1986-04-12' }],
    });
    expect(noGender).toEqual({ ok: false, problems: ["Add the proposer (self)'s gender."] });
  });

  it('Criti Protect: the proposer alone, with the sum insured in lakhs', () => {
    const result = ok('criti-protect', {
      preferences: { coverType: 'individual', sumInsuredPaise: 100_000_000, tenureYears: 1 },
    });
    const list = result.steps.map((s) => s.op);
    expect(valueOf(list, '#sumInsured')).toBe('10 lacs');
    expect(valueOf(list, '#typeOfMember')).toBe('Proposer');
    expect(valueOf(list, '#healthCondition')).toBe('Yes');
    expect(dateOf(list, '#spouseDob')).toBeUndefined();
    expect(result.byHand).toContain('Criti Protect quotes one person: only the proposer is filled');
  });
});
