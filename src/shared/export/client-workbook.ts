// Every saved client in one workbook, a sheet per kind (request of 11 November 2026): health
// clients, travel clients and vehicles in the import's own columns and wording (so the sheets can
// be edited and imported back), and rural, marine and property clients in columns of their own.
// The Aadhaar and passport numbers are never exported: they stay in the encrypted vault. Pure.
import { compareText } from '../comparison/comparability';
import type { ClientRecord } from '../contracts/client';
import type { MarineClient, MarineRecord } from '../contracts/marine';
import type { PropertyRecord, RiskAnswers } from '../contracts/property';
import type { RuralRecord } from '../contracts/rural';
import type { TravellerRecord } from '../contracts/traveller';
import type { VehicleRecord } from '../contracts/vehicle';
import { PAISE_PER_RUPEE } from '../money';
import {
  BUS_CHOICES,
  CONDITION_CHOICES,
  COVER_CHOICES,
  FUEL_CHOICES,
  GENDER_CHOICES,
  HIGH_RISK_CHOICES,
  MARITAL_CHOICES,
  NOMINEE_CHOICES,
  RELATIONSHIP_CHOICES,
  TRAVEL_OCCUPATION_CHOICES,
  VEHICLE_CLASS_CHOICES,
  ZONE_CHOICES,
  type Choice,
} from '../import/choices';
import { HEALTH_CLIENT_COLUMNS } from '../import/health-clients';
import type { Column } from '../import/sheet';
import { TRAVELLER_COLUMNS } from '../import/travellers';
import { VEHICLE_COLUMNS } from '../import/vehicles';

export type Cell = string | number | null;

export interface ExportSheet {
  name: string;
  headers: string[];
  rows: Cell[][];
}

export interface ClientExport {
  clients: ClientRecord[];
  travellers: TravellerRecord[];
  vehicles: VehicleRecord[];
  rural: RuralRecord[];
  marine: MarineRecord[];
  properties: PropertyRecord[];
}

/** Never exported: kept in the encrypted vault. */
const SECRET_KEYS = new Set(['aadhaar', 'passport']);

/** DD/MM/YYYY, as the imports read dates. */
export const ddmmyyyy = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const name = <V extends string>(
  choices: readonly Choice<V>[],
  value: V | undefined,
): string | null =>
  value === undefined ? null : (choices.find((c) => c.value === value)?.names[0] ?? value);
const yesNo = (value: boolean | undefined): string | null =>
  value === undefined ? null : value ? 'Yes' : 'No';
/** An enum value in words: "milch-cow" → "Milch cow". */
const words = (value: string | undefined): string | null =>
  value === undefined
    ? null
    : (value.charAt(0).toUpperCase() + value.slice(1)).replace(/[-_]/g, ' ');
const or = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/** A sheet in an import's columns, from each record's cells by column key. */
function importSheet(
  sheetName: string,
  columns: readonly Column[],
  rows: Record<string, Cell>[],
): ExportSheet {
  const shown = columns.filter(
    (c) => !SECRET_KEYS.has(c.key) && (!c.hidden || rows.some((r) => r[c.key] != null)),
  );
  return {
    name: sheetName,
    headers: shown.map((c) => c.header),
    rows: rows.map((r) => shown.map((c) => r[c.key] ?? null)),
  };
}

type ProposalLike = {
  pan?: string;
  address?: string;
  state?: string;
  city?: string;
  village?: string;
  highRiskCustomer?: boolean;
  highRiskType?: (typeof HIGH_RISK_CHOICES)[number]['value'];
  landlineStdCode?: string;
  landlineNumber?: string;
  ckycNumber?: string;
  eInsuranceAccountNumber?: string;
  nomineeName?: string;
  nomineeRelationship?: (typeof NOMINEE_CHOICES)[number]['value'];
  nomineeAddress?: string;
  nomineeContact?: string;
  intermediaryPlace?: string;
};

