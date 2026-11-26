// Saved vehicles, for motor quotes: kept on their own, not as part of a client (decision of
// 3 November 2026), encrypted on this computer until the advisor deletes them. Each vehicle has a
// name the advisor chooses and the details United India's Motor calculator asks for, and can be
// quoted from here ("Motor quote"): United India's premium, or (private cars and two-wheelers)
// New India's vehicle details filled in its quote form.
import { Car, Pencil, Tag, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { RecordPage, type RecordItem } from '../ui/RecordPage';
import { toast } from '../ui/toast';
import { isInsurerPaused } from '../../../shared/insurers/availability';
import { QuoteWorkspace } from '../quote/QuoteWorkspace';
import type { VehicleSummary } from '../../../shared/contracts/vehicle';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import {
  HDFC_MOTOR_NAMES,
  HDFC_PREVIOUS_INSURERS,
  hdfcProductFor,
  type HdfcMotorRun,
} from '../../../shared/insurers/hdfc';
import type { IciciMotorRun } from '../../../shared/insurers/icici';
import { showAppScreens } from '../insurers/PortalTabs';
import {
  EMPTY_VEHICLE,
  VEHICLE_CLASS_LABELS,
  VehicleFields,
  VehicleQuoteDetailsFields,
  NewIndiaFields,
  asksNewIndiaDetails,
  vehicleFromRecord,
  vehicleToInput,
  type VehicleDraft,
} from './VehicleFields';
import { runQuote } from '../quote/run';
import { useSavedQuoteDetails } from './saved-quote-details';
import { IciciApiMotorSection, useIciciApiReady } from '../quote/IciciApiPanels';

interface Draft {
  id: string | null;
  name: string;
  vehicle: VehicleDraft;
}

export function VehiclesPanel(): React.JSX.Element | null {
  const [vehicles, setVehicles] = useState<VehicleSummary[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** The quote workspace is open for this record. */
  const [quoting, setQuoting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.vehicles.list().catch(() => null);
    if (result?.ok) {
      setVehicles(result.data.vehicles);
      setError(null);
    } else if (result && result.error.code === 'UNSUPPORTED_FLOW') {
      // The automation features are switched off (FQF_INSURER_PORTALS=0): no vehicles screen.
      setHidden(true);
    } else {
      setError(result ? result.error.message : 'Vehicles could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (hidden) return null;

  const edit = async (summary: VehicleSummary) => {
    setError(null);
    const result = await window.fqf.vehicles.get(summary.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDraft({
      id: summary.id,
      name: result.data.saved.name,
      vehicle: vehicleFromRecord(result.data.saved.vehicle),
    });
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const result = await window.fqf.vehicles.delete(id);
    if (!result.ok) setError(result.error.message);
    else toast('Vehicle deleted.');
    await refresh();
  };
  const quoteFor = quoting ? (vehicles?.find((v) => v.id === quoting) ?? null) : null;
  const toDelete = confirmDelete ? vehicles?.find((v) => v.id === confirmDelete) : undefined;
  const items: RecordItem[] | null =
    vehicles?.map((v) => ({
      id: v.id,
      title: v.name,
      subtitle: 'Vehicle',
      icon: Car,
      hue: 2,
      meta: [{ icon: Tag, text: VEHICLE_CLASS_LABELS[v.vehicleClass] }],
      badge:
        v.condition === 'new'
          ? { label: 'New', tone: 'info' as const }
          : { label: 'Pre-owned', tone: 'neutral' as const },
      updatedAt: v.updatedAt,
      primary: { label: 'Motor quote', icon: Zap, onClick: () => setQuoting(v.id) },
      menu: [
        { label: 'Motor quote', icon: Zap, onSelect: () => setQuoting(v.id) },
        'separator',
        { label: 'Edit vehicle', icon: Pencil, onSelect: () => void edit(v) },
        {
          label: 'Delete vehicle',
          icon: Trash2,
          danger: true,
          onSelect: () => setConfirmDelete(v.id),
        },
      ],
      search: `${v.name} ${VEHICLE_CLASS_LABELS[v.vehicleClass]}`,
    })) ?? null;

  return (
    <RecordPage
      view="vehicles"
      icon={Car}
      title="Vehicles"
      subtitle="Saved vehicles for motor quotes, kept apart from clients and stored encrypted on this computer."
      noun={{ one: 'vehicle', many: 'vehicles' }}
      addLabel="Add vehicle"
      onAdd={() => setDraft({ id: null, name: '', vehicle: EMPTY_VEHICLE })}
      importKind="vehicles"
      onImported={() => void refresh()}
      items={items}
      failed={!vehicles && !!error}
      filters={[
        {
          id: 'new',
          label: 'New',
          test: (id) => vehicles?.find((v) => v.id === id)?.condition === 'new',
        },
        {
          id: 'pre-owned',
          label: 'Pre-owned',
          test: (id) => vehicles?.find((v) => v.id === id)?.condition !== 'new',
        },
      ]}
      empty={{
        icon: Car,
        title: 'No vehicles yet',
        text: isInsurerPaused('new-india')
          ? 'Add a vehicle to quote motor policies, or import a list.'
          : 'Add a vehicle to quote United India and New India motor policies, or import a list.',
      }}
      alerts={
        error && (
          <p className="error" role="alert">
            {error}
          </p>
        )
      }
    >
      <Modal
        open={draft !== null}
        title={draft?.id ? 'Edit vehicle' : 'New vehicle'}
        subtitle="Vehicle"
        onClose={() => setDraft(null)}
      >
        {draft && (
          <VehicleForm
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSaved={() => {
              toast(draft.id ? 'Vehicle updated.' : 'Vehicle saved.');
              setDraft(null);
              void refresh();
            }}
          />
        )}
      </Modal>
      <QuoteWorkspace
        open={quoteFor !== null}
        subject={quoteFor?.name ?? ''}
        options={[
          {
            key: 'motor',
            insurer: 'United India',
            label: 'Motor quote',
            description: isInsurerPaused('new-india')
              ? 'United India premium'
              : 'United India premium, and New India for new cars and two-wheelers',
          },
        ]}
        selected="motor"
        onSelect={() => undefined}
        onClose={() => setQuoting(null)}
      >
        {quoteFor && <MotorQuotePanel vehicle={quoteFor} />}
      </QuoteWorkspace>
      <ConfirmDialog
        open={toDelete !== undefined}
        title="Delete this vehicle?"
        message={`${toDelete?.name ?? 'The vehicle'} will be deleted from this computer. This cannot be undone.`}
        confirmLabel="Delete vehicle"
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </RecordPage>
  );
}

function VehicleForm(props: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { draft: d, onChange } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // As a health client's form (request of 26 November 2026): Basic details, Additional details.
  const [tab, setTab] = useState<'basic' | 'additional'>('basic');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await window.fqf.vehicles
      .save({
        ...(d.id ? { id: d.id } : {}),
        saved: { name: d.name.trim(), vehicle: vehicleToInput(d.vehicle) as never },
      })
      .catch(() => null);
    setBusy(false);
    if (result?.ok) props.onSaved();
    else {
      const paths =
        result?.ok === false
          ? ((result.error.details?.['issues'] as { path: string }[] | undefined) ?? []).map(
              (i) => i.path,
            )
          : [];
      // A quote detail (or New India's) not valid: its tab is shown.
      const inAdditional = paths.some((p) =>
        /quoteDetails|make|model|variant|manufactureYear|fuelType|bodyType|colour|engineNumber|chassisNumber|invoiceValueRupees/.test(
          p,
        ),
      );
      if (paths.length > 0) setTab(inAdditional ? 'additional' : 'basic');
      setError(
        result?.ok === false && result.error.code === 'VALIDATION_FAILED'
          ? inAdditional
            ? 'Check the Additional details: a detail is not valid (the registration number, email or 10-digit mobile).'
            : 'Check the vehicle details: a required detail is missing or not valid.'
          : (result?.error.message ?? 'The vehicle could not be saved.'),
      );
    }
  };

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
      <div className="form-tabs" role="tablist" aria-label="Vehicle details">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'basic'}
          onClick={() => setTab('basic')}
        >
          Basic details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'additional'}
          onClick={() => setTab('additional')}
        >
          Additional details
        </button>
      </div>
      {tab === 'basic' && (
        <>
          <label>
            Name (for you to find it, for example &ldquo;Swift &ndash; Ramesh&rdquo;)
            <input
              value={d.name}
              onChange={(e) => onChange({ ...d, name: e.target.value })}
              maxLength={100}
              required
            />
          </label>
          <VehicleFields value={d.vehicle} onChange={(vehicle) => onChange({ ...d, vehicle })} />
        </>
      )}
      {tab === 'additional' && (
        <>
          <VehicleQuoteDetailsFields
            value={d.vehicle}
            onChange={(patch) => onChange({ ...d, vehicle: { ...d.vehicle, ...patch } })}
          />
          {asksNewIndiaDetails(d.vehicle) && (
            <NewIndiaFields
              value={d.vehicle}
              onChange={(patch) => onChange({ ...d, vehicle: { ...d.vehicle, ...patch } })}
            />
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save vehicle'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Gets United India's motor premium for a saved vehicle. */
function MotorQuotePanel(props: { vehicle: VehicleSummary }): React.JSX.Element {
  const { vehicle } = props;
  const [busy, setBusy] = useState<'united-india' | 'new-india' | null>(null);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  // ICICI's Partner API section only once the API is set up; NYSA (normal sign-in) otherwise.
  const iciciApi = useIciciApiReady();
  const run = async (insurerId: 'united-india' | 'new-india') => {
    setBusy(insurerId);
    setResult(null);
    const r = await runQuote({ product: 'motor', vehicleId: vehicle.id, insurerId }).catch(
      () => null,
    );
    setBusy(null);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
    // A form kept for the advisor stays in front (Stop & make PDF); a saved PDF comes back here.
    if (r?.ok && r.data.pdf) showAppScreens();
  };
  // New India: the Private Car and Two Wheeler forms, new vehicles (src/main/quotes/nia-motor.ts).
  const newIndia =
    !isInsurerPaused('new-india') &&
    (vehicle.vehicleClass === 'private-car' || vehicle.vehicleClass === 'two-wheeler') &&
    vehicle.condition === 'new';
  const niaForm = vehicle.vehicleClass === 'private-car' ? 'Private Car' : 'Two Wheeler';
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>United India, motor (Package Policy).</strong> Sign in to United India and leave it
        on its home page. The app opens the Motor Premium Calculator, fills it for this vehicle and
        reads the premium.
      </p>
      <div className="insurer-actions">
        <button type="button" disabled={busy !== null} onClick={() => void run('united-india')}>
          {busy === 'united-india' ? 'Getting the premium…' : 'Get United India motor premium'}
        </button>
      </div>
      {newIndia && (
        <>
          <p className="insurer-note">
            <strong>New India, {niaForm}.</strong> Sign in to New India and leave it on its
            dashboard. The app opens the {niaForm} quote form and fills the vehicle details; you
            fill the policy holder and covers and press Calculate Premium.
          </p>
          <div className="insurer-actions">
            <button type="button" disabled={busy !== null} onClick={() => void run('new-india')}>
              {busy === 'new-india' ? 'Filling…' : 'Fill New India vehicle details'}
            </button>
          </div>
        </>
      )}
      <HdfcMotorSection vehicle={vehicle} />
      {iciciApi && <IciciApiMotorSection vehicle={vehicle} />}
      <IciciMotorSection vehicle={vehicle} />
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
            <ul>
              {result.toDo.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** HDFC ERGO: fills PIE's motor form for the vehicle and reads the premium (src/main/quotes/run-hdfc.ts). */
function HdfcMotorSection(props: { vehicle: VehicleSummary }): React.JSX.Element | null {
  const { vehicle } = props;
  const product = hdfcProductFor(vehicle.vehicleClass);
  const renewal = vehicle.condition === 'pre-owned';
  const twoOrCar = product === 'private-car' || product === 'two-wheeler';
  const [cover, setCover] = useState<HdfcMotorRun['cover']>('comprehensive');
  const [customerType, setCustomerType] = useState<HdfcMotorRun['customerType']>('individual');
  const [rtoCity, setRtoCity] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [previousInsurer, setPreviousInsurer] = useState('');
  const [previousEnd, setPreviousEnd] = useState('');
  const [previousType, setPreviousType] = useState<'comprehensive' | 'tp'>('comprehensive');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  // Started from the vehicle's saved quote details (its Additional details).
  useSavedQuoteDetails(vehicle.id, (q) => {
    if (q.cover) setCover(q.cover);
    if (q.rtoCity) setRtoCity(q.rtoCity);
    if (q.registrationNumber) setRegistrationNumber(q.registrationNumber);
    if (q.previousInsurer) setPreviousInsurer(q.previousInsurer);
    if (q.previousPolicyEnd) setPreviousEnd(q.previousPolicyEnd);
    if (q.previousPolicyType) setPreviousType(q.previousPolicyType);
    if (q.ownerName) setName(q.ownerName);
    if (q.ownerEmail) setEmail(q.ownerEmail);
    if (q.ownerMobile) setMobile(q.ownerMobile);
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  if (!product) return null;
  const ready =
    rtoCity.trim() !== '' &&
    name.trim() !== '' &&
    email.trim() !== '' &&
    mobile.trim() !== '' &&
    (!renewal || (registrationNumber.trim() !== '' && previousEnd !== ''));
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await runQuote({
      product: 'hdfc-motor',
      vehicleId: vehicle.id,
      insurerId: 'hdfc-ergo',
      run: {
        product,
        cover,
        customerType,
        rtoCity,
        ...(registrationNumber.trim() ? { registrationNumber } : {}),
        ...(renewal
          ? {
              previous: {
                endDate: previousEnd,
                policyType: previousType,
                ...(previousInsurer ? { insurer: previousInsurer } : {}),
              },
            }
          : {}),
        customer: { name, email, mobile },
      },
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
    if (r?.ok && r.data.pdf) showAppScreens();
  };
  return (
    <>
      <p className="insurer-note">
        <strong>HDFC ERGO, {HDFC_MOTOR_NAMES[product]} (PIE).</strong> Sign in to HDFC&rsquo;s 1up.
        From 1up&rsquo;s home page the app opens PIE itself (Issue Quotes &amp; Policy, then PIE
        Dashboard), then opens the {HDFC_MOTOR_NAMES[product]} form, fills it, presses Calculate
        Premium and reads the premium. It never presses Generate Quote. PIE asks the
        customer&rsquo;s name, email and mobile before it works the premium out; they are not saved.
      </p>
      <div className="form-grid">
        <label>
          Cover{' '}
          <select value={cover} onChange={(e) => setCover(e.target.value as HdfcMotorRun['cover'])}>
            <option value="comprehensive">Comprehensive</option>
            <option value="liability">Liability only</option>
            {twoOrCar && renewal && <option value="own-damage">Own damage only</option>}
          </select>
        </label>
        <label>
          Customer{' '}
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value as HdfcMotorRun['customerType'])}
          >
            <option value="individual">Individual</option>
            <option value="corporate">Corporate</option>
          </select>
        </label>
        <label>
          RTO / registration city{' '}
          <input
            value={rtoCity}
            onChange={(e) => setRtoCity(e.target.value)}
            placeholder="Ahmedabad"
          />
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
          <>
            <label>
              Previous insurer{' '}
              <select value={previousInsurer} onChange={(e) => setPreviousInsurer(e.target.value)}>
                <option value="">(leave as PIE sets it)</option>
                {HDFC_PREVIOUS_INSURERS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Previous policy ends{' '}
              <input
                type="date"
                value={previousEnd}
                onChange={(e) => setPreviousEnd(e.target.value)}
              />
            </label>
            <label>
              Previous policy type{' '}
              <select
                value={previousType}
                onChange={(e) => setPreviousType(e.target.value as 'comprehensive' | 'tp')}
              >
                <option value="comprehensive">Comprehensive</option>
                <option value="tp">Third party (TP)</option>
              </select>
            </label>
          </>
        )}
        <label>
          Customer name <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Mobile <input value={mobile} onChange={(e) => setMobile(e.target.value)} maxLength={10} />
        </label>
      </div>
      <div className="insurer-actions">
        <button type="button" disabled={busy || !ready} onClick={() => void run()}>
          {busy ? 'Working on PIE…' : 'Get HDFC ERGO premium'}
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
            <ul>
              {result.toDo.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/**
 * ICICI Lombard: NYSA's motor quote for a registered vehicle (renewal), by its registration number:
 * ICICI reads the vehicle from Vahan itself (src/main/quotes/run-icici-motor.ts). A new vehicle is
 * taken to NYSA's form with New Business chosen and handed to the advisor (not recorded further).
 */
function IciciMotorSection(props: { vehicle: VehicleSummary }): React.JSX.Element {
  const { vehicle } = props;
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [ownershipChanged, setOwnershipChanged] = useState(false);
  const [idv, setIdv] = useState<IciciMotorRun['idv']>('insurer');
  // Started from the vehicle's saved quote details (its Additional details).
  useSavedQuoteDetails(vehicle.id, (q) => {
    if (q.registrationNumber) setRegistrationNumber(q.registrationNumber);
    if (q.iciciIdv) setIdv(q.iciciIdv);
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const isNew = vehicle.condition === 'new';
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await runQuote({
      product: 'icici-motor',
      vehicleId: vehicle.id,
      insurerId: 'icici-lombard',
      run: {
        ...(!isNew || registrationNumber.trim() ? { registrationNumber } : {}),
        ownershipChanged,
        idv,
      },
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
    if (r?.ok && r.data.pdf) showAppScreens();
  };
  return (
    <>
      {isNew ? (
        <p className="insurer-note">
          <strong>ICICI Lombard, motor (NYSA, New Business).</strong> Sign in to ICICI Lombard. The
          app opens Motor and chooses New Business, then hands the form to you: ICICI&rsquo;s New
          Business form has not been recorded yet, so fill the vehicle&rsquo;s details on NYSA, get
          the premium, and press Stop &amp; make PDF. It never presses Buy Now.
        </p>
      ) : (
        <p className="insurer-note">
          <strong>ICICI Lombard, motor (NYSA, Rollover).</strong> Sign in to ICICI Lombard and leave
          it on its dashboard. The app opens Motor, enters the registration number, presses Fetch
          Vehicle Data (ICICI reads the vehicle from Vahan) and reads the Total Premium. It never
          presses Buy Now.
        </p>
      )}
      {!isNew && (
        <div className="form-grid">
          <label>
            Registration number{' '}
            <input
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder="MH01AB1234"
            />
          </label>
          <label>
            Ownership changed in the last year{' '}
            <select
              value={ownershipChanged ? 'yes' : 'no'}
              onChange={(e) => setOwnershipChanged(e.target.value === 'yes')}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label>
            IDV{' '}
            <select value={idv} onChange={(e) => setIdv(e.target.value as IciciMotorRun['idv'])}>
              <option value="insurer">ICICI&rsquo;s own IDV</option>
              <option value="vehicle">The vehicle&rsquo;s saved IDV</option>
            </select>
          </label>
        </div>
      )}
      <div className="insurer-actions">
        <button
          type="button"
          disabled={busy || (!isNew && registrationNumber.trim() === '')}
          onClick={() => void run()}
        >
          {busy
            ? 'Working on NYSA…'
            : isNew
              ? 'Open ICICI Lombard New Business'
              : 'Get ICICI Lombard premium'}
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
              Total premium: <strong>₹{result.premium.amount}</strong> &mdash;{' '}
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
        </div>
      )}
    </>
  );
}
