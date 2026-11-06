// Fills one of New India's overseas travel quote forms for a travel client: the advisor picks the
// form and enters the trip for this run (never saved), and confirms New India's question about
// pre-existing illness or an accident. The app stops before New India works the premium out.
import { useState } from 'react';
import type { TravelDestination } from '../../../shared/contracts/travel';
import {
  NIA_CFT_DESTINATION_NAMES,
  NIA_CFT_DESTINATIONS,
  NIA_TRAVEL_EASE_PLAN_NAMES,
  NIA_TRAVEL_EASE_PLANS,
  NIA_TRAVEL_FORM_NAMES,
  NIA_TRAVEL_FORMS,
  type NiaTrip,
  type NiaTravelForm,
} from '../../../shared/insurers/nia-travel';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import { runQuote } from '../quote/run';

const PLAN_PLACES = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function NiaTravelPanel(props: { travellerId: string }): React.JSX.Element {
  const [form, setForm] = useState<NiaTravelForm>('travel-ease');
  const [destination, setDestination] = useState<TravelDestination>('worldwide');
  const [cft, setCft] = useState<(typeof NIA_CFT_DESTINATIONS)[number]>('E1');
  const [purpose, setPurpose] = useState<'business' | 'holiday' | 'studies' | 'employment'>(
    'holiday',
  );
  const [leavingDate, setLeavingDate] = useState(() => inDays(1));
  const [returnDate, setReturnDate] = useState(() => inDays(8));
  const [months, setMonths] = useState(6);
  const [planPlace, setPlanPlace] = useState(1);
  const [plan, setPlan] = useState<(typeof NIA_TRAVEL_EASE_PLANS)[number]>('50000');
  const [noPreExisting, setNoPreExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);

  const studies = form === 'studies-employment';
  const purposes = studies
    ? (['studies', 'employment'] as const)
    : (['business', 'holiday'] as const);
  const chooseForm = (next: NiaTravelForm) => {
    setForm(next);
    setPurpose(next === 'studies-employment' ? 'studies' : 'holiday');
  };
  const trip = (): NiaTrip =>
    form === 'studies-employment'
      ? {
          form,
          destination,
          purpose: purpose as 'studies' | 'employment',
          leavingDate,
          months,
          plan: planPlace,
        }
      : form === 'business-holiday'
        ? { form, destination: cft, purpose: purpose as 'business' | 'holiday', leavingDate }
        : {
            form,
            destination,
            purpose: purpose as 'business' | 'holiday',
            leavingDate,
            returnDate,
            plan,
          };

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const r = await runQuote({
      product: 'nia-travel',
      travellerId: props.travellerId,
      insurerId: 'new-india',
      trip: trip(),
      noPreExistingConfirmed: noPreExisting,
    }).catch(() => null);
    setBusy(false);
    setResult(
      r?.ok
        ? r.data
        : {
            error:
              r?.ok === false && r.error.code === 'VALIDATION_FAILED'
                ? 'Check the trip: a detail is missing or not valid.'
                : (r?.error.message ?? 'The quote could not be started.'),
          },
    );
  };

  return (
    <form className="quote-panel login-form" onSubmit={(e) => void run(e)}>
      <p className="insurer-note">
        <strong>New India, overseas travel quote.</strong> Sign in to New India and leave it on its
        dashboard (or open the form yourself). The app opens the form and fills the trip and the
        traveller, then stops. When New India asks whether the client has a PAN, answer it on its
        page and press Fill again. The trip is used for this quote only and not saved. The app never
        presses Save &amp; Calculate Premium: you check the form and press it.
      </p>
      <label>
        Form
        <select value={form} onChange={(e) => chooseForm(e.target.value as NiaTravelForm)}>
          {NIA_TRAVEL_FORMS.map((f) => (
            <option key={f} value={f}>
              {NIA_TRAVEL_FORM_NAMES[f]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Travel destination
        {form === 'business-holiday' ? (
          <select value={cft} onChange={(e) => setCft(e.target.value as typeof cft)}>
            {NIA_CFT_DESTINATIONS.map((d) => (
              <option key={d} value={d}>
                {NIA_CFT_DESTINATION_NAMES[d]}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value as TravelDestination)}
          >
            <option value="worldwide">Worldwide, including USA and Canada</option>
            <option value="worldwide-excluding-usa-canada">
              Worldwide, excluding USA and Canada
            </option>
          </select>
        )}
      </label>
      <label>
        Purpose of travel
        <select value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}>
          {purposes.map((p) => (
            <option key={p} value={p}>
              {p[0]!.toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Leaving India on
        <input
          type="date"
          value={leavingDate}
          onChange={(e) => setLeavingDate(e.target.value)}
          required
        />
      </label>
      {form === 'travel-ease' && (
        <label>
          Returning to India on
          <input
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            required
          />
        </label>
      )}
      {studies && (
        <label>
          Travel duration (months)
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}
      {studies && (
        <label>
          Plan (its place in New India&rsquo;s list for this trip)
          <select value={planPlace} onChange={(e) => setPlanPlace(Number(e.target.value))}>
            {PLAN_PLACES.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {form === 'travel-ease' && (
        <label>
          Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)}>
            {NIA_TRAVEL_EASE_PLANS.map((p) => (
              <option key={p} value={p}>
                {NIA_TRAVEL_EASE_PLAN_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={noPreExisting}
          onChange={(e) => setNoPreExisting(e.target.checked)}
        />
        The traveller has no pre-existing illness, disease or disability, and has not had an
        accident (New India&rsquo;s question, for this quote).
      </label>
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Filling New India…' : `Fill ${NIA_TRAVEL_FORM_NAMES[form]} form`}
        </button>
      </div>
      {result && 'error' in result && (
        <p className="error" role="alert">
          {result.error}
        </p>
      )}
      {result && 'outcome' in result && (
        <div role="status">
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
