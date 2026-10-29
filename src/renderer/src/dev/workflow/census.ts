// DEVELOPMENT-ONLY census staging for the demo workflow: the supplied synthetic census, CSV
// loading and row-level validation. Field checks reuse the M3 contract schemas (relationship
// list, contract age bounds, customer name and e-mail, pincode format). Business limits such
// as age per relationship are NOT checked here: the quote request validator applies them.
import {
  MAX_CONTRACT_AGE,
  RELATIONSHIPS,
  type Relationship,
  customerSchema,
} from '../../../../shared/contracts/customer';
import { pincodeSchema } from '../../../../shared/contracts/quote';
import { parseCsv } from './csv';
import {
  CENSUS_COLUMNS,
  type CensusBatch,
  type CensusField,
  type CensusIssue,
  type CensusRow,
  REQUIRED_CENSUS_COLUMNS,
} from './types';

/**
 * The supplied demo census: SYNTHETIC. Invented people at a fictitious company; every e-mail
 * address uses the reserved example.com domain (RFC 2606), so none can be delivered. Several
 * rows contain deliberate, correctable errors:
 * - line 17: pincode `11001` has five digits;
 * - line 20: the employee's name is missing;
 * - line 22: e-mail `nisha.fictional@example` has no domain suffix;
 * - line 27: relationship `sister` is not in the member contract;
 * - line 32: age `1O` uses the letter O;
 * - lines 39 and 40: the same spouse row twice (possible duplicate);
 * - line 52: a dependant of an employee who has no row of their own.
 * Lines 14 and 15 are twins of the same age: flagged as a possible duplicate, which the user
 * can confirm is not one. Line 8 names a dependant: accepted, but the name is not stored.
 * Line 53 is a parent aged 82: valid for the census, but outside the placeholder age limit,
 * so the quote request validator rejects a request that includes them. 52 people in total.
 */
export const SUPPLIED_DEMO_CENSUS_CSV = `employee_id,relationship,age,name,email,pincode
EMP-001,self,34,Aarav Sample,aarav.sample@example.com,110001
EMP-001,spouse,31,,,
EMP-001,son,6,,,
EMP-001,daughter,3,,,
EMP-002,self,41,Diya Example,diya.example@example.com,400001
EMP-002,spouse,39,,,
EMP-002,father,68,Ramesh Example,,
EMP-002,mother,64,,,
EMP-002,daughter,12,,,
EMP-003,self,28,Kabir Demo,kabir.demo@example.com,560001
EMP-004,self,36,Meera Placeholder,meera.placeholder@example.com,600001
EMP-004,spouse,37,,,
EMP-004,son,9,,,
EMP-004,son,9,,,
EMP-004,daughter,5,,,
EMP-005,self,45,Rohan Mockford,rohan.mockford@example.com,11001
EMP-005,spouse,43,,,
EMP-005,daughter,17,,,
EMP-006,self,30,,ishaan.sample@example.com,122001
EMP-006,spouse,29,,,
EMP-007,self,52,Nisha Fictional,nisha.fictional@example,700001
EMP-007,spouse,55,,,
EMP-007,father_in_law,79,,,
EMP-008,self,33,Arjun Sample,arjun.sample@example.com,110002
EMP-008,spouse,32,,,
EMP-008,sister,30,,,
EMP-009,self,27,Sara Example,,500001
EMP-009,mother,58,,,
EMP-010,self,39,Vikram Demo,vikram.demo@example.com,411001
EMP-010,spouse,36,,,
EMP-010,son,1O,,,
EMP-010,daughter,4,,,
EMP-011,self,48,Ananya Placeholder,ananya.placeholder@example.com,380001
EMP-011,spouse,50,,,
EMP-011,son,21,,,
EMP-011,daughter,19,,,
EMP-012,self,31,Dev Mockford,dev.mockford@example.com,302001
EMP-012,spouse,30,,,
EMP-012,spouse,30,,,
EMP-013,self,44,Kavya Fictional,kavya.fictional@example.com,226001
EMP-013,spouse,46,,,
EMP-013,daughter,14,,,
EMP-013,son,11,,,
EMP-013,mother,71,,,
EMP-014,self,26,Neel Sample,neel.sample@example.com,682001
EMP-015,self,37,Riya Example,riya.example@example.com,160017
EMP-015,spouse,38,,,
EMP-015,daughter,8,,,
EMP-016,self,58,Om Demo,om.demo@example.com,751001
EMP-016,spouse,56,,,
EMP-017,son,5,,,
EMP-016,father,82,,,
`;

export const EMPLOYEE_ID_PATTERN = /^EMP-\d{3}$/;

