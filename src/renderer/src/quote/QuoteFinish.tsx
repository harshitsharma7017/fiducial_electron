// Finishing a form the run left for the advisor (request of 20 November 2026). The run filled what
// it could; the advisor fills the rest in the insurer's tab and presses its premium button. The
// app watches for the premium and saves the quote as a PDF, or takes the premium the advisor
// types. In the drawer (QuoteFinishCard) and, while the insurer's page fills the window, in the
// top bar (QuoteFinishStatus).
import { Eye, FileDown, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  dismissFinish,
  finishWithAmount,
  onFinishState,
  openQuotePdf,
  showInsurerTab,
  stopWatching,
  watchForPremium,
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

  const button = state.finish.button ? `“${state.finish.button}”` : "the insurer's premium button";
  const save = async () => {
    setProblem(null);
    const error = await finishWithAmount(amount);
    if (error) setProblem(error);
  };
  return (
    <div className="qw-finish" role="status">
      <p>
        {state.phase === 'watching' ? (
          <>
            <Loader2 size={14} className="spin" aria-hidden="true" />{' '}
            <strong>Watching for the premium.</strong> Fill what is listed below in {props.insurer}
            &rsquo;s tab and press {button}. The app saves the quote as a PDF as soon as the premium
            shows.
            {state.finish.guessed &&
              ' (This form was not recorded up to its premium: if the app does not pick it up, type it below.)'}
          </>
        ) : state.phase === 'saving' ? (
          <>
            <Loader2 size={14} className="spin" aria-hidden="true" /> Saving the PDF…
          </>
        ) : (
          <>
            <strong>Not watching for the premium.</strong> {state.note}
          </>
        )}
      </p>
      <div className="insurer-actions">
        <button type="button" onClick={() => void showInsurerTab(state.insurerId)}>
          Go to {props.insurer}&rsquo;s tab
        </button>
        {state.phase === 'watching' ? (
          <button type="button" className="ghost" onClick={() => void stopWatching()}>
            <X size={14} aria-hidden="true" />
            Stop watching
          </button>
        ) : (
          state.phase === 'stopped' && (
            <button
              type="button"
              className="ghost"
              onClick={() => void watchForPremium(state.insurerId, state.finish)}
            >
              <Eye size={14} aria-hidden="true" />
              Watch again
            </button>
          )
        )}
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

/** In the top bar while the app watches a form's premium (the insurer's page fills the window). */
export function QuoteFinishStatus(): React.JSX.Element | null {
  const state = useFinishState();
  if (state.phase !== 'watching' && state.phase !== 'saving') return null;
  return (
    <span className="topbar-run" role="status">
      <Loader2 size={13} className="spin" aria-hidden="true" />
      {state.phase === 'saving'
        ? 'Saving the PDF…'
        : `Watching for the premium: press ${state.finish.button ?? 'the premium button'} when the form is done`}
      {state.phase === 'watching' && (
        <button type="button" className="ghost btn-sm" onClick={() => void stopWatching()}>
          <X size={14} aria-hidden="true" />
          Stop
        </button>
      )}
    </span>
  );
}
