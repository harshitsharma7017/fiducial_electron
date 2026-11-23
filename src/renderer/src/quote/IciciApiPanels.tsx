// ICICI Lombard premiums by its partner API (request of 21 November 2026): motor for a saved
// vehicle, Elevate and Activate Booster (super top-up) for a health client. Nothing is filled in a
// portal: the app asks ICICI's API in the environment chosen on the Insurer portals screen
// (Partner API), shows the premium and how ICICI made it up, and saves the PDF.
import { useEffect, useState } from 'react';
import type { VehicleSummary } from '../../../shared/contracts/vehicle';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import {
  ICICI_BOOSTER_DEDUCTIBLES,
  ICICI_ELEVATE_SUMS,
  ICICI_HEALTH_NAMES,
  ICICI_MOTOR_ADDONS,
  type IciciApiHealthRun,
  type IciciApiMotorRun,
  type IciciHealthProduct,
} from '../../../shared/insurers/icici-api';
import { runQuote } from './run';

/**
 * Whether ICICI's Partner API is set up (an environment chosen, with its login saved). Until it
 * is, its quote sections are not shown: the advisor quotes ICICI through NYSA with the normal
 * portal sign-in (request of 23 November 2026).
 */
export function useIciciApiReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void window.fqf.iciciApi
      .status()
      .then((r) => {
        if (live) setReady(r.ok && r.data.mode !== null && r.data.saved[r.data.mode]);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

const lakh = (n: number) => `₹${(n / 100000).toLocaleString('en-IN')} lakh`;
type Result = QuoteRunResultView | { error: string } | null;

function ApiResult(props: { result: Result }): React.JSX.Element | null {
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
          <strong>₹{Number(result.premium.amount).toLocaleString('en-IN')}</strong> &mdash;{' '}
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
      {result.breakdown && result.breakdown.length > 0 && (
        <table className="breakdown">
          <tbody>
            {result.breakdown.map((b) => (
              <tr key={b.label}>
                <th scope="row">{b.label}</th>
                <td>{b.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const SETUP_NOTE = (
  <>
    Set up on the Insurer portals screen: ICICI Lombard &rarr; <strong>Partner API</strong> (UAT or
    Production, and the partner login). No portal needs to be open.
  </>
);

export function IciciApiMotorSection(props: { vehicle: VehicleSummary }): React.JSX.Element | null {
  const { vehicle } = props;
  const kind =
    vehicle.vehicleClass === 'private-car'
      ? '4w'
      : vehicle.vehicleClass === 'two-wheeler'
        ? '2w'
        : null;
  const renewal = vehicle.condition === 'pre-owned';
  const [cover, setCover] = useState<IciciApiMotorRun['cover']>('package');
  const [years, setYears] = useState<IciciApiMotorRun['years']>(1);
  const [used, setUsed] = useState(false);
  const [makeCode, setMakeCode] = useState('');
  const [modelCode, setModelCode] = useState('');
  const [rtoCode, setRtoCode] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [previousExpiry, setPreviousExpiry] = useState('');
  const [previousType, setPreviousType] = useState<'comprehensive' | 'tp'>('comprehensive');
  const [tpNumber, setTpNumber] = useState('');
  const [tpStart, setTpStart] = useState('');
  const [tpEnd, setTpEnd] = useState('');
  const [tpInsurer, setTpInsurer] = useState('');
  const [idv, setIdv] = useState<IciciApiMotorRun['idv']>('avg');
  const [addOns, setAddOns] = useState<string[]>([]);
  const [paCover, setPaCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  if (!kind) return null;
  const rollover = renewal && !used;
  const code = (v: string) => /^\d{1,9}$/.test(v.trim());
  const codes = [makeCode, modelCode, rtoCode];
  // Each code is a number or left empty; with none, the registration number is asked for.
  const codesOk = codes.every((c) => c.trim() === '' || code(c));
  const anyCode = codes.some((c) => c.trim() !== '');
  const ready =
    codesOk &&
    (anyCode || registrationNumber.trim() !== '') &&
    (!renewal || registrationNumber.trim() !== '') &&
    (!rollover || previousExpiry !== '') &&
    (cover !== 'own-damage' || (tpNumber && tpStart && tpEnd && tpInsurer));
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await runQuote({
      product: 'icici-api-motor',
      vehicleId: vehicle.id,
      insurerId: 'icici-lombard',
      run: {
        cover,
        years,
        used: renewal && used,
        ...(makeCode.trim() ? { makeCode: Number(makeCode) } : {}),
        ...(modelCode.trim() ? { modelCode: Number(modelCode) } : {}),
        ...(rtoCode.trim() ? { rtoCode: Number(rtoCode) } : {}),
        ...(registrationNumber.trim() ? { registrationNumber } : {}),
        ...(rollover ? { previous: { expiryDate: previousExpiry, type: previousType } } : {}),
        ...(cover === 'own-damage'
          ? {
              activeTp: {
                policyNumber: tpNumber,
                startDate: tpStart,
                endDate: tpEnd,
                insurerCode: tpInsurer,
              },
            }
          : {}),
        idv,
        addOns,
        hasExistingPaCover: paCover,
      },
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <>
      <p className="insurer-note">
        <strong>ICICI Lombard, motor by API.</strong> ICICI&rsquo;s documents ask for its make,
        model and RTO codes (its masters). They are optional here: with the registration number
        alone, ICICI&rsquo;s answer shows whether it finds the vehicle itself. {SETUP_NOTE}
      </p>
      <div className="form-grid">
        <label>
          Make code{' '}
          <input
            value={makeCode}
            onChange={(e) => setMakeCode(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label>
          Model code{' '}
          <input
            value={modelCode}
            onChange={(e) => setModelCode(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label>
          RTO code{' '}
          <input value={rtoCode} onChange={(e) => setRtoCode(e.target.value)} inputMode="numeric" />
        </label>
        <label>
          Registration number{renewal ? '' : ' (if known)'}{' '}
          <input
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder="MH01AB1234"
          />
        </label>
        {renewal && (
          <label>
            <input type="checkbox" checked={used} onChange={(e) => setUsed(e.target.checked)} />{' '}
            Bought used, without a running policy
          </label>
        )}
        <label>
          Cover{' '}
          <select
            value={cover}
            onChange={(e) => setCover(e.target.value as IciciApiMotorRun['cover'])}
          >
            <option value="package">Package (comprehensive)</option>
            {rollover && <option value="own-damage">Own damage only</option>}
            {rollover && <option value="liability">Third-party liability only</option>}
          </select>
        </label>
        {rollover && cover === 'package' && (
          <label>
            Term{' '}
            <select
              value={years}
              onChange={(e) => setYears(Number(e.target.value) as IciciApiMotorRun['years'])}
            >
              <option value={1}>1 year</option>
              <option value={2}>2 years</option>
              <option value={3}>3 years</option>
            </select>
          </label>
        )}
        {rollover && (
          <>
            <label>
              Previous policy ends{' '}
              <input
                type="date"
                value={previousExpiry}
                onChange={(e) => setPreviousExpiry(e.target.value)}
              />
            </label>
            <label>
              Previous policy type{' '}
              <select
                value={previousType}
                onChange={(e) => setPreviousType(e.target.value as 'comprehensive' | 'tp')}
              >
                <option value="comprehensive">Comprehensive</option>
                <option value="tp">Third party</option>
              </select>
            </label>
          </>
        )}
        {cover === 'own-damage' && (
          <>
            <label>
              Third-party policy number{' '}
              <input value={tpNumber} onChange={(e) => setTpNumber(e.target.value)} />
            </label>
            <label>
              Third-party policy from{' '}
              <input type="date" value={tpStart} onChange={(e) => setTpStart(e.target.value)} />
            </label>
            <label>
              to <input type="date" value={tpEnd} onChange={(e) => setTpEnd(e.target.value)} />
            </label>
            <label>
              Its insurer&rsquo;s ICICI code{' '}
              <input value={tpInsurer} onChange={(e) => setTpInsurer(e.target.value)} />
            </label>
          </>
        )}
        <label>
          IDV{' '}
          <select value={idv} onChange={(e) => setIdv(e.target.value as IciciApiMotorRun['idv'])}>
            <option value="avg">ICICI&rsquo;s middle IDV</option>
            <option value="min">ICICI&rsquo;s lowest IDV</option>
            <option value="max">ICICI&rsquo;s highest IDV</option>
            <option value="vehicle">The vehicle&rsquo;s saved IDV</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={paCover} onChange={(e) => setPaCover(e.target.checked)} />{' '}
          Owner already has a personal accident cover
        </label>
      </div>
      <fieldset className="addon-grid">
        <legend>Add-ons (ICICI decides which this vehicle can have)</legend>
        {Object.entries(ICICI_MOTOR_ADDONS[kind]).map(([key, name]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={addOns.includes(key)}
              onChange={(e) =>
                setAddOns(e.target.checked ? [...addOns, key] : addOns.filter((a) => a !== key))
              }
            />{' '}
            {name}
          </label>
        ))}
      </fieldset>
      <div className="insurer-actions">
        <button type="button" disabled={busy || !ready} onClick={() => void run()}>
          {busy ? 'Asking ICICI Lombard…' : 'Get ICICI Lombard premium (API)'}
        </button>
      </div>
      <ApiResult result={result} />
    </>
  );
}

export function IciciApiHealthPanel(props: { clientId: string }): React.JSX.Element {
  const [product, setProduct] = useState<IciciHealthProduct>('elevate');
  const [sumInsured, setSumInsured] = useState<number>(500000);
  const [deductible, setDeductible] = useState<number>(500000);
  const [tenure, setTenure] = useState(1);
  const [ped, setPed] = useState<'' | 'no' | 'yes'>('');
  const [paymentOption, setPaymentOption] = useState<IciciApiHealthRun['paymentOption']>('annual');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await runQuote({
      product: 'icici-api-health',
      clientId: props.clientId,
      insurerId: 'icici-lombard',
      run: {
        product,
        sumInsured,
        tenure,
        ...(product === 'activate-booster' ? { deductible } : {}),
        preExistingDisease: ped === 'yes',
        paymentOption,
      },
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  const sums =
    product === 'elevate' ? [...ICICI_ELEVATE_SUMS] : [500000, 1000000, 2000000, 2500000, 5000000];
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>ICICI Lombard, {ICICI_HEALTH_NAMES[product]}, by API.</strong> ICICI works the
        premium out for the client&rsquo;s members (dates of birth and genders are needed).{' '}
        {SETUP_NOTE}
      </p>
      <div className="form-grid">
        <label>
          Plan{' '}
          <select
            value={product}
            onChange={(e) => {
              const next = e.target.value as IciciHealthProduct;
              setProduct(next);
              if (next === 'elevate') setSumInsured(500000);
            }}
          >
            <option value="elevate">{ICICI_HEALTH_NAMES.elevate}</option>
            <option value="activate-booster">{ICICI_HEALTH_NAMES['activate-booster']}</option>
          </select>
        </label>
        <label>
          Sum insured{' '}
          <select value={sumInsured} onChange={(e) => setSumInsured(Number(e.target.value))}>
            {sums.map((s) => (
              <option key={s} value={s}>
                {lakh(s)}
              </option>
            ))}
          </select>
        </label>
        {product === 'activate-booster' && (
          <label>
            Deductible (base cover){' '}
            <select value={deductible} onChange={(e) => setDeductible(Number(e.target.value))}>
              {ICICI_BOOSTER_DEDUCTIBLES.map((d) => (
                <option key={d} value={d}>
                  {lakh(d)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Term{' '}
          <select value={tenure} onChange={(e) => setTenure(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y} year{y > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Payment{' '}
          <select
            value={paymentOption}
            onChange={(e) => setPaymentOption(e.target.value as IciciApiHealthRun['paymentOption'])}
          >
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </label>
        <label>
          Any member with a pre-existing disease?{' '}
          <select value={ped} onChange={(e) => setPed(e.target.value as '' | 'no' | 'yes')}>
            <option value="">Ask the client</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
      </div>
      <div className="insurer-actions">
        <button type="button" disabled={busy || ped === ''} onClick={() => void run()}>
          {busy ? 'Asking ICICI Lombard…' : 'Get ICICI Lombard premium (API)'}
        </button>
      </div>
      <ApiResult result={result} />
    </div>
  );
}