const RELATIONSHIP_TEXT =
  'self, spouse, son, daughter, father, mother, father-in-law, mother-in-law';

/** `Father-in-law`, `father in law` and `FATHER_IN_LAW` all become `father_in_law`. */
export function normaliseRelationship(text: string): Relationship | null {
  const key = text
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return (RELATIONSHIPS as readonly string[]).includes(key) ? (key as Relationship) : null;
}

/** A whole number of years, or null if the text is not one. */
export function parseAge(text: string): number | null {
  return /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null;
}

export type CensusLoad = { ok: true; rows: CensusRow[] } | { ok: false; error: string };

/** Parses census CSV text into staging rows. Column order may differ; extra columns are ignored. */
export function loadCensusCsv(text: string, firstRowId: number): CensusLoad {
  const parsed = parseCsv(text);
  if (!parsed.ok) return parsed;
  const [header, ...records] = parsed.records;
  if (!header) return { ok: false, error: 'The file is empty.' };
  const names = header.cells.map((c) => c.trim().toLowerCase());
  const missing = REQUIRED_CENSUS_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length > 0) {
    return { ok: false, error: `Required column missing: ${missing.join(', ')}.` };
  }
  if (records.length === 0) return { ok: false, error: 'The file has a header but no rows.' };
  const index = Object.fromEntries(CENSUS_COLUMNS.map((c) => [c, names.indexOf(c)])) as Record<
    CensusField,
    number
  >;
  const rows = records.map((record, i): CensusRow => {
    const values = Object.fromEntries(
      CENSUS_COLUMNS.map((c) => [c, index[c] >= 0 ? (record.cells[index[c]] ?? '').trim() : '']),
    ) as Record<CensusField, string>;
    return {
      id: `ROW-${String(firstRowId + i).padStart(3, '0')}`,
      line: record.line,
      values,
      imported: false,
      excluded: false,
      notDuplicate: false,
    };
  });
  return { ok: true, rows };
}

function issue(
  field: CensusIssue['field'],
  code: CensusIssue['code'],
  message: string,
  blocking = true,
): CensusIssue {
  return { field, code, message, blocking };
}

/** Field checks for one row, ignoring other rows. */
function fieldIssues(row: CensusRow): CensusIssue[] {
  const v = row.values;
  const issues: CensusIssue[] = [];
  if (v.employee_id === '')
    issues.push(issue('employee_id', 'REQUIRED', 'Employee ID is required.'));
  else if (!EMPLOYEE_ID_PATTERN.test(v.employee_id)) {
    issues.push(issue('employee_id', 'INVALID_FORMAT', 'Employee ID must look like EMP-001.'));
  }

  const relationship = normaliseRelationship(v.relationship);
  if (v.relationship === '')
    issues.push(issue('relationship', 'REQUIRED', 'Relationship is required.'));
  else if (!relationship) {
    issues.push(
      issue(
        'relationship',
        'UNSUPPORTED_VALUE',
        `"${v.relationship.slice(0, 30)}" is not a relationship the member contract supports (${RELATIONSHIP_TEXT}).`,
      ),
    );
  }

  const age = parseAge(v.age);
  if (v.age === '') issues.push(issue('age', 'REQUIRED', 'Age is required.'));
  else if (age === null) {
    issues.push(
      issue(
        'age',
        'INVALID_FORMAT',
        `Age "${v.age.slice(0, 10)}" is not a whole number of years. Use digits only (check for a letter O in place of a zero).`,
      ),
    );
  } else if (age > MAX_CONTRACT_AGE) {
    issues.push(issue('age', 'OUT_OF_RANGE', `Age must be between 0 and ${MAX_CONTRACT_AGE}.`));
  }

  if (relationship === 'self') {
    if (v.name === '')
      issues.push(issue('name', 'REQUIRED', "The employee's name is required on their own row."));
    else if (!customerSchema.shape.name.safeParse(v.name).success) {
      issues.push(
        issue('name', 'INVALID_FORMAT', 'The name must be one line of at most 100 characters.'),
      );
    }
    if (v.email !== '' && !customerSchema.shape.email.safeParse(v.email).success) {
      issues.push(issue('email', 'INVALID_FORMAT', 'The e-mail address is not valid.'));
    }
    if (v.pincode === '')
      issues.push(issue('pincode', 'REQUIRED', "Pincode is required on the employee's row."));
    else if (!pincodeSchema.safeParse(v.pincode).success) {
      issues.push(
        issue('pincode', 'INVALID_FORMAT', 'Pincode must be six digits, not starting with 0.'),
      );
    }
  } else if (relationship && (v.name !== '' || v.email !== '' || v.pincode !== '')) {
    issues.push(
      issue(
        'row',
        'NOT_STORED',
        "Name, e-mail and pincode on a dependant's row are not stored: members carry relationship and age only (data minimisation, C-04).",
        false,
      ),
    );
  }
  return issues;
}