/** The shared proposal-detail columns (health and travel). */
const proposalCells = (p: ProposalLike | undefined): Record<string, Cell> => ({
  pan: or(p?.pan),
  address: or(p?.address),
  state: or(p?.state),
  city: or(p?.city),
  village: or(p?.village),
  highRiskCustomer: yesNo(p?.highRiskCustomer),
  highRiskType: name(HIGH_RISK_CHOICES, p?.highRiskType),
  landlineStdCode: or(p?.landlineStdCode),
  landlineNumber: or(p?.landlineNumber),
  ckycNumber: or(p?.ckycNumber),
  eInsuranceAccountNumber: or(p?.eInsuranceAccountNumber),
  nomineeName: or(p?.nomineeName),
  nomineeRelationship: name(NOMINEE_CHOICES, p?.nomineeRelationship),
  nomineeAddress: or(p?.nomineeAddress),
  nomineeContact: or(p?.nomineeContact),
  intermediaryPlace: or(p?.intermediaryPlace),
});

export function healthClientCells(record: ClientRecord): Record<string, Cell> {
  const c = record.client;
  const cells: Record<string, Cell> = {
    name: c.customer.name,
    phone: or(c.customer.phone),
    email: or(c.customer.email),
    pincode: c.pincode,
    notes: or(c.customer.notes),
    maritalStatus: name(MARITAL_CHOICES, c.proposerMaritalStatus),
    coverType: name(COVER_CHOICES, c.preferences?.coverType),
    sumInsured: c.preferences ? c.preferences.sumInsuredPaise / PAISE_PER_RUPEE : null,
    tenureYears: or(c.preferences?.tenureYears),
    occupation: or(c.proposal?.occupation),
    ...proposalCells(c.proposal),
  };
  c.members.forEach((m, i) => {
    const n = i + 1;
    cells[`m${n}Relationship`] = name(RELATIONSHIP_CHOICES, m.relationship);
    cells[`m${n}DateOfBirth`] = ddmmyyyy(m.dateOfBirth);
    // The age only when there is no date of birth (the import works it out from the date).
    cells[`m${n}Age`] = m.dateOfBirth ? null : m.age;
    cells[`m${n}Gender`] = name(GENDER_CHOICES, m.gender);
  });
  return cells;
}

export function travellerCells(record: TravellerRecord): Record<string, Cell> {
  const t = record.traveller;
  return {
    name: t.customer.name,
    phone: or(t.customer.phone),
    email: or(t.customer.email),
    pincode: t.pincode,
    dateOfBirth: ddmmyyyy(t.dateOfBirth),
    gender: name(GENDER_CHOICES, t.gender),
    maritalStatus: name(MARITAL_CHOICES, t.maritalStatus),
    occupation: name(TRAVEL_OCCUPATION_CHOICES, t.occupation),
    notes: or(t.customer.notes),
    passportAuthority: or(t.passport?.issuingAuthority),
    passportIssued: ddmmyyyy(t.passport?.issueDate),
    passportExpiry: ddmmyyyy(t.passport?.expiryDate),
    ...proposalCells(t.proposal),
  };
}

export function vehicleCells(record: VehicleRecord): Record<string, Cell> {
  const v = record.saved.vehicle;
  return {
    name: record.saved.name,
    vehicleClass: name(VEHICLE_CLASS_CHOICES, v.vehicleClass),
    condition: name(CONDITION_CHOICES, v.condition),
    registrationDate: ddmmyyyy(v.registrationDate),
    zone: name(ZONE_CHOICES, v.zone),
    idv: v.idvRupees,
    odDiscount: or(v.odDiscountPercent),
    cc: or(v.cubicCapacityCc),
    hp: or(v.horsePower),
    seats: or(v.seatingCapacity),
    weight: or(v.grossWeightKg),
    busType: name(BUS_CHOICES, v.busType),
    specialType: or(v.specialType),
    battery: yesNo(v.batteryOperated),
    longTermOd: yesNo(v.longTermOd),
    claimLastYear: yesNo(v.claimLastYear),
    previousNcb: or(v.previousNcbPercent),
    make: or(v.make),
    model: or(v.model),
    variant: or(v.variant),
    manufactureYear: or(v.manufactureYear),
    fuelType: name(FUEL_CHOICES, v.fuelType),
    bodyType: or(v.bodyType),
    colour: or(v.colour),
    engineNumber: or(v.engineNumber),
    chassisNumber: or(v.chassisNumber),
    invoiceValue: or(v.invoiceValueRupees),
  };
}

