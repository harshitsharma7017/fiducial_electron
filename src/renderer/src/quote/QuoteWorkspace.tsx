// The quote workspace: a drawer for one client (or vehicle), where the advisor chooses the
// insurer and product, then fills the run's details and starts it. The product panels are the
// screens' own (their fields, checks and automation calls are unchanged); this only hosts them.
import { MousePointerClick } from 'lucide-react';
import type { ReactNode } from 'react';
import { InsurerAvatar } from '../insurers/branding';
import { Modal } from '../ui/Modal';

export interface QuoteOption {
  key: string;
  insurer: string;
  label: string;
  description: string;
  /** Why it cannot be used for this client (shown, and the option is disabled). */
  unavailable?: string;
}

export function QuoteWorkspace(props: {
  open: boolean;
  /** The client or vehicle the quote is for. */
  subject: string;
  options: QuoteOption[];
  selected: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
  /** The chosen product's panel. */
  children: ReactNode;
}): React.JSX.Element {
  const { options, selected } = props;
  const single = options.length === 1;
  const chosen = options.find((o) => o.key === selected) ?? null;
  const insurers = [...new Set(options.map((o) => o.insurer))];
  const steps = single
    ? ['Fill the details', 'Run in the insurer portal']
    : ['Choose product', 'Fill the details', 'Run in the insurer portal'];
  const current = single || chosen ? steps.length - 2 : 0;

  return (
    <Modal
      open={props.open}
      variant="drawer"
      size={single ? 'default' : 'wide'}
      title={chosen ? `${chosen.insurer} · ${chosen.label}` : 'New quote'}
      subtitle={`For ${props.subject}`}
      onClose={props.onClose}
    >
      <ol className="qw-steps" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} data-state={i < current ? 'done' : i === current ? 'current' : 'next'}>
            <span className="qw-step-num">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {!single && (
        <div className="qw-groups">
          {insurers.map((insurer) => (
            <section key={insurer} aria-label={insurer}>
              <div className="qw-group-head">
                <InsurerAvatar name={insurer} />
                {insurer}
              </div>
              <div className="qw-options">
                {options
                  .filter((o) => o.insurer === insurer)
                  .map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className="qw-option"
                      aria-pressed={o.key === selected}
                      disabled={!!o.unavailable}
                      title={o.unavailable}
                      onClick={() => props.onSelect(o.key)}
                    >
                      <strong>{o.label}</strong>
                      <span>{o.unavailable ?? o.description}</span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {chosen ? (
        <div className={single ? undefined : 'qw-panel'}>
          {!single && <p className="qw-section-title">Details</p>}
          {props.children}
        </div>
      ) : (
        <p className="qw-empty">
          <MousePointerClick size={18} aria-hidden="true" />
          Choose an insurer&rsquo;s product above. The app fills the insurer&rsquo;s own form in its
          tab; nothing is submitted for you.
        </p>
      )}
    </Modal>
  );
}
