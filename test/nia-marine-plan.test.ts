// New India Marine Specific Voyage for a marine client: the request and shipment, what is filled,
// what is left to the advisor, and that nothing is saved.
import { describe, expect, it } from 'vitest';
import type { PageOp } from '../src/main/quotes/page-ops';
import { planNiaMarineQuote } from '../src/main/quotes/nia-marine';
import { marineClientSchema } from '../src/shared/contracts/marine';
import { niaShipmentSchema, type NiaShipment } from '../src/shared/insurers/nia-marine';
import { quoteRunRequestSchema } from '../src/shared/ipc/contract';

const TODAY = new Date(2026, 10, 4);
const BUSINESS = {
  kind: 'organization',
  customer: { name: 'Synthetic Exports Pvt Ltd' },
  pincode: '400001',
};
const SHIPMENT: NiaShipment = {
  voyageType: 'export',
  startDate: '2026-11-10',
  transitType: 'road',
  mode: 'vessel',
  fromCountry: 'India',
  toCountry: 'United Arab Emirates',
  portOfLoading: 'Nhava Sheva',
  portOfDischarge: 'Jebel Ali',
  billType: 'bl',
  showPremium: true,
  cargoType: 'textiles',
  sumInsuredRupees: 1_000_000,
  ratePercent: '0.1',
  extraPercent: '10',
  invoiceNumber: 'INV-1',
  excessOn: 'consignment',
  excessPercent: '1',
  minimumExcessRupees: 5000,
  clause: 'C',
};
const plan = (shipment: NiaShipment = SHIPMENT, holder: Record<string, unknown> = BUSINESS) =>
  planNiaMarineQuote(marineClientSchema.parse(holder), shipment, { today: TODAY });
const ops = (...args: Parameters<typeof plan>): PageOp[] => {
  const r = plan(...args);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.steps.map((s) => s.op);
};
const valueOf = (list: PageOp[], selector: string) =>
  list.find(
    (o): o is Extract<PageOp, { op: 'setField' }> => o.op === 'setField' && o.selector === selector,
  )?.value;

describe('New India Marine Specific Voyage', () => {
  it('a request names a marine client and a valid shipment', () => {
    const request = {
      product: 'nia-marine',
      marineId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      insurerId: 'new-india',
      shipment: SHIPMENT,
    };
    expect(quoteRunRequestSchema.safeParse(request).success).toBe(true);
    for (const bad of [
      { ratePercent: '1,5' },
      { sumInsuredRupees: 1_000_000_000 },
      { clause: 'D' },
      { cargoType: 'spices' },
    ]) {
      expect(niaShipmentSchema.safeParse({ ...SHIPMENT, ...bad }).success).toBe(false);
    }
  });

  it('fills an organisation and the shipment, never pressing a save or premium button', () => {
    const list = ops();
    expect(list).toContainEqual({ op: 'check', selector: '#Organization', checked: true });
    expect(valueOf(list, '#businessNameNewOrg')).toBe('Synthetic Exports Pvt Ltd');
    expect(valueOf(list, '#typeOfSV')).toBe('Export');
    expect(valueOf(list, '#CargoType')).toBe(
      'Textiles - Fabrics/Yarns, Carpets, ready made garments',
    );
    expect(valueOf(list, '#showPremiumAmount')).toBe('Yes');
    expect(list).toContainEqual({ op: 'check', selector: '#coverageDet2', checked: true });
    expect(JSON.stringify(list)).not.toMatch(/Calculate Premium|Save|Approve|Find|Create|ifscCode/);
  });

  it('a person is filled as on the travel forms', () => {
    const list = ops(SHIPMENT, {
      kind: 'individual',
      customer: { name: 'Synthetic Trader' },
      pincode: '560001',
      gender: 'male',
    });
    expect(valueOf(list, '#typeOfOrg')).toBe('Mr.');
    expect(JSON.stringify(list)).not.toContain('#Organization');
  });

  it('refuses a start date that has passed, and lists what New India works out', () => {
    expect(plan({ ...SHIPMENT, startDate: '2026-11-03' })).toEqual({
      ok: false,
      problems: ['The policy start date has passed.'],
    });
    const r = plan();
    expect(r.ok && r.byHand).toEqual(
      expect.arrayContaining([
        'packaging (New India lists it for the cargo type)',
        'Vessel Details',
        'GST registration type and GSTIN',
      ]),
    );
  });
});