/** A person or business holding a marine or property policy. */
const HOLDER_HEADERS = [
  'Name',
  'Person or organisation',
  'Mobile',
  'Email',
  'Pincode',
  'Address',
  'PAN',
  'Date of birth',
  'Gender',
  'Marital status',
  'Registration number',
  'Registration date',
  'MSME',
  'Type of organisation',
  'Notes',
];
const holderRow = (h: MarineClient): Cell[] => [
  h.customer.name,
  h.kind === 'organization' ? 'Organisation' : 'Person',
  or(h.customer.phone),
  or(h.customer.email),
  h.pincode,
  or(h.address),
  or(h.pan),
  ddmmyyyy(h.dateOfBirth),
  name(GENDER_CHOICES, h.gender),
  name(MARITAL_CHOICES, h.maritalStatus),
  or(h.registrationNo),
  ddmmyyyy(h.registrationDate),
  yesNo(h.msme),
  or(h.organisationType),
  or(h.customer.notes),
];

/** Every risk question, so none is missed (a new one fails to compile until it is named here). */
const RISK_LABELS: Record<keyof RiskAnswers, string> = {
  lift: 'Lift',
  inBasement: 'In a basement',
  fireProtection: 'Fire protection',
  electricalWellMaintained: 'Electrical wiring well maintained',
  stormWaterDrain: 'Storm water drain',
  security24x7: 'Security 24x7',
  basementUsedForOperations: 'Basement used for operations',
  nearWaterBody: 'Near a water body',
  noFireBrigadeAccess: 'No fire brigade access',
  centralAC: 'Central AC',
  unoccupied30Days: 'Unoccupied over 30 days',
  mortgaged: 'Mortgaged',
  pastFireLoss: 'Past fire loss',
  insuredBefore: 'Insured before',
};
const RISKS = Object.keys(RISK_LABELS) as (keyof RiskAnswers)[];

