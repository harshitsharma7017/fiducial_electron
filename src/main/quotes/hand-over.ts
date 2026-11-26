// When a run cannot fill everything (request of 20 November 2026): it fills whatever it can, lists
// what it could not, and hands the form over. The advisor fills the rest in the insurer's tab and
// presses the insurer's own button that works the premium out (Calculate Premium, Check
// Premium…); the app then reads the premium and saves the quote as a PDF (service.ts, finish).
// - A step that puts a value in a box (a dropdown, a date, a radio…) and fails is left for the
//   advisor, and the run goes on with the next one.
// - A step that moves the form along (opening a section, pressing a pop-up's Ok) and fails ends the
//   filling: what comes after it depends on it.
// - Once anything is left, the run stops before the steps that work the premium out ("finish"
//   steps): the insurer would only complain about the boxes still empty.
// The run never presses the insurer's button itself after a hand-over.
import type { PortalPage } from '../insurers/portal-host';
import type { PageOp, PageOpResult } from './page-ops';
import type { QuoteRunResult } from './run-uiic-health';
import type { PlanStep } from './uiic-health';

/** What the app needs to finish a handed-over form: where, how to read the premium, and how. */
export interface HandOver {
  /** The page the advisor finishes the form in. */
  page: PortalPage;
  /** Reads the premium once the insurer shows it. */
  read: PageOp;
  /** Whether `read` is the form's own (recorded) reading, or a guess by common captions. */
  known: boolean;
  /** The run's result once `read` has read the premium. */
  compose: (read: PageOpResult) => QuoteRunResult;
}

/** Operations that put a value in a box: one that fails is left for the advisor. */
const FILL_OPS: ReadonlySet<PageOp['op']> = new Set<PageOp['op']>([
  'select',
  'type',
  'typeahead',
  'stepper',
  'matDate',
  'ionPick',
  'ionRadio',
  'addOn',
  'pickOption',
  'pickFromList',
  'waitForValue',
  'radio',
  'setField',
  'check',
  'pickNth',
  'pickDate',
  'matSelect',
  'toggle',
]);
const READ_OPS: ReadonlySet<PageOp['op']> = new Set<PageOp['op']>([
  'readAmount',
  'readPlans',
  'readValue',
  'readTable',
  'ionRadioRead',
  'readCards',
]);
const PRESS_OPS: ReadonlySet<PageOp['op']> = new Set<PageOp['op']>([
  'clickButton',
  'clickSelector',
  'clickText',
  'revealButton',
]);
/** The insurer's buttons that work the premium out, as the plans press them. */
const PREMIUM_BUTTON = /calculate premium|check premium|see premium|view premium/i;

export const isFillOp = (op: PageOp): boolean => FILL_OPS.has(op.op);
export const isReadOp = (op: PageOp): boolean => READ_OPS.has(op.op);

/** The text of the button a press step presses, if it says. */
function buttonText(op: PageOp): string | null {
  if (op.op === 'clickButton' || op.op === 'clickText' || op.op === 'revealButton') return op.text;
  if (op.op === 'clickSelector') return op.text ?? op.pattern?.replace(/[\^$\\]/g, '') ?? null;
  return null;
}

/**
 * Where the plan's finish steps start: the first press of a button that works the premium out,
 * else the premium reading at the end of the plan. The plan's length when it has neither.
 */
export function finishStart(steps: readonly PlanStep[]): number {
  const marked = steps.findIndex((s) => s.finish === true);
  if (marked >= 0) return marked;
  const press = steps.findIndex(
    (s) => PRESS_OPS.has(s.op.op) && PREMIUM_BUTTON.test(buttonText(s.op) ?? s.label),
  );
  if (press >= 0) return press;
  const lastRead = steps.findLastIndex((s) => isReadOp(s.op));
  return lastRead >= 0 && lastRead >= steps.length - 2 ? lastRead : steps.length;
}

/** The plan's premium reading (the last read step of its finish steps), if it has one. */
export function premiumReading(steps: readonly PlanStep[]): PlanStep | null {
  const from = finishStart(steps);
  return steps.slice(from).findLast((s) => isReadOp(s.op)) ?? null;
}

