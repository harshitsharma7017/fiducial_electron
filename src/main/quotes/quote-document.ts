// A fetched quote as a document the advisor can send (request of 11 November 2026): the client and
// what was asked, every plan the insurer quoted with its premium, and the notes that go with them.
// Plain HTML laid out for A4, printed to PDF by quote-pdf.ts in a window without scripts. Every
// value is escaped. Pure.
import { ageOn, type ClientInput } from '../../shared/contracts/client';
import type { Traveller } from '../../shared/contracts/traveller';
import type { Vehicle } from '../../shared/contracts/vehicle';
import { PAISE_PER_RUPEE } from '../../shared/money';

export interface QuoteDocument {
  /** "Health insurance quote". */
  title: string;
  insurer: string;
  /** What was quoted, for example "Health (premium calculator)". */
  product: string;
  issuedAt: Date;
  /** For example "QF-20261111-1257". */
  reference: string;
  clientName: string;
  /** Who and what the quote is for, as label and value. */
  details: [string, string][];
  /** The insured people, for health quotes. */
  members?: { person: string; dateOfBirth: string; age: string; gender: string }[];
  /** Each plan and its premium, as the insurer showed them. */
  plans: { name: string; amount: string }[];
  /** What the amounts are, for example "Premium (excluding GST)". */
  amountLabel: string;
  notes: string[];
}

const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const two = (n: number) => String(n).padStart(2, '0');
const ddmmyyyy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const RELATION: Record<string, string> = {
  self: 'Proposer',
  spouse: 'Spouse',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  father_in_law: 'Father-in-law',
  mother_in_law: 'Mother-in-law',
};
const GENDER: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  transgender: 'Transgender',
};
const words = (value: string) =>
  (value.charAt(0).toUpperCase() + value.slice(1)).replace(/[-_]/g, ' ');

/** An amount as rupees in Indian grouping (11948 → ₹11,948); anything else as shown. */
export function rupees(amount: string): string {
  const plain = amount.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return amount;
  const [whole, paise] = plain.split('.');
  const formatted = Number(whole).toLocaleString('en-IN');
  return `₹${formatted}${paise ? `.${paise.padEnd(2, '0')}` : ''}`;
}
const numeric = (amount: string) => Number(amount.replace(/[^\d.]/g, '')) || Infinity;

export const quoteReference = (at: Date): string =>
  `QF-${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`;

/** Who a health quote is for: the cover asked and every insured person. */
export function healthFacts(
  client: ClientInput,
  at: Date,
): Pick<QuoteDocument, 'details' | 'members'> {
  const p = client.preferences;
  return {
    details: [
      ['PIN code', client.pincode],
      ...(p
        ? ([
            ['Cover type', p.coverType === 'floater' ? 'Family floater' : 'Individual'],
            ['Sum insured', rupees(String(p.sumInsuredPaise / PAISE_PER_RUPEE))],
            ['Policy term', `${p.tenureYears} year${p.tenureYears > 1 ? 's' : ''}`],
          ] as [string, string][])
        : []),
      ['Insured persons', String(client.members.length)],
    ],
    members: client.members.map((m) => ({
      person: RELATION[m.relationship] ?? words(m.relationship),
      dateOfBirth: m.dateOfBirth ? ddmmyyyy(m.dateOfBirth) : '—',
      age: String(m.dateOfBirth ? ageOn(m.dateOfBirth, at) : m.age),
      gender: m.gender ? GENDER[m.gender]! : '—',
    })),
  };
}

export function travellerFacts(traveller: Traveller, at: Date): Pick<QuoteDocument, 'details'> {
  return {
    details: [
      ['Date of birth', ddmmyyyy(traveller.dateOfBirth)],
      ['Age', String(ageOn(traveller.dateOfBirth, at))],
      ...(traveller.gender ? ([['Gender', GENDER[traveller.gender]!]] as [string, string][]) : []),
      ['PIN code', traveller.pincode],
    ],
  };
}

export function vehicleFacts(v: Vehicle): Pick<QuoteDocument, 'details'> {
  return {
    details: [
      ...(
        [['Vehicle', [v.make, v.model, v.variant].filter(Boolean).join(' ')]] as [string, string][]
      ).filter(([, value]) => value),
      ['Class', words(v.vehicleClass)],
      ['New or pre-owned', v.condition === 'new' ? 'New' : 'Pre-owned'],
      ['Registered', ddmmyyyy(v.registrationDate)],
      ['Insured declared value', rupees(String(v.idvRupees))],
      ...(v.fuelType ? ([['Fuel', words(v.fuelType)]] as [string, string][]) : []),
    ],
  };
}

