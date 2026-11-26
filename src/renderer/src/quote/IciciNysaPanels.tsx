// ICICI Lombard on NYSA's health site (recordings of 26 November 2026): Elevate for a health client
// (everything from the client's details, Additional details → ICICI Lombard), and International
// Travel or Student Medical Travel for a travel client (the trip asked here, as other travel
// quotes do). The app presses Generate Quote / Get quote (allowed by the advisor), never Save &
// Proceed.
import { useEffect, useState } from 'react';
import { iciciElevateFromChoices, QUOTE_DEFAULTS } from '../../../shared/contracts/client-quote';
import {
  ICICI_TRAVEL_DESTINATION_NAMES,
  ICICI_TRAVEL_DESTINATIONS,
  ICICI_INTL_TRAVEL_DEFAULT_PLAN,
  ICICI_INTL_TRAVEL_PLANS,
  type IciciTravelDestination,
} from '../../../shared/insurers/icici-nysa';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import {
  missingMessage,
  QuoteResult,
  readChoices,
  SavedChoicesNote,
  useSavedChoices,
} from '../clients/saved-choices';
import { runQuote } from './run';

type Result = QuoteRunResultView | { error: string } | null;
const lakh = (n: number) => `₹${(n / 100000).toLocaleString('en-IN')} lakh`;

const OPENING =
  "Sign in to ICICI Lombard's NYSA. From NYSA's dashboard the app opens the health site (Health), then the form.";

