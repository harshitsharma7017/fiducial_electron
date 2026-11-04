// Marine clients, for New India's Marine Specific Voyage form: the policy holder of a voyage (a
// business or an individual), kept apart from the other clients (decision of 4 November 2026) and
// encrypted on this computer until the advisor deletes them. The shipment is entered for each
// quote and not saved.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import type { Gender, MaritalStatus } from '../../../shared/contracts/client';
import {
  NIA_ORGANISATION_TYPES,
  type MarineClientRaw,
  type MarineSummary,
} from '../../../shared/contracts/marine';
import {
  NIA_BILL_TYPES,
  NIA_CARGO_TYPES,
  NIA_EXCESS_ON,
  NIA_TRANSIT_CLAUSES,
  NIA_TRANSIT_TYPES,
  NIA_TRANSPORT_MODES,
  NIA_VOYAGE_TYPES,
} from '../../../shared/insurers/nia-marine';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import { MARITAL_LABELS } from '../clients/proposal-fields';

type OrgType = (typeof NIA_ORGANISATION_TYPES)[number];

interface Draft {
  id: string | null;
  kind: 'organization' | 'individual';
  name: string;
  phone: string;
  email: string;
  notes: string;
  pincode: string;
  address: string;
  pan: string;
  dateOfBirth: string;
  gender: Gender | '';
  maritalStatus: MaritalStatus | '';
  registrationNo: string;
  registrationDate: string;
  msme: '' | 'yes' | 'no';
  organisationType: OrgType | '';
}
const EMPTY: Draft = {
  id: null,
  kind: 'organization',
  name: '',
  phone: '',
  email: '',
  notes: '',
  pincode: '',
  address: '',
  pan: '',
  dateOfBirth: '',
  gender: '',
  maritalStatus: '',
  registrationNo: '',
  registrationDate: '',
  msme: '',
  organisationType: '',
};

const text = (v: string) => (v.trim() ? v.trim() : undefined);
const opt = <K extends string>(key: K, v: string | undefined) => (v ? { [key]: v } : {});

function toInput(d: Draft): MarineClientRaw {
  const common = {
    customer: {
      name: d.name.trim(),
      ...opt('phone', text(d.phone)),
      ...opt('email', text(d.email)),
      ...opt('notes', text(d.notes)),
    },
    pincode: d.pincode,
    ...opt('address', text(d.address)),
    ...opt('pan', text(d.pan)),
  };
  return d.kind === 'organization'
    ? {
        kind: 'organization',
        ...common,
        ...opt('registrationNo', text(d.registrationNo)),
        ...opt('registrationDate', d.registrationDate),
        ...(d.msme ? { msme: d.msme === 'yes' } : {}),
        ...(d.organisationType ? { organisationType: d.organisationType } : {}),
      }
    : {
        kind: 'individual',
        ...common,
        ...opt('dateOfBirth', d.dateOfBirth),
        ...(d.gender ? { gender: d.gender } : {}),
        ...(d.maritalStatus ? { maritalStatus: d.maritalStatus } : {}),
      };
}

