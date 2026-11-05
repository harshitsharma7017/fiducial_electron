// Runs a New India fire plan (nia-fire.ts) in New India's own page, as the other New India forms
// are run (fillNiaForm): from the dashboard, FIRE, then the policy's tile. New India's PAN
// question is left to the advisor. It never presses Save & Calculate Premium.
import type { PortalPage } from '../insurers/portal-host';
import type { PropertyClient } from '../../shared/contracts/property';
import type { NiaFireRun } from '../../shared/insurers/nia-fire';
import { niaFireForm, planNiaFireQuote } from './nia-fire';
import { fillNiaForm } from './run-nia-health';
import type { QuoteRunResult } from './run-uiic-health';

export async function runNiaFireQuote(deps: {
  /** New India's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  client: PropertyClient;
  run: NiaFireRun;
  today: Date;
}): Promise<QuoteRunResult> {
  const form = niaFireForm(deps.run.form);
  const plan = planNiaFireQuote(deps.client, deps.run, { today: deps.today });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This property cannot be filled in automatically on New India's ${form.name} form.`,
      problems: plan.problems,
    };
  }
  return fillNiaForm({
    windows: deps.windows,
    form: { ...form, group: 'FIRE', groupName: 'Fire Products' },
    confirmed: false,
    steps: plan.steps,
    byHand: plan.byHand,
    ready: `New India ${form.name} form: the owner and property are filled. Do what is listed below; the app does not press Save & Calculate Premium.`,
  });
}