export function IciciElevatePanel(props: { clientId: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const saved = useSavedChoices(props.clientId);
  const c = saved?.['icici-lombard'] ?? {};
  const tenure = c.tenure ?? QUOTE_DEFAULTS.iciciTenure;
  const lines = [
    `sum insured ${lakh(c.nysaSumInsured ?? QUOTE_DEFAULTS.iciciNysaSumInsured)}`,
    `${tenure} year${tenure > 1 ? 's' : ''}`,
    c.annualIncome
      ? `annual income ₹${c.annualIncome.toLocaleString('en-IN')}`
      : 'annual income not given yet',
    c.preExistingDisease === undefined
      ? 'pre-existing disease not answered yet'
      : c.preExistingDisease
        ? 'a member has a pre-existing disease'
        : 'no pre-existing disease',
  ];
  const run = async () => {
    setBusy(true);
    setResult(null);
    const read = await readChoices(props.clientId);
    if ('error' in read) {
      setBusy(false);
      setResult(read);
      return;
    }
    const built = iciciElevateFromChoices(read.choices);
    if (!built.ok) {
      setBusy(false);
      setResult({ error: missingMessage(built.missing) });
      return;
    }
    const r = await runQuote({
      product: 'icici-elevate',
      clientId: props.clientId,
      insurerId: 'icici-lombard',
      run: built.value,
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>ICICI Lombard, Elevate (NYSA).</strong> {OPENING} It fills the PIN code, the
        members, tenure, sum insured, income and the pre-existing disease answer, presses Generate
        Quote and reads the three plans&rsquo; premiums (Basic, Essential, Recommended). It never
        goes on to the proposal.
      </p>
      <SavedChoicesNote insurer="icici-lombard" lines={lines} />
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Working on NYSA…' : 'Get Elevate premiums'}
        </button>
      </div>
      <QuoteResult result={result} />
    </div>
  );
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** International Travel or Student Medical Travel, for a travel client. */
export function IciciTravelPanel(props: {
  travellerId: string;
  form: 'international' | 'student';
}): React.JSX.Element {
  const student = props.form === 'student';
  const [departure, setDeparture] = useState(() => inDays(7));
  const [ret, setRet] = useState(() => inDays(student ? 97 : 21));
  const [destination, setDestination] = useState<IciciTravelDestination>('usa-canada');
  const [visitingUsaCanada, setVisitingUsaCanada] = useState(false);
  // ICICI's own plan names (names alike are other plans: GOLD_W50, GOLD_W_50).
  const [plan, setPlan] = useState<string>(
    student ? '' : ICICI_INTL_TRAVEL_DEFAULT_PLAN['usa-canada'],
  );
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  // The traveller's state and trip, if saved with their details (Additional details).
  useEffect(() => {
    let live = true;
    void window.fqf.travellers
      .get(props.travellerId)
      .then((r) => {
        if (!live || !r.ok) return;
        const saved = r.data.traveller.proposal?.state;
        if (saved) setState((s) => s || saved);
        const trip = r.data.traveller.trip;
        if (trip) {
          setDeparture(trip.departureDate);
          setRet(trip.returnDate);
          setDestination(trip.destination);
          setVisitingUsaCanada(trip.destination === 'usa-canada');
          if (!student) setPlan(ICICI_INTL_TRAVEL_DEFAULT_PLAN[trip.destination]);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [props.travellerId]);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const trip = { departureDate: departure, returnDate: ret, state: state.trim() };
    const chosen = plan.trim();
    const r = await runQuote(
      student
        ? {
            product: 'icici-student-travel',
            travellerId: props.travellerId,
            insurerId: 'icici-lombard',
            run: { ...trip, visitingUsaCanada, ...(chosen ? { plan: chosen } : {}) },
          }
        : {
            product: 'icici-intl-travel',
            travellerId: props.travellerId,
            insurerId: 'icici-lombard',
            run: { ...trip, destination, plan: chosen },
          },
    ).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>
          ICICI Lombard, {student ? 'Student Medical Travel' : 'International Travel'} (NYSA).
        </strong>{' '}
        {OPENING} It fills the trip and the traveller (as the applicant, Self), chooses the plan
        below by its exact name, presses Get quote and reads the Total premium. It never presses
        Save &amp; Proceed.
        {student &&
          ' Without a plan (or if ICICI offers none, as when this form was recorded), the app stops there: choose the plan and press Get quote yourself, and the app reads the premium.'}
      </p>
      <div className="form-grid">
        <label>
          {student ? 'Leaving India on' : 'Departure'}
          <input type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} />
        </label>
        <label>
          {student ? 'Studies end (sets the duration)' : 'Return'}
          <input type="date" value={ret} onChange={(e) => setRet(e.target.value)} />
        </label>
        {student ? (
          <label className="check">
            <input
              type="checkbox"
              checked={visitingUsaCanada}
              onChange={(e) => setVisitingUsaCanada(e.target.checked)}
            />
            Visiting USA / Canada during studies
          </label>
        ) : (
          <label>
            Travelling to
            <select
              value={destination}
              onChange={(e) => {
                const to = e.target.value as IciciTravelDestination;
                setDestination(to);
                // Each destination has its own plans.
                setPlan(ICICI_INTL_TRAVEL_DEFAULT_PLAN[to]);
              }}
            >
              {ICICI_TRAVEL_DESTINATIONS.map((d) => (
                <option key={d} value={d}>
                  {ICICI_TRAVEL_DESTINATION_NAMES[d]}
                </option>
              ))}
            </select>
          </label>
        )}
        {student ? (
          <label>
            Plan (as ICICI lists it; empty: you choose it there)
            <input
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="Leave empty to choose in ICICI's list"
            />
          </label>
        ) : (
          <label>
            Plan ({ICICI_TRAVEL_DESTINATION_NAMES[destination]})
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              {ICICI_INTL_TRAVEL_PLANS[destination].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          State (as ICICI lists it)
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Maharashtra"
          />
        </label>
      </div>
      <div className="insurer-actions">
        <button
          type="button"
          disabled={busy || state.trim().length < 3 || departure > ret}
          onClick={() => void run()}
        >
          {busy ? 'Working on NYSA…' : 'Get ICICI travel premium'}
        </button>
      </div>
      <QuoteResult result={result} />
    </div>
  );
}
