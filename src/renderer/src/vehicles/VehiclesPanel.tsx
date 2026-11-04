// Saved vehicles, for motor quotes: kept on their own, not as part of a client (decision of
// 3 November 2026), encrypted on this computer until the advisor deletes them. Each vehicle has a
// name the advisor chooses and the details United India's Motor calculator asks for, and can be
// quoted from here ("Motor quote"): United India's premium, or (private cars and two-wheelers)
// New India's vehicle details filled in its quote form.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { ImportButton } from '../import/ImportDialog';
import type { VehicleSummary } from '../../../shared/contracts/vehicle';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import { showAppScreens } from '../insurers/PortalTabs';
import {
  EMPTY_VEHICLE,
  VEHICLE_CLASS_LABELS,
  VehicleFields,
  vehicleFromRecord,
  vehicleToInput,
  type VehicleDraft,
} from './VehicleFields';

interface Draft {
  id: string | null;
  name: string;
  vehicle: VehicleDraft;
}

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function VehiclesPanel(): React.JSX.Element | null {
  const [vehicles, setVehicles] = useState<VehicleSummary[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [quoting, setQuoting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.vehicles.list().catch(() => null);
    if (result?.ok) {
      setVehicles(result.data.vehicles);
      setError(null);
    } else if (result && result.error.code === 'UNSUPPORTED_FLOW') {
      // The automation features are off (FQF_INSURER_PORTALS): no vehicles screen.
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
    await refresh();
  };

  return (
    <section className="panel insurers" aria-labelledby="vehicles-heading">
      <h2 id="vehicles-heading">Vehicles</h2>
      <p className="lead">
        Saved vehicles are used for motor quotes. They are kept on their own, not as part of a
        client, stored encrypted on this computer until you delete them.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {vehicles && (
        <div className="insurer-actions">
          <button
            type="button"
            className="primary"
            onClick={() => setDraft({ id: null, name: '', vehicle: EMPTY_VEHICLE })}
          >
            Add vehicle
          </button>
          <ImportButton kind="vehicles" onImported={() => void refresh()} />
        </div>
      )}
      <Modal
        open={draft !== null}
        title={draft?.id ? 'Edit vehicle' : 'New vehicle'}
        onClose={() => setDraft(null)}
      >
        {draft && (
          <VehicleForm
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSaved={() => {
              setDraft(null);
              void refresh();
            }}
          />
        )}
      </Modal>
      {vehicles && vehicles.length > 0 && (
        <ul className="insurer-list">
          {vehicles.map((v) => (
            <li key={v.id} className="insurer-row">
              <div className="insurer-main">
                <div>
                  <strong>{v.name}</strong>
                  <span className="insurer-mode">
                    {VEHICLE_CLASS_LABELS[v.vehicleClass]} ·{' '}
                    {v.condition === 'new' ? 'new' : 'pre-owned'} · updated{' '}
                    {relativeDate(v.updatedAt)}
                  </span>
                </div>
                <div className="insurer-actions">
                  <button type="button" onClick={() => setQuoting(quoting === v.id ? null : v.id)}>
                    Motor quote
                  </button>
                  <button type="button" onClick={() => void edit(v)}>
                    Edit
                  </button>
                  {confirmDelete === v.id ? (
                    <>
                      <button type="button" className="danger" onClick={() => void remove(v.id)}>
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="danger" onClick={() => setConfirmDelete(v.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {quoting === v.id && <MotorQuotePanel vehicle={v} />}
            </li>
          ))}
        </ul>
      )}
    </section>
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
    else
      setError(
        result?.ok === false && result.error.code === 'VALIDATION_FAILED'
          ? 'Check the vehicle details: a required detail is missing or not valid.'
          : (result?.error.message ?? 'The vehicle could not be saved.'),
      );
  };

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
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
  const run = async (insurerId: 'united-india' | 'new-india') => {
    setBusy(insurerId);
    setResult(null);
    const r = await window.fqf.quotes
      .run({ product: 'motor', vehicleId: vehicle.id, insurerId })
      .catch(() => null);
    setBusy(null);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
    // The premium is shown here: come back from the calculator's tab (left open to check it).
    if (r?.ok && r.data.premium) showAppScreens();
  };
  // New India: the Private Car and Two Wheeler forms, new vehicles (src/main/quotes/nia-motor.ts).
  const newIndia =
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