const STYLE = `
@page { size: A4; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #1c2433; font-size: 10.5pt; line-height: 1.45; }
.band { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px;
  border-bottom: 3px solid #1f3a68; margin-bottom: 18px; }
.brand { font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; color: #5b6b85; }
h1 { margin: 4px 0 0; font-size: 20pt; font-weight: 650; color: #1f3a68; }
.meta { text-align: right; font-size: 9pt; color: #5b6b85; }
.meta strong { color: #1c2433; font-weight: 600; }
h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .1em; color: #1f3a68; margin: 22px 0 8px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.card { border: 1px solid #d9dfea; border-radius: 6px; padding: 12px 14px; }
.card .label { font-size: 8.5pt; color: #5b6b85; text-transform: uppercase; letter-spacing: .08em; }
.card .value { font-size: 12.5pt; font-weight: 600; margin-top: 2px; }
dl { display: grid; grid-template-columns: 42% 58%; margin: 6px 0 0; row-gap: 4px; }
dt { color: #5b6b85; } dd { margin: 0; font-weight: 500; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; color: #5b6b85;
  font-weight: 600; border-bottom: 1.5px solid #1f3a68; padding: 6px 8px; }
td { padding: 8px; border-bottom: 1px solid #e3e8f0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.plans td { font-size: 11.5pt; }
.plans td.num { font-weight: 650; }
.tag { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 10px; font-size: 8pt;
  font-weight: 600; color: #0b5d3b; background: #dff3e9; vertical-align: 1px; }
.notes { margin: 0; padding-left: 16px; color: #3a465b; font-size: 9pt; }
.notes li { margin: 3px 0; }
footer { margin-top: 26px; padding-top: 8px; border-top: 1px solid #d9dfea; font-size: 8pt; color: #7a879c; }
`;

export function quoteDocumentHtml(doc: QuoteDocument): string {
  const at = doc.issuedAt;
  const issued = `${two(at.getDate())}/${two(at.getMonth() + 1)}/${at.getFullYear()} ${two(at.getHours())}:${two(at.getMinutes())}`;
  const lowest =
    doc.plans.length > 1
      ? doc.plans.reduce((a, b) => (numeric(b.amount) < numeric(a.amount) ? b : a))
      : null;
  const details = doc.details
    .map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`)
    .join('');
  const members = doc.members?.length
    ? `<h2>Insured persons</h2>
<table><thead><tr><th>Person</th><th>Date of birth</th><th class="num">Age</th><th>Gender</th></tr></thead><tbody>
${doc.members.map((m) => `<tr><td>${escape(m.person)}</td><td>${escape(m.dateOfBirth)}</td><td class="num">${escape(m.age)}</td><td>${escape(m.gender)}</td></tr>`).join('\n')}
</tbody></table>`
    : '';
  const plans = doc.plans
    .map(
      (p) =>
        `<tr><td>${escape(p.name)}${p === lowest ? '<span class="tag">Lowest</span>' : ''}</td><td class="num">${escape(rupees(p.amount))}</td></tr>`,
    )
    .join('\n');
  const notes = doc.notes.map((n) => `<li>${escape(n)}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escape(doc.title)} - ${escape(doc.clientName)}</title><style>${STYLE}</style></head><body>
<header class="band"><div><div class="brand">Fiducial · Insurance quote</div><h1>${escape(doc.title)}</h1></div>
<div class="meta">Reference <strong>${escape(doc.reference)}</strong><br>Issued <strong>${escape(issued)}</strong></div></header>
<div class="grid">
<div class="card"><div class="label">Prepared for</div><div class="value">${escape(doc.clientName)}</div><dl>${details}</dl></div>
<div class="card"><div class="label">Insurer</div><div class="value">${escape(doc.insurer)}</div>
<dl><dt>Product</dt><dd>${escape(doc.product)}</dd><dt>Plans quoted</dt><dd>${doc.plans.length}</dd></dl></div>
</div>
${members}
<h2>Premiums</h2>
<table class="plans"><thead><tr><th>Plan</th><th class="num">${escape(doc.amountLabel)}</th></tr></thead><tbody>
${plans}
</tbody></table>
<h2>Notes</h2><ul class="notes">${notes}</ul>
<footer>Premiums as quoted by ${escape(doc.insurer)} on ${escape(issued)}, retrieved with Fiducial Quote Fetcher. A quote is not a policy: cover is subject to the insurer's acceptance, underwriting and terms.</footer>
</body></html>`;
}
