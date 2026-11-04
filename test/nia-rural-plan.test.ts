// New India rural quote forms for a rural client: the request, which animals each form takes,
// what is filled, what is left to the advisor, and that nothing is saved.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { niaRuralForm, planNiaRuralQuote } from '../src/main/quotes/nia-rural';
import { ruralClientSchema } from '../src/shared/contracts/rural';
import { niaRuralRunSchema, type NiaRuralRun } from '../src/shared/insurers/nia-rural';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 4);
const COW = {
  kind: 'cattle',
  cattleType: 'milch-cow',
  origin: 'indigenous',
  gender: 'female',
  breed: 'Gir',
  ageYears: 5,
  ageMonths: 0,
  marketValueRupees: 50000,
};
const FARMER = {
  customer: { name: 'Synthetic Farmer' },
  pincode: '411001',
  animals: [COW],
  farm: { dwellingSumInsuredRupees: 200000, contentsSumInsuredRupees: 40000 },
};

function plan(run: NiaRuralRun, rural: Record<string, unknown> = {}) {
  return planNiaRuralQuote(ruralClientSchema.parse({ ...FARMER, ...rural }), run, {
    today: TODAY,
  });
}
function ok(...args: Parameters<typeof plan>) {
  const result = plan(...args);
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result;
}
const valueOf = (list: PageOp[], selector: string) =>
  list.find(
    (o): o is Extract<PageOp, { op: 'setField' }> => o.op === 'setField' && o.selector === selector,
  )?.value;
const ops = (...args: Parameters<typeof plan>) => ok(...args).steps.map((s) => s.op);

describe('the New India rural request', () => {
  it('names a rural client and what is chosen for the run', () => {
    const request = {
      product: 'nia-rural',
      ruralId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      insurerId: 'new-india',
      run: { form: 'cattle-non-scheme', scheme: 'private-dairies' },
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    expect(
      niaRuralRunSchema.safeParse({ form: 'cattle', scheme: 'dairies', claimRatio: '1e5' }).success,
    ).toBe(false);
    expect(
      niaRuralRunSchema.safeParse({ form: 'farmers-package', startDate: '2026-11-10', excess: '7' })
        .success,
    ).toBe(false);
  });

  it('opens the two recorded forms by tile, and asks the advisor to open the other two', () => {
    expect(niaRuralForm('cattle')).toMatchObject({ heading: 'Cattle Insurance' });
    expect(niaRuralForm('farmers-package').tiles).toContain('Farmers Package Insurance');
    expect(niaRuralForm('livestock-blda')).toMatchObject({
      heading: null,
      marker: 'Add Animal',
      tiles: [],
    });
    expect(niaRuralForm('cattle-non-scheme')).toMatchObject({ marker: 'Add Cattle', tiles: [] });
  });
});

describe('planNiaRuralQuote', () => {
  it('never presses a premium, save, payment or PAN button', () => {
    for (const run of [
      { form: 'cattle', scheme: 'bank-financed' },
      { form: 'farmers-package', startDate: '2026-11-10', excess: '0' },
      { form: 'livestock-blda', beneficiary: 'SC' },
      { form: 'cattle-non-scheme', scheme: 'others' },
    ] as NiaRuralRun[]) {
      expect(JSON.stringify(ok(run).steps)).not.toMatch(
        /Calculate Premium|Save|Approve|Send Quote|Submit|doUHavePan|panNumber|acceptTerms|ifscCode/,
      );
    }
  });

  it('Cattle Insurance: new quote, scheme, Cattle or Calf Heifer by the animals', () => {
    const list = ops(
      { form: 'cattle', scheme: 'dairies', claimRatio: '70' },
      { animals: [{ ...COW, cattleType: 'calf-heifer' }] },
    );
    expect(list[0]).toEqual({ op: 'check', selector: '#checkPolicy1', checked: true });
    expect(valueOf(list, '#Scheme')).toBe('Corporate/Co-operative Dairies');
    expect(valueOf(list, 'input[name="Claim Ratio"]')).toBe('70');
    expect(list).toContainEqual({ op: 'check', selector: '#calfCheck', checked: true });
    // Only calves: the Cattle box is not ticked.
    expect(list).not.toContainEqual({ op: 'check', selector: '#cattleCheck', checked: true });
  });

  it('Farmers Package needs the farm and a start date not in the past', () => {
    expect(
      plan({ form: 'farmers-package', startDate: '2026-11-01', excess: '0' }, { farm: undefined }),
    ).toEqual({
      ok: false,
      problems: [
        'The policy start date has passed.',
        'Add the farm details to this rural client: the sums insured on the dwelling and on its contents.',
      ],
    });
    const result = ok({ form: 'farmers-package', startDate: '2026-11-10', excess: '10' });
    const list = result.steps.map((s) => s.op);
    expect(valueOf(list, '#sumInsuredDwelling')).toBe('200000');
    expect(valueOf(list, '#excess')).toBe('10');
    expect(result.byHand).toContain("nominee's name");
  });

  it('Livestock (BLDA): one row per animal, by kind, through Add Animal', () => {
    const list = ops(
      { form: 'livestock-blda', beneficiary: 'BPL' },
      {
        animals: [
          COW,
          { ...COW, kind: 'pig', cattleType: undefined, purpose: 'Meat' },
          { ...COW, kind: 'yak', cattleType: undefined },
        ],
      },
    );
    expect(valueOf(list, '#Beneficiary')).toBe('BPL');
    expect(valueOf(list, 'select[name="typeOfCattle0"]')).toBe('Mitch Cows');
    expect(valueOf(list, 'select[name="typeOfAnimal1"]')).toBe('Pig');
    expect(valueOf(list, '[name="purposeOfCamelPig1"]')).toBe('Meat');
    expect(valueOf(list, 'select[name="typeOfHDPMY2"]')).toBe('Yak');
    expect(valueOf(list, 'select[name="originType2"]')).toBe('Indigeneous');
    expect(list).toContainEqual({
      op: 'ensureShown',
      shown: { selector: 'select[name="typeOfAnimal2"]' },
      open: { button: 'Add Animal' },
      timeoutMs: 10_000,
    });
  });

  it('Cattle forms take cattle only; the non-scheme form its own types', () => {
    const goat = { ...COW, kind: 'goat', cattleType: undefined };
    expect(plan({ form: 'cattle', scheme: 'dairies' }, { animals: [goat] })).toEqual({
      ok: false,
      problems: ['Animal 1 (goat): Cattle Insurance is for cattle only.'],
    });
    expect(
      plan(
        { form: 'cattle-non-scheme', scheme: 'others' },
        { animals: [{ ...COW, cattleType: 'mithun' }] },
      ),
    ).toEqual({
      ok: false,
      problems: ['Animal 1 (mithun): Cattle (Non-scheme) does not list this type of cattle.'],
    });
    expect(plan({ form: 'livestock-blda', beneficiary: 'GEN' }, { animals: [] })).toEqual({
      ok: false,
      problems: ['Add the animals to this rural client.'],
    });
    const list = ops({ form: 'cattle-non-scheme', scheme: 'others' });
    expect(valueOf(list, '#typeOfRiskForCattle0')).toBe('Milch Cows');
    expect(valueOf(list, '#ycMarkectValue0')).toBe('50000');
  });
});
