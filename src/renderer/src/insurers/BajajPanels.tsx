// Bajaj Allianz's Personal Accident form for a health client (its proposer): the plan is chosen
// here; everything else is the client's details (Additional details, Bajaj Allianz). The run fills
// Bajaj's form, presses Calculate Premium (Bajaj's quick quote: nothing is saved) and reads the
// premium.
import { useState } from 'react';
import { bajajPaFromChoices } from '../../../shared/contracts/client-quote';
import {
  BAJAJ_OCCUPATIONS,
  BAJAJ_PA_PLANS,
  BAJAJ_PA_RECORDED_PLAN,
  type BajajPaPlan,
} from '../../../shared/insurers/bajaj';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import {
  missingMessage,
  QuoteResult,
  readChoices,
  SavedChoicesNote,
  useSavedChoices,
} from '../clients/saved-choices';
import { runQuote } from '../quote/run';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function BajajPaPanel(props: { clientId: string }): React.JSX.Element {
  const [plan, setPlan] = useState<BajajPaPlan>(BAJAJ_PA_RECORDED_PLAN);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const saved = useSavedChoices(props.clientId);
  const c = saved?.['bajaj-allianz'] ?? {};
  const lines = [
    `${c.paTenureYears ?? 1} year${(c.paTenureYears ?? 1) > 1 ? 's' : ''}`,
    c.familyIncome ? `family income ${rupees(c.familyIncome)}` : 'family income not given',
    c.monthlyIncome ? `monthly income ${rupees(c.monthlyIncome)}` : 'monthly income not given',
    c.occupation ? BAJAJ_OCCUPATIONS[c.occupation] : 'occupation not given',
    ...(c.deathSumInsured ? [`death ${rupees(c.deathSumInsured)}`] : []),
    ...(c.partialDisabilitySumInsured
      ? [`partial disability ${rupees(c.partialDisabilitySumInsured)}`]
      : []),
    ...(c.totalDisabilitySumInsured
      ? [`total disability ${rupees(c.totalDisabilitySumInsured)}`]
      : []),
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
    const built = bajajPaFromChoices(plan, read.choices);
    if (!built.ok) {
      setBusy(false);
      setResult({ error: missingMessage(built.missing) });
      return;
    }
    const r = await runQuote({
      clientId: props.clientId,
      insurerId: 'bajaj-allianz',
      product: 'bajaj-pa',
      run: built.value,
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>Bajaj Allianz, Personal Accident.</strong> Sign in to Bajaj Allianz&rsquo;s partner
        portal. The app opens the Personal Accident form, fills the plan, tenure, pincode, family
        income and the proposer (name, gender, date of birth, monthly income, occupation) and the
        covers&rsquo; sums insured, presses Calculate Premium (Bajaj&rsquo;s quick quote: nothing is
        saved) and reads the premium.
      </p>
      <label>
        Plan{' '}
        <select value={plan} onChange={(e) => setPlan(e.target.value as BajajPaPlan)}>
          {(Object.entries(BAJAJ_PA_PLANS) as [BajajPaPlan, string][]).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
              {code === BAJAJ_PA_RECORDED_PLAN ? '' : ' (not recorded yet)'}
            </option>
          ))}
        </select>
      </label>
      <SavedChoicesNote insurer="bajaj-allianz" lines={lines} />
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Working on Bajaj…' : `Get ${BAJAJ_PA_PLANS[plan]} premium`}
        </button>
      </div>
      <QuoteResult result={result} />
    </div>
  );
}
