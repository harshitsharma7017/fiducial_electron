// Sample workbooks for trying the client imports: one per kind (health clients, travel clients,
// vehicles), covering every category and value the import accepts, plus rows that must be
// refused or flagged. All data is made up. Each row says what it checks in an "Expected result"
// column (not an import column, so the preview lists it under "Columns not imported").
//
// After writing, every file is read back through the real import code (the same reader, header
// matching and row checks the app uses) and each row's status is compared with what the row
// expects. Exits non-zero on any mismatch.
// Usage: node test/import-samples/run.mjs
import { join } from 'node:path';

// A command-line tool: it reports on stdout.
const print = (line: string) => process.stdout.write(`${line}\n`);
import writeXlsxFile from 'write-excel-file/node';
import { readSpreadsheet } from '../../src/main/import/read-file';
import { UIIC_OCCUPATIONS } from '../../src/shared/contracts/client';
import { loose } from '../../src/shared/import/cells';
import { IMPORT_SPECS, type ImportKind } from '../../src/shared/import/kinds';
import { layoutSheet } from '../../src/shared/import/sheet';

const TODAY = new Date(2026, 10, 4);
const EXPECTED = 'Expected result';

/** Made-up Aadhaar numbers with a valid check digit (Verhoeff). */
function aadhaar(n: number): string {
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
  const first11 = String(98765400000 + n * 7919);
  let c = 0;
  [...first11].reverse().forEach((ch, i) => (c = d[c]![p[(i + 1) % 8]![Number(ch)]!]!));
  return `${first11.slice(0, 4)} ${first11.slice(4, 8)} ${first11.slice(8)}${inv[c]}`;
}

type Row = Record<string, string> & { [EXPECTED]: string };
const pick = <T>(list: readonly T[], i: number): T => list[i % list.length]!;

// ---------------------------------------------------------------------------------------------
// Health clients
// ---------------------------------------------------------------------------------------------
const FIRST = [
  'Ramesh',
  'Sunita',
  'Arjun',
  'Kavya',
  'Imran',
  'Priya',
  'Vikram',
  'Neha',
  'Rahul',
  'Anjali',
  'Suresh',
];
const LAST = [
  'Kumar',
  'Sharma',
  'Iyer',
  'Reddy',
  'Khan',
  'Patel',
  'Singh',
  'Nair',
  'Gupta',
  'Das',
  'Mehta',
];
const CITIES = [
  ['110001', 'Delhi', 'New Delhi'],
  ['400001', 'Maharashtra', 'Mumbai'],
  ['560001', 'Karnataka', 'Bengaluru'],
  ['600001', 'Tamil Nadu', 'Chennai'],
  ['700001', 'West Bengal', 'Kolkata'],
  ['500001', 'Telangana', 'Hyderabad'],
  ['380001', 'Gujarat', 'Ahmedabad'],
  ['411001', 'Maharashtra', 'Pune'],
] as const;
const MOBILE_FORMATS = (n: number) => [
  `98${String(10000000 + n * 1371).slice(0, 8)}`,
  `+91 97${String(10000000 + n * 2311).slice(0, 8)}`,
  `0 96${String(10000000 + n * 919).slice(0, 8)}`,
];
const NOMINEES = [
  'Spouse',
  'Father',
  'Mother',
  'Son',
  'Daughter',
  'Father-in-law',
  'Mother-in-law',
  'Brother',
  'Sister',
];
const MARITAL = ['Married', 'Unmarried', 'Widowed', 'Divorced'];
const GENDERS = ['Male', 'Female', 'Transgender'];
const HIGH_RISK = [
  ['No', ''],
  ['Yes', 'HNI'],
  ['Yes', 'PEP'],
  ['Yes', 'NRI HNI'],
  ['Yes', 'Trust / NGO'],
];

