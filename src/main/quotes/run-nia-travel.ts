// Runs a New India travel quote plan (nia-travel.ts) in New India's own page, as the health forms
// are run (fillNiaForm): from the dashboard, TRAVEL, then the form's tile. New India's question
// about pre-existing illness or an accident is answered No only with the advisor's confirmation.
// It never presses Save & Calculate Premium or Calculate Premium.
import type { PortalPage } from '../insurers/portal-host';
import type { Traveller } from '../../shared/contracts/traveller';
import type { NiaTrip } from '../../shared/insurers/nia-travel';
import { niaTravelForm, planNiaTravelQuote } from './nia-travel';
import { fillNiaForm } from './run-nia-health';
import type { QuoteRunResult } from './run-uiic-health';

export async function runNiaTravelQuote(deps: {
  /** New India's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  traveller: Traveller;
  trip: NiaTrip;
  passportNumber: string | null;
  /** The advisor confirms no pre-existing illness, disease or disability, and no past accident. */
  noPreExisting: boolean;
  today: Date;
}): Promise<QuoteRunResult> {
  const form = niaTravelForm(deps.trip.form);
  if (!deps.noPreExisting) {
    return {
      outcome: 'refused',
      step: null,
      message: `This traveller cannot be filled in automatically on New India's ${form.name} form.`,
      problems: [
        'New India asks first whether the traveller has a pre-existing illness, disease or disability, or has had an accident; it does not take such travellers online. Confirm it for this quote, or answer it by hand.',
      ],
    };
  }
  const plan = planNiaTravelQuote(deps.traveller, deps.trip, {
    passportNumber: deps.passportNumber,
    today: deps.today,
  });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This trip cannot be filled in automatically on New India's ${form.name} form.`,
      problems: plan.problems,
    };
  }
  return fillNiaForm({
    windows: deps.windows,
    form: { ...form, group: 'TRAVEL', groupName: 'Travel Products' },
    confirmed: deps.noPreExisting,
    steps: plan.steps,
    byHand: plan.byHand,
    premiumButton:
      deps.trip.form === 'business-holiday' ? 'Calculate Premium' : 'Save & Calculate Premium',
    ready: (kept) =>
      `New India ${form.name} form: the trip${deps.trip.form === 'business-holiday' ? '' : ' and traveller'} are filled${kept.plan ? ` (plan ${kept.plan})` : ''}. Do what is listed below; the app does not press ${deps.trip.form === 'business-holiday' ? 'Calculate Premium' : 'Save & Calculate Premium'}.`,
  });
}
