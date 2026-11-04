// Client imports (health clients, travel clients, vehicles): reading rows, CSV, header matching,
// and real .xlsx files (the template, and a filled workbook) read back. Run on its own with
// `npx vitest run test/client-import.test.ts`.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import writeXlsxFile from 'write-excel-file/node';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientService } from '../src/main/clients/service';
import { createImportService } from '../src/main/import/service';
import { AppException } from '../src/main/ipc/dispatcher';
import { createLogger, type LogRecord } from '../src/main/logging/logger';
import { readSpreadsheet } from '../src/main/import/read-file';
import { writeTemplate } from '../src/main/import/template';
import { readCsv } from '../src/shared/import/csv';
import { readHealthClientRow } from '../src/shared/import/health-clients';
import { IMPORT_SPECS } from '../src/shared/import/kinds';
import { layoutSheet } from '../src/shared/import/sheet';
import { readTravellerRow } from '../src/shared/import/travellers';
import { readVehicleRow } from '../src/shared/import/vehicles';
import type { SheetRow } from '../src/shared/import/cells';

const TODAY = new Date(2026, 10, 4);

// The file dialogs: the next file the advisor "chooses".
const chosen = vi.hoisted(() => ({ path: '' }));
vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: () => Promise.resolve({ canceled: !chosen.path, filePaths: [chosen.path] }),
    showSaveDialog: () => Promise.resolve({ canceled: true }),
  },
}));

/** A valid Aadhaar number: eleven digits and their Verhoeff check digit. */
function aadhaarFrom(first11: string): string {
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
  let c = 0;
  [...first11].reverse().forEach((ch, i) => (c = d[c]![p[(i + 1) % 8]![Number(ch)]!]!));
  return first11 + String(inv[c]);
}
const AADHAAR = aadhaarFrom('23456789012');

const row = (cells: Record<string, string>, line = 2): SheetRow => ({ line, cells });

