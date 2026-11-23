// ICICI Lombard health premium by API ("Elevate Fresh API Kit V3": POST
// health-fresh/elevate/generic/premium), for Elevate (ProductCode 18) and Activate Booster, the
// super top-up (ProductCode 19, with its deductible). Builds the request from a saved health
// client and the run's choices, and turns ICICI's answer into the run's result: the total premium
// (including tax), the zone, and the breakdown for the PDF. Never calls the proposal or payment
// endpoints.
import { ageOn, type ClientInput, type ClientMember } from '../../shared/contracts/client';
import {
  ICICI_HEALTH_NAMES,
  ICICI_HEALTH_PRODUCT_CODE,
  type IciciApiHealthRun,
} from '../../shared/insurers/icici-api';
import type { QuoteRunResult } from '../quotes/run-uiic-health';
import { requestId, type IciciApiClient } from './client';

const PATH = '/health-fresh/elevate/generic/premium';

/** The kit's relationship master (Relationship sheet), for the app's relationships. */
const RELATIONSHIP: Record<ClientMember['relationship'], string> = {
  self: 'SELF',
  spouse: 'SPOUSE',
  son: 'SON',
  daughter: 'DAUGHTER',
  father: 'FATHER',
  mother: 'MOTHER',
  father_in_law: 'FATHER IN LAW',
  mother_in_law: 'MOTHER IN LAW',
};
const WHO: Record<ClientMember['relationship'], string> = {
  self: 'proposer',
  spouse: 'spouse',
  son: 'son',
  daughter: 'daughter',
  father: 'father',
  mother: 'mother',
  father_in_law: 'father-in-law',
  mother_in_law: 'mother-in-law',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "30-Aug-1989", as the kit writes dates of birth. */
export function iciciDob(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}
/** The kit's name rule (Regex Master): letters, spaces and . & / - only. */
const cleanName = (name: string): string =>
  name
    .replace(/[^A-Za-z .&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export type IciciHealthPlan =
  { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] };

export function planIciciHealthPremium(
  client: ClientInput,
  run: IciciApiHealthRun,
  options: { today: Date; imidCode?: string },
): IciciHealthPlan {
  const problems: string[] = [];
  if (client.members.length === 0) problems.push('Add the members to insure.');
  if (!client.members.some((m) => m.relationship === 'self')) {
    problems.push('ICICI Lombard asks for the proposer (a member who is "Self").');
  }
  const counts = new Map<string, number>();
  const name = cleanName(client.customer.name) || 'Proposer';
  const insured = client.members.map((m) => {
    const who = WHO[m.relationship];
    if (!m.dateOfBirth) problems.push(`Add the ${who}'s date of birth.`);
    if (!m.gender) problems.push(`Add the ${who}'s gender.`);
    else if (m.gender === 'transgender') {
      problems.push(`ICICI Lombard's health API takes Male or Female only (the ${who}).`);
    }
    // ICICI asks each insured person's name; the app keeps the client's name only, so the others
    // are named by their relationship (the premium does not depend on it).
    const n = (counts.get(m.relationship) ?? 0) + 1;
    counts.set(m.relationship, n);
    const own =
      m.relationship === 'self'
        ? name
        : `${who.charAt(0).toUpperCase()}${who.slice(1)}${n > 1 ? ` ${'ABCDEFGH'[n - 1]}` : ''} ${name.split(' ').at(-1) ?? ''}`.trim();
    const age = m.dateOfBirth ? ageOn(m.dateOfBirth, options.today) : m.age;
    return {
      InsuredType: age >= 18 ? 'Adult' : 'Kid',
      Name: cleanName(own),
      DateOfBirth: m.dateOfBirth ? iciciDob(m.dateOfBirth) : '',
      Gender: m.gender === 'female' ? 'Female' : 'Male',
      IsPED: run.preExistingDisease,
      RelationshipWithApplicant: RELATIONSHIP[m.relationship],
      AddOns: [],
    };
  });
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    body: {
      RequestId: requestId(),
      ProductCode: ICICI_HEALTH_PRODUCT_CODE[run.product],
      SumInsured: run.sumInsured,
      Tenure: run.tenure,
      Insured: insured,
      PinCode: client.pincode,
      PaymentOption: { annual: 0, monthly: 1, quarterly: 3 }[run.paymentOption],
      // Activate Booster on its own (not with an ICICI base policy): its deductible is the base
      // cover it tops up.
      ...(run.product === 'activate-booster'
        ? { VoluntaryDeductible: run.deductible, IsCombo: false }
        : {}),
      ...(options.imidCode ? { ImidCode: options.imidCode } : {}),
    },
  };
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

export async function runIciciHealthPremium(deps: {
  api: IciciApiClient;
  client: ClientInput;
  run: IciciApiHealthRun;
  today: Date;
  imidCode?: string;
}): Promise<QuoteRunResult> {
  const product = ICICI_HEALTH_NAMES[deps.run.product];
  const plan = planIciciHealthPremium(deps.client, deps.run, {
    today: deps.today,
    ...(deps.imidCode ? { imidCode: deps.imidCode } : {}),
  });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This client cannot be quoted for ICICI Lombard ${product} yet.`,
      problems: plan.problems,
    };
  }
  const answer = await deps.api.post(PATH, plan.body);
  const total = num(answer.TotalPremium);
  if (answer.Success === false || total === null || total <= 0) {
    const said =
      (typeof answer.ErrorMessage === 'string' && answer.ErrorMessage) ||
      'no premium in its answer';
    return {
      outcome: 'failed',
      step: 'ICICI Lombard premium',
      message: `ICICI Lombard did not quote ${product}: ${said}`,
      problems: [],
    };
  }
  const premium = answer.Premium as
    { Loading?: { CoverName?: string; CoverPremium?: number }[]; Discount?: unknown[] } | undefined;
  const cover = rupees(deps.run.sumInsured);
  const label = `ICICI Lombard ${product}, ${cover}${deps.run.product === 'activate-booster' && deps.run.deductible ? ` over ${rupees(deps.run.deductible)} deductible` : ''}, ${deps.run.tenure} year${deps.run.tenure > 1 ? 's' : ''}`;
  const zone = typeof answer.ZoneName === 'string' ? answer.ZoneName : null;
  const basic = num(answer.BasicPremium);
  const tax = num(answer.TotalTax);
  return {
    outcome: 'ready',
    step: null,
    message: `ICICI Lombard (${deps.api.mode === 'uat' ? 'UAT' : 'production'}) quoted ${rupees(total)} including tax for ${product}, ${cover}${zone ? ` (${zone})` : ''}.`,
    problems: [],
    premium: { label, amount: String(Math.round(total * 100) / 100) },
    amountLabel: 'Premium (including GST)',
    breakdown: [
      ...(zone ? [{ label: 'Zone', value: zone }] : []),
      ...(basic !== null ? [{ label: 'Premium before tax', value: rupees(basic) }] : []),
      ...(tax !== null ? [{ label: 'Tax', value: rupees(tax) }] : []),
      ...(premium?.Loading ?? [])
        .filter((l) => l.CoverName && num(l.CoverPremium))
        .map((l) => ({ label: `Add-on ${l.CoverName}`, value: rupees(num(l.CoverPremium)!) })),
      {
        label: 'Pre-existing disease declared',
        value: deps.run.preExistingDisease ? 'Yes' : 'No',
      },
      ...(deps.api.mode === 'uat'
        ? [{ label: 'Environment', value: 'ICICI UAT (test) — not a live premium' }]
        : []),
    ],
  };
}
