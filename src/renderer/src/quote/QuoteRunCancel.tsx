// Cancels a quote run while it fills the insurer's form. Kept in the top bar: during a run the
// drawer has stepped aside and the insurer's page fills the window, and the bar stays above it.
import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cancelQuoteRun, onQuoteRun } from './run';

export function QuoteRunCancel(): React.JSX.Element | null {
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  useEffect(
    () =>
      onQuoteRun((event) => {
        setRunning(event.phase === 'start');
        setCancelling(false);
      }),
    [],
  );
  if (!running) return null;
  return (
    <span className="topbar-run" role="status">
      <Loader2 size={13} className="spin" aria-hidden="true" />
      {cancelling ? 'Cancelling…' : 'Filling the form…'}
      <button
        type="button"
        className="danger btn-sm"
        disabled={cancelling}
        onClick={() => {
          setCancelling(true);
          // A run that has not reached the form yet cannot be stopped: the button comes back.
          void cancelQuoteRun().then((cancelled) => {
            if (!cancelled) setCancelling(false);
          });
        }}
      >
        <X size={14} aria-hidden="true" />
        Cancel
      </button>
    </span>
  );
}
