// Property clients, for New India's fire forms: an owner (a person or a business, as a marine
// client) and their home or business premises, kept apart from the other clients (decision of 4
// November 2026) and encrypted on this computer until the advisor deletes them.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import {
  CLAIM_RATIOS,
  type PropertyClientRaw,
  type PropertySummary,
  type RiskAnswers,
} from '../../../shared/contracts/property';
import {
  NIA_FIRE_COVERS,
  NIA_FIRE_FORM_NAMES,
  NIA_FIRE_FORMS,
  NIA_FIRE_HOME_FORMS,
  type NiaFireCover,
  type NiaFireForm,
} from '../../../shared/insurers/nia-fire';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import {
  EMPTY_HOLDER,
  HolderFields,
  holderFromRecord,
  holderToInput,
  type HolderDraft,
} from '../marine/MarinePanel';

type Tri = '' | 'yes' | 'no';
const RISK_LABELS: Record<keyof RiskAnswers, string> = {
  lift: 'Lift / elevator',
  inBasement: 'The insured risk is in the basement',
  fireProtection: 'Operational fire hydrant, sprinkler, alarm or smoke detectors',
  electricalWellMaintained: 'Electrical installations well maintained',
  stormWaterDrain: 'Storm water drain, plinth above flood level',
  security24x7: 'Security guards 24 x 7 and CCTV',
  basementUsedForOperations: 'Basement used for operations or storage',
  nearWaterBody: 'Within 1 km of the sea, a river or a lake',
  noFireBrigadeAccess: 'Thickly populated, no access for the fire brigade',
  centralAC: 'Centrally air-conditioned',
  unoccupied30Days: 'Unoccupied for more than 30 days',
  mortgaged: 'Mortgaged',
  pastFireLoss: 'Past losses from fire or allied perils',
  insuredBefore: 'Insured against fire before',
};
const RISK_KEYS = Object.keys(RISK_LABELS) as (keyof RiskAnswers)[];

interface PropertyDraft {
  use: 'home' | 'business';
  buildingName: string;
  landmark: string;
  address: string;
  pincode: string;
  walls: '' | 'pucca' | 'kutcha';
  floor: '' | 'pucca' | 'kutcha';
  roof: '' | 'pucca' | 'kutcha';
  yearOfConstruction: string;
  floors: string;
  occupancyFloor: string;
  heightMeters: string;
  carpetAreaSqm: string;
  constructionRatePerSqm: string;
  buildingSumInsured: string;
  furnitureSumInsured: string;
  electricalSumInsured: string;
  otherContentsSumInsured: string;
  otherContentsDescription: string;
  plantMachinerySumInsured: string;
  stocksSumInsured: string;
  stocksDescription: string;
  industry: string;
  claimRatio: '' | (typeof CLAIM_RATIOS)[number];
  maxClaimRatioPercent: string;
  fireProtectionDetails: string;
  fireBrigadeDistanceKm: string;
  fireBrigadeMinutes: string;
  risks: Record<keyof RiskAnswers, Tri>;
}
const EMPTY_PROPERTY: PropertyDraft = {
  use: 'home',
  buildingName: '',
  landmark: '',
  address: '',
  pincode: '',
  walls: '',
  floor: '',
  roof: '',
  yearOfConstruction: '',
  floors: '',
  occupancyFloor: '',
  heightMeters: '',
  carpetAreaSqm: '',
  constructionRatePerSqm: '',
  buildingSumInsured: '',
  furnitureSumInsured: '',
  electricalSumInsured: '',
  otherContentsSumInsured: '',
  otherContentsDescription: '',
  plantMachinerySumInsured: '',
  stocksSumInsured: '',
  stocksDescription: '',
  industry: '',
  claimRatio: '',
  maxClaimRatioPercent: '',
  fireProtectionDetails: '',
  fireBrigadeDistanceKm: '',
  fireBrigadeMinutes: '',
  risks: Object.fromEntries(RISK_KEYS.map((k) => [k, ''])) as Record<keyof RiskAnswers, Tri>,
};

