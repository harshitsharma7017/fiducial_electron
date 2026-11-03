// United India's Overseas Travel Insurance e-proposal for a saved client: the advisor enters the
// trip for this run (never saved, nor the passport number), and the app fills the form, reads the
// premium if United India shows it, and stops. It never saves or submits the proposal.
import { useState } from 'react';
import {
  TRAVEL_OCCUPATIONS,
  type TravelDestination,
  type TravelSumInsured,
} from '../../../shared/contracts/travel';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';

const SUMS: { value: TravelSumInsured; label: string }[] = [
  { value: '50000', label: '50,000' },
  { value: '100000', label: '1,00,000' },
  { value: '250000', label: '2,50,000' },
  { value: '500000', label: '5,00,000 (Worldwide only)' },
];

const OCCUPATION_LABELS: Record<(typeof TRAVEL_OCCUPATIONS)[number], string> = {
  SelfEmployed: 'Self-employed',
  Unemployed: 'Unemployed',
  Salaried: 'Salaried',
  Service: 'Service',
  Professional: 'Professional',
};

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TravelProposalPanel(props: { clientId: string }): React.JSX.Element {
  const [destination, setDestination] = useState<TravelDestination>('worldwide');
  const [sumInsured, setSumInsured] = useState<TravelSumInsured>('50000');
  const [startDate, setStartDate] = useState(tomorrow);
  const [days, setDays] = useState('7');
  const [occupation, setOccupation] = useState('');
  const [passport, setPassport] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);

  const excludesUsa = destination === 'worldwide-excluding-usa-canada';
  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        product: 'travel-proposal',
        clientId: props.clientId,
        insurerId: 'united-india',
        trip: {
          destination,
          sumInsured,
          startDate,
          days: Number(days),
          ...(occupation ? { occupation: occupation as (typeof TRAVEL_OCCUPATIONS)[number] } : {}),
          ...(passport.trim() ? { passportNumber: passport } : {}),
        },
      })
      .catch(() => null);
    setBusy(false);
    setResult(
      r?.ok
        ? r.data
        : {
            error:
              r?.ok === false && r.error.code === 'VALIDATION_FAILED'
                ? 'Check the trip: a detail is missing or not valid (the passport number is letters and digits).'
                : (r?.error.message ?? 'The proposal could not be started.'),
          },
    );
  };

  return (
    <form className="quote-panel login-form" onSubmit={(e) => void run(e)}>
      <p className="insurer-note">
        <strong>United India, Overseas Travel Insurance e-proposal.</strong> Sign in to United India
        and leave it on its home page. The insured is this client&rsquo;s proposer. The app fills
        the form for this trip, presses View Premium and shows the premium if United India gives it,
        then stops. The trip and passport number are used for this proposal only and not saved. It
        never saves or submits the proposal: you answer the medical questions and declarations,
        upload the signature, check it, and press Save As Draft yourself.
      </p>
      <label>
        Travel destination
        <select
          value={destination}
          onChange={(e) => {
            const next = e.target.value as TravelDestination;
            setDestination(next);
            if (next === 'worldwide-excluding-usa-canada' && sumInsured === '500000') {
              setSumInsured('250000');
            }
          }}
        >
          <option value="worldwide">Worldwide</option>
          <option value="worldwide-excluding-usa-canada">
            Worldwide, excluding USA and Canada
          </option>
        </select>
      </label>
      <label>
        Sum insured (United India&rsquo;s plan)
        <select
          value={sumInsured}
          onChange={(e) => setSumInsured(e.target.value as TravelSumInsured)}
        >
          {SUMS.filter((s) => !(excludesUsa && s.value === '500000')).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Travel start date
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </label>
      <label>
        Travel days
        <input
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          maxLength={3}
          required
        />
      </label>
      <label>
        Insured&rsquo;s occupation (optional)
        <select value={occupation} onChange={(e) => setOccupation(e.target.value)}>
          <option value="">Fill in on the form</option>
          {TRAVEL_OCCUPATIONS.map((o) => (
            <option key={o} value={o}>
              {OCCUPATION_LABELS[o]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Passport number (optional, not saved)
        <input
          value={passport}
          onChange={(e) => setPassport(e.target.value)}
          maxLength={20}
          autoComplete="off"
        />
      </label>
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Filling United India…' : 'Fill Overseas Travel proposal'}
        </button>
      </div>
      {result && 'error' in result && (
        <p className="error" role="alert">
          {result.error}
        </p>
      )}
      {result && 'outcome' in result && (
        <div role="status">
          {result.premium && (
            <p className="premium">
              Premium (including GST): <strong>₹{result.premium.amount}</strong>
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
              <p>Still to fill in by hand:</p>
              <ul>
                {result.toDo.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
