// The health client import: one row per client, with up to twelve members in "Member N …"
// columns (six in the template; more are read when present). Each row becomes what the app's own
// client form saves, checked by the same schema, and its Aadhaar number for the vault. Pure: today
// is passed in (ages are worked out from dates of birth).
import {
  aadhaarSchema,
  ageOn,
  clientInputSchema,
  type ClientInputRaw,
  UIIC_OCCUPATIONS,
} from '../contracts/client';
import { PAISE_PER_RUPEE } from '../money';
import {
  readChoice,
  readDate,
  readInt,
  readRupees,
  rowReader,
  loose,
  type SheetRow,
} from './cells';
import {
  COVER_CHOICES,
  GENDER_CHOICES,
  listOf,
  MARITAL_CHOICES,
  RELATIONSHIP_CHOICES,
} from './choices';
import { PROPOSAL_COLUMNS, readProposal } from './proposal-columns';
import { schemaProblems, type ImportRow } from './result';
import type { Column } from './sheet';

export const MAX_IMPORT_MEMBERS = 12;
const TEMPLATE_MEMBERS = 6;

const memberColumns = (n: number): Column[] => {
  const hidden = n > TEMPLATE_MEMBERS;
  return [
    {
      key: `m${n}Relationship`,
      header: `Member ${n} relationship`,
      required: false,
      help:
        n === 1 ? `Usually Self. ${listOf(RELATIONSHIP_CHOICES)}.` : listOf(RELATIONSHIP_CHOICES),
      hidden,
    },
    {
      key: `m${n}DateOfBirth`,
      header: `Member ${n} date of birth`,
      help: 'DD/MM/YYYY. The age is worked out from it.',
      hidden,
    },
    {
      key: `m${n}Age`,
      header: `Member ${n} age`,
      help: 'In years, if the date of birth is not known.',
      hidden,
    },
    { key: `m${n}Gender`, header: `Member ${n} gender`, help: listOf(GENDER_CHOICES), hidden },
  ];
};

export const HEALTH_CLIENT_COLUMNS: readonly Column[] = [
  { key: 'name', header: 'Client name', required: true, help: 'Required.' },
  { key: 'phone', header: 'Mobile', help: '10 digits (+91 or 0 in front is fine).' },
  { key: 'email', header: 'Email', help: '' },
  { key: 'pincode', header: 'Pincode', required: true, help: 'Required. 6 digits.' },
  { key: 'notes', header: 'Notes', help: 'For you; not sent to insurers.' },
  { key: 'aadhaar', header: 'Aadhaar number', help: '12 digits. Kept in the encrypted vault.' },
  {
    key: 'maritalStatus',
    header: 'Proposer marital status',
    help: listOf(MARITAL_CHOICES),
  },
  ...Array.from({ length: MAX_IMPORT_MEMBERS }, (_, i) => memberColumns(i + 1)).flat(),
  {
    key: 'coverType',
    header: 'Cover type',
    help: `${listOf(COVER_CHOICES)}. Fill cover type, sum insured and tenure together, or none.`,
  },
  {
    key: 'sumInsured',
    header: 'Sum insured (₹)',
    help: 'In rupees, for example 500000. Per member for individual cover.',
  },
  { key: 'tenureYears', header: 'Tenure (years)', help: '1 to 5.' },
  {
    key: 'occupation',
    header: 'Occupation',
    help: `As United India lists it, for example: ${UIIC_OCCUPATIONS.slice(0, 4).join(', ')}.`,
  },
  ...PROPOSAL_COLUMNS,
];

const HEADERS = Object.fromEntries(HEALTH_CLIENT_COLUMNS.map((c) => [c.key, c.header])) as Record<
  string,
  string
>;

/** Where a schema problem is, as a column of this import. */
function columnFor(path: readonly PropertyKey[]): string | null {
  const [top, second, third] = path;
  if (top === 'customer') return typeof second === 'string' ? (HEADERS[second] ?? null) : null;
  if (top === 'pincode') return HEADERS.pincode!;
  if (top === 'proposerMaritalStatus') return HEADERS.maritalStatus!;
  if (top === 'members' && typeof second === 'number') {
    const n = second + 1;
    const field = { relationship: 'Relationship', dateOfBirth: 'DateOfBirth', age: 'Age' }[
      String(third)
    ];
    return HEADERS[`m${n}${field ?? 'Relationship'}`] ?? `Member ${n}`;
  }
  if (top === 'preferences') {
    const key = {
      coverType: 'coverType',
      sumInsuredPaise: 'sumInsured',
      tenureYears: 'tenureYears',
    }[String(second)];
    return key ? HEADERS[key]! : HEADERS.coverType!;
  }
  if (top === 'proposal' && typeof second === 'string') return HEADERS[second] ?? null;
  return null;
}

export interface HealthClientImport {
  client: ClientInputRaw;
  aadhaar?: string;
}

