// United India's travel e-proposals for a travel client: Overseas Travel Insurance, and Overseas
// Mediclaim (B&H, SCHENGEN, Studies). The advisor enters the trip for this run (never saved); the
// traveller, their occupation and passport come from the travel client. The app fills the form,
// reads the premium if United India shows it, and stops. It never saves or submits the proposal.
import { useState } from 'react';
import {
  TRAVEL_OCCUPATIONS,
  type OmpForm,
  type TravelOccupation,
  type TravelDestination,
  type TravelSumInsured,
} from '../../../shared/contracts/travel';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import { runQuote } from '../quote/run';

const SUMS: { value: TravelSumInsured; label: string }[] = [
  { value: '50000', label: '50,000' },
  { value: '100000', label: '1,00,000' },
  { value: '250000', label: '2,50,000' },
  { value: '500000', label: '5,00,000 (Worldwide only)' },
];

export const TRAVEL_OCCUPATION_LABELS: Record<TravelOccupation, string> = {
  SelfEmployed: 'Self-employed',
  Unemployed: 'Unemployed',
  Salaried: 'Salaried',
  Service: 'Service',
  Professional: 'Professional',
};

/** The travel occupations, in the form's order. */
export const TRAVEL_OCCUPATION_LIST: readonly TravelOccupation[] = TRAVEL_OCCUPATIONS;

/** The three Overseas Mediclaim forms, each with its own button on a travel client. */
export const OMP_FORM_NAMES: Record<OmpForm, string> = {
  'business-holiday': 'Overseas Mediclaim B&H',
  schengen: 'Overseas Mediclaim SCHENGEN',
  studies: 'Overseas Mediclaim Studies',
};

const PLAN_PLACES = ['1st (lowest)', '2nd', '3rd', '4th', '5th', '6th'];

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Without `ompForm`: Overseas Travel Insurance, its plan chosen by sum insured. With it: that
 * Overseas Mediclaim form, its plan chosen by place among those United India offers.
 */
export function TravelProposalPanel(props: {
  travellerId: string;
  ompForm?: OmpForm;
}): React.JSX.Element {
  const ompForm = props.ompForm;
  const mediclaim = ompForm !== undefined;
  const [planPlace, setPlanPlace] = useState(1);
  const [destination, setDestination] = useState<TravelDestination>('worldwide');
  const [sumInsured, setSumInsured] = useState<TravelSumInsured>('50000');
  const [startDate, setStartDate] = useState(tomorrow);
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);

  const excludesUsa = destination === 'worldwide-excluding-usa-canada';
  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const common = {
      destination,
      startDate,
      days: Number(days),
    };
    const r = await runQuote(
      ompForm
        ? {
            product: 'omp-proposal',
            travellerId: props.travellerId,
            insurerId: 'united-india',
            trip: { ...common, form: ompForm, plan: planPlace },
          }
        : {
            product: 'travel-proposal',
            travellerId: props.travellerId,
            insurerId: 'united-india',
            trip: { ...common, sumInsured },
          },
    ).catch(() => null);
    setBusy(false);
    setResult(
      r?.ok
        ? r.data
        : {
            error:
              r?.ok === false && r.error.code === 'VALIDATION_FAILED'
                ? 'Check the trip: a detail is missing or not valid.'
                : (r?.error.message ?? 'The proposal could not be started.'),
          },
    );
  };

  return (
    <form className="quote-panel login-form" onSubmit={(e) => void run(e)}>
      {ompForm ? (
        <p className="insurer-note">
          <strong>United India, {OMP_FORM_NAMES[ompForm]} e-proposal.</strong> Sign in to United
          India and leave it on its home page. The traveller is the proposer and insured (United
          India prices the plans by their age). The app fills the trip, opens United India&rsquo;s
          plans for it and chooses the one in the place you pick (lowest first), fills the rest and
          shows the premium, then stops. The trip is used for this proposal only and not saved. It
          never saves or submits the proposal: you answer the medical questions, upload the
          signatures and documents, check it, and press Save As Draft yourself.
        </p>
      ) : (
        <p className="insurer-note">
          <strong>United India, Overseas Travel Insurance e-proposal.</strong> Sign in to United
          India and leave it on its home page. The traveller is the proposer and insured. The app
          fills the form for this trip, presses View Premium and shows the premium if United India
          gives it, then stops. The trip is used for this proposal only and not saved. It never
          saves or submits the proposal: you answer the medical questions and declarations, upload
          the signature, check it, and press Save As Draft yourself.
        </p>
      )}
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
      {mediclaim ? (
        <label>
          Plan (its place in United India&rsquo;s list for this trip)
          <select value={planPlace} onChange={(e) => setPlanPlace(Number(e.target.value))}>
            {PLAN_PLACES.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : (
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
      )}
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
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy
            ? 'Filling United India…'
            : ompForm
              ? `Fill ${OMP_FORM_NAMES[ompForm]} proposal`
              : 'Fill Overseas Travel proposal'}
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
