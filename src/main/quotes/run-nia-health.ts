// Runs a New India health quote plan (nia-health.ts) in New India's own page. If the policy's
// quote form is not open yet, it opens it from the dashboard: HEALTH, then the policy's tile (as
// recorded). New India may ask on the dashboard, before it opens the form, whether anyone to be
// insured has a listed condition (recorded for Premier Mediclaim): with the advisor's good health
// confirmation it answers No and continues; otherwise it stops. After every step it looks for a New
// India pop-up and stops with its text. It never presses Save & Calculate Premium or Continue.
import type { PortalPage } from '../insurers/portal-host';
import type { ClientInput } from '../../shared/contracts/client';
import type { NiaHealthPolicy } from '../../shared/insurers/nia-health';
import { niaHealthForm, planNiaHealthQuote } from './nia-health';
import { FORM_PATH, openNiaForm, pathOf } from './run-nia-motor';
import { exec, type QuoteRunResult } from './run-uiic-health';

const ASKED_ON_OPEN = 'Has any person to be insured been suffering';
const LAST_STEP = 'Press Save & Calculate Premium yourself, and check the premium New India shows.';

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
  return `Stopped at "${label}" (${detail ?? 'unknown'}). The form may have changed; fill the rest by hand.`;
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
  const pages = () => deps.windows().filter((w) => !w.isDestroyed());
  const formPage = () => pages().find((w) => pathOf(w.webContents.getURL()) === FORM_PATH);

  let page = formPage();
  // A form already open for another product is not used.
  if (
    page &&
    !(await exec(page.webContents, { op: 'hasHeading', text: form.heading, timeoutMs: 3000 })).ok
  ) {
    page = undefined;
  }
  if (!page) {
    const opened = await openNiaForm(
      pages,
      { ...form, group: 'HEALTH', groupName: 'Health Products' },
      async (dashboard, text) => {
        const wc = dashboard.webContents;
        if (!text.includes(ASKED_ON_OPEN)) {
          return {
            outcome: 'failed',
            step: 'Open the quote form',
            message: `New India says: ${text}`,
            problems: [],
          };
        }
        if (!deps.goodHealth) {
          return {
            outcome: 'refused',
            step: 'Open the quote form',
            message:
              'New India asks whether anyone to be insured has a listed condition before it opens this form. Confirm good health for this quote, or answer it by hand.',
            problems: [],
          };
        }
        const no = await exec(wc, { op: 'check', selector: '#healthConfirm2', checked: true });
        const go = no.ok
          ? await exec(wc, {
              op: 'clickButton',
              text: 'Continue',
              within: ASKED_ON_OPEN,
              timeoutMs: 5000,
            })
          : no;
        return go.ok
          ? null
          : {
              outcome: 'failed',
              step: 'Open the quote form',
              message: `New India's health question could not be answered (${go.detail}). Answer it by hand, then try again.`,
              problems: [],
            };
      },
    );
    if ('message' in opened) return opened;
    page = opened.page;
  }
  const wc = page.webContents;
  const before = await exec(wc, { op: 'popup' });
  if (before.errors) {
    page.focus();
    return {
      outcome: 'refused',
      step: null,
      message: `Close New India's message first, then try again. It says: ${before.errors}`,
      problems: [],
    };
  }

  const missed: string[] = [];
  for (const step of plan.steps) {
    const result = await exec(wc, step.op);
    if (!step.dialogOk) {
      const popup = await exec(wc, { op: 'popup' });
      if (popup.errors) {
        page.focus();
        return {
          outcome: 'failed',
          step: step.label,
          message: `New India says: ${popup.errors}`,
          problems: [],
          toDo: [...missed, ...plan.byHand, LAST_STEP],
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
        toDo: [...missed, ...plan.byHand, LAST_STEP],
      };
    }
  }
  page.focus();
  return {
    outcome: 'ready',
    step: null,
    message: `New India ${form.name} form: the client's members are filled. Do what is listed below; the app does not press Save & Calculate Premium.`,
    problems: [],
    toDo: [...missed, ...plan.byHand, LAST_STEP],
  };
}