interface Draft {
  holder: HolderDraft;
  property: PropertyDraft;
}

const num = (v: string) => (v.trim() ? Number(v.replace(/[,\s]/g, '')) : undefined);
const txt = (v: string) => (v.trim() ? v.trim() : undefined);
const strip = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

function toInput(d: Draft): PropertyClientRaw {
  const p = d.property;
  return {
    holder: holderToInput(d.holder),
    property: {
      ...strip({
        buildingName: txt(p.buildingName),
        landmark: txt(p.landmark),
        walls: p.walls || undefined,
        floor: p.floor || undefined,
        roof: p.roof || undefined,
        yearOfConstruction: num(p.yearOfConstruction),
        floors: num(p.floors),
        occupancyFloor: num(p.occupancyFloor),
        heightMeters: num(p.heightMeters),
        carpetAreaSqm: num(p.carpetAreaSqm),
        constructionRatePerSqm: num(p.constructionRatePerSqm),
        buildingSumInsured: num(p.buildingSumInsured),
        furnitureSumInsured: num(p.furnitureSumInsured),
        electricalSumInsured: num(p.electricalSumInsured),
        otherContentsSumInsured: num(p.otherContentsSumInsured),
        otherContentsDescription: txt(p.otherContentsDescription),
        plantMachinerySumInsured: num(p.plantMachinerySumInsured),
        stocksSumInsured: num(p.stocksSumInsured),
        stocksDescription: txt(p.stocksDescription),
        industry: txt(p.industry),
        claimRatio: p.claimRatio || undefined,
        maxClaimRatioPercent: num(p.maxClaimRatioPercent),
        fireProtectionDetails: txt(p.fireProtectionDetails),
        fireBrigadeDistanceKm: num(p.fireBrigadeDistanceKm),
        fireBrigadeMinutes: num(p.fireBrigadeMinutes),
      }),
      use: p.use,
      address: p.address.trim(),
      pincode: p.pincode,
      risks: strip(
        Object.fromEntries(
          RISK_KEYS.map((k) => [k, p.risks[k] === '' ? undefined : p.risks[k] === 'yes']),
        ),
      ),
    },
  };
}