describe('health client rows', () => {
  const good = {
    name: '  Ramesh  Kumar ',
    phone: '+91 98765 43210',
    pincode: '110 001',
    aadhaar: AADHAAR.replace(/(\d{4})/g, '$1 ').trim(),
    maritalStatus: 'married',
    m1Relationship: 'Self',
    m1DateOfBirth: '15/08/1985',
    m1Gender: 'M',
    m2Relationship: 'wife',
    m2Age: '38',
    m2Gender: 'Female',
    coverType: 'Family floater',
    sumInsured: '₹5,00,000',
    tenureYears: '1',
    occupation: 'software professional',
    pan: 'abcde1234f',
    nomineeRelationship: 'Spouse',
  };

  it('becomes the client the form saves, with its Aadhaar for the vault', () => {
    const r = readHealthClientRow(row(good), TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.aadhaar).toBe(AADHAAR);
    expect(r.value.client).toMatchObject({
      customer: { name: 'Ramesh  Kumar', phone: '+91 98765 43210' },
      members: [
        { relationship: 'self', age: 41, dateOfBirth: '1985-08-15', gender: 'male' },
        { relationship: 'spouse', age: 38, gender: 'female' },
      ],
      proposerMaritalStatus: 'married',
      preferences: { coverType: 'floater', sumInsuredPaise: 50_000_000, tenureYears: 1 },
      proposal: { occupation: 'Software Professional', pan: 'abcde1234f' },
    });
    expect(r.label).toBe('Ramesh Kumar');
    expect(r.key).toBe('rameshkumar|9876543210');
    expect(r.detail).toContain(`Aadhaar ••${AADHAAR.slice(-4)}`);
  });

  it('lists every problem by column, never repeating a number', () => {
    const r = readHealthClientRow(
      row({
        name: 'Asha',
        aadhaar: '123412341234',
        m1Relationship: 'Self',
        m1DateOfBirth: '31/02/1990',
        m2Relationship: 'Son',
        m2DateOfBirth: '01/01/2010',
        m2Age: '5',
        m3Relationship: 'Daughter',
        m3DateOfBirth: '01/01/2030',
        coverType: 'Floater',
      }),
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toEqual(
      expect.arrayContaining([
        'Pincode: required',
        'Aadhaar number: not a valid Aadhaar number (12 digits, with a valid check digit)',
        'Member 1 date of birth: not a real date (DD/MM/YYYY)',
        'Member 2 age: does not match the date of birth (16)',
        'Member 3 date of birth: in the future',
        'Fill Cover type, Sum insured and Tenure together, or leave all three blank',
      ]),
    );
    expect(r.problems.join(' ')).not.toContain('123412341234');
  });

  it('needs at least one member', () => {
    const r = readHealthClientRow(row({ name: 'A', pincode: '110001' }), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.problems).toContain('Member 1 relationship: at least one member is required');
  });
});

describe('travel client rows', () => {
  it('reads the traveller, the passport and both numbers', () => {
    const r = readTravellerRow(
      row({
        name: 'Meera Shah',
        pincode: '400001',
        dateOfBirth: '1990-04-05',
        gender: 'f',
        occupation: 'salaried',
        aadhaar: AADHAAR,
        passport: 'z 1234567',
        passportIssued: '1/2/2020',
        passportExpiry: '31.01.2030',
      }),
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      aadhaar: AADHAAR,
      passport: 'Z1234567',
      traveller: {
        dateOfBirth: '1990-04-05',
        gender: 'female',
        occupation: 'Salaried',
        passport: { issueDate: '2020-02-01', expiryDate: '2030-01-31' },
      },
    });
    expect(r.key).toBe('meerashah|1990-04-05');
  });

  it('reports a passport expiring before it was issued under its column', () => {
    const r = readTravellerRow(
      row({
        name: 'A',
        pincode: '400001',
        dateOfBirth: '05/04/1990',
        passportIssued: '01/02/2030',
        passportExpiry: '01/02/2020',
      }),
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toContain('Passport expiry date: not valid');
  });
});

describe('vehicle rows', () => {
  it('reads a pre-owned car with its NCB and New India details', () => {
    const r = readVehicleRow(
      row({
        name: 'Swift - Ramesh',
        vehicleClass: 'car',
        condition: 'used',
        registrationDate: '10/03/2022',
        zone: 'zone b',
        idv: '4,50,000',
        cc: '1197',
        claimLastYear: 'No',
        previousNcb: '25%',
        fuelType: 'petrol',
        chassisNumber: 'MA3 TEST 1',
      }),
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.vehicle).toMatchObject({
      vehicleClass: 'private-car',
      condition: 'pre-owned',
      registrationDate: '2022-03-10',
      zone: 'B',
      idvRupees: 450000,
      cubicCapacityCc: 1197,
      claimLastYear: false,
      previousNcbPercent: 25,
      fuelType: 'petrol',
    });
    expect(r.key).toBe('chassis|ma3test1');
  });

  it('rejects unknown classes, NCB steps and future dates', () => {
    const r = readVehicleRow(
      row({
        name: 'X',
        vehicleClass: 'tractor',
        condition: 'new',
        registrationDate: '01/01/2027',
        zone: 'A',
        idv: '100',
        previousNcb: '30',
      }),
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toEqual(
      expect.arrayContaining([
        'Vehicle class: not one of the accepted values',
        'Date of registration: in the future',
        'Previous NCB (%): one of 0, 20, 25, 35, 45, 50',
      ]),
    );
  });
});

describe('sheets', () => {
  it('reads CSV as Excel writes it (semicolons, quotes, BOM, CRLF)', () => {
    const csv = readCsv(
      '\uFEFFClient name;Notes;Pincode\r\n"Shah; Meera";"said ""hi""";400001\r\n',
    );
    expect(csv).toEqual({
      ok: true,
      rows: [
        ['Client name', 'Notes', 'Pincode'],
        ['Shah; Meera', 'said "hi"', '400001'],
      ],
    });
    expect(readCsv('a,"b\n')).toEqual({ ok: false, reason: 'unclosed-quote' });
  });

  it('matches headers loosely, ignores unknown columns and skips blank rows', () => {
    const layout = layoutSheet(
      [
        ['', ''],
        ['CLIENT NAME', 'Pin-code', 'Favourite colour', 'client name'],
        ['A', '110001', 'red', 'again'],
        ['', '', '', ''],
        ['B', '110002', '', ''],
      ],
      IMPORT_SPECS.clients.columns,
    );
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(layout.ignored).toEqual(['Favourite colour', 'client name (repeated)']);
    expect(layout.rows).toEqual([
      { line: 3, cells: { name: 'A', pincode: '110001' } },
      { line: 5, cells: { name: 'B', pincode: '110002' } },
    ]);
  });

  it('refuses a file without the required columns', () => {
    const layout = layoutSheet([['Name only'], ['A']], IMPORT_SPECS.vehicles.columns);
    expect(layout.ok).toBe(false);
  });
});

describe('.xlsx files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fqf-import-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads back each template header as its columns', async () => {
    for (const kind of ['clients', 'travellers', 'vehicles'] as const) {
      const path = join(dir, `${kind}.xlsx`);
      await writeTemplate(kind, 'xlsx', path);
      const read = await readSpreadsheet(path, IMPORT_SPECS[kind].sheet);
      expect(read.ok).toBe(true);
      if (!read.ok) continue;
      expect(read.rows[0]).toEqual(
        IMPORT_SPECS[kind].columns.filter((c) => !c.hidden).map((c) => c.header),
      );
    }
  });

  it('reads a filled workbook: Excel dates and numbers become the row the import checks', async () => {
    const path = join(dir, 'filled.xlsx');
    await writeXlsxFile(
      [
        { sheet: 'Notes', data: [['ignored']] },
        {
          sheet: 'Clients',
          dateFormat: 'dd/mm/yyyy',
          data: [
            [
              'Client name',
              'Pincode',
              'Aadhaar number',
              'Member 1 relationship',
              'Member 1 date of birth',
            ],
            ['Ramesh', 110001, Number(AADHAAR), 'Self', new Date(Date.UTC(1985, 7, 15))],
          ],
        },
      ],
      {},
    ).toFile(path);
    const read = await readSpreadsheet(path, 'Clients');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const layout = layoutSheet(read.rows, IMPORT_SPECS.clients.columns);
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    const r = readHealthClientRow(layout.rows[0]!, TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.aadhaar).toBe(AADHAAR);
      expect(r.value.client.members[0]).toMatchObject({ dateOfBirth: '1985-08-15', age: 41 });
    }
  });

  it('refuses an old .xls file and an unreadable .xlsx', async () => {
    expect(await readSpreadsheet(join(dir, 'old.xls'), 'Clients')).toEqual({
      ok: false,
      reason: 'xls',
    });
    const bad = join(dir, 'bad.xlsx');
    await writeTemplate('clients', 'csv', bad);
    expect(await readSpreadsheet(bad, 'Clients')).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('import service (preview, duplicates, saving)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fqf-import-svc-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const csv = (name: string, lines: string[]) => {
    const path = join(dir, name);
    writeFileSync(path, lines.join('\r\n'), 'utf8');
    return path;
  };
  let saves: unknown[][];
  let records: LogRecord[];
  let failVaultFrom: number;
  const clients = {
    list: () =>
      Promise.resolve({
        enabled: true,
        storageError: null,
        clients: [
          {
            id: 'c1',
            name: 'Saved Client',
            pincode: '110001',
            memberCount: 1,
            hasPreferences: false,
            updatedAt: '2026-11-01T00:00:00.000Z',
          },
        ],
      }),
    get: () =>
      Promise.resolve({
        id: 'c1',
        client: { customer: { name: 'Saved Client', phone: '9876543210' }, pincode: '110001' },
      }),
    save: (...args: unknown[]) => {
      saves.push(['client', ...args]);
      if (saves.length >= failVaultFrom)
        return Promise.reject(new AppException('SECRET_STORE_UNAVAILABLE'));
      return Promise.resolve(`id${saves.length}`);
    },
    listTravellers: () =>
      Promise.resolve([
        {
          id: 't1',
          name: 'Meera Shah',
          pincode: '400001',
          dateOfBirth: '1990-04-05',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
      ]),
    saveTraveller: (...args: unknown[]) => {
      saves.push(['traveller', ...args]);
      return Promise.resolve('t');
    },
    listVehicles: () => Promise.resolve([]),
    getVehicle: () => Promise.reject(new Error('unused')),
    saveVehicle: (...args: unknown[]) => {
      saves.push(['vehicle', ...args]);
      return Promise.resolve('v');
    },
  } as unknown as ClientService;
  const service = () =>
    createImportService({
      clients,
      window: () => null,
      logger: createLogger([(r) => records.push(r)]),
      now: () => TODAY,
    });
  beforeEach(() => {
    saves = [];
    records = [];
    failVaultFrom = Infinity;
  });

  const header = 'Client name,Mobile,Pincode,Aadhaar number,Member 1 relationship,Member 1 age';
  const file = () =>
    csv('clients.csv', [
      header,
      `New One,9123456789,110002,${AADHAAR},Self,40`,
      'Saved Client,98765 43210,110001,,Self,50',
      'New One,9123456789,110002,,Self,40',
      'Broken,,,,Self,abc',
      `New Two,,560001,${AADHAAR},Self,30`,
    ]);

  it('marks rows new, already saved, repeated or with problems, and shows no numbers', async () => {
    chosen.path = file();
    const preview = await service().preview('clients');
    expect(preview.problem).toBeNull();
    expect(preview.rows.map((r) => [r.line, r.status])).toEqual([
      [2, 'new'],
      [3, 'saved-already'],
      [4, 'repeated'],
      [5, 'problems'],
      [6, 'new'],
    ]);
    expect(JSON.stringify(preview)).not.toContain(AADHAAR);
    expect(preview.rows[0]!.detail).toContain(`Aadhaar ••${AADHAAR.slice(-4)}`);
    // Only the kind and counts are logged: no file name, no row content.
    const logged = JSON.stringify(records);
    expect(logged).toContain('import.previewed');
    expect(logged).not.toContain('clients.csv');
    expect(logged).not.toContain('New One');
  });

  it('saves the new rows with their Aadhaar numbers, once', async () => {
    chosen.path = file();
    const s = service();
    const preview = await s.preview('clients');
    const result = await s.commit(preview.token!, false);
    expect(result).toEqual({ saved: 2, skipped: 2, failed: [] });
    expect(
      saves.map((c) => [(c[2] as { customer: { name: string } }).customer.name, c[3]]),
    ).toEqual([
      ['New One', AADHAAR],
      ['New Two', AADHAAR],
    ]);
    expect(saves.every((c) => c[1] === null)).toBe(true);
    await expect(s.commit(preview.token!, false)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('saves the duplicates too when asked', async () => {
    chosen.path = file();
    const s = service();
    const result = await s.commit((await s.preview('clients')).token!, true);
    expect(result).toEqual({ saved: 4, skipped: 0, failed: [] });
  });

  it('stops when secure storage fails, and says which rows were not tried', async () => {
    chosen.path = file();
    failVaultFrom = 1;
    const s = service();
    const result = await s.commit((await s.preview('clients')).token!, false);
    expect(result).toEqual({
      saved: 0,
      skipped: 2,
      failed: [
        { line: 2, code: 'SECRET_STORE_UNAVAILABLE' },
        { line: 6, code: 'CANCELLED' },
      ],
    });
  });

  it('passes travel clients’ numbers to the vault and finds a saved traveller by name and birth date', async () => {
    chosen.path = csv('travellers.csv', [
      'Traveller name,Pincode,Date of birth,Passport number,Aadhaar number',
      'Meera Shah,400001,05/04/1990,Z1234567,',
      `Ravi Rao,500001,01/01/1980,k7654321,${AADHAAR}`,
    ]);
    const s = service();
    const preview = await s.preview('travellers');
    expect(preview.rows.map((r) => r.status)).toEqual(['saved-already', 'new']);
    await s.commit(preview.token!, false);
    expect(saves).toEqual([
      [
        'traveller',
        null,
        expect.objectContaining({ dateOfBirth: '1980-01-01' }),
        { aadhaar: AADHAAR, passport: 'K7654321' },
      ],
    ]);
  });

  it('reports a file it cannot use, and a closed dialog as cancelled', async () => {
    chosen.path = csv('wrong.csv', ['Something,Else', 'a,b']);
    const preview = await service().preview('vehicles');
    expect(preview.token).toBeNull();
    expect(preview.problem).toContain('Missing: Vehicle name, Vehicle class');
    chosen.path = '';
    await expect(service().preview('vehicles')).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
