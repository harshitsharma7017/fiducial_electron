// New India's Marine Specific Voyage quote form: the shipment, entered for each quote and never
// saved (recording new-india-2026-11-04T10-22-36-040Z: the form opened, its sections and lists;
// nothing typed, no premium). Shared by the request contract and the marine client screen; what is
// filled is in src/main/quotes/nia-marine.ts. The lists are New India's, as recorded.
import { z } from 'zod';
import { dateOfBirthSchema } from '../contracts/client';
import { singleLineText } from '../contracts/common';

export const NIA_VOYAGE_TYPES = { export: 'Export', import: 'Import', inland: 'Inland' } as const;
export const NIA_TRANSIT_TYPES = {
  'air-domestic': 'Air Domestic',
  rail: 'Rail',
  road: 'Road',
  courier: 'Courier',
  'inland-water': 'Inland Water',
} as const;
export const NIA_TRANSPORT_MODES = {
  air: 'Air',
  rail: 'Rail',
  road: 'Road',
  vessel: 'Vessel',
} as const;
export const NIA_BILL_TYPES = {
  lr: 'Lorry Receipt(LR)',
  rr: 'Rail Receipt(RR)',
  bl: 'Bill of Lading(BL)',
  awb: 'Airway Bill Number(AWB)',
  post: 'Registered Post Parcel',
} as const;
export const NIA_CARGO_TYPES = {
  machinery: 'Machinery - Precision euipments, medical equipments',
  grains: 'Grains in Break Bulk (Bagged Grains - Wheat Rice, Maize, etc)',
  steel: 'Steel - Sheets/Coils/Pipes/Wire Rods',
  leather: 'Leather and leather goods',
  cotton: 'Cotton - FP Bales',
  textiles: 'Textiles - Fabrics/Yarns, Carpets, ready made garments',
} as const;
export const NIA_EXCESS_ON = { consignment: 'Consignment value', claim: 'Claim amount' } as const;
/** Inland Transit Clause A, B or C (the boxes #coverageDet0-2). */
export const NIA_TRANSIT_CLAUSES = ['A', 'B', 'C'] as const;

const keys = <T extends Record<string, string>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
/** A percentage as typed: digits and at most one point. */
const percent = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^\d{1,3}(\.\d{1,3})?$/);

export const niaShipmentSchema = z.strictObject({
  voyageType: z.enum(keys(NIA_VOYAGE_TYPES)),
  /** The policy start date, YYYY-MM-DD (not before today: checked by the plan). */
  startDate: dateOfBirthSchema,
  transitType: z.enum(keys(NIA_TRANSIT_TYPES)),
  mode: z.enum(keys(NIA_TRANSPORT_MODES)),
  fromCountry: singleLineText(60),
  toCountry: singleLineText(60),
  portOfLoading: singleLineText(50),
  portOfDischarge: singleLineText(50),
  billType: z.enum(keys(NIA_BILL_TYPES)),
  billNumber: singleLineText(20).optional(),
  billDate: dateOfBirthSchema.optional(),
  markNo: singleLineText(100).optional(),
  /** Whether the certificate shows the premium. */
  showPremium: z.boolean(),
  cargoType: z.enum(keys(NIA_CARGO_TYPES)),
  sumInsuredRupees: z.int().min(1).max(999_999_999),
  ratePercent: percent(7),
  extraPercent: percent(5),
  invoiceNumber: singleLineText(20),
  invoiceDate: dateOfBirthSchema.optional(),
  excessOn: z.enum(keys(NIA_EXCESS_ON)),
  excessPercent: percent(7),
  minimumExcessRupees: z.int().min(0).max(9_999_999_999),
  clause: z.enum(NIA_TRANSIT_CLAUSES),
});
export type NiaShipment = z.output<typeof niaShipmentSchema>;