export function MarinePanel(): React.JSX.Element | null {
  const [list, setList] = useState<MarineSummary[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.marine.list().catch(() => null);
    if (result?.ok) {
      setList(result.data.marine);
      setError(null);
    } else if (result && result.error.code === 'UNSUPPORTED_FLOW') {
      setHidden(true);
    } else {
      setError(result ? result.error.message : 'Marine clients could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (hidden) return null;

  const edit = async (summary: MarineSummary) => {
    setError(null);
    const result = await window.fqf.marine.get(summary.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const m = result.data.marine;
    setDraft({
      id: summary.id,
      kind: m.kind,
      name: m.customer.name,
      phone: m.customer.phone ?? '',
      email: m.customer.email ?? '',
      notes: m.customer.notes ?? '',
      pincode: m.pincode,
      address: m.address ?? '',
      pan: m.pan ?? '',
      dateOfBirth: m.dateOfBirth ?? '',
      gender: m.gender ?? '',
      maritalStatus: m.maritalStatus ?? '',
      registrationNo: m.registrationNo ?? '',
      registrationDate: m.registrationDate ?? '',
      msme: m.msme === undefined ? '' : m.msme ? 'yes' : 'no',
      organisationType: m.organisationType ?? '',
    });
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const result = await window.fqf.marine.delete(id);
    if (!result.ok) setError(result.error.message);
    await refresh();
  };

  return (
    <section className="panel insurers" aria-labelledby="marine-heading">
      <h2 id="marine-heading">Marine clients</h2>
      <p className="lead">
        Marine clients are the policy holders of voyages (a business or a person), for New
        India&rsquo;s Specific Voyage form. They are stored encrypted on this computer until you
        delete them; each shipment is entered when you quote it.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {list && (
        <div className="insurer-actions">
          <button type="button" className="primary" onClick={() => setDraft({ ...EMPTY })}>
            Add marine client
          </button>
        </div>
      )}
      <Modal
        open={draft !== null}
        title={draft?.id ? 'Edit marine client' : 'New marine client'}
        onClose={() => setDraft(null)}
      >
        {draft && (
          <MarineForm
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
          {list.map((m) => (
            <li key={m.id} className="insurer-row">
              <div className="insurer-main">
                <div>
                  <strong>{m.name}</strong>
                  <span className="insurer-mode">
                    {m.kind === 'organization' ? 'Business' : 'Individual'} · pincode {m.pincode}
                  </span>
                </div>
                <div className="insurer-actions">
                  <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)}>
                    New India Specific Voyage quote
                  </button>
                  <button type="button" onClick={() => void edit(m)}>
                    Edit
                  </button>
                  {confirmDelete === m.id ? (
                    <>
                      <button type="button" className="danger" onClick={() => void remove(m.id)}>
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="danger" onClick={() => setConfirmDelete(m.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {open === m.id && <NiaMarinePanel marineId={m.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MarineForm(props: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { draft: d, onChange } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const business = d.kind === 'organization';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await window.fqf.marine
      .save({ ...(d.id ? { id: d.id } : {}), marine: toInput(d) })
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
          ? `Check these details: ${[...new Set(fields.map((f) => f.path.replace(/^marine\./, '')))].join(', ')}.`
          : (result?.error.message ?? 'The marine client could not be saved.'),
      );
    }
  };

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
      <label>
        Policy holder
        <select value={d.kind} onChange={(e) => set({ kind: e.target.value as Draft['kind'] })}>
          <option value="organization">A business (organisation)</option>
          <option value="individual">A person</option>
        </select>
      </label>
      <label>
        {business ? 'Business name' : 'Name'}
        <input
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={100}
          required
        />
      </label>
      <div className="member-row">
        <label>
          Mobile
          <input
            value={d.phone}
            onChange={(e) => set({ phone: e.target.value })}
            inputMode="tel"
            maxLength={16}
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={d.email}
            onChange={(e) => set({ email: e.target.value })}
            maxLength={254}
          />
        </label>
      </div>
      <div className="member-row">
        <label>
          Pincode
          <input
            value={d.pincode}
            onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '') })}
            inputMode="numeric"
            maxLength={6}
            required
          />
        </label>
        <label>
          PAN
          <input
            value={d.pan}
            onChange={(e) => set({ pan: e.target.value.toUpperCase() })}
            maxLength={10}
            autoComplete="off"
          />
        </label>
      </div>
      <label>
        {business ? 'Business address' : 'Address (building no., street)'}
        <input
          value={d.address}
          onChange={(e) => set({ address: e.target.value })}
          maxLength={100}
        />
      </label>
      {business ? (
        <>
          <div className="member-row">
            <label>
              Registration no.
              <input
                value={d.registrationNo}
                onChange={(e) => set({ registrationNo: e.target.value })}
                maxLength={40}
              />
            </label>
            <label>
              Registration date
              <input
                type="date"
                value={d.registrationDate}
                onChange={(e) => set({ registrationDate: e.target.value })}
              />
            </label>
          </div>
          <div className="member-row">
            <label>
              MSME
              <select
                value={d.msme}
                onChange={(e) => set({ msme: e.target.value as Draft['msme'] })}
              >
                <option value="">Not given</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label>
              Type of organisation
              <select
                value={d.organisationType}
                onChange={(e) => set({ organisationType: e.target.value as OrgType | '' })}
              >
                <option value="">Not given</option>
                {NIA_ORGANISATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : (
        <div className="member-row">
          <label>
            Date of birth
            <input
              type="date"
              value={d.dateOfBirth}
              onChange={(e) => set({ dateOfBirth: e.target.value })}
            />
          </label>
          <label>
            Gender
            <select
              value={d.gender}
              onChange={(e) => set({ gender: e.target.value as Gender | '' })}
            >
              <option value="">Not given</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="transgender">Transgender</option>
            </select>
          </label>
          <label>
            Marital status
            <select
              value={d.maritalStatus}
              onChange={(e) => set({ maritalStatus: e.target.value as MaritalStatus | '' })}
            >
              <option value="">Not given</option>
              {(Object.keys(MARITAL_LABELS) as MaritalStatus[]).map((k) => (
                <option key={k} value={k}>
                  {MARITAL_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label>
        Notes (optional)
        <textarea
          value={d.notes}
          onChange={(e) => set({ notes: e.target.value })}
          maxLength={1000}
          rows={2}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save marine client'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Choice<T extends string>(props: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
}): React.JSX.Element {
  return (
    <label>
      {props.label}
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {(Object.keys(props.options) as T[]).map((k) => (
          <option key={k} value={k}>
            {props.options[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

type Keys<T> = keyof T & string;

/** Fills New India's Specific Voyage form for a marine client and a shipment entered here. */
function NiaMarinePanel(props: { marineId: string }): React.JSX.Element {
  const [voyageType, setVoyageType] = useState<Keys<typeof NIA_VOYAGE_TYPES>>('inland');
  const [startDate, setStartDate] = useState(tomorrow);
  const [transitType, setTransitType] = useState<Keys<typeof NIA_TRANSIT_TYPES>>('road');
  const [mode, setMode] = useState<Keys<typeof NIA_TRANSPORT_MODES>>('road');
  const [fromCountry, setFromCountry] = useState('India');
  const [toCountry, setToCountry] = useState('India');
  const [portOfLoading, setPortOfLoading] = useState('');
  const [portOfDischarge, setPortOfDischarge] = useState('');
  const [billType, setBillType] = useState<Keys<typeof NIA_BILL_TYPES>>('lr');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState('');
  const [markNo, setMarkNo] = useState('');
  const [showPremium, setShowPremium] = useState(false);
  const [cargoType, setCargoType] = useState<Keys<typeof NIA_CARGO_TYPES>>('machinery');
  const [sumInsured, setSumInsured] = useState('');
  const [rate, setRate] = useState('');
  const [extra, setExtra] = useState('10');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [excessOn, setExcessOn] = useState<Keys<typeof NIA_EXCESS_ON>>('claim');
  const [excess, setExcess] = useState('');
  const [minimumExcess, setMinimumExcess] = useState('');
  const [clause, setClause] = useState<(typeof NIA_TRANSIT_CLAUSES)[number]>('A');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        product: 'nia-marine',
        marineId: props.marineId,
        insurerId: 'new-india',
        shipment: {
          voyageType,
          startDate,
          transitType,
          mode,
          fromCountry: fromCountry.trim(),
          toCountry: toCountry.trim(),
          portOfLoading: portOfLoading.trim(),
          portOfDischarge: portOfDischarge.trim(),
          billType,
          ...(billNumber.trim() ? { billNumber: billNumber.trim() } : {}),
          ...(billDate ? { billDate } : {}),
          ...(markNo.trim() ? { markNo: markNo.trim() } : {}),
          showPremium,
          cargoType,
          sumInsuredRupees: Number(sumInsured || 'NaN'),
          ratePercent: rate,
          extraPercent: extra,
          invoiceNumber: invoiceNumber.trim(),
          ...(invoiceDate ? { invoiceDate } : {}),
          excessOn,
          excessPercent: excess,
          minimumExcessRupees: Number(minimumExcess || 'NaN'),
          clause,
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
                ? 'Check the shipment: a detail is missing or not valid.'
                : (r?.error.message ?? 'The quote could not be started.'),
          },
    );
  };
  const digits = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(e.target.value.replace(/\D/g, ''));
  const decimal = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(e.target.value.replace(/[^\d.]/g, ''));

  return (
    <form className="quote-panel login-form" onSubmit={(e) => void run(e)}>
      <p className="insurer-note">
        <strong>New India, Marine Specific Voyage quote.</strong> Sign in to New India and leave it
        on its dashboard (or open the form yourself). The app fills the policy holder and this
        shipment, then stops. The shipment is used for this quote only and not saved. It never
        presses Save &amp; Calculate Premium: you check the form and press it.
      </p>
      <div className="member-row">
        <Choice
          label="Type of voyage"
          value={voyageType}
          options={NIA_VOYAGE_TYPES}
          onChange={setVoyageType}
        />
        <label>
          Policy start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </label>
      </div>
      <div className="member-row">
        <Choice
          label="Transit type"
          value={transitType}
          options={NIA_TRANSIT_TYPES}
          onChange={setTransitType}
        />
        <Choice
          label="Mode of transport"
          value={mode}
          options={NIA_TRANSPORT_MODES}
          onChange={setMode}
        />
      </div>
      <div className="member-row">
        <label>
          From country
          <input
            value={fromCountry}
            onChange={(e) => setFromCountry(e.target.value)}
            maxLength={60}
            required
          />
        </label>
        <label>
          To country
          <input
            value={toCountry}
            onChange={(e) => setToCountry(e.target.value)}
            maxLength={60}
            required
          />
        </label>
      </div>
      <div className="member-row">
        <label>
          Port of loading
          <input
            value={portOfLoading}
            onChange={(e) => setPortOfLoading(e.target.value)}
            maxLength={50}
            required
          />
        </label>
        <label>
          Port of discharge
          <input
            value={portOfDischarge}
            onChange={(e) => setPortOfDischarge(e.target.value)}
            maxLength={50}
            required
          />
        </label>
      </div>
      <div className="member-row">
        <Choice
          label="Type of bill"
          value={billType}
          options={NIA_BILL_TYPES}
          onChange={setBillType}
        />
        <label>
          Bill no. (optional)
          <input
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            maxLength={20}
          />
        </label>
        <label>
          Bill date (optional)
          <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </label>
      </div>
      <label>
        Mark no. (optional)
        <input value={markNo} onChange={(e) => setMarkNo(e.target.value)} maxLength={100} />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={showPremium}
          onChange={(e) => setShowPremium(e.target.checked)}
        />
        Show the premium amount in the certificate
      </label>
      <Choice
        label="Cargo type"
        value={cargoType}
        options={NIA_CARGO_TYPES}
        onChange={setCargoType}
      />
      <div className="member-row">
        <label>
          Cargo sum insured (₹)
          <input
            value={sumInsured}
            onChange={digits(setSumInsured)}
            inputMode="numeric"
            maxLength={9}
            required
          />
        </label>
        <label>
          Cargo rate (%)
          <input
            value={rate}
            onChange={decimal(setRate)}
            inputMode="decimal"
            maxLength={7}
            required
          />
        </label>
        <label>
          % extra
          <input
            value={extra}
            onChange={decimal(setExtra)}
            inputMode="decimal"
            maxLength={5}
            required
          />
        </label>
      </div>
      <div className="member-row">
        <label>
          Invoice number
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            maxLength={20}
            required
          />
        </label>
        <label>
          Invoice date (optional)
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </label>
      </div>
      <div className="member-row">
        <Choice
          label="Excess applicable on"
          value={excessOn}
          options={NIA_EXCESS_ON}
          onChange={setExcessOn}
        />
        <label>
          Excess (%)
          <input
            value={excess}
            onChange={decimal(setExcess)}
            inputMode="decimal"
            maxLength={7}
            required
          />
        </label>
        <label>
          Minimum excess (₹)
          <input
            value={minimumExcess}
            onChange={digits(setMinimumExcess)}
            inputMode="numeric"
            maxLength={10}
            required
          />
        </label>
      </div>
      <label>
        Inland Transit Clause
        <select value={clause} onChange={(e) => setClause(e.target.value as typeof clause)}>
          {NIA_TRANSIT_CLAUSES.map((c) => (
            <option key={c} value={c}>
              Clause {c}
            </option>
          ))}
        </select>
      </label>
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Filling New India…' : 'Fill Specific Voyage form'}
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
