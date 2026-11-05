// HDFC ERGO: PIE's MST (Medisure Super Top-up) quote form (pie.hdfcergo.com/MST/CreateQuote), for a
// saved health client, to work the premium out. Built from the recording
// hdfc-ergo-2026-11-05T11-50-09-251Z, in which the form was filled to its premium:
// - plan details: the transaction type (New), the cover (labels name=Risk101: Individual, Family,
//   Family Floater) and the term (labels name=Risk102: "2 Years");
// - Member Detail: Adult and Child counters (input buttons #buttonPlusAdult and so on, counts in
//   #adultCount / #childCount); one tab per member (#Adult1, #Adult2, #Child1), each with its date
//   of birth (#Info02_<n>, dd/mm/yyyy, with a calendar) and relation (#Info12_<n>: Self, Spouse,
//   Father, Mother, Father in Law, Mother in Law, Dependent Son, Dependent Daughter), members
//   numbered adults first, then children;
// - Cover Detail: PIE then shows the premium ("Rs7106" and, in Quote Summary, "Total Payable
//   Premium Rs7106"), before any customer detail is asked.
// The sum insured and deductible were left as PIE sets them in the recording: they are listed for
// the advisor. The run never presses Generate Quote (it saves a quote) or Generate Proposal.
import type { ClientInput, ClientMember } from '../../shared/contracts/client';
import type { HdfcMstRun } from '../../shared/insurers/hdfc';
import type { PageOp } from './page-ops';
import { PIE_COMPLAINTS, PIE_PREMIUM_LABEL, type HdfcPlan, type HdfcStep } from './hdfc-motor';

const RELATION: Record<ClientMember['relationship'], string> = {
  self: 'Self',
  spouse: 'Spouse',
  father: 'Father',
  mother: 'Mother',
  father_in_law: 'Father in Law',
  mother_in_law: 'Mother in Law',
  son: 'Dependent Son',
  daughter: 'Dependent Daughter',
};

const who = (m: ClientMember): string =>
  m.relationship === 'self' ? 'proposer (self)' : m.relationship.replace(/_/g, ' ');

export function planHdfcMstQuote(client: ClientInput, run: HdfcMstRun): HdfcPlan {
  const adults = client.members.filter(
    (m) => m.relationship !== 'son' && m.relationship !== 'daughter',
  );
  const children = client.members.filter(
    (m) => m.relationship === 'son' || m.relationship === 'daughter',
  );
  const problems: string[] = [];
  if (adults.length === 0)
    problems.push('MST needs at least one adult (self, spouse or a parent).');
  for (const m of client.members) {
    if (!m.dateOfBirth) problems.push(`Add the ${who(m)}'s date of birth.`);
  }
  if (run.cover === 'individual' && client.members.length > 1) {
    problems.push(
      'An individual MST policy covers one member: choose Family Floater for this client.',
    );
  }
  if (problems.length > 0) return { ok: false, problems };

  const steps: HdfcStep[] = [];
  const add = (label: string, op: PageOp, more: Partial<HdfcStep> = {}) =>
    steps.push({ label, op, ...more });

  add(
    'Transaction type',
    { op: 'clickSelector', selector: '[name="TransactionType"]', pattern: '^new', timeoutMs: 5000 },
    { optional: true },
  );
  add('Cover', {
    op: 'clickSelector',
    selector: 'label[name="Risk101"]',
    text: run.cover === 'individual' ? 'Individual' : 'Family Floater',
    timeoutMs: 15000,
  });
  add('Policy term', {
    op: 'clickSelector',
    selector: 'label[name="Risk102"]',
    pattern: `^${run.years} years?$`,
    timeoutMs: 5000,
  });
  add('Member Detail', {
    op: 'clickSelector',
    selector: 'button[name="name"]',
    text: 'Member Detail',
    timeoutMs: 5000,
  });
  add('Adults', { op: 'stepper', index: 0, count: adults.length, timeoutMs: 10000 });
  add('Children', { op: 'stepper', index: 1, count: children.length, timeoutMs: 5000 });
  [...adults, ...children].forEach((m, n) => {
    const tab = n < adults.length ? `#Adult${n + 1}` : `#Child${n - adults.length + 1}`;
    add(`Member ${n + 1} (${who(m)})`, { op: 'clickSelector', selector: tab, timeoutMs: 5000 });
    add(`Date of birth (${who(m)})`, {
      op: 'typeDate',
      input: `#Info02_${n}`,
      date: m.dateOfBirth!,
    });
    add(`Relation (${who(m)})`, {
      op: 'setField',
      selector: `#Info12_${n}`,
      value: RELATION[m.relationship],
    });
  });
  add(
    'Cover Detail',
    { op: 'clickSelector', selector: 'button[name="name"]', text: 'Cover Detail', timeoutMs: 5000 },
    { popupAfter: true },
  );
  add(
    'Premium',
    { op: 'readAmount', label: PIE_PREMIUM_LABEL, errorPattern: PIE_COMPLAINTS, timeoutMs: 30000 },
    { keep: 'premium', popupAfter: true },
  );
  return {
    ok: true,
    steps,
    byHand: ["MST's sum insured and deductible (left as PIE sets them; the premium is for those)"],
  };
}
