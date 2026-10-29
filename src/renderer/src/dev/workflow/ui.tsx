// DEVELOPMENT-ONLY shared pieces for the demo workflow screens: the screen context, badges,
// state panels, the confirmation dialog and the quote-request picker. Presentation only: every
// value shown comes from the workflow state.
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  type Tone,
  describeCoverType,
  describeMembers,
  describeTenure,
  formatAmount,
} from '../demo-model';
import { Icon, type IconName } from '../icons';
import { formatTime } from './clock';
import type { DemoWorkflow } from './engine';
import type { DemoState, QuoteRequestRecord } from './types';

export type PageId =
  'dashboard' | 'census' | 'request' | 'jobs' | 'comparison' | 'report' | 'activity';

export interface NavState {
  page: PageId;
  clientId: string;
  requestId: string | null;
  reportId: string | null;
  /** Pre-selects the employee on the quote request screen. */
  employeeId: string | null;
}

export interface WorkflowContextValue {
  workflow: DemoWorkflow;
  state: DemoState;
  nav: NavState;
  go: (page: PageId, patch?: Partial<Omit<NavState, 'page'>>) => void;
  /** Shows a message in the screen's status region (announced politely). */
  flash: (tone: Tone, text: string) => void;
}

export const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function useWorkflow(): WorkflowContextValue {
  const value = useContext(WorkflowContext);
  if (!value) throw new Error('useWorkflow is used outside WorkflowApp');
  return value;
}

export const TONE_ICON: Record<Tone, IconName> = {
  positive: 'check-circle',
  info: 'info',
  neutral: 'minus-circle',
  warning: 'alert-triangle',
  danger: 'x-circle',
};

export function Badge({ tone, label }: { tone: Tone; label: string }): React.JSX.Element {
  return (
    <span className={`qc-badge tone-${tone}`}>
      <Icon name={TONE_ICON[tone]} size={12} />
      {label}
    </span>
  );
}

/** Marks anything produced by a simulator, wherever it appears. */
export function SimulatedTag({ text = 'DEMO SIMULATOR' }: { text?: string }): React.JSX.Element {
  return <span className="wf-simtag">{text}</span>;
}

export function StatePanel(props: {
  tone: Tone;
  icon: IconName;
  title: string;
  text: ReactNode;
  children?: ReactNode;
}): React.JSX.Element {
  const headingId = useId();
  return (
    <section className={`qc-card qc-state tone-${props.tone}`} aria-labelledby={headingId}>
      <span className="qc-state-icon">
        <Icon name={props.icon} size={22} />
      </span>
      <div className="qc-state-body">
        <h2 id={headingId}>{props.title}</h2>
        <p>{props.text}</p>
        {props.children}
      </div>
    </section>
  );
}

/** A tinted message box. Status is also given by the icon and the text, never colour alone. */
export function Callout(props: {
  tone: Tone;
  title?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={`wf-callout tone-${props.tone}`}>
      <Icon name={TONE_ICON[props.tone]} />
      <div>
        {props.title && <p className="wf-callout-title">{props.title}</p>}
        <div className="wf-callout-body">{props.children}</div>
      </div>
    </div>
  );
}

/** The page heading. It takes focus when the page opens, so screen readers announce it. */
export function PageTitle(props: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="wf-pagehead">
      <div>
        <h1 ref={ref} tabIndex={-1}>
          {props.title}
        </h1>
        {props.description && <p className="wf-pagehead-text">{props.description}</p>}
      </div>
      {props.actions && <div className="wf-actions">{props.actions}</div>}
    </div>
  );
}

/**
 * A modal built on the native dialog element: the page behind it is inert, Escape cancels, and
 * focus moves to the element marked `data-autofocus` on open and back to the trigger on close.
 * The content is rendered only while open, so it starts fresh each time.
 */
export function Modal(props: {
  open: boolean;
  labelledBy: string;
  describedBy?: string;
  wide?: boolean;
  onCancel: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  // Layout effect: open and close before paint, so an empty dialog is never shown.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      className={props.wide ? 'wf-dialog is-wide' : 'wf-dialog'}
      aria-labelledby={props.labelledBy}
      aria-describedby={props.describedBy}
      onCancel={(event) => {
        // Escape: let React state close the dialog so the two never disagree.
        event.preventDefault();
        props.onCancel();
      }}
    >
      {props.open ? props.children : null}
    </dialog>
  );
}

/** A modal confirmation for destructive actions. Cancel has the initial focus. */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const titleId = useId();
  const bodyId = useId();
  return (
    <Modal open={props.open} labelledBy={titleId} describedBy={bodyId} onCancel={props.onCancel}>
      <h2 id={titleId}>{props.title}</h2>
      <div id={bodyId} className="wf-dialog-body">
        {props.children}
      </div>
      <div className="wf-dialog-actions">
        <button
          type="button"
          className="qc-btn qc-btn-secondary"
          onClick={props.onCancel}
          data-autofocus
        >
          Cancel
        </button>
        <button type="button" className="qc-btn wf-btn-danger" onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** The selected quote request, falling back to the most recent one. */
export function selectedRequest(
  state: DemoState,
  requestId: string | null,
): QuoteRequestRecord | undefined {
  return state.quoteRequests.find((r) => r.id === requestId) ?? state.quoteRequests.at(-1);
}

export function describeRequest(request: QuoteRequestRecord): string {
  const r = request.draft.request;
  return [
    describeMembers(r.members),
    describeCoverType(r.coverType),
    `Sum insured ${formatAmount(r.sumInsuredPaise)}`,
    describeTenure(r.tenureYears),
    `Pincode ${r.pincode}`,
  ].join(' · ');
}

export function RequestPicker(props: {
  requests: readonly QuoteRequestRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className="wf-field wf-field-inline">
      <label htmlFor={id}>Quote request</label>
      <select id={id} value={props.selectedId} onChange={(e) => props.onSelect(e.target.value)}>
        {[...props.requests].reverse().map((r) => (
          <option key={r.id} value={r.id}>
            {`${r.id} · employee ${r.employeeId} · ${r.insurerIds.length} simulator${
              r.insurerIds.length === 1 ? '' : 's'
            } · created ${formatTime(r.createdAt)}`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
