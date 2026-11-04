// Runs a New India rural quote plan (nia-rural.ts) in New India's own page, as the health and
// travel forms are run (fillNiaForm): from the dashboard, RURAL, then the form's tile; the two
// forms whose tile was not recorded are opened by the advisor and known by their own button. New
// India's PAN question is left to the advisor. It never presses Save & Calculate Premium.
import type { PortalPage } from '../insurers/portal-host';
import type { RuralClient } from '../../shared/contracts/rural';
import type { NiaRuralRun } from '../../shared/insurers/nia-rural';
import { niaRuralForm, planNiaRuralQuote } from './nia-rural';
import { fillNiaForm } from './run-nia-health';
import type { QuoteRunResult } from './run-uiic-health';

export async function runNiaRuralQuote(deps: {
  /** New India's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  rural: RuralClient;
  run: NiaRuralRun;
  today: Date;
}): Promise<QuoteRunResult> {
  const form = niaRuralForm(deps.run.form);
  const plan = planNiaRuralQuote(deps.rural, deps.run, { today: deps.today });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This rural client cannot be filled in automatically on New India's ${form.name} form.`,
      problems: plan.problems,
    };
  }
  return fillNiaForm({
    windows: deps.windows,
    form: { ...form, group: 'RURAL', groupName: 'Rural Products' },
    confirmed: false,
    steps: plan.steps,
    byHand: plan.byHand,
    ready: `New India ${form.name} form: the rural client's details are filled. Do what is listed below; the app does not press Save & Calculate Premium.`,
  });
}
