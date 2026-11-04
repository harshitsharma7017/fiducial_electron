// New India: the Marine Specific Voyage quote form (QuoteNonCustomer.html) for a marine client and
// a shipment entered for the run. Built from the recording new-india-2026-11-04T10-22-36-040Z, in
// which the form was opened from the dashboard (Product Selection, MARINE, Specific Voyage), its
// policy holder looked at as an individual and as an organisation, and its sections Transit
// Details, Vessel Details and Cargo Details opened. Nothing was typed and no premium was worked
// out, so dates are typed as dd/mm/yyyy and the run stops before Save & Calculate Premium.
//   Policy Holder Information: New Customer, then Individual (as on the travel forms) or
//     Organization (business name, registration, MSME, type, address, contact, PAN).
//   Transit Details: type of voyage, start date, transit type, mode of transport, from and to
//     country (boxes that may suggest as you type: missed ones are listed), ports, bill, mark,
//     whether the certificate shows the premium.
//   Cargo Details: cargo type (its packaging and the basis of valuation then follow from New
//     India's lists: left to the advisor), sum insured, rate, % extra, invoice, excess, the
//     Inland Transit Clause (A, B or C).
import type { MarineClient } from '../../shared/contracts/marine';
import {
  NIA_BILL_TYPES,
  NIA_CARGO_TYPES,
  NIA_EXCESS_ON,
  NIA_TRANSIT_TYPES,
  NIA_TRANSPORT_MODES,
  NIA_VOYAGE_TYPES,
  type NiaShipment,
} from '../../shared/insurers/nia-marine';
import type { NiaHealthStep } from './nia-health';
import type { PageOp } from './page-ops';
import { policyHolderSteps } from './nia-travel';
import { iso } from './uiic-travel-proposal';

export const NIA_MARINE_FORM = {
  name: 'Specific Voyage',
  heading: 'Specific Voyage Insurance',
  tiles: ['Specific Voyage', 'Specific Voyage Insurance'],
};

export type NiaMarinePlan =
  { ok: true; steps: NiaHealthStep[]; byHand: string[] } | { ok: false; problems: string[] };

