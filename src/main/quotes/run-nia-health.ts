// Runs a New India health quote plan (nia-health.ts) in New India's own page, and holds what the
// New India health and travel runs share (fillNiaForm). If the quote form is not open yet, the run
// opens it from the dashboard: the group (HEALTH, TRAVEL), then the product's tile (as recorded).
// New India may ask on the dashboard, before it opens the form, whether anyone to be insured has a
// listed condition (recorded for Premier Mediclaim and the travel products): with the advisor's
// confirmation it answers No and continues; otherwise it stops. After every step it looks for a
// New India pop-up and stops with its text; New India's PAN question (travel forms) is left to the
// advisor, who answers it and runs again in the open form. It never presses Save & Calculate
// Premium, Calculate Premium, Save & Continue or Continue.
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import type { NiaHealthPolicy } from '../../shared/insurers/nia-health';
import { niaHealthForm, planNiaHealthQuote, type NiaHealthStep } from './nia-health';
import { FORM_PATH, openNiaForm, pathOf, type NiaFormToOpen } from './run-nia-motor';
import { exec, type QuoteRunResult } from './run-uiic-health';

/** The question New India asks on the dashboard before it opens some forms (text it starts with). */
const ASKED_ON_OPEN = [
  'Has any person to be insured been suffering', // health (Premier Mediclaim)
  'Has any person suffering from pre-existing illness', // travel
];
const PAN_QUESTION = 'Do you have PAN Number';

/** What a step's failure means, in the advisor's words. */
function explain(label: string, detail: string | undefined): string {
  if (detail === 'option-missing') {
    return `New India does not offer this value at "${label}". Choose it by hand, then fill the rest.`;
  }
  if (detail === 'read-only') {
    return `New India's "${label}" box takes a date from its calendar only. Pick it there, then fill the rest by hand.`;
  }
  if (detail === 'opener-not-found') {
    return `New India's form shows no "${label.replace(/: add$/, '')}" button or section here. The form may have changed; fill the rest by hand.`;
  }
  if (detail?.startsWith('only-')) {
    return `New India offers ${detail.slice(5)} plans here for this trip: pick a lower place, or choose the plan by hand.`;
  }
  return `Stopped at "${label}" (${detail ?? 'unknown'}). The form may have changed; fill the rest by hand.`;
}

/** A New India pop-up on the form, in the advisor's words. */
function popupMessage(text: string): string {
  return text.includes(PAN_QUESTION)
    ? "New India asks whether the client has a PAN (with the client's consent for KYC). Answer it on New India's page, then press Fill again: the app carries on in the open form."
    : `New India says: ${text}`;
}

/**
 * Opens the form (unless it is open), then performs the steps, stopping at the first that fails
 * (an optional one is listed for the advisor instead) or at any New India pop-up.
 */
export async function fillNiaForm(deps: {
  windows: () => PortalPage[];
  form: NiaFormToOpen;
  /** The advisor's confirmation for New India's question before it opens the form. */
  confirmed: boolean;
  steps: NiaHealthStep[];
  byHand: string[];
  /** The message when everything is filled, given the values steps kept (a plan's name). */
  ready: string | ((kept: Record<string, string>) => string);
  /** The form's premium button, for the last line of the advisor's list. */
  premiumButton?: string;
}): Promise<QuoteRunResult> {
  const { form } = deps;
  const pages = () => deps.windows().filter((w) => !w.isDestroyed());
  const formPage = () => pages().find((w) => pathOf(w.webContents.getURL()) === FORM_PATH);

  let page = formPage();
  // A form already open for another product is not used.
  if (
    page &&
    !(
      await exec(
        page.webContents,
        form.heading !== null
          ? { op: 'hasHeading', text: form.heading, timeoutMs: 3000 }
          : { op: 'hasText', text: form.marker ?? '', timeoutMs: 3000 },
      )
    ).ok
  ) {
    page = undefined;
  }
  if (!page) {
    const opened = await openNiaForm(pages, form, async (dashboard, text) => {
      const wc = dashboard.webContents;
      const question = ASKED_ON_OPEN.find((q) => text.includes(q));
      if (!question) {
        return {
          outcome: 'failed',
          step: 'Open the quote form',
          message: `New India says: ${text}`,
          problems: [],
        };
      }
      if (!deps.confirmed) {
        return {
          outcome: 'refused',
          step: 'Open the quote form',
          message:
            'New India asks a health question before it opens this form. Confirm it for this quote, or answer it by hand.',
          problems: [],
        };
      }
      const no = await exec(wc, { op: 'check', selector: '#healthConfirm2', checked: true });
      const go = no.ok
        ? await exec(wc, { op: 'clickButton', text: 'Continue', within: question, timeoutMs: 5000 })
        : no;
      return go.ok
        ? null
        : {
            outcome: 'failed',
            step: 'Open the quote form',
            message: `New India's health question could not be answered (${go.detail}). Answer it by hand, then try again.`,
            problems: [],
          };
    });
    if ('message' in opened) return opened;
    page = opened.page;
    // New India may ask its PAN question a moment after the form shows.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  const wc = page.webContents;
  const before = await exec(wc, { op: 'popup' });
  if (before.errors) {
    page.focus();
    return {
      outcome: 'refused',
      step: null,
      message: before.errors.includes(PAN_QUESTION)
        ? popupMessage(before.errors)
        : `Close New India's message first, then try again. It says: ${before.errors}`,
      problems: [],
    };
  }

  const missed: string[] = [];
  const kept: Record<string, string> = {};
  const last = `Press ${deps.premiumButton ?? 'Save & Calculate Premium'} yourself, and check the premium New India shows.`;
  const toDo = () => [...missed, ...deps.byHand, last];
  for (const step of deps.steps) {
    const result = await exec(wc, step.op);
    if (result.ok && step.keep && result.value) kept[step.keep] = result.value;
    if (!step.dialogOk) {
      const popup = await exec(wc, { op: 'popup' });
      if (popup.errors) {
        page.focus();
        return {
          outcome: 'failed',
          step: step.label,
          message: popupMessage(popup.errors),
          problems: [],
          toDo: toDo(),
        };
      }
    }
    if (!result.ok) {
      if (step.optional) {
        if (step.ifMissed && !missed.includes(step.ifMissed)) missed.push(step.ifMissed);
        continue;
      }
      page.focus();
      return {
        outcome: 'failed',
        step: step.label,
        message: explain(step.label, result.detail),
        problems: [],
        toDo: toDo(),
      };
    }
  }
  page.focus();
  const message = typeof deps.ready === 'string' ? deps.ready : deps.ready(kept);
  return { outcome: 'ready', step: null, message, problems: [], toDo: toDo() };
}

export async function runNiaHealthQuote(deps: {
  /** New India's pages (tabs): its portal first. */
  windows: () => PortalPage[];
  client: ClientInput;
  policy: NiaHealthPolicy;
  goodHealth: boolean;
  today: Date;
}): Promise<QuoteRunResult> {
  const plan = planNiaHealthQuote(deps.client, {
    policy: deps.policy,
    goodHealth: deps.goodHealth,
    today: deps.today,
  });
  const form = niaHealthForm(deps.policy);
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: `This client cannot be filled in automatically on New India's ${form.name} form.`,
      problems: plan.problems,
    };
  }
  return fillNiaForm({
    windows: deps.windows,
    form: { ...form, group: 'HEALTH', groupName: 'Health Products' },
    confirmed: deps.goodHealth,
    steps: plan.steps,
    byHand: plan.byHand,
    ready: `New India ${form.name} form: the client's members are filled. Do what is listed below; the app does not press Save & Calculate Premium.`,
  });
}