export function readHealthClientRow(row: SheetRow, today: Date): ImportRow<HealthClientImport> {
  const r = rowReader(row, HEADERS);
  const name = r.text('name') ?? '';

  const members: Record<string, unknown>[] = [];
  for (let n = 1; n <= MAX_IMPORT_MEMBERS; n += 1) {
    const given = ['Relationship', 'DateOfBirth', 'Age', 'Gender'].some(
      (f) => r.text(`m${n}${f}`) !== undefined,
    );
    if (!given) continue;
    const relationship = r.require(`m${n}Relationship`, (t) => readChoice(t, RELATIONSHIP_CHOICES));
    const dateOfBirth = r.read(`m${n}DateOfBirth`, readDate);
    let age = r.read(`m${n}Age`, (t) => readInt(t, 0, 120));
    if (dateOfBirth !== undefined) {
      const worked = ageOn(dateOfBirth, today);
      if (worked < 0) r.problem(`m${n}DateOfBirth`, 'in the future');
      else if (age !== undefined && age !== worked) {
        r.problem(`m${n}Age`, `does not match the date of birth (${worked})`);
      } else age = worked;
    } else if (age === undefined && r.text(`m${n}Age`) === undefined) {
      r.problem(`m${n}DateOfBirth`, 'give the date of birth or the age');
    }
    const gender = r.read(`m${n}Gender`, (t) => readChoice(t, GENDER_CHOICES));
    members.push({
      ...(relationship !== undefined ? { relationship } : {}),
      ...(age !== undefined ? { age } : {}),
      ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
      ...(gender !== undefined ? { gender } : {}),
    });
  }
  if (members.length === 0) r.problem('m1Relationship', 'at least one member is required');

  const coverType = r.read('coverType', (t) => readChoice(t, COVER_CHOICES));
  const sumInsured = r.read('sumInsured', (t) => readRupees(t, 100_000_000));
  const tenureYears = r.read('tenureYears', (t) => readInt(t, 1, 5));
  const quoteGiven = ['coverType', 'sumInsured', 'tenureYears'].filter(
    (k) => r.text(k) !== undefined,
  );
  if (quoteGiven.length > 0 && quoteGiven.length < 3) {
    r.problem(null, 'Fill Cover type, Sum insured and Tenure together, or leave all three blank');
  }

  const occupation = r.text('occupation');
  const listedOccupation = occupation
    ? (UIIC_OCCUPATIONS.find((o) => loose(o) === loose(occupation)) ?? occupation)
    : undefined;
  const proposal = readProposal(r, listedOccupation ? { occupation: listedOccupation } : {});
  const maritalStatus = r.read('maritalStatus', (t) => readChoice(t, MARITAL_CHOICES));

  const aadhaarText = r.text('aadhaar');
  let aadhaar: string | undefined;
  if (aadhaarText !== undefined) {
    const parsed = aadhaarSchema.safeParse(aadhaarText);
    if (parsed.success) aadhaar = parsed.data;
    else r.problem('aadhaar', 'not a valid Aadhaar number (12 digits, with a valid check digit)');
  }

  const phone = r.text('phone');
  const email = r.text('email');
  const notes = r.text('notes');
  const client = {
    customer: {
      name,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(notes ? { notes } : {}),
    },
    pincode: r.text('pincode') ?? '',
    members,
    ...(maritalStatus ? { proposerMaritalStatus: maritalStatus } : {}),
    ...(coverType && sumInsured !== undefined && tenureYears !== undefined
      ? {
          preferences: {
            coverType,
            sumInsuredPaise: Math.round(sumInsured * PAISE_PER_RUPEE),
            tenureYears,
          },
        }
      : {}),
    ...(proposal ? { proposal } : {}),
  } as ClientInputRaw;

  if (!name) r.problem('name', 'required');
  if (!r.text('pincode')) r.problem('pincode', 'required');
  const checked = clientInputSchema.safeParse(client);
  const problems = [
    ...r.problems,
    ...(checked.success ? [] : schemaProblems(checked.error.issues, columnFor, r.problems)),
  ];
  const detail = [
    `Pincode ${r.text('pincode') ?? '—'}`,
    `${members.length} ${members.length === 1 ? 'member' : 'members'}`,
    ...(aadhaar ? [`Aadhaar ••${aadhaar.slice(-4)}`] : []),
  ].join(' · ');
  if (problems.length > 0 || !checked.success) {
    return { ok: false, line: row.line, label: name || '(no name)', detail, problems };
  }
  return {
    ok: true,
    line: row.line,
    label: checked.data.customer.name,
    detail,
    // Same client: same name and mobile, or (no mobile) same name and pincode.
    key: `${loose(checked.data.customer.name)}|${checked.data.customer.phone ?? checked.data.pincode}`,
    value: { client, ...(aadhaar ? { aadhaar } : {}) },
  };
}