export function clientWorkbook(data: ClientExport): ExportSheet[] {
  const byName = <T>(list: T[], nameOf: (t: T) => string) =>
    [...list].sort((a, b) => compareText(nameOf(a), nameOf(b)));

  const rural = byName(data.rural, (r) => r.rural.customer.name);
  const properties = byName(data.properties, (p) => p.property.holder.customer.name);

  return [
    importSheet(
      'Health clients',
      HEALTH_CLIENT_COLUMNS,
      byName(data.clients, (c) => c.client.customer.name).map(healthClientCells),
    ),
    importSheet(
      'Travel clients',
      TRAVELLER_COLUMNS,
      byName(data.travellers, (t) => t.traveller.customer.name).map(travellerCells),
    ),
    importSheet(
      'Vehicles',
      VEHICLE_COLUMNS,
      byName(data.vehicles, (v) => v.saved.name).map(vehicleCells),
    ),
    {
      name: 'Rural clients',
      headers: [
        'Name',
        'Mobile',
        'Email',
        'Pincode',
        'Date of birth',
        'Gender',
        'Marital status',
        'Address',
        'Nominee name',
        'Nominee relationship',
        'Nominee address',
        'Animals',
        'Dwelling sum insured (₹)',
        'Contents sum insured (₹)',
        'Dwelling ID',
        'Dwelling location',
        'Dwelling description',
        'Contents description',
        'Katcha construction',
        'Disabilities',
        'Notes',
      ],
      rows: rural.map(({ rural: r }) => [
        r.customer.name,
        or(r.customer.phone),
        or(r.customer.email),
        r.pincode,
        ddmmyyyy(r.dateOfBirth),
        name(GENDER_CHOICES, r.gender),
        name(MARITAL_CHOICES, r.maritalStatus),
        or(r.address),
        or(r.nomineeName),
        words(r.nomineeRelationship),
        or(r.nomineeAddress),
        r.animals.length,
        or(r.farm?.dwellingSumInsuredRupees),
        or(r.farm?.contentsSumInsuredRupees),
        or(r.farm?.dwellingId),
        or(r.farm?.dwellingLocation),
        or(r.farm?.dwellingDescription),
        or(r.farm?.contentsDescription),
        yesNo(r.farm?.katcha),
        or(r.farm?.disabilities),
        or(r.customer.notes),
      ]),
    },
    {
      name: 'Rural animals',
      headers: [
        'Client',
        'Animal',
        'Type of cattle',
        'Origin',
        'Gender',
        'Breed',
        'Age (years)',
        'Age (months)',
        'Tag number',
        'Purpose',
        'Market value (₹)',
        'Sum insured (₹)',
        'Fitness certificate date',
        'Location of stable',
      ],
      rows: rural.flatMap(({ rural: r }) =>
        r.animals.map((a) => [
          r.customer.name,
          words(a.kind),
          words(a.cattleType),
          words(a.origin),
          words(a.gender),
          a.breed,
          a.ageYears,
          a.ageMonths,
          or(a.tagNumber),
          or(a.purpose),
          a.marketValueRupees,
          or(a.sumInsuredRupees),
          ddmmyyyy(a.fitnessCertificateDate),
          or(a.locationOfStable),
        ]),
      ),
    },
    {
      name: 'Marine clients',
      headers: HOLDER_HEADERS,
      rows: byName(data.marine, (m) => m.marine.customer.name).map((m) => holderRow(m.marine)),
    },
    {
      name: 'Property clients',
      headers: [
        ...HOLDER_HEADERS,
        'Home or business',
        'Building name',
        'Landmark',
        'Property address',
        'Property pincode',
        'Walls',
        'Floor',
        'Roof',
        'Year of construction',
        'Floors',
        'Occupancy floor',
        'Height (m)',
        'Carpet area (sq m)',
        'Construction rate per sq m (₹)',
        'Building sum insured (₹)',
        'Furniture sum insured (₹)',
        'Electrical sum insured (₹)',
        'Other contents sum insured (₹)',
        'Other contents',
        'Plant and machinery sum insured (₹)',
        'Stocks sum insured (₹)',
        'Stocks',
        'Industry',
        'Claim ratio',
        'Highest claim ratio (%)',
        'Fire protection details',
        'Fire brigade distance (km)',
        'Fire brigade time (minutes)',
        ...RISKS.map((key) => RISK_LABELS[key]),
      ],
      rows: properties.map(({ property: { holder, property: p } }) => [
        ...holderRow(holder),
        words(p.use),
        or(p.buildingName),
        or(p.landmark),
        p.address,
        p.pincode,
        words(p.walls),
        words(p.floor),
        words(p.roof),
        or(p.yearOfConstruction),
        or(p.floors),
        or(p.occupancyFloor),
        or(p.heightMeters),
        or(p.carpetAreaSqm),
        or(p.constructionRatePerSqm),
        or(p.buildingSumInsured),
        or(p.furnitureSumInsured),
        or(p.electricalSumInsured),
        or(p.otherContentsSumInsured),
        or(p.otherContentsDescription),
        or(p.plantMachinerySumInsured),
        or(p.stocksSumInsured),
        or(p.stocksDescription),
        or(p.industry),
        or(p.claimRatio),
        or(p.maxClaimRatioPercent),
        or(p.fireProtectionDetails),
        or(p.fireBrigadeDistanceKm),
        or(p.fireBrigadeMinutes),
        ...RISKS.map((key) => yesNo(p.risks[key])),
      ]),
    },
  ];
}
