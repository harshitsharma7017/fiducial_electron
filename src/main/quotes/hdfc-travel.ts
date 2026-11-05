// HDFC ERGO: PIE's Retail Travel form (pie.hdfcergo.com/Travel/CreateQuote), new business, for a
// travel client (one traveller), to work the premium out. The recording
// hdfc-ergo-2026-11-05T11-50-09-251Z opened it for a renewal only, showing: the transaction type
// buttons (#TransactionType2: Renew; New is the first), Individual / Family Floater, the dates of
// departure and return (#PolicyEffectiveFromDate, #PolicyEffectiveToDate, dd/mm/yyyy), the plan
// (#Risk103, suggesting as you type: "Type i.e. Gold") and Member Detail. The member's date of
// birth and relation, and Calculate Premium with its Premium Details, are taken from PIE's MST
// form (same layout: Plan Details, Member Detail, Info02/Info12 per member); the run reads "Total
// Payable Premium". Optional where the recording did not show them. Never presses Generate Quote.
import type { Traveller } from '../../shared/contracts/traveller';
import type { HdfcTravelRun } from '../../shared/insurers/hdfc';
import type { PageOp } from './page-ops';
import { PIE_COMPLAINTS, PIE_PREMIUM_LABEL, type HdfcPlan, type HdfcStep } from './hdfc-motor';
import { PIE_PREMIUM_CAPTIONS } from './hdfc-retail';

export function planHdfcTravelQuote(
  traveller: Traveller,
  run: HdfcTravelRun,
  options: { today: Date },
): HdfcPlan {
  const iso = `${options.today.getFullYear()}-${String(options.today.getMonth() + 1).padStart(2, '0')}-${String(options.today.getDate()).padStart(2, '0')}`;
  if (run.departureDate < iso) {
    return { ok: false, problems: ['The departure date has passed.'] };
  }
  const steps: HdfcStep[] = [];
  const add = (label: string, op: PageOp, more: Partial<HdfcStep> = {}) =>
    steps.push({ label, op, ...more });
  const optional = (ifMissed: string): Partial<HdfcStep> => ({ optional: true, ifMissed });

  add(
    'Transaction type',
    {
      op: 'clickSelector',
      selector: '[name="TransactionType"]',
      pattern: '^new',
      timeoutMs: 10000,
    },
    { optional: true },
  );
  add(
    'Cover',
    { op: 'clickSelector', selector: 'button, label', text: 'Individual', timeoutMs: 5000 },
    optional('cover (Individual)'),
  );
  add('Date of departure', {
    op: 'typeDate',
    input: '#PolicyEffectiveFromDate',
    date: run.departureDate,
  });
  add('Date of return', { op: 'typeDate', input: '#PolicyEffectiveToDate', date: run.returnDate });
  add(
    'Plan',
    {
      op: 'pickOption',
      selector: '#Risk103',
      type: run.plan,
      options: [run.plan],
      startsWith: true,
      timeoutMs: 10000,
    },
    { keep: 'plan', popupAfter: true },
  );
  add('Member Detail', {
    op: 'clickSelector',
    selector: 'button[name="name"]',
    text: 'Member Detail',
    timeoutMs: 5000,
  });
  add('Member', { op: 'clickSelector', selector: '#Adult1', timeoutMs: 3000 }, { optional: true });
  add("Traveller's date of birth", {
    op: 'typeDate',
    input: '#Info02_0',
    date: traveller.dateOfBirth,
  });
  add(
    'Relation',
    { op: 'setField', selector: '#Info12_0', value: 'Self' },
    optional('relation (Self)'),
  );
  add(
    'Calculate Premium',
    {
      op: 'clickSelector',
      selector: '#btnSubmit, button[name="name"]',
      pattern: '^(calculate premium|cover detail)',
      timeoutMs: 5000,
    },
    { popupAfter: true },
  );
  add('Premium', { op: 'pause', ms: 2000 });
  add(
    'Premium',
    {
      op: 'readAmount',
      label: PIE_PREMIUM_LABEL,
      alsoLabels: PIE_PREMIUM_CAPTIONS,
      errorPattern: PIE_COMPLAINTS,
      timeoutMs: 25000,
    },
    { keep: 'premium', popupAfter: true },
  );
  return { ok: true, steps, byHand: ['travel covers and add-ons (left as PIE sets them)'] };
}