export function planNiaMarineQuote(
  holder: MarineClient,
  shipment: NiaShipment,
  options: { today: Date },
): NiaMarinePlan {
  const problems: string[] = [];
  if (shipment.startDate < iso(options.today)) problems.push('The policy start date has passed.');
  if (problems.length > 0) return { ok: false, problems };

  const steps: NiaHealthStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, more: Partial<NiaHealthStep> = {}) =>
    steps.push({ label, op, ...more });
  const field = (label: string, selector: string, value: string, optional = false) =>
    add(
      label,
      { op: 'setField', selector, value },
      optional ? { optional: true, ifMissed: label.toLowerCase() } : {},
    );
  const section = (link: string, selector: string) =>
    add(link, { op: 'ensureShown', shown: { selector }, open: { link }, timeoutMs: 8000 });

  // Policy Holder Information.
  if (holder.kind === 'individual') {
    policyHolderSteps(
      {
        name: holder.customer.name,
        gender: holder.gender,
        maritalStatus: holder.maritalStatus,
        dateOfBirth: holder.dateOfBirth,
        address: holder.address,
        phone: holder.customer.phone,
        email: holder.customer.email,
      },
      steps,
      byHand,
    );
  } else {
    section('Policy Holder Information', '#policyHolder1');
    add(
      'New customer',
      { op: 'check', selector: '#policyHolder1', checked: true },
      { optional: true, ifMissed: 'policy holder: New or Existing Customer' },
    );
    add('Category: Organization', { op: 'check', selector: '#Organization', checked: true });
    field('Business name', '#businessNameNewOrg', holder.customer.name);
    if (holder.registrationNo) field('Registration no.', '#registrationNo', holder.registrationNo);
    if (holder.msme !== undefined) field('MSME', '#isMSME', holder.msme ? 'Yes' : 'No');
    else byHand.push('whether the business is under the MSME category');
    if (holder.registrationDate) {
      add('Registration date', {
        op: 'typeDate',
        input: '#regDate',
        date: holder.registrationDate,
      });
    } else byHand.push('registration date');
    if (holder.organisationType) {
      field('Type of organisation', '#typeOfOrg', holder.organisationType, true);
    }
    if (holder.address) field('Business address 1', '#businessAddress1', holder.address);
    else byHand.push('business address');
    byHand.push('state, city and PIN code', 'GST registration type and GSTIN');
    if (holder.customer.phone) field('Mobile no.', '#mobileBus', holder.customer.phone);
    if (holder.customer.email) field('Email ID', '#emailBus', holder.customer.email);
    if (holder.pan) field('PAN no.', 'input[name="panNumber"]:not([disabled])', holder.pan, true);
  }

  // Transit Details.
  section('Transit Details', '#typeOfSV');
  field('Type of SV', '#typeOfSV', NIA_VOYAGE_TYPES[shipment.voyageType]);
  add('Type of SV', { op: 'pause', ms: 800 });
  add('Policy start date', { op: 'typeDate', input: '#fromDate', date: shipment.startDate });
  // The lists may follow the type of voyage: what New India does not offer is left to the advisor.
  field('Transit type', '#TransitType', NIA_TRANSIT_TYPES[shipment.transitType], true);
  field('Mode of transport', '#ModeOfTransport', NIA_TRANSPORT_MODES[shipment.mode], true);
  for (const [label, selector, value] of [
    ['From country', '#fromCountry', shipment.fromCountry],
    ['To country', '#ToCountry', shipment.toCountry],
  ] as const) {
    add(
      label,
      { op: 'typeahead', selector, value, timeoutMs: 5000 },
      { optional: true, ifMissed: `${label.toLowerCase()} (and its city)` },
    );
  }
  byHand.push('from city and to city');
  field('Port of loading', '#portOfLoading', shipment.portOfLoading);
  field('Port of discharge', '#portOfDischarge', shipment.portOfDischarge);
  field('Type of bill', '#Billtype', NIA_BILL_TYPES[shipment.billType]);
  if (shipment.billNumber) field('Bill no.', '#BillNumber', shipment.billNumber);
  if (shipment.billDate) {
    add('Bill date', { op: 'typeDate', input: '#BillDate', date: shipment.billDate });
  }
  if (shipment.markNo) field('Mark no.', '#Markno', shipment.markNo);
  field(
    'Show the premium in the certificate',
    '#showPremiumAmount',
    shipment.showPremium ? 'Yes' : 'No',
  );
  if (shipment.mode === 'vessel') byHand.push('Vessel Details');

  // Cargo Details.
  section('Cargo Details', '#CargoType');
  field('Cargo type', '#CargoType', NIA_CARGO_TYPES[shipment.cargoType]);
  // New India lists the packaging for the cargo type.
  add('Cargo type', { op: 'pause', ms: 1000 });
  byHand.push('packaging (New India lists it for the cargo type)', 'basis of valuation');
  field('Cargo sum insured', '#CargoSumInsured', String(shipment.sumInsuredRupees));
  field('Cargo rate (%)', '#CargoRatept', shipment.ratePercent);
  field('% extra', '#ExtraPt', shipment.extraPercent);
  field('Invoice number', '#invoiceNumber', shipment.invoiceNumber);
  if (shipment.invoiceDate) {
    add('Invoice date', { op: 'typeDate', input: '#Invoicedate', date: shipment.invoiceDate });
  }
  field('Excess applicable on', '#ExcessApplicableOn', NIA_EXCESS_ON[shipment.excessOn]);
  field('Excess (%)', '#Excess', shipment.excessPercent);
  field('Minimum excess amount', '#minimumExcessAmount', String(shipment.minimumExcessRupees));
  add(
    `Inland Transit Clause-${shipment.clause}`,
    { op: 'check', selector: `#coverageDet${'ABC'.indexOf(shipment.clause)}`, checked: true },
    { optional: true, ifMissed: `Inland Transit Clause-${shipment.clause}` },
  );
  return { ok: true, steps, byHand };
}
