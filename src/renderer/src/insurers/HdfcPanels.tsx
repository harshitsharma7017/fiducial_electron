// HDFC ERGO's PIE forms that start from a health client (Energy, Optima Secure, Optima Restore) or
// a travel client (Retail Travel): the advisor's choices for one run, and the premium PIE works out.
// The SP/POSP name or code is remembered on this computer (it is the advisor's, not the client's).
// A health client's choices besides the product are its saved details (request of 24 November 2026).
import { useEffect, useState } from 'react';
import { hdfcRetailFromChoices } from '../../../shared/contracts/client-quote';
import {
  missingMessage,
  readChoices,
  SavedChoicesNote,
  useSavedChoices,
} from '../clients/saved-choices';
import { rememberedPosp } from './hdfc-posp';
import {
  HDFC_RETAIL_NAMES,
  HDFC_RETAIL_PRODUCTS,
  type HdfcRetailRun,
} from '../../../shared/insurers/hdfc';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import { runQuote } from '../quote/run';

type Result = QuoteRunResultView | { error: string } | null;

function ResultView(props: { result: Result }): React.JSX.Element | null {
  const { result } = props;
  if (!result) return null;
  if ('error' in result) {
    return (
      <p className="error" role="alert">
        {result.error}
      </p>
    );
  }
  return (
    <div role="status">
      {result.premium && (
        <p className="premium">
          Total payable premium: <strong>₹{result.premium.amount}</strong> &mdash;{' '}
          {result.premium.label}
        </p>
      )}
      <p className={result.outcome === 'ready' ? undefined : 'error'}>
        {result.step ? `${result.step}: ` : ''}
        {result.message}
      </p>
      {result.problems.length > 0 && (
        <ul>
          {result.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {result.toDo && result.toDo.length > 0 && (
        <>
          <p>Still to do by hand:</p>
          <ul>
            {result.toDo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const OPENING =
  "Sign in to HDFC's 1up. From 1up's home page the app opens PIE itself (Issue Quotes & Policy, then PIE Dashboard).";

/**
 * Energy, Optima Secure, Optima Restore for a health client: the product is chosen here, the rest
 * is the client's details (Additional details, HDFC ERGO) and the advisor's SP/POSP code.
 */
export function HdfcRetailPanel(props: { clientId: string }): React.JSX.Element {
  const [product, setProduct] = useState<HdfcRetailRun['product']>('optima-secure');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const saved = useSavedChoices(props.clientId);
  const shown = hdfcRetailFromChoices(product, saved ?? undefined, rememberedPosp() || '--');
  const lines = shown.ok
    ? [
        ...(product !== 'energy' ? [shown.value.cover === 'family' ? 'Family' : 'Individual'] : []),
        ...(shown.value.plan ? [`plan ${shown.value.plan}`] : []),
        `${shown.value.years} year${shown.value.years > 1 ? 's' : ''}`,
        ...(shown.value.sumInsuredLacs ? [`${shown.value.sumInsuredLacs} lakh`] : []),
        ...(product !== 'optima-secure' ? [`stays in ${shown.value.city}`] : []),
        rememberedPosp() ? `SP/POSP ${rememberedPosp()}` : 'your SP/POSP code not given yet',
      ]
    : [];
  const run = async () => {
    setBusy(true);
    setResult(null);
    const read = await readChoices(props.clientId);
    if ('error' in read) {
      setBusy(false);
      setResult(read);
      return;
    }
    const built = hdfcRetailFromChoices(product, read.choices, rememberedPosp());
    if (!built.ok) {
      setBusy(false);
      setResult({ error: missingMessage(built.missing) });
      return;
    }
    const r = await runQuote({
      clientId: props.clientId,
      insurerId: 'hdfc-ergo',
      product: 'hdfc-retail',
      run: built.value,
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>HDFC ERGO, retail health (PIE), new business.</strong> {OPENING} The app opens the
        form, answers its questionnaire and product details for the client, goes to Basic Details
        and reads the premium. It never presses Generate Quote. These forms were not recorded up to
        their premium: if PIE asks something more, the run stops and says what.
      </p>
      <label>
        Product{' '}
        <select
          value={product}
          onChange={(e) => setProduct(e.target.value as HdfcRetailRun['product'])}
        >
          {HDFC_RETAIL_PRODUCTS.map((p) => (
            <option key={p} value={p}>
              {HDFC_RETAIL_NAMES[p]}
            </option>
          ))}
        </select>
      </label>
      <SavedChoicesNote insurer="hdfc-ergo" lines={lines} />
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Working on PIE…' : `Get ${HDFC_RETAIL_NAMES[product]} premium`}
        </button>
      </div>
      <ResultView result={result} />
    </div>
  );
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Retail Travel for a travel client. */
export function HdfcTravelPanel(props: { travellerId: string }): React.JSX.Element {
  const [departure, setDeparture] = useState(() => inDays(1));
  const [ret, setRet] = useState(() => inDays(8));
  const [plan, setPlan] = useState('Gold');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  // The trip saved with the travel client (Additional details), if any.
  useEffect(() => {
    let live = true;
    void window.fqf.travellers
      .get(props.travellerId)
      .then((r) => {
        const trip = r.ok ? r.data.traveller.trip : undefined;
        if (!live || !trip) return;
        setDeparture(trip.departureDate);
        setRet(trip.returnDate);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [props.travellerId]);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await runQuote({
      travellerId: props.travellerId,
      insurerId: 'hdfc-ergo',
      product: 'hdfc-travel',
      run: { departureDate: departure, returnDate: ret, plan },
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>HDFC ERGO, Retail Travel (PIE), new business.</strong> {OPENING} The app opens the
        form, fills the trip, plan and traveller, presses Calculate Premium and reads the premium.
        It never presses Generate Quote. This form was recorded for a renewal only: if PIE asks
        something more, the run stops and says what.
      </p>
      <label>
        Departure{' '}
        <input type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} />
      </label>{' '}
      <label>
        Return <input type="date" value={ret} onChange={(e) => setRet(e.target.value)} />
      </label>{' '}
      <label>
        Plan (as PIE names it){' '}
        <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Gold" />
      </label>
      <div className="insurer-actions">
        <button type="button" disabled={busy || plan.trim().length < 2} onClick={() => void run()}>
          {busy ? 'Working on PIE…' : 'Get HDFC ERGO travel premium'}
        </button>
      </div>
      <ResultView result={result} />
    </div>
  );
}