/** The member sets, by family shape (relationship, date of birth or age, gender). */
const FAMILIES: { label: string; members: [string, string, string, string][] }[] = [
  { label: 'self only', members: [['Self', '15/08/1985', '', 'Male']] },
  {
    label: 'couple',
    members: [
      ['Self', '02/03/1980', '', 'Female'],
      ['Husband', '', '47', 'Male'],
    ],
  },
  {
    label: 'couple and two children',
    members: [
      ['Self', '10/11/1978', '', 'Male'],
      ['Wife', '22/01/1982', '', 'Female'],
      ['Son', '05/06/2010', '16', 'Male'],
      ['Daughter', '30/09/2014', '', 'Female'],
    ],
  },
  {
    label: 'self with parents',
    members: [
      ['Self', '', '35', 'Female'],
      ['Father', '12/12/1960', '', 'Male'],
      ['Mother', '', '62', 'Female'],
    ],
  },
  {
    label: 'every relationship (members 7 and 8 in extra columns)',
    members: [
      ['Self', '01/01/1975', '', 'Male'],
      ['Spouse', '01/01/1977', '', 'Female'],
      ['Son', '01/01/2005', '', 'Male'],
      ['Daughter', '01/01/2008', '', 'Female'],
      ['Father', '01/01/1948', '', 'Male'],
      ['Mother', '01/01/1950', '', 'Female'],
      ['Father-in-law', '01/01/1946', '', 'Male'],
      ['Mother-in-law', '01/01/1949', '', 'Female'],
    ],
  },
  {
    label: 'transgender proposer, infant child (age 0)',
    members: [
      ['Self', '14/02/1995', '', 'Transgender'],
      ['Son', '', '0', ''],
    ],
  },
];

