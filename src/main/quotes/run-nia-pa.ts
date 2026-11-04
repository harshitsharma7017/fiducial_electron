// Runs a New India Personal Accident plan (nia-pa.ts) in New India's own page, as the other New
// India forms are run (fillNiaForm): from the dashboard, PERSONAL ACCIDENT, then the policy's
// tile. New India's PAN question is left to the advisor. It never presses Save & Calculate.
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import type { NiaPaRun } from '../../shared/insurers/nia-pa';
import { niaPaForm, planNiaPaQuote } from './nia-pa';
import { fillNiaForm } from './run-nia-health';
import type { QuoteRunResult } from './run-uiic-health';

export async function runNiaPaQuote(deps: {
  /** New India's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  client: ClientInput;
  run: NiaPaRun;
  noClaims: boolean;
  noDisabilities: boolean;
}): Promise<QuoteRunResult> {
  const form = niaPaForm(deps.run.form);
  const plan = planNiaPaQuote(deps.client, deps.run, {
    noClaims: deps.noClaims,
    noDisabilities: deps.noDisabilities,
  });
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This client cannot be filled in automatically on New India's ${form.name} form.`,
      problems: plan.problems,
    };
  }
  const button = deps.run.form === 'pension' ? 'Save & Calculate Premium' : 'Save & Calculate';
  return fillNiaForm({
    windows: deps.windows,
    form: { ...form, group: 'PERSONAL ACCIDENT', groupName: 'Personal Accident Products' },
    confirmed: false,
    steps: plan.steps,
    byHand: plan.byHand,
    premiumButton: button,
    ready: `New India ${form.name} form: the insured and nominee are filled. Do what is listed below; the app does not press ${button}.`,
  });
}