/** The button the advisor presses to work the premium out, as the form names it. */
export function premiumButton(steps: readonly PlanStep[]): string | null {
  const step = steps.slice(finishStart(steps)).find((s) => PRESS_OPS.has(s.op.op));
  if (!step) return null;
  const text = buttonText(step.op) ?? step.label;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A reading for a form whose premium the app was not shown (New India's forms, which the app
 * fills but never calculates): the amount after a caption premiums commonly have. Not a bare
 * "Premium", which could be a heading over a list of sums insured.
 */
export const GUESSED_READING: PageOp = {
  op: 'readAmount',
  label: 'Total Payable Premium',
  alsoLabels: [
    'Total Premium Payable',
    'Total Premium',
    'Final Premium',
    'Premium Payable',
    'Net Premium Payable',
    'Gross Premium',
    'Net Premium',
  ],
  timeoutMs: 2000,
};

/** What a failed fill step leaves for the advisor, in their words. */
export function leftItem(step: PlanStep, detail: string | undefined): string {
  const d = detail ?? '';
  const only = /^only-(\d+)$/.exec(d);
  // What the insurer's list offered instead, when the step says ("option-missing (offered: …)").
  const offered = /\(offered: (.*)\)$/.exec(d)?.[1];
  const why = only
    ? `the form offers only ${only[1]} choices here`
    : d.startsWith('option-missing')
      ? `the insurer's list does not offer the saved value${offered ? `; it offers: ${offered}` : ''}`
      : d.startsWith('no-match')
        ? 'no suggestion matches the saved value'
        : d.startsWith('not-found')
          ? 'the box was not found'
          : d.startsWith('date-disabled')
            ? 'the calendar does not allow that date'
            : d === 'still-disabled' || d === 'disabled'
              ? 'the box was not enabled'
              : d.startsWith('missing')
                ? 'the client record does not have it'
                : d
                  ? `the app could not: ${d}`
                  : 'the app could not fill it';
  return `${step.label}: fill it in yourself (${why}).`;
}

/** Tracks a run's progress through its plan: what is left, and where to stop. */
export class FillProgress {
  readonly left: string[];
  private readonly finishAt: number;

  constructor(
    private readonly steps: readonly PlanStep[],
    /** What the plan already knows it cannot fill (the record lacks it). */
    left: readonly string[] = [],
  ) {
    this.left = [...left];
    this.finishAt = finishStart(steps);
  }

  /** Whether to stop before the `index`-th step: a finish step, with something left. */
  stopBefore(index: number): boolean {
    return index >= this.finishAt && this.left.length > 0;
  }

  /** Whether the `index`-th step is one of the finish steps. */
  isFinish(index: number): boolean {
    return index >= this.finishAt;
  }

  /**
   * A failed step: true if it is left for the advisor and the run goes on. `why` is the run's own
   * words for it (what the insurer offers instead), in place of the general one.
   */
  skip(step: PlanStep, index: number, result: PageOpResult, why?: string): boolean {
    if (this.isFinish(index) || !isFillOp(step.op)) return false;
    const item = why ?? leftItem(step, result.detail);
    if (!this.left.includes(item)) this.left.push(item);
    return true;
  }

  /** The form's premium reading (recorded), or the guess. */
  reading(): { read: PageOp; known: boolean } {
    const step = premiumReading(this.steps);
    return step ? { read: step.op, known: true } : { read: GUESSED_READING, known: false };
  }

  button(): string | null {
    return premiumButton(this.steps);
  }
}

/**
 * The result of a run that handed the form over: what it filled, what is left, and how the app
 * finishes once the advisor has the premium.
 */
export function handedOver(options: {
  insurer: string;
  page: PortalPage;
  progress: FillProgress;
  compose: (read: PageOpResult) => QuoteRunResult;
  /** The step the filling stopped at, and why (a step that moves the form along failed). */
  stopped?: { label: string; why: string };
  /** More for the advisor to do (the plan's own list). */
  toDo?: string[];
  /** What the app did, when every step ran (a form the app never works out itself). */
  done?: string;
  /** The form's premium button, when its plan does not press it (New India's forms). */
  button?: string;
}): QuoteRunResult {
  const { insurer, progress, stopped } = options;
  const button = options.button ?? progress.button();
  const { read, known } = progress.reading();
  return {
    outcome: 'handed-over',
    step: stopped?.label ?? null,
    message: [
      stopped
        ? `The app filled what it could and stopped at "${stopped.label}": ${/[.!?]$/.test(stopped.why) ? stopped.why : `${stopped.why}.`}`
        : progress.left.length === 0 && options.done
          ? options.done
          : 'The app filled what it could.',
      `Finish the form in ${insurer}'s tab (see below), then press ${button ? `"${button}"` : "the insurer's button that works the premium out"} yourself.`,
      "When the premium shows, press Stop & make PDF in the app: it reads the premium on the insurer's page and saves the PDF (or type the premium in the app).",
    ].join(' '),
    problems: [],
    toDo: [...new Set([...progress.left, ...(options.toDo ?? [])])],
    finish: { button, guessed: !known },
    handOver: { page: options.page, read, known, compose: options.compose },
  };
}

/**
 * A run that read the premium, with how to read it again on the same page: kept only when the
 * advisor asked to change the form before its PDF ("let me change it first", the service's
 * `adjust`); otherwise the service saves the PDF as before.
 */
export function readAgain(
  result: QuoteRunResult,
  options: {
    page: PortalPage;
    progress: FillProgress;
    compose: (read: PageOpResult) => QuoteRunResult;
  },
): QuoteRunResult {
  if (result.outcome !== 'ready' || result.handOver) return result;
  const { read, known } = options.progress.reading();
  return { ...result, handOver: { page: options.page, read, known, compose: options.compose } };
}
