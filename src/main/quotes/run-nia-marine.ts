// Runs the New India Marine Specific Voyage plan (nia-marine.ts) in New India's own page, as the
// other New India forms are run (fillNiaForm): from the dashboard, MARINE, then Specific Voyage.
// It never presses Save & Calculate Premium.
import type { PortalPage } from '../insurers/portal-host';
import type { MarineClient } from '../../shared/contracts/marine';
import type { NiaShipment } from '../../shared/insurers/nia-marine';
import { NIA_MARINE_FORM, planNiaMarineQuote } from './nia-marine';
import { fillNiaForm } from './run-nia-health';
import type { QuoteRunResult } from './run-uiic-health';

export async function runNiaMarineQuote(deps: {
  /** New India's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  holder: MarineClient;
  shipment: NiaShipment;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planNiaMarineQuote(deps.holder, deps.shipment, { today: deps.today });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message:
        "This shipment cannot be filled in automatically on New India's Specific Voyage form.",
      problems: plan.problems,
    };
  }
  return fillNiaForm({
    windows: deps.windows,
    form: { ...NIA_MARINE_FORM, group: 'MARINE', groupName: 'Marine Products' },
    confirmed: false,
    steps: plan.steps,
    byHand: plan.byHand,
    ready:
      'New India Specific Voyage form: the policy holder and shipment are filled. Do what is listed below; the app does not press Save & Calculate Premium.',
  });
}