export function PropertyPanel(): React.JSX.Element | null {
  const [list, setList] = useState<PropertySummary[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.properties.list().catch(() => null);
    if (result?.ok) {
      setList(result.data.properties);
      setError(null);
    } else if (result && result.error.code === 'UNSUPPORTED_FLOW') {
      setHidden(true);
    } else {
      setError(result ? result.error.message : 'Property clients could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (hidden) return null;

  const edit = async (summary: PropertySummary) => {
    setError(null);
    const result = await window.fqf.properties.get(summary.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const { holder, property: p } = result.data.property;
    const s = (v: number | string | undefined) => (v === undefined ? '' : String(v));
    setEditId(summary.id);
    setDraft({
      holder: holderFromRecord(holder, summary.id),
      property: {
        use: p.use,
        buildingName: s(p.buildingName),
        landmark: s(p.landmark),
        address: p.address,
        pincode: p.pincode,
        walls: p.walls ?? '',
        floor: p.floor ?? '',
        roof: p.roof ?? '',
        yearOfConstruction: s(p.yearOfConstruction),
        floors: s(p.floors),
        occupancyFloor: s(p.occupancyFloor),
        heightMeters: s(p.heightMeters),
        carpetAreaSqm: s(p.carpetAreaSqm),
        constructionRatePerSqm: s(p.constructionRatePerSqm),
        buildingSumInsured: s(p.buildingSumInsured),
        furnitureSumInsured: s(p.furnitureSumInsured),
        electricalSumInsured: s(p.electricalSumInsured),
        otherContentsSumInsured: s(p.otherContentsSumInsured),
        otherContentsDescription: s(p.otherContentsDescription),
        plantMachinerySumInsured: s(p.plantMachinerySumInsured),
        stocksSumInsured: s(p.stocksSumInsured),
        stocksDescription: s(p.stocksDescription),
        industry: s(p.industry),
        claimRatio: p.claimRatio ?? '',
        maxClaimRatioPercent: s(p.maxClaimRatioPercent),
        fireProtectionDetails: s(p.fireProtectionDetails),
        fireBrigadeDistanceKm: s(p.fireBrigadeDistanceKm),
        fireBrigadeMinutes: s(p.fireBrigadeMinutes),
        risks: Object.fromEntries(
          RISK_KEYS.map((k) => [k, p.risks[k] === undefined ? '' : p.risks[k] ? 'yes' : 'no']),
        ) as Record<keyof RiskAnswers, Tri>,
      },
    });
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const result = await window.fqf.properties.delete(id);
    if (!result.ok) setError(result.error.message);
    await refresh();
  };

  return (
    <section className="panel insurers" aria-labelledby="property-heading">
      <h2 id="property-heading">Property clients</h2>
      <p className="lead">
        Property clients are for New India&rsquo;s fire forms: an owner (a person or a business) and
        their home or business premises, with its sums insured and the answers to the fire
        forms&rsquo; questions. They are stored encrypted on this computer until you delete them.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {list && (
        <div className="insurer-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              setEditId(null);
              setDraft({
                holder: { ...EMPTY_HOLDER, kind: 'individual' },
                property: EMPTY_PROPERTY,
              });
            }}
          >
            Add property client
          </button>
        </div>
      )}
      <Modal
        open={draft !== null}
        title={editId ? 'Edit property client' : 'New property client'}
        onClose={() => setDraft(null)}
      >
        {draft && (
          <PropertyForm
            id={editId}
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
      {list && list.length > 0 && (
        <ul className="insurer-list">
          {list.map((p) => (
            <li key={p.id} className="insurer-row">
              <div className="insurer-main">
                <div>
                  <strong>{p.name}</strong>
                  <span className="insurer-mode">
                    {p.use === 'home' ? 'Home' : 'Business premises'} · pincode {p.pincode}
                  </span>
                </div>
                <div className="insurer-actions">
                  <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    New India fire quote
                  </button>
                  <button type="button" onClick={() => void edit(p)}>
                    Edit
                  </button>
                  {confirmDelete === p.id ? (
                    <>
                      <button type="button" className="danger" onClick={() => void remove(p.id)}>
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="danger" onClick={() => setConfirmDelete(p.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {open === p.id && <NiaFirePanel propertyId={p.id} use={p.use} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Num(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
  required?: boolean;
}): React.JSX.Element {
  return (
    <label>
      {props.label}
      <input
        value={props.value}
        onChange={(e) =>
          props.onChange(e.target.value.replace(props.decimal ? /[^\d.]/g : /\D/g, ''))
        }
        inputMode={props.decimal ? 'decimal' : 'numeric'}
        maxLength={14}
        required={props.required}
      />
    </label>
  );
}

function PropertyForm(props: {
  id: string | null;
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { draft: d, onChange } = props;
  const p = d.property;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<PropertyDraft>) => onChange({ ...d, property: { ...p, ...patch } });
  const isHome = p.use === 'home';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await window.fqf.properties
      .save({ ...(props.id ? { id: props.id } : {}), property: toInput(d) })
      .catch(() => null);
    setBusy(false);
    if (result?.ok) props.onSaved();
    else {
      const fields =
        result?.ok === false
          ? (result.error.details?.['issues'] as { path: string }[] | undefined)
          : undefined;
      setError(
        fields?.length
          ? `Check these details: ${[...new Set(fields.map((f) => f.path.replace(/^property\./, '')))].join(', ')}.`
          : (result?.error.message ?? 'The property client could not be saved.'),
      );
    }
  };
  const construction = (key: 'walls' | 'floor' | 'roof', label: string) => (
    <label>
      {label}
      <select
        value={p[key]}
        onChange={(e) => set({ [key]: e.target.value as PropertyDraft['walls'] })}
      >
        <option value="">Not given</option>
        <option value="pucca">Pucca</option>
        <option value="kutcha">Kutcha</option>
      </select>
    </label>
  );

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
      <fieldset>
        <legend>Owner</legend>
        <HolderFields draft={d.holder} onChange={(holder) => onChange({ ...d, holder })} />
      </fieldset>
      <fieldset>
        <legend>Property</legend>
        <label>
          Property
          <select
            value={p.use}
            onChange={(e) => set({ use: e.target.value as PropertyDraft['use'] })}
          >
            <option value="home">A home</option>
            <option value="business">Business premises</option>
          </select>
        </label>
        <div className="member-row">
          <label>
            Building name
            <input
              value={p.buildingName}
              onChange={(e) => set({ buildingName: e.target.value })}
              maxLength={100}
            />
          </label>
          <label>
            Nearby landmark
            <input
              value={p.landmark}
              onChange={(e) => set({ landmark: e.target.value })}
              maxLength={100}
            />
          </label>
        </div>
        <div className="member-row">
          <label>
            Address
            <input
              value={p.address}
              onChange={(e) => set({ address: e.target.value })}
              maxLength={200}
              required
            />
          </label>
          <label>
            Pincode
            <input
              value={p.pincode}
              onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              maxLength={6}
              required
            />
          </label>
        </div>
        <div className="member-row">
          {construction('walls', 'Walls')}
          {construction('floor', 'Floor')}
          {construction('roof', 'Roof')}
        </div>
        <div className="member-row">
          <Num
            label="Year built"
            value={p.yearOfConstruction}
            onChange={(v) => set({ yearOfConstruction: v })}
          />
          <Num label="Floors" value={p.floors} onChange={(v) => set({ floors: v })} />
          <Num
            label="On floor (0 = ground)"
            value={p.occupancyFloor}
            onChange={(v) => set({ occupancyFloor: v })}
          />
          <Num
            label="Height (m)"
            value={p.heightMeters}
            onChange={(v) => set({ heightMeters: v })}
            decimal
          />
        </div>
        {!isHome && (
          <label>
            Type of industry / occupation (as New India lists it, for example Offices or Shops)
            <input
              value={p.industry}
              onChange={(e) => set({ industry: e.target.value })}
              maxLength={120}
            />
          </label>
        )}
      </fieldset>
      <fieldset>
        <legend>Sums insured (₹)</legend>
        {isHome && (
          <div className="member-row">
            <Num
              label="Carpet area (sq. m)"
              value={p.carpetAreaSqm}
              onChange={(v) => set({ carpetAreaSqm: v })}
              decimal
            />
            <Num
              label="Construction cost (₹ per sq. m)"
              value={p.constructionRatePerSqm}
              onChange={(v) => set({ constructionRatePerSqm: v })}
            />
          </div>
        )}
        <div className="member-row">
          <Num
            label="Building"
            value={p.buildingSumInsured}
            onChange={(v) => set({ buildingSumInsured: v })}
          />
          <Num
            label="Furniture, fixtures, fittings"
            value={p.furnitureSumInsured}
            onChange={(v) => set({ furnitureSumInsured: v })}
          />
          <Num
            label="Electrical / electronic"
            value={p.electricalSumInsured}
            onChange={(v) => set({ electricalSumInsured: v })}
          />
        </div>
        <div className="member-row">
          <Num
            label="Other contents"
            value={p.otherContentsSumInsured}
            onChange={(v) => set({ otherContentsSumInsured: v })}
          />
          <label>
            Other contents, described
            <input
              value={p.otherContentsDescription}
              onChange={(e) => set({ otherContentsDescription: e.target.value })}
              maxLength={200}
            />
          </label>
        </div>
        {!isHome && (
          <div className="member-row">
            <Num
              label="Plant and machinery"
              value={p.plantMachinerySumInsured}
              onChange={(v) => set({ plantMachinerySumInsured: v })}
            />
            <Num
              label="Stocks"
              value={p.stocksSumInsured}
              onChange={(v) => set({ stocksSumInsured: v })}
            />
            <label>
              Stocks, described
              <input
                value={p.stocksDescription}
                onChange={(e) => set({ stocksDescription: e.target.value })}
                maxLength={200}
              />
            </label>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Risk questions</legend>
        {RISK_KEYS.map((k) => (
          <label key={k}>
            {RISK_LABELS[k]}
            <select
              value={p.risks[k]}
              onChange={(e) => set({ risks: { ...p.risks, [k]: e.target.value as Tri } })}
            >
              <option value="">Not given</option>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
        ))}
        <div className="member-row">
          <label>
            Past 3 years claims ratio
            <select
              value={p.claimRatio}
              onChange={(e) => set({ claimRatio: e.target.value as PropertyDraft['claimRatio'] })}
            >
              <option value="">Not given</option>
              {CLAIM_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <Num
            label="Maximum ICR, last 3 years (%)"
            value={p.maxClaimRatioPercent}
            onChange={(v) => set({ maxClaimRatioPercent: v })}
            decimal
          />
        </div>
        <label>
          Fire protection details
          <input
            value={p.fireProtectionDetails}
            onChange={(e) => set({ fireProtectionDetails: e.target.value })}
            maxLength={200}
          />
        </label>
        <div className="member-row">
          <Num
            label="Fire brigade distance (km)"
            value={p.fireBrigadeDistanceKm}
            onChange={(v) => set({ fireBrigadeDistanceKm: v })}
            decimal
          />
          <Num
            label="Fire brigade response (minutes)"
            value={p.fireBrigadeMinutes}
            onChange={(v) => set({ fireBrigadeMinutes: v })}
          />
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save property client'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Fills one of New India's fire forms for a property client, stopping before the premium. */
function NiaFirePanel(props: { propertyId: string; use: 'home' | 'business' }): React.JSX.Element {
  const forms = NIA_FIRE_FORMS.filter(
    (f) =>
      f === 'sfsp' || f === 'war' || NIA_FIRE_HOME_FORMS.includes(f) === (props.use === 'home'),
  );
  const [form, setForm] = useState<NiaFireForm>(forms[0]!);
  const [cover, setCover] = useState<NiaFireCover>('building-contents');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const covers = (Object.keys(NIA_FIRE_COVERS) as NiaFireCover[]).filter(
    (c) => props.use === 'business' || c !== 'building-contents-stocks',
  );

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        product: 'nia-fire',
        propertyId: props.propertyId,
        insurerId: 'new-india',
        run: { form, cover },
      })
      .catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };

  return (
    <form className="quote-panel login-form" onSubmit={(e) => void run(e)}>
      <p className="insurer-note">
        <strong>New India, fire quote.</strong> Sign in to New India and leave it on its dashboard
        (or open the form yourself). The app opens the form&rsquo;s sections and fills the owner and
        property, then stops. When New India asks whether the client has a PAN, answer it on its
        page and press Fill again. It never presses Save &amp; Calculate Premium.
      </p>
      <div className="member-row">
        <label>
          Policy
          <select value={form} onChange={(e) => setForm(e.target.value as NiaFireForm)}>
            {forms.map((f) => (
              <option key={f} value={f}>
                {NIA_FIRE_FORM_NAMES[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cover
          <select value={cover} onChange={(e) => setCover(e.target.value as NiaFireCover)}>
            {covers.map((c) => (
              <option key={c} value={c}>
                {NIA_FIRE_COVERS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Filling New India…' : `Fill ${NIA_FIRE_FORM_NAMES[form]} form`}
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
              {result.problems.map((x) => (
                <li key={x}>{x}</li>
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
