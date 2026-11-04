// The travel client import: one row per traveller, with their passport. The Aadhaar and passport
// numbers go to the vault, as the app's own form does. Pure.
import { aadhaarSchema } from '../contracts/client';
import { passportNumberSchema } from '../contracts/travel';
import { travellerSchema, type TravellerRaw } from '../contracts/traveller';
import { readChoice, readDate, rowReader, loose, type SheetRow } from './cells';
import { GENDER_CHOICES, listOf, MARITAL_CHOICES, TRAVEL_OCCUPATION_CHOICES } from './choices';
import { PROPOSAL_COLUMNS, readProposal } from './proposal-columns';
import { schemaProblems, type ImportRow } from './result';
import type { Column } from './sheet';

export const TRAVELLER_COLUMNS: readonly Column[] = [
  { key: 'name', header: 'Traveller name', required: true, help: 'Required.', aliases: ['Name'] },
  { key: 'phone', header: 'Mobile', help: '10 digits (+91 or 0 in front is fine).' },
  { key: 'email', header: 'Email', help: '' },
  { key: 'pincode', header: 'Pincode', required: true, help: 'Required. 6 digits.' },
  {
    key: 'dateOfBirth',
    header: 'Date of birth',
    required: true,
    help: 'Required. DD/MM/YYYY.',
  },
  { key: 'gender', header: 'Gender', help: listOf(GENDER_CHOICES) },
  { key: 'maritalStatus', header: 'Marital status', help: listOf(MARITAL_CHOICES) },
  { key: 'occupation', header: 'Occupation', help: listOf(TRAVEL_OCCUPATION_CHOICES) },
  { key: 'notes', header: 'Notes', help: 'For you; not sent to insurers.' },
  { key: 'aadhaar', header: 'Aadhaar number', help: '12 digits. Kept in the encrypted vault.' },
  {
    key: 'passport',
    header: 'Passport number',
    help: '6 to 12 letters and digits. Kept in the encrypted vault.',
  },
  { key: 'passportAuthority', header: 'Passport issuing authority', help: 'For example Delhi.' },
  { key: 'passportIssued', header: 'Passport issue date', help: 'DD/MM/YYYY.' },
  {
    key: 'passportExpiry',
    header: 'Passport expiry date',
    help: 'DD/MM/YYYY, after the issue date.',
  },
  ...PROPOSAL_COLUMNS,
];

const HEADERS = Object.fromEntries(TRAVELLER_COLUMNS.map((c) => [c.key, c.header])) as Record<
  string,
  string
>;

function columnFor(path: readonly PropertyKey[]): string | null {
  const [top, second] = path;
  if (top === 'customer') return typeof second === 'string' ? (HEADERS[second] ?? null) : null;
  if (top === 'passport') {
    return (
      { issuingAuthority: HEADERS.passportAuthority, issueDate: HEADERS.passportIssued }[
        String(second)
      ] ?? HEADERS.passportExpiry!
    );
  }
  if (top === 'proposal' && typeof second === 'string') return HEADERS[second] ?? null;
  return typeof top === 'string' ? (HEADERS[top] ?? null) : null;
}

export interface TravellerImport {
  traveller: TravellerRaw;
  aadhaar?: string;
  passport?: string;
}

export function readTravellerRow(row: SheetRow, today: Date): ImportRow<TravellerImport> {
  const r = rowReader(row, HEADERS);
  const name = r.text('name') ?? '';
  const dateOfBirth = r.require('dateOfBirth', readDate);
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (dateOfBirth !== undefined && dateOfBirth > iso) r.problem('dateOfBirth', 'in the future');
  const gender = r.read('gender', (t) => readChoice(t, GENDER_CHOICES));
  const maritalStatus = r.read('maritalStatus', (t) => readChoice(t, MARITAL_CHOICES));
  const occupation = r.read('occupation', (t) => readChoice(t, TRAVEL_OCCUPATION_CHOICES));
  const issuingAuthority = r.text('passportAuthority');
  const issueDate = r.read('passportIssued', readDate);
  const expiryDate = r.read('passportExpiry', readDate);
  const proposal = readProposal(r);

  const vault = <T>(
    key: string,
    schema: { safeParse(v: string): { success: true; data: T } | { success: false } },
    reason: string,
  ): T | undefined => {
    const text = r.text(key);
    if (text === undefined) return undefined;
    const parsed = schema.safeParse(text);
    if (parsed.success) return parsed.data;
    r.problem(key, reason);
    return undefined;
  };
  const aadhaar = vault<string>(
    'aadhaar',
    aadhaarSchema,
    'not a valid Aadhaar number (12 digits, with a valid check digit)',
  );
  const passport = vault<string>(
    'passport',
    passportNumberSchema,
    'not a valid passport number (6 to 12 letters and digits)',
  );

  const phone = r.text('phone');
  const email = r.text('email');
  const notes = r.text('notes');
  const passportDetails = {
    ...(issuingAuthority ? { issuingAuthority } : {}),
    ...(issueDate ? { issueDate } : {}),
    ...(expiryDate ? { expiryDate } : {}),
  };
  const traveller = {
    customer: {
      name,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(notes ? { notes } : {}),
    },
    pincode: r.text('pincode') ?? '',
    dateOfBirth: dateOfBirth ?? '',
    ...(gender ? { gender } : {}),
    ...(maritalStatus ? { maritalStatus } : {}),
    ...(occupation ? { occupation } : {}),
    ...(proposal ? { proposal } : {}),
    ...(Object.keys(passportDetails).length > 0 ? { passport: passportDetails } : {}),
  };

  if (!name) r.problem('name', 'required');
  if (!r.text('pincode')) r.problem('pincode', 'required');
  const checked = travellerSchema.safeParse(traveller);
  const problems = [
    ...r.problems,
    ...(checked.success ? [] : schemaProblems(checked.error.issues, columnFor, r.problems)),
  ];
  const detail = [
    `Pincode ${r.text('pincode') ?? '—'}`,
    ...(dateOfBirth ? [`born ${dateOfBirth.split('-').reverse().join('/')}`] : []),
    ...(passport ? [`passport ••${passport.slice(-4)}`] : []),
  ].join(' · ');
  if (problems.length > 0 || !checked.success) {
    return { ok: false, line: row.line, label: name || '(no name)', detail, problems };
  }
  return {
    ok: true,
    line: row.line,
    label: checked.data.customer.name,
    detail,
    // Same traveller: same name and date of birth.
    key: `${loose(checked.data.customer.name)}|${checked.data.dateOfBirth}`,
    value: {
      traveller,
      ...(aadhaar ? { aadhaar } : {}),
      ...(passport ? { passport } : {}),
    },
  };
}
