// HDFC ERGO's PIE forms that start from a health client (Energy, Optima Secure, Optima Restore) or
// a travel client (Retail Travel): the advisor's choices for one run, and the premium PIE works out.
// The SP/POSP name or code is remembered on this computer (it is the advisor's, not the client's).
import { useState } from 'react';
import {
  HDFC_CITIES,
  HDFC_ENERGY_PLANS,
  HDFC_OPTIMA_SECURE_PLANS,
  HDFC_RETAIL_NAMES,
  HDFC_RETAIL_PRODUCTS,
  type HdfcRetailRun,
} from '../../../shared/insurers/hdfc';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';

type Result = QuoteRunResultView | { error: string } | null;
const POSP_KEY = 'fqf.hdfc.posp';

function remembered(): string {
  try {
    return localStorage.getItem(POSP_KEY) ?? '';
  } catch {
    return '';
  }
}
function remember(value: string): void {
  try {
    localStorage.setItem(POSP_KEY, value);
  } catch {
    // Not kept: asked again next time.
  }
}

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
  'Sign in to HDFC and open any product from 1up once (Issue Quotes & Policy), so the tab is signed in to PIE.';

/** Energy, Optima Secure, Optima Restore for a health client. */
export function HdfcRetailPanel(props: { clientId: string }): React.JSX.Element {
  const [product, setProduct] = useState<HdfcRetailRun['product']>('optima-secure');
  const [cover, setCover] = useState<HdfcRetailRun['cover']>('individual');
  const [years, setYears] = useState<HdfcRetailRun['years']>(1);
  const [sumInsuredLacs, setSumInsuredLacs] = useState(10);
  const [plan, setPlan] = useState('');
  const [city, setCity] = useState<HdfcRetailRun['city']>('Mumbai');
  const [existing, setExisting] = useState('');
  const [posp, setPosp] = useState(remembered);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const plans =
    product === 'optima-secure'
      ? HDFC_OPTIMA_SECURE_PLANS
      : product === 'energy'
        ? HDFC_ENERGY_PLANS
        : [];
  const run = async () => {
    setBusy(true);
    setResult(null);
    remember(posp.trim());
    const r = await window.fqf.quotes
      .run({
        clientId: props.clientId,
        insurerId: 'hdfc-ergo',
        product: 'hdfc-retail',
        run: {
          product,
          cover: product === 'energy' ? 'individual' : cover,
          years,
          city,
          posp,
          ...(product !== 'energy' ? { sumInsuredLacs } : {}),
          ...(plan ? { plan } : {}),
          ...(product === 'energy' && Number(existing) > 0
            ? { existingSumInsured: Number(existing) }
            : {}),
        },
      })
      .catch(() => null);
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
          onChange={(e) => {
            setProduct(e.target.value as HdfcRetailRun['product']);
            setPlan('');
          }}
        >
          {HDFC_RETAIL_PRODUCTS.map((p) => (
            <option key={p} value={p}>
              {HDFC_RETAIL_NAMES[p]}
            </option>
          ))}
        </select>
      </label>{' '}
      {product !== 'energy' && (
        <label>
          Cover{' '}
          <select
            value={cover}
            onChange={(e) => setCover(e.target.value as HdfcRetailRun['cover'])}
          >
            <option value="individual">Individual</option>
            <option value="family">Family</option>
          </select>
        </label>
      )}{' '}
      {plans.length > 0 && (
        <label>
          Plan{' '}
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">(PIE&rsquo;s first)</option>
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}{' '}
      <label>
        Policy period{' '}
        <select
          value={years}
          onChange={(e) => setYears(Number(e.target.value) as HdfcRetailRun['years'])}
        >
          <option value={1}>1 year</option>
          <option value={2}>2 years</option>
          <option value={3}>3 years</option>
        </select>
      </label>{' '}
      {product !== 'energy' && (
        <label>
          Sum insured (lakh){' '}
          <input
            type="number"
            min={1}
            max={500}
            value={sumInsuredLacs}
            onChange={(e) => setSumInsuredLacs(Number(e.target.value))}
          />
        </label>
      )}{' '}
      {product !== 'optima-secure' && (
        <label>
          I stay in{' '}
          <select value={city} onChange={(e) => setCity(e.target.value as HdfcRetailRun['city'])}>
            {HDFC_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}{' '}
      {product === 'energy' && (
        <label>
          Existing health insurance sum insured (₹, if any){' '}
          <input
            value={existing}
            onChange={(e) => setExisting(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      )}
      <label>
        Your SP/POSP name or code <input value={posp} onChange={(e) => setPosp(e.target.value)} />
      </label>
      <div className="insurer-actions">
        <button type="button" disabled={busy || posp.trim().length < 2} onClick={() => void run()}>
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
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        travellerId: props.travellerId,
        insurerId: 'hdfc-ergo',
        product: 'hdfc-travel',
        run: { departureDate: departure, returnDate: ret, plan },
      })
      .catch(() => null);
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