function healthRows(): Row[] {
  const rows: Row[] = [];
  UIIC_OCCUPATIONS.forEach((occupation, i) => {
    const [pin, state, city] = pick(CITIES, i);
    const family = pick(FAMILIES, i);
    const quote = i % 7 !== 6;
    const [risk, riskType] = pick(HIGH_RISK, i);
    const row: Row = {
      name: `${pick(FIRST, i)} ${pick(LAST, i + 3)}`,
      phone: i % 5 === 4 ? '' : pick(MOBILE_FORMATS(i), i),
      email: i % 3 === 0 ? `client${i + 1}@example.com` : '',
      pincode: pin,
      notes: i === 0 ? 'Sample client; made-up data.' : '',
      aadhaar: i % 4 === 3 ? '' : aadhaar(i),
      maritalStatus: pick(MARITAL, i),
      coverType: quote ? (family.members.length > 1 && i % 2 === 0 ? 'Floater' : 'Individual') : '',
      sumInsured: quote ? pick(['300000', '5,00,000', '₹10,00,000', '2500000', '750000'], i) : '',
      tenureYears: quote ? String((i % 5) + 1) : '',
      occupation,
      pan: `ABC${String.fromCharCode(65 + (i % 26))}E${String(1000 + i)}F`.replace(
        /^(.{5})(\d{4})(.)$/,
        '$1$2$3',
      ),
      address: `${10 + i}, Sample Street, ${city}`,
      state,
      city,
      village: i % 6 === 5 ? 'Rampur' : '',
      highRiskCustomer: risk!,
      highRiskType: riskType!,
      landlineStdCode: i % 4 === 0 ? '011' : '',
      landlineNumber: i % 4 === 0 ? '2345678' : '',
      ckycNumber: i % 5 === 0 ? String(10000000000000 + i) : '',
      eInsuranceAccountNumber: i % 6 === 0 ? `EIA${100000 + i}` : '',
      nomineeName: `Nominee ${i + 1}`,
      nomineeRelationship: pick(NOMINEES, i),
      nomineeAddress: `${20 + i}, Nominee Road, ${city}`,
      nomineeContact: `9${String(810000000 + i * 37)}`,
      intermediaryPlace: city,
      [EXPECTED]: `New: ${family.label}; occupation ${occupation}; ${quote ? 'with' : 'no'} quote details${risk === 'Yes' ? `; high-risk ${riskType}` : ''}`,
    };
    family.members.forEach(([rel, dob, age, gender], m) => {
      row[`m${m + 1}Relationship`] = rel;
      row[`m${m + 1}DateOfBirth`] = dob;
      row[`m${m + 1}Age`] = age;
      row[`m${m + 1}Gender`] = gender;
    });
    rows.push(row);
  });
  // The first client again: flagged, saved only if the advisor asks.
  rows.push({ ...rows[0]!, [EXPECTED]: 'Repeated in file: same name and mobile as row 2' });
  const base = { name: 'Problem Client', pincode: '110001', m1Relationship: 'Self', m1Age: '40' };
  const problems: [string, Record<string, string>][] = [
    ['Aadhaar check digit wrong', { aadhaar: '1234 5678 9012' }],
    ['no pincode', { pincode: '' }],
    ['pincode not 6 digits', { pincode: '11001' }],
    ['no members', { m1Relationship: '', m1Age: '' }],
    ['unknown relationship', { m1Relationship: 'Cousin' }],
    ['member date of birth in the future', { m1Age: '', m1DateOfBirth: '01/01/2030' }],
    ['age does not match date of birth', { m1Age: '30', m1DateOfBirth: '01/01/1980' }],
    ['not a real date', { m1Age: '', m1DateOfBirth: '31/02/1990' }],
    ['cover type without sum insured and tenure', { coverType: 'Floater' }],
    ['tenure over 5 years', { coverType: 'Individual', sumInsured: '500000', tenureYears: '6' }],
    ['bad PAN', { pan: 'ABC123' }],
    ['bad email', { email: 'not-an-email' }],
    ['bad mobile', { phone: '12345' }],
    ['high-risk type but high-risk customer No', { highRiskCustomer: 'No', highRiskType: 'PEP' }],
    ['unknown nominee relationship', { nomineeRelationship: 'Friend' }],
    ['no client name', { name: '' }],
  ];
  for (const [what, cells] of problems) {
    rows.push({ ...base, ...cells, [EXPECTED]: `Has problems: ${what}` });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Travel clients
// ---------------------------------------------------------------------------------------------
const TRAVEL_OCCUPATIONS = ['Self-employed', 'Unemployed', 'Salaried', 'Service', 'Professional'];

function travellerRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 10; i += 1) {
    const [pin, state, city] = pick(CITIES, i + 2);
    const [risk, riskType] = pick(HIGH_RISK, i);
    const withPassport = i % 4 !== 3;
    rows.push({
      name: `${pick(FIRST, i + 5)} ${pick(LAST, i)}`,
      phone: pick(MOBILE_FORMATS(i + 40), i),
      email: i % 2 === 0 ? `traveller${i + 1}@example.com` : '',
      pincode: pin,
      dateOfBirth: pick(['05/04/1990', '1985-12-31', '7/3/1972', '15.08.2001', '29/02/1988'], i),
      gender: pick(GENDERS, i),
      maritalStatus: pick(MARITAL, i),
      occupation: pick(TRAVEL_OCCUPATIONS, i),
      notes: '',
      aadhaar: i % 3 === 2 ? '' : aadhaar(100 + i),
      passport: withPassport
        ? `${String.fromCharCode(75 + (i % 10))}${String(1234567 + i * 101)}`
        : '',
      passportAuthority: withPassport ? city : '',
      passportIssued: withPassport ? `01/0${(i % 9) + 1}/2019` : '',
      passportExpiry: withPassport ? `28/0${(i % 9) + 1}/2029` : '',
      pan: `TRV${String.fromCharCode(65 + i)}P${String(2000 + i)}Q`,
      address: `${30 + i}, Travel Lane, ${city}`,
      state,
      city,
      highRiskCustomer: risk!,
      highRiskType: riskType!,
      nomineeName: `Nominee ${i + 1}`,
      nomineeRelationship: pick(NOMINEES, i),
      nomineeContact: `9${String(820000000 + i * 41)}`,
      intermediaryPlace: city,
      [EXPECTED]: `New: ${pick(TRAVEL_OCCUPATIONS, i)}, ${pick(GENDERS, i)}, ${pick(MARITAL, i)}; ${withPassport ? 'with' : 'no'} passport`,
    });
  }
  rows.push({
    ...rows[0]!,
    phone: '',
    [EXPECTED]: 'Repeated in file: same name and date of birth as row 2',
  });
  const base = { name: 'Problem Traveller', pincode: '400001', dateOfBirth: '01/01/1990' };
  const problems: [string, Record<string, string>][] = [
    ['no date of birth', { dateOfBirth: '' }],
    ['date of birth in the future', { dateOfBirth: '01/01/2030' }],
    ['date written month first (13th month)', { dateOfBirth: '12/31/1990' }],
    [
      'passport expires before it was issued',
      { passportIssued: '01/01/2025', passportExpiry: '01/01/2020' },
    ],
    ['passport number too short', { passport: 'K12' }],
    ['Aadhaar check digit wrong', { aadhaar: '2345 6789 0123' }],
    ['unknown occupation', { occupation: 'Astronaut' }],
    ['unknown gender', { gender: 'X' }],
    ['no pincode', { pincode: '' }],
  ];
  for (const [what, cells] of problems) {
    rows.push({ ...base, ...cells, [EXPECTED]: `Has problems: ${what}` });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Vehicles: every class, new and pre-owned, with the details each class needs
// ---------------------------------------------------------------------------------------------
const CLASSES: {
  name: string;
  label: string;
  extra: (isNew: boolean, i: number) => Record<string, string>;
}[] = [
  {
    name: 'Private car',
    label: 'private car',
    extra: (isNew, i) => ({
      cc: pick(['998', '1197', '1498', '2179'], i),
      seats: '5',
      battery: 'No',
      ...(isNew ? { longTermOd: i % 2 ? 'Yes' : 'No' } : {}),
      make: 'MARUTI SUZUKI',
      model: 'SWIFT',
      variant: 'VXI',
      manufactureYear: isNew ? '2026' : '2021',
      fuelType: isNew ? 'Petrol' : 'CNG',
      bodyType: 'Hatch-Back',
      colour: isNew ? 'Pearl White' : 'Cherry Red',
      engineNumber: `K12N${isNew ? 'NEW' : 'OLD'}0001`,
      chassisNumber: `MA3PC${isNew ? 'NEW' : 'OLD'}00001`,
      invoiceValue: isNew ? '680000' : '',
    }),
  },
  {
    name: 'Two-wheeler',
    label: 'two-wheeler',
    extra: (isNew, i) => ({
      cc: pick(['110', '150', '350', '500'], i),
      battery: 'No',
      ...(isNew ? { longTermOd: 'Yes' } : {}),
      make: 'HONDA',
      model: 'ACTIVA',
      variant: 'DLX',
      manufactureYear: isNew ? '2026' : '2020',
      fuelType: 'Petrol',
      colour: 'Black',
      engineNumber: `JF50${isNew ? 'NEW' : 'OLD'}0001`,
      chassisNumber: `ME4TW${isNew ? 'NEW' : 'OLD'}00001`,
      invoiceValue: isNew ? '92000' : '',
    }),
  },
  {
    name: 'Taxi',
    label: 'taxi (up to 6)',
    extra: () => ({ cc: '1197', seats: '5', fuelType: 'Diesel' }),
  },
  {
    name: 'Bus',
    label: 'bus',
    extra: (isNew) => ({
      seats: '40',
      busType: isNew ? 'School bus' : 'Other',
      fuelType: 'Diesel',
    }),
  },
  { name: 'Passenger 2-wheeler', label: 'passenger 2-wheeler', extra: () => ({ seats: '2' }) },
  {
    name: 'Auto rickshaw',
    label: 'passenger 3-wheeler (up to 6)',
    extra: () => ({ seats: '4', fuelType: 'LPG' }),
  },
  {
    name: 'Passenger 3-wheeler (7 to 17)',
    label: 'passenger 3-wheeler (7 to 17)',
    extra: () => ({ seats: '10', fuelType: 'CNG' }),
  },
  {
    name: 'Goods carrier, private',
    label: 'goods carrier, private',
    extra: () => ({ cc: '2500', weight: '7500', fuelType: 'Diesel' }),
  },
  {
    name: 'Goods carrier, public',
    label: 'goods carrier, public',
    extra: () => ({ cc: '3000', weight: '12000', fuelType: 'Diesel' }),
  },
  {
    name: 'Goods 3-wheeler, private',
    label: 'goods 3-wheeler, private',
    extra: () => ({ cc: '200', weight: '1000' }),
  },
  {
    name: 'Goods 3-wheeler, public',
    label: 'goods 3-wheeler, public',
    extra: () => ({ weight: '1200' }),
  },
  { name: 'E-cart, private', label: 'e-cart, private', extra: () => ({ fuelType: 'Electric' }) },
  { name: 'E-cart, public', label: 'e-cart, public', extra: () => ({ fuelType: 'Electric' }) },
  { name: 'E-rickshaw', label: 'e-rickshaw', extra: () => ({ seats: '4', fuelType: 'Electric' }) },
  {
    name: 'Special vehicle',
    label: 'special vehicle',
    extra: (isNew) => ({
      hp: isNew ? '35' : '5.5',
      specialType: isNew ? 'Agricultural Tractors' : 'Ambulances',
    }),
  },
];
const NCB = ['0', '20', '25', '35', '45', '50'];

function vehicleRows(): Row[] {
  const rows: Row[] = [];
  CLASSES.forEach((c, i) => {
    for (const isNew of [true, false]) {
      const twoZones = c.label === 'private car' || c.label === 'two-wheeler';
      const ncb = pick(NCB, i);
      rows.push({
        name: `${c.name} - ${isNew ? 'new' : 'pre-owned'} sample`,
        vehicleClass: c.name,
        condition: isNew ? 'New' : 'Pre-owned',
        registrationDate: isNew ? '01/11/2026' : pick(['15/03/2022', '2019-07-01', '1/1/2018'], i),
        zone: twoZones ? (isNew ? 'A' : 'B') : pick(['A', 'B', 'C'], i),
        idv: pick(['610000', '85,000', '1500000', '450000', '250000'], i),
        odDiscount: pick(['', '0', '10', '25'], i),
        ...(isNew ? {} : { claimLastYear: i % 3 === 0 ? 'Yes' : 'No', previousNcb: ncb }),
        ...c.extra(isNew, i),
        [EXPECTED]: `New: ${c.label}, ${isNew ? 'new' : `pre-owned, NCB ${ncb}%`}`,
      });
    }
  });
  rows.push({
    ...rows[0]!,
    name: 'Same chassis, other name',
    [EXPECTED]: 'Repeated in file: same chassis number as row 2',
  });
  const base = {
    name: 'Problem Vehicle',
    vehicleClass: 'Private car',
    condition: 'New',
    registrationDate: '01/11/2026',
    zone: 'A',
    idv: '500000',
  };
  const problems: [string, Record<string, string>][] = [
    ['unknown vehicle class', { vehicleClass: 'Tractor' }],
    ['registration date in the future', { registrationDate: '01/01/2027' }],
    ['previous NCB not a step (30%)', { condition: 'Pre-owned', previousNcb: '30' }],
    ['IDV not a number', { idv: 'six lakh' }],
    ['OD discount over 95%', { odDiscount: '99' }],
    ['unknown fuel type', { fuelType: 'Hydrogen' }],
    ['unknown zone', { zone: 'D' }],
    ['no New or pre-owned', { condition: '' }],
    ['battery operated not Yes or No', { battery: 'Maybe' }],
    ['no vehicle name', { name: '' }],
  ];
  for (const [what, cells] of problems) {
    rows.push({ ...base, ...cells, [EXPECTED]: `Has problems: ${what}` });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------

const FILES: { kind: ImportKind; file: string; rows: () => Row[] }[] = [
  { kind: 'clients', file: 'Health clients sample.xlsx', rows: healthRows },
  { kind: 'travellers', file: 'Travel clients sample.xlsx', rows: travellerRows },
  { kind: 'vehicles', file: 'Vehicles sample.xlsx', rows: vehicleRows },
];

const STATUS_OF: Record<string, string> = {
  New: 'new',
  'Repeated in file': 'repeated',
  'Has problems': 'problems',
};

export async function generate(outDir: string): Promise<boolean> {
  let allPass = true;
  for (const { kind, file, rows: make } of FILES) {
    const spec = IMPORT_SPECS[kind];
    const rows = make();
    // The template's columns, plus any hidden ones this sample uses (members 7 and 8).
    const used = new Set(rows.flatMap((r) => Object.keys(r).filter((k) => r[k] !== '')));
    const columns = spec.columns.filter((c) => !c.hidden || used.has(c.key));
    const header = [...columns.map((c) => c.header), EXPECTED];
    const bold = { fontWeight: 'bold' as const };
    const path = join(outDir, file);
    await writeXlsxFile(
      [
        {
          sheet: spec.sheet,
          data: [
            header.map((h) => ({ value: h, ...bold })),
            ...rows.map((r) => [...columns.map((c) => r[c.key] ?? ''), r[EXPECTED]]),
          ],
          columns: header.map((h) => ({ width: Math.max(14, Math.min(40, h.length + 4)) })),
          stickyRowsCount: 1,
        },
      ],
      {},
    ).toFile(path);

    // Read back as the app does, and check each row's status.
    const read = await readSpreadsheet(path, spec.sheet);
    if (!read.ok) throw new Error(`${file}: ${read.reason}`);
    const layout = layoutSheet(read.rows, spec.columns);
    if (!layout.ok) throw new Error(`${file}: ${layout.reason}`);
    const expectedAt = read.rows[0]!.findIndex((h) => loose(h) === loose(EXPECTED));
    const seen = new Set<string>();
    const counts: Record<string, number> = {};
    let mismatches = 0;
    for (const row of layout.rows) {
      const result = spec.read(row, TODAY);
      const status = !result.ok ? 'problems' : seen.has(result.key) ? 'repeated' : 'new';
      if (result.ok) seen.add(result.key);
      counts[status] = (counts[status] ?? 0) + 1;
      const expected = read.rows[row.line - 1]![expectedAt]!;
      const want = STATUS_OF[expected.split(':')[0]!];
      if (status !== want) {
        mismatches += 1;
        print(
          `  FAIL row ${row.line}: got ${status}, expected "${expected}"${result.ok ? '' : `\n       ${result.problems.join('; ')}`}`,
        );
      }
    }
    const pass = mismatches === 0 && layout.ignored.join() === EXPECTED;
    allPass &&= pass;
    print(
      `${pass ? 'pass' : 'FAIL'}  ${file}: ${layout.rows.length} rows — ${counts.new ?? 0} new, ${counts.repeated ?? 0} repeated, ${counts.problems ?? 0} with problems`,
    );
  }
  return allPass;
}
