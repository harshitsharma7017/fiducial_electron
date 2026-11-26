// Finishing the form a run filled (requests of 20 and 26 November 2026). The run filled what it
// could and kept the form: the advisor checks it in the insurer's tab, fills or changes anything,
// and presses Stop & make PDF; the app reads the premium the page shows then and saves the quote
// as a PDF (no PDF is made by itself), or takes the premium the advisor types. In the drawer
// (QuoteFinishCard) and, while the insurer's page fills the window, in the top bar
// (QuoteFinishStatus).
import { FileDown, Loader2, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePortalTabs } from '../insurers/PortalTabs';
import { toast } from '../ui/toast';
import {
  discardForm,
  dismissFinish,
  finishWithAmount,
  makePdfNow,
  onFinishState,
  openQuotePdf,
  showInsurerTab,
  stopAndMakePdf,
  type FinishState,
} from './run';

function useFinishState(): FinishState {
  const [state, setState] = useState<FinishState>({ phase: 'idle' });
  useEffect(() => onFinishState(setState), []);
  return state;
}

export function QuoteFinishCard(props: { insurer: string }): React.JSX.Element | null {
  const state = useFinishState();
  const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [pdfProblem, setPdfProblem] = useState(false);
  if (state.phase === 'idle') return null;

  if (state.phase === 'done') {
    const { result } = state;
    return (
      <div className="qw-finish" role="status">
        <p>
          <strong>
            Premium {result.premium ? `₹${result.premium.amount}` : ''}
            {result.premium?.label ? ` — ${result.premium.label}` : ''}
          </strong>
          <br />
          {result.pdf ? `Quote saved as a PDF in Downloads: ${result.pdf.name}` : result.message}
          {pdfProblem && ' (it could not be opened: find it in your Downloads folder)'}
        </p>
        <div className="insurer-actions">
          {result.pdf && (
            <button
              type="button"
              onClick={() =>
                void openQuotePdf(result.pdf?.name ?? '').then((opened) => setPdfProblem(!opened))
              }
            >
              <FileDown size={16} aria-hidden="true" />
              Open PDF
            </button>
          )}
          <button type="button" className="ghost" onClick={dismissFinish}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const button = state.finish.button ? `“${state.finish.button}”` : null;
  const save = async () => {
    setProblem(null);
    const error = await finishWithAmount(amount);
    if (error) setProblem(error);
  };
  return (
    <div className="qw-finish" role="status">
      <p>
        {state.phase === 'saving' ? (
          <>
            <Loader2 size={14} className="spin" aria-hidden="true" /> Reading the premium and saving
            the PDF…
          </>
        ) : (
          <>
            <strong>The form is filled and kept.</strong> Check it in {props.insurer}&rsquo;s tab:
            fill anything listed below{button ? `, press ${button}` : ''} and change what you need.
            Then press Stop &amp; make PDF: the premium shown then is saved as the quote&rsquo;s
            PDF. No PDF is made until you do.
            {state.note && (
              <>
                <br />
                {state.note}
              </>
            )}
          </>
        )}
      </p>
      <div className="insurer-actions">
        <button
          type="button"
          className="primary"
          disabled={state.phase === 'saving'}
          onClick={() => void makePdfNow()}
        >
          <Square size={14} aria-hidden="true" />
          Stop &amp; make PDF
        </button>
        <button type="button" onClick={() => void showInsurerTab(state.insurerId)}>
          Go to {props.insurer}&rsquo;s tab
        </button>
        <button
          type="button"
          className="ghost"
          disabled={state.phase === 'saving'}
          onClick={() => void discardForm()}
        >
          <X size={14} aria-hidden="true" />
          Discard
        </button>
      </div>
      <form
        className="qw-finish-amount"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Or type the premium {props.insurer} shows{' '}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₹ 12,345"
            maxLength={16}
          />
        </label>
        <button type="submit" disabled={state.phase === 'saving' || amount.trim() === ''}>
          <FileDown size={16} aria-hidden="true" />
          Save PDF
        </button>
      </form>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The insurers whose filled form is kept now (any run's: a single quote's, Compare quotes'), and
 * those still being filled.
 */
function useKeptForms(): { kept: Set<string>; filling: string[] } {
  const [kept, setKept] = useState<{ kept: Set<string>; filling: string[] }>({
    kept: new Set(),
    filling: [],
  });
  useEffect(() => {
    let live = true;
    let since = 0;
    void (async () => {
      while (live) {
        const r = await window.fqf.quotes.progress(since).catch(() => null);
        if (!live) return;
        if (r?.ok) {
          since = r.data.version;
          setKept({
            kept: new Set(
              r.data.items.filter((p) => p.state === 'handed-over').map((p) => p.insurerId),
            ),
            filling: r.data.items.filter((p) => p.state === 'running').map((p) => p.insurerId),
          });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return kept;
}

/**
 * In the top bar while an insurer's page fills the window (request of 26 November 2026: "on the
 * page of each insurer, when the user clicks Stop"): Stop & make PDF for the insurer in front,
 * whenever its filled form is kept, whichever screen started it.
 */
export function QuoteFinishStatus(): React.JSX.Element | null {
  const state = useFinishState();
  const portals = usePortalTabs(true);
  const { kept, filling } = useKeptForms();
  const [saving, setSaving] = useState(false);
  const front = portals?.tabs.find((t) => t.id === portals.active)?.insurerId ?? null;
  if (state.phase === 'saving' || saving) {
    return (
      <span className="topbar-run" role="status" title="Reading the premium and saving the PDF">
        <Loader2 size={13} className="spin" aria-hidden="true" />
        <span className="topbar-run-text">Saving the PDF…</span>
      </span>
    );
  }
  const insurer =
    front && kept.has(front)
      ? front
      : state.phase === 'pending' && front === state.insurerId
        ? state.insurerId
        : null;
  if (!insurer) {
    // Several insurers filled at once: their pages stay on screen (a hidden page is not drawn,
    // and their forms would stall), the app's screens come back when they are filled.
    if (filling.length < 2) return null;
    // Short in the bar (the tabs need the room); the why is in its tooltip.
    return (
      <span
        className="topbar-run"
        role="status"
        title="Their pages stay on screen until each form is filled: switch between them with the tabs."
      >
        <Loader2 size={13} className="spin" aria-hidden="true" />
        <span className="topbar-run-text">Filling {filling.length} insurers…</span>
      </span>
    );
  }
  const stop = async () => {
    // The single quote's own form: through its card's state (the drawer shows the PDF after).
    if (state.phase === 'pending' && state.insurerId === insurer) {
      await makePdfNow();
      return;
    }
    setSaving(true);
    const r = await stopAndMakePdf(insurer);
    setSaving(false);
    // Null: the plan question was cancelled (the form stays kept).
    if (!r) return;
    else if (!r.ok) toast(r.error.message);
    else if (r.data.outcome === 'ready') toast('PDF saved in Downloads.');
    else toast(r.data.message);
  };
  return (
    <span
      className="topbar-run"
      role="status"
      title="The form is filled: check it (change anything you need), then make its PDF."
    >
      <span className="topbar-run-text">Form filled</span>
      <button type="button" className="primary btn-sm" onClick={() => void stop()}>
        <Square size={14} aria-hidden="true" />
        Stop &amp; make PDF
      </button>
    </span>
  );
}
