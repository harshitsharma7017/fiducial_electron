// Every saved client in one Excel workbook, a sheet per kind. The health, travel and vehicle sheets
// are written in the import's columns: written to a real file and read back by the import's own
// reader, they give the same records. Aadhaar and passport numbers are never in the file.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { writeClientWorkbook } from '../src/main/export/clients-export';
import { readSpreadsheet } from '../src/main/import/read-file';
import { ageOn, clientInputSchema } from '../src/shared/contracts/client';
import { marineClientSchema } from '../src/shared/contracts/marine';
import { propertyClientSchema } from '../src/shared/contracts/property';
import { ruralClientSchema } from '../src/shared/contracts/rural';
import { travellerSchema } from '../src/shared/contracts/traveller';
import { vehicleInputSchema } from '../src/shared/contracts/vehicle';
import { clientWorkbook, type ClientExport } from '../src/shared/export/client-workbook';
import { IMPORT_SPECS, type ImportKind } from '../src/shared/import/kinds';
import { layoutSheet } from '../src/shared/import/sheet';

vi.mock('electron', () => ({ dialog: {} }));

const TODAY = new Date(2026, 10, 11);
const STAMP = {
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const id = (n: number) => `0f8fad5b-d9cb-469f-a165-7086772895${String(n).padStart(2, '0')}`;

const HEALTH = clientInputSchema.parse({
  customer: {
    name: 'Synthetic Couple',
    phone: '9876543210',
    email: 'couple@example.test',
    notes: 'Prefers calls after 6',
  },
  pincode: '560001',
  proposerMaritalStatus: 'married',
  members: [
    {
      relationship: 'self',
      age: ageOn('1985-03-14', TODAY),
      dateOfBirth: '1985-03-14',
      gender: 'male',
    },
    {
      relationship: 'spouse',
      age: ageOn('1988-07-02', TODAY),
      dateOfBirth: '1988-07-02',
      gender: 'female',
    },
    { relationship: 'son', age: 7 },
  ],
  preferences: { coverType: 'floater', sumInsuredPaise: 500000_00, tenureYears: 1 },
  proposal: {
    pan: 'ABCDE1234F',
    address: '12 Synthetic Street',
    state: 'Karnataka',
    city: 'Bengaluru',
    village: 'Koramangala',
    occupation: 'Software Professional',
    highRiskCustomer: true,
    highRiskType: 'pep',
    nomineeName: 'Synthetic Nominee',
    nomineeRelationship: 'spouse',
    nomineeAddress: '12 Synthetic Street',
    nomineeContact: '9876500000',
    intermediaryPlace: 'Bengaluru',
  },
});
const TRAVELLER = travellerSchema.parse({
  customer: { name: 'Synthetic Traveller', phone: '9876543211', email: 'traveller@example.test' },
  pincode: '560001',
  dateOfBirth: '1986-04-12',
  gender: 'female',
  maritalStatus: 'unmarried',
  occupation: 'Salaried',
  proposal: { address: '5 Synthetic Road', highRiskCustomer: false, nomineeRelationship: 'mother' },
  passport: {
    issuingAuthority: 'Passport Office, Bengaluru',
    issueDate: '2020-01-15',
    expiryDate: '2030-01-14',
  },
});
const VEHICLE = vehicleInputSchema.parse({
  name: 'Swift - Synthetic',
  vehicle: {
    vehicleClass: 'private-car',
    condition: 'pre-owned',
    registrationDate: '2020-05-10',
    zone: 'A',
    idvRupees: 450000,
    odDiscountPercent: 10,
    cubicCapacityCc: 1197,
    claimLastYear: false,
    previousNcbPercent: 25,
    make: 'MARUTI SUZUKI',
    model: 'SWIFT',
    fuelType: 'petrol',
    chassisNumber: 'MA3SYN1234567',
  },
});

const DATA: ClientExport = {
  clients: [{ id: id(1), ...STAMP, client: HEALTH }],
  travellers: [{ id: id(2), ...STAMP, traveller: TRAVELLER }],
  vehicles: [{ id: id(3), ...STAMP, saved: VEHICLE }],
  rural: [
    {
      id: id(4),
      ...STAMP,
      rural: ruralClientSchema.parse({
        customer: { name: 'Synthetic Farmer' },
        pincode: '411001',
        animals: [
          {
            kind: 'cattle',
            cattleType: 'milch-cow',
            origin: 'indigenous',
            gender: 'female',
            breed: 'Gir',
            ageYears: 5,
            ageMonths: 0,
            marketValueRupees: 50000,
          },
          {
            kind: 'goat',
            origin: 'cross-breed',
            gender: 'male',
            breed: 'Sirohi',
            ageYears: 2,
            ageMonths: 3,
            marketValueRupees: 9000,
          },
        ],
        farm: { dwellingSumInsuredRupees: 200000, katcha: true },
      }),
    },
  ],
  marine: [
    {
      id: id(5),
      ...STAMP,
      marine: marineClientSchema.parse({
        kind: 'organization',
        customer: { name: 'Synthetic Exports' },
        pincode: '400001',
        msme: true,
      }),
    },
  ],
  properties: [
    {
      id: id(6),
      ...STAMP,
      property: propertyClientSchema.parse({
        holder: { kind: 'individual', customer: { name: 'Synthetic Owner' }, pincode: '400001' },
        property: {
          use: 'home',
          address: 'Flat 3, Synthetic Heights',
          pincode: '400001',
          buildingSumInsured: 2500000,
          risks: { lift: true, mortgaged: false },
        },
      }),
    },
  ],
};

const sheetOf = (name: string) => clientWorkbook(DATA).find((s) => s.name === name)!;

describe('the client workbook', () => {
  it('has a sheet for every kind of client', () => {
    expect(clientWorkbook(DATA).map((s) => [s.name, s.rows.length])).toEqual([
      ['Health clients', 1],
      ['Travel clients', 1],
      ['Vehicles', 1],
      ['Rural clients', 1],
      ['Rural animals', 2],
      ['Marine clients', 1],
      ['Property clients', 1],
    ]);
  });

  it('never has an Aadhaar or passport number column', () => {
    const headers = clientWorkbook(DATA).flatMap((s) => s.headers);
    expect(headers).not.toContain('Aadhaar number');
    expect(headers).not.toContain('Passport number');
  });

  it('lists each animal against its client, and every property risk answered', () => {
    const animals = sheetOf('Rural animals');
    expect(animals.rows.map((r) => [r[0], r[1], r[2]])).toEqual([
      ['Synthetic Farmer', 'Cattle', 'Milch cow'],
      ['Synthetic Farmer', 'Goat', null],
    ]);
    const property = sheetOf('Property clients');
    const at = (h: string) => property.rows[0]![property.headers.indexOf(h)];
    expect([at('Lift'), at('Mortgaged'), at('Insured before'), at('Security 24x7')]).toEqual([
      'Yes',
      'No',
      null,
      null,
    ]);
  });

  it('keeps member columns only as many as the clients have', () => {
    const headers = sheetOf('Health clients').headers;
    expect(headers).toContain('Member 3 relationship');
    expect(headers).toContain('Member 6 relationship'); // the template's six
    expect(headers).not.toContain('Member 7 relationship');
  });
});

describe('the workbook, read back by the import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fqf-export-'));
  const path = join(dir, 'Clients.xlsx');

  const readBack = async (kind: ImportKind) => {
    const spec = IMPORT_SPECS[kind];
    const file = await readSpreadsheet(path, spec.sheet);
    if (!file.ok) throw new Error(file.reason);
    const layout = layoutSheet(file.rows, spec.columns);
    if (!layout.ok) throw new Error(layout.reason);
    return layout.rows.map((row) => spec.read(row, TODAY));
  };

  it('writes a real Excel file', async () => {
    await writeClientWorkbook(path, clientWorkbook(DATA), TODAY);
    expect(readFileSync(path).subarray(0, 2).toString()).toBe('PK');
  });

  it('gives back the same health client', async () => {
    const [row] = await readBack('clients');
    if (!row?.ok) throw new Error(JSON.stringify(row));
    const { client } = row.value as { client: unknown };
    expect(clientInputSchema.parse(client)).toEqual(HEALTH);
  });

  it('gives back the same travel client (passport details, not its number)', async () => {
    const [row] = await readBack('travellers');
    if (!row?.ok) throw new Error(JSON.stringify(row));
    const value = row.value as { traveller: unknown; passport?: string; aadhaar?: string };
    expect(travellerSchema.parse(value.traveller)).toEqual(TRAVELLER);
    expect(value.passport).toBeUndefined();
    expect(value.aadhaar).toBeUndefined();
  });

  it('gives back the same vehicle', async () => {
    const [row] = await readBack('vehicles');
    if (!row?.ok) throw new Error(JSON.stringify(row));
    expect(vehicleInputSchema.parse(row.value)).toEqual(VEHICLE);
  });
});