const memberKey = (row: CensusRow): string | null => {
  const relationship = normaliseRelationship(row.values.relationship);
  const age = parseAge(row.values.age);
  return relationship && age !== null ? `${row.values.employee_id}|${relationship}|${age}` : null;
};

/** Every row's issues: field checks, then duplicates and the family (employee row) checks. */
export function validateCensus(rows: readonly CensusRow[]): Map<string, CensusIssue[]> {
  const result = new Map<string, CensusIssue[]>();
  const active = rows.filter((r) => !r.excluded);
  for (const row of rows) result.set(row.id, row.excluded ? [] : fieldIssues(row));

  // Two own rows for one employee, and identical member rows.
  const selfRows = new Map<string, CensusRow[]>();
  const sameMember = new Map<string, CensusRow[]>();
  for (const row of active) {
    if (normaliseRelationship(row.values.relationship) === 'self') {
      selfRows.set(row.values.employee_id, [...(selfRows.get(row.values.employee_id) ?? []), row]);
    }
    const key = memberKey(row);
    if (key) sameMember.set(key, [...(sameMember.get(key) ?? []), row]);
  }
  for (const group of selfRows.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      result
        .get(row.id)!
        .push(
          issue(
            'row',
            'DUPLICATE_EMPLOYEE_ROW',
            `Employee ${row.values.employee_id} has more than one own (self) row. Exclude the extra row.`,
          ),
        );
    }
  }
  for (const group of sameMember.values()) {
    if (group.length < 2 || normaliseRelationship(group[0]!.values.relationship) === 'self')
      continue;
    // Resolved once all but one of the identical rows are confirmed as different people.
    if (group.filter((r) => r.notDuplicate).length >= group.length - 1) continue;
    const lines = group.map((r) => r.line);
    for (const row of group) {
      const others = lines.filter((l) => l !== row.line).join(', ');
      result
        .get(row.id)!
        .push(
          issue(
            'row',
            'POSSIBLE_DUPLICATE',
            `Possible duplicate of line ${others}: same employee, relationship and age. Exclude one row, or confirm they are different people (for example, twins).`,
          ),
        );
    }
  }

  // A dependant needs the employee's own row, and that row must be importable.
  const ownRowOk = new Map<string, boolean>();
  for (const [employeeId, group] of selfRows) {
    const row = group[0]!;
    ownRowOk.set(
      employeeId,
      group.length === 1 && (row.imported || !result.get(row.id)!.some((i) => i.blocking)),
    );
  }
  for (const row of active) {
    const relationship = normaliseRelationship(row.values.relationship);
    if (
      !relationship ||
      relationship === 'self' ||
      !EMPLOYEE_ID_PATTERN.test(row.values.employee_id)
    )
      continue;
    const ok = ownRowOk.get(row.values.employee_id);
    if (ok === undefined) {
      result
        .get(row.id)!
        .push(
          issue(
            'row',
            'NO_EMPLOYEE_ROW',
            `There is no own (self) row for employee ${row.values.employee_id}, so this dependant cannot be imported.`,
          ),
        );
    } else if (!ok) {
      result
        .get(row.id)!
        .push(
          issue(
            'row',
            'EMPLOYEE_ROW_INVALID',
            `The own (self) row of employee ${row.values.employee_id} has errors. Correct it first.`,
          ),
        );
    }
  }
  return result;
}

export type CensusRowStatus = 'imported' | 'excluded' | 'blocked' | 'ready';

export function rowStatus(row: CensusRow, issues: readonly CensusIssue[]): CensusRowStatus {
  if (row.imported) return 'imported';
  if (row.excluded) return 'excluded';
  return issues.some((i) => i.blocking) ? 'blocked' : 'ready';
}

export interface CensusSummary {
  total: number;
  ready: number;
  blocked: number;
  imported: number;
  excluded: number;
  warnings: number;
}

export function summariseCensus(batch: CensusBatch | undefined): CensusSummary {
  const summary: CensusSummary = {
    total: 0,
    ready: 0,
    blocked: 0,
    imported: 0,
    excluded: 0,
    warnings: 0,
  };
  if (!batch) return summary;
  const issues = validateCensus(batch.rows);
  for (const row of batch.rows) {
    const rowIssues = issues.get(row.id) ?? [];
    summary.total += 1;
    summary[rowStatus(row, rowIssues)] += 1;
    if (rowIssues.some((i) => !i.blocking)) summary.warnings += 1;
  }
  return summary;
}
