// New India fire forms for a property client: each detail goes into the field its form has (from
// the recording), nothing is invented for a field the client lacks, and nothing is saved.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { NIA_FIRE_FIELDS } from '../src/main/quotes/nia-fire-fields';
import { niaFireForm, planNiaFireQuote } from '../src/main/quotes/nia-fire';
import { propertyClientSchema } from '../src/shared/contracts/property';
import { NIA_FIRE_FORMS, type NiaFireRun } from '../src/shared/insurers/nia-fire';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 4);
const CLIENT = {
  holder: { kind: 'organization', customer: { name: 'Synthetic Traders LLP' }, pincode: '400001' },
  property: {
    use: 'business',
    address: 'Shop 2, Synthetic Bazaar',
    pincode: '400001',
    yearOfConstruction: 1980,
    occupancyFloor: 2,
    furnitureSumInsured: 100,
    electricalSumInsured: 20,
    otherContentsSumInsured: 3,
    risks: { lift: false },
  },
};
const plan = (run: NiaFireRun, client: Record<string, unknown> = CLIENT) =>
  planNiaFireQuote(propertyClientSchema.parse(client), run, { today: TODAY });
const ok = (run: NiaFireRun, client?: Record<string, unknown>) => {
  const r = plan(run, client);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const valueOf = (list: PageOp[], selector: string) =>
  list.find(
    (o): o is Extract<PageOp, { op: 'setField' }> => o.op === 'setField' && o.selector === selector,
  )?.value;

describe('New India fire forms', () => {
  it('a request names a property client, the form and the cover', () => {
    const request = {
      product: 'nia-fire',
      propertyId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      insurerId: 'new-india',
      run: { form: 'sfsp', cover: 'building' },
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    expect(
      quoteRunRequestSchema.safeParse({ ...request, run: { form: 'sfsp', cover: 'all' } }).success,
    ).toBe(false);
    for (const f of NIA_FIRE_FORMS) expect(niaFireForm(f).heading).toMatch(/Insurance$/);
  });

  it('fills only fields the form has, by the field kind', () => {
    for (const form of ['laghu', 'flexi-laghu', 'sfsp', 'sookshma', 'flexi-sookshma'] as const) {
      const ids = Object.keys(NIA_FIRE_FIELDS[form]);
      const steps = ok({ form, cover: 'building-contents' }).steps;
      // The property's details come after the sections are opened (the policy holder before).
      const after = steps.slice(steps.findIndex((st) => st.op.op === 'openSections'));
      for (const step of after) {
        if (step.op.op === 'setField') expect(ids).toContain(step.op.selector.slice(1));
      }
    }
    // Floor: a list on Flexi Laghu, a number on SFSP.
    const laghu = ok({ form: 'flexi-laghu', cover: 'building-contents' }).steps.map((s) => s.op);
    expect(valueOf(laghu, '#onWhichFloor')).toBe('Higher Floor');
    const sfsp = ok({ form: 'sfsp', cover: 'building-contents' }).steps.map((s) => s.op);
    expect(valueOf(sfsp, '#vInsuredOccupancySituatedWhichFloor')).toBe('2');
    expect(valueOf(sfsp, '#vFurnitureFittingsFixturesOtherContents0')).toBe('123');
  });

  it('lists what the form asks and the client lacks; never presses a button', () => {
    const r = ok({ form: 'flexi-laghu', cover: 'building-contents' });
    expect(r.byHand).toEqual(
      expect.arrayContaining([
        'construction: walls',
        'height of the building (m)',
        'add-on covers and the remaining underwriting questions',
      ]),
    );
    expect(r.steps.filter((s) => s.op.op === 'clickButton' || s.op.op === 'clickText')).toEqual([]);
    expect(r.steps.filter((s) => s.op.op === 'openSections').length).toBe(2);
  });

  it('refuses a form for the other kind of property, and stocks for a home', () => {
    expect(plan({ form: 'griha', cover: 'building' }).ok).toBe(false);
    const home = { ...CLIENT, property: { ...CLIENT.property, use: 'home' } };
    expect(plan({ form: 'flexi-sookshma', cover: 'building' }, home).ok).toBe(false);
    expect(plan({ form: 'griha', cover: 'building-contents-stocks' }, home)).toEqual({
      ok: false,
      problems: ['A home has no stocks: choose building and/or contents.'],
    });
    expect(plan({ form: 'war', cover: 'building' }, home).ok).toBe(true);
  });
});
