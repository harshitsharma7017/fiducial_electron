// New India Personal Accident forms for a health client's proposer: the request, what is
// filled, what is left to the advisor, and that nothing is saved.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { niaPaForm, planNiaPaQuote } from '../src/main/quotes/nia-pa';
import { clientInputSchema } from '../src/shared/contracts/client';
import { NIA_PA_FORMS, type NiaPaRun } from '../src/shared/insurers/nia-pa';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const CLIENT = {
  customer: { name: 'Synthetic Insured' },
  pincode: '560001',
  members: [{ relationship: 'self', age: 45, dateOfBirth: '1981-02-20', gender: 'female' }],
  proposal: { nomineeName: 'Synthetic Nominee Long Name', nomineeRelationship: 'father_in_law' },
};
const JANTA: NiaPaRun = {
  form: 'janta',
  sumInsured: '50000',
  status: 'earning',
  term: 1,
  excess: '0',
};
const plan = (
  run: NiaPaRun = JANTA,
  client: Record<string, unknown> = {},
  options = { noClaims: true, noDisabilities: true },
) => planNiaPaQuote(clientInputSchema.parse({ ...CLIENT, ...client }), run, options);
const ops = (...args: Parameters<typeof plan>): PageOp[] => {
  const r = plan(...args);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.steps.map((s) => s.op);
};
const valueOf = (list: PageOp[], selector: string) =>
  list.find(
    (o): o is Extract<PageOp, { op: 'setField' }> => o.op === 'setField' && o.selector === selector,
  )?.value;

describe('New India Personal Accident', () => {
  it('a request names a health client, the run and both confirmations', () => {
    const request = {
      product: 'nia-pa',
      clientId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      insurerId: 'new-india',
      run: JANTA,
      noClaimsConfirmed: true,
      noDisabilitiesConfirmed: false,
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    expect(
      quoteRunRequestSchema.safeParse({ ...request, run: { ...JANTA, sumInsured: '200000' } })
        .success,
    ).toBe(false);
    for (const f of NIA_PA_FORMS) expect(niaPaForm(f).heading).toMatch(/Insurance$/);
  });

  it('never presses a save, calculate or payment button, and answers no claim', () => {
    for (const run of [
      JANTA,
      { form: 'sukshma', sumInsured: '25000', status: 'minor', term: 3 },
      { form: 'pension', monthlyPensionRupees: 20000, organisation: 'Synthetic Works' },
    ] as NiaPaRun[]) {
      const list = ops(run);
      // No button is pressed at all (Save & Calculate, Approve & Pay, Find, Create, Submit).
      expect(list.filter((o) => o.op === 'clickButton' || o.op === 'clickText')).toEqual([]);
      expect(valueOf(list, '#vPreviousClaim')).toBe('No');
    }
  });

  it('refuses without the no-claims confirmation, or without the insured’s date of birth', () => {
    expect(plan(JANTA, {}, { noClaims: false, noDisabilities: true }).ok).toBe(false);
    expect(plan(JANTA, { members: [{ relationship: 'self', age: 45, gender: 'female' }] })).toEqual(
      { ok: false, problems: ["Add the proposer's (self) date of birth."] },
    );
  });

  it('keeps to New India’s lengths and lists; leaves the rest to the advisor', () => {
    const result = plan();
    if (!result.ok) throw new Error('refused');
    const list = result.steps.map((s) => s.op);
    // The nominee's name is longer than the 20 characters the Janata forms take.
    expect(valueOf(list, '#vNomineesName_1')).toBeUndefined();
    expect(result.byHand).toContain("nominee's name (New India takes 20 characters)");
    // A father-in-law is "Any other" on the Janata list, and on the Pension list his own.
    expect(valueOf(list, '#vRelationshipNomineeInsured_2')).toBe('Any other');
    expect(
      valueOf(
        ops({ form: 'pension', monthlyPensionRupees: 1, organisation: 'X' }),
        '#relationWithNominee1',
      ),
    ).toBe('Father-in-law');
    expect(valueOf(list, '#vSexInsured_1')).toBe('Female');
    expect(valueOf(list, '#vDetailsExistingPhysicalDisabilities_2')).toBe('None');
  });
});
