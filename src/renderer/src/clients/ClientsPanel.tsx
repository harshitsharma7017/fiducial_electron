// Saved clients: the details quotes are fetched for, kept encrypted on this computer until the
// advisor deletes them. Members carry relationship and age, and optionally date of birth and
// gender (United India's calculator needs them); the proposer may have a marital status. Each
// client can be quoted from here ("Get quote"). Proposal details (PAN, address, occupation, nominee
// and so on) are for e-proposal forms; the Aadhaar number is kept apart, in the secret vault, and
// only its last four digits are ever shown. Vehicles are not part of a client: see
// ../vehicles/VehiclesPanel.tsx.
import { useCallback, useEffect, useState } from 'react';
import {
  ageOn,
  HIGH_RISK_TYPES,
  NOMINEE_RELATIONSHIPS,
  UIIC_OCCUPATIONS,
  type ClientInputRaw,
  type HighRiskType,
  type NomineeRelationship,
  type ClientSummary,
  type Gender,
  type MaritalStatus,
} from '../../../shared/contracts/client';
import { RELATIONSHIPS, type Relationship } from '../../../shared/contracts/customer';
import type { ClientListResponse, QuoteRunResultView } from '../../../shared/ipc/contract';
import { PAISE_PER_RUPEE } from '../../../shared/money';

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  self: 'Self',
  spouse: 'Spouse',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  father_in_law: 'Father-in-law',
  mother_in_law: 'Mother-in-law',
};

interface MemberDraft {
  relationship: Relationship;
  age: string;
  /** YYYY-MM-DD, or '' if not given. */
  dateOfBirth: string;
  gender: Gender | '';
}

const MARITAL_LABELS: Record<MaritalStatus, string> = {
  married: 'Married',
  unmarried: 'Unmarried',
  widowed: 'Widow / widower',
  divorced: 'Divorced',
};

const NOMINEE_LABELS: Record<NomineeRelationship, string> = {
  spouse: 'Spouse',
  father: 'Father',
  mother: 'Mother',
  son: 'Son',
  daughter: 'Daughter',
  father_in_law: 'Father-in-law',
  mother_in_law: 'Mother-in-law',
  brother: 'Brother',
  sister: 'Sister',
};

/** The proposal details kept as text in the form (all but the relationship and the flag). */
const PROPOSAL_TEXT = [
  'pan',
  'address',
  'state',
  'city',
  'village',
  'occupation',
  'landlineStdCode',
  'landlineNumber',
  'ckycNumber',
  'eInsuranceAccountNumber',
  'nomineeName',
  'nomineeAddress',
  'nomineeContact',
  'intermediaryPlace',
] as const;
type ProposalTextKey = (typeof PROPOSAL_TEXT)[number];

type ProposalDraft = Record<ProposalTextKey, string> & {
  nomineeRelationship: NomineeRelationship | '';
  highRiskCustomer: boolean;
  highRiskType: HighRiskType | '';
};

const HIGH_RISK_LABELS: Record<HighRiskType, string> = {
  hni: 'High-net-worth individual (HNI)',
  pep: 'Politically exposed person (PEP) or close relative',
  'nri-hni': 'NRI / foreign resident who is also HNI',
  'trust-ngo': 'Trust / NGO paying over ₹10 lakh premium a year',
};

const EMPTY_PROPOSAL: ProposalDraft = {
  ...(Object.fromEntries(PROPOSAL_TEXT.map((k) => [k, ''])) as Record<ProposalTextKey, string>),
  nomineeRelationship: '',
  highRiskCustomer: false,
  highRiskType: '',
};

/** The Aadhaar number, kept apart (secret vault): the form only knows its last four digits. */
interface AadhaarDraft {
  lastFour: string | null;
  /** A new number typed in (replaces any saved one). */
  input: string;
  remove: boolean;
}

interface Draft {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
  pincode: string;
  maritalStatus: MaritalStatus | '';
  members: MemberDraft[];
  withPreferences: boolean;
  withProposal: boolean;
  proposal: ProposalDraft;
  aadhaar: AadhaarDraft;
  coverType: 'individual' | 'floater';
  sumInsuredRupees: string;
  tenureYears: string;
}

const EMPTY: Draft = {
  id: null,
  name: '',
  phone: '',
  email: '',
  notes: '',
  pincode: '',
  maritalStatus: '',
  members: [{ relationship: 'self', age: '', dateOfBirth: '', gender: '' }],
  withPreferences: true,
  withProposal: false,
  proposal: EMPTY_PROPOSAL,
  aadhaar: { lastFour: null, input: '', remove: false },
  coverType: 'floater',
  sumInsuredRupees: '',
  tenureYears: '1',
};

function toInput(d: Draft): ClientInputRaw {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  const phone = optional(d.phone);
  const email = optional(d.email);
  const notes = optional(d.notes);
  return {
    customer: {
      name: d.name.trim(),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(notes ? { notes } : {}),
    },
    pincode: d.pincode,
    ...(d.maritalStatus ? { proposerMaritalStatus: d.maritalStatus } : {}),
    members: d.members.map((m) => ({
      relationship: m.relationship,
      age: Number(m.age),
      ...(m.dateOfBirth ? { dateOfBirth: m.dateOfBirth } : {}),
      ...(m.gender ? { gender: m.gender } : {}),
    })),
    ...(d.withPreferences
      ? {
          preferences: {
            coverType: d.coverType,
            sumInsuredPaise: Math.round(Number(d.sumInsuredRupees) * PAISE_PER_RUPEE),
            tenureYears: Number(d.tenureYears),
          },
        }
      : {}),
    ...(d.withProposal
      ? {
          proposal: {
            // Only the details given: empty boxes are not saved.
            ...Object.fromEntries(
              PROPOSAL_TEXT.filter((k) => optional(d.proposal[k])).map((k) => [
                k,
                d.proposal[k].trim(),
              ]),
            ),
            ...(d.proposal.nomineeRelationship
              ? { nomineeRelationship: d.proposal.nomineeRelationship }
              : {}),
            highRiskCustomer: d.proposal.highRiskCustomer,
            ...(d.proposal.highRiskCustomer && d.proposal.highRiskType
              ? { highRiskType: d.proposal.highRiskType }
              : {}),
          },
        }
      : {}),
  };
}

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ClientsPanel(): React.JSX.Element | null {
  const [list, setList] = useState<ClientListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [quoting, setQuoting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.clients.list().catch(() => null);
    if (result?.ok) setList(result.data);
    else setError(result ? result.error.message : 'Clients could not be loaded.');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!list?.enabled) {
    return error ? (
      <section className="panel insurers">
        <h2>Clients</h2>
        <p className="error">{error}</p>
      </section>
    ) : null;
  }

  const edit = async (summary: ClientSummary) => {
    setError(null);
    const result = await window.fqf.clients.get(summary.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const { client } = result.data;
    setDraft({
      id: summary.id,
      name: client.customer.name,
      phone: client.customer.phone ?? '',
      email: client.customer.email ?? '',
      notes: client.customer.notes ?? '',
      pincode: client.pincode,
      maritalStatus: client.proposerMaritalStatus ?? '',
      members: client.members.map((m) => ({
        relationship: m.relationship,
        age: String(m.age),
        dateOfBirth: m.dateOfBirth ?? '',
        gender: m.gender ?? '',
      })),
      withPreferences: !!client.preferences,
      withProposal: !!client.proposal || result.data.aadhaarLastFour !== null,
      aadhaar: { lastFour: result.data.aadhaarLastFour, input: '', remove: false },
      proposal: {
        ...(Object.fromEntries(PROPOSAL_TEXT.map((k) => [k, client.proposal?.[k] ?? ''])) as Record<
          ProposalTextKey,
          string
        >),
        nomineeRelationship: client.proposal?.nomineeRelationship ?? '',
        highRiskCustomer: client.proposal?.highRiskCustomer ?? false,
        highRiskType: client.proposal?.highRiskType ?? '',
      },
      coverType: client.preferences?.coverType ?? 'floater',
      sumInsuredRupees: client.preferences
        ? String(client.preferences.sumInsuredPaise / PAISE_PER_RUPEE)
        : '',
      tenureYears: String(client.preferences?.tenureYears ?? 1),
    });
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const result = await window.fqf.clients.delete(id);
    if (!result.ok) setError(result.error.message);
    await refresh();
  };

  return (
    <section className="panel insurers" aria-labelledby="clients-heading">
      <h2 id="clients-heading">Clients</h2>
      <p className="lead">
        Saved clients are reused when fetching quotes. They are stored encrypted on this computer
        and kept until you delete them.
      </p>
      {list.storageError && (
        <p className="error" role="alert">
          {list.storageError === 'SECRET_STORE_UNAVAILABLE'
            ? 'Secure storage is unavailable, so clients cannot be saved or shown.'
            : 'The client database could not be opened. Nothing was changed; contact support.'}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!list.storageError && !draft && (
        <button type="button" onClick={() => setDraft({ ...EMPTY, members: [...EMPTY.members] })}>
          Add client
        </button>
      )}
      {draft && (
        <ClientForm
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void refresh();
          }}
        />
      )}
      {list.clients.length > 0 && (
        <ul className="insurer-list">
          {list.clients.map((c) => (
            <li key={c.id} className="insurer-row">
              <div className="insurer-main">
                <div>
                  <strong>{c.name}</strong>
                  <span className="insurer-mode">
                    Pincode {c.pincode} · {c.memberCount}{' '}
                    {c.memberCount === 1 ? 'member' : 'members'} · updated{' '}
                    {relativeDate(c.updatedAt)}
                  </span>
                </div>
                <div className="insurer-actions">
                  <span className={c.hasPreferences ? 'badge saved' : 'badge'}>
                    {c.hasPreferences ? 'Ready to quote' : 'Quote details missing'}
                  </span>
                  {c.memberCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuoting(quoting === `fm:${c.id}` ? null : `fm:${c.id}`)}
                    >
                      Family Medicare proposal
                    </button>
                  )}
                  {c.hasPreferences && c.memberCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuoting(quoting === c.id ? null : c.id)}
                    >
                      Get quote
                    </button>
                  )}
                  <button type="button" onClick={() => void edit(c)}>
                    Edit
                  </button>
                  {confirmDelete === c.id ? (
                    <>
                      <button type="button" onClick={() => void remove(c.id)}>
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(c.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {quoting === c.id && <QuotePanel clientId={c.id} />}
              {quoting === `fm:${c.id}` && <FmProposalPanel clientId={c.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClientForm(props: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { draft: d, onChange } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const setMember = (i: number, patch: Partial<MemberDraft>) =>
    set({ members: d.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const hasSelf = d.members.some((m) => m.relationship === 'self');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const aadhaar = d.aadhaar.input.trim()
      ? { aadhaar: d.aadhaar.input.trim() }
      : d.aadhaar.remove
        ? { aadhaar: null }
        : {};
    const result = await window.fqf.clients
      .save({ ...(d.id ? { id: d.id } : {}), client: toInput(d), ...aadhaar })
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
          ? `Check these details: ${[...new Set(fields.map((f) => describeField(f.path)))].join(', ')}.`
          : (result?.error.message ?? 'The client could not be saved.'),
      );
    }
  };

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
      <h3>{d.id ? 'Edit client' : 'New client'}</h3>
      <label>
        Client name
        <input
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={100}
          required
        />
      </label>
      <label>
        Mobile (optional)
        <input
          value={d.phone}
          onChange={(e) => set({ phone: e.target.value })}
          inputMode="tel"
          maxLength={20}
        />
      </label>
      <label>
        Email (optional)
        <input
          value={d.email}
          onChange={(e) => set({ email: e.target.value })}
          type="email"
          maxLength={254}
        />
      </label>
      <label>
        Pincode
        <input
          value={d.pincode}
          onChange={(e) => set({ pincode: e.target.value })}
          inputMode="numeric"
          maxLength={7}
          required
        />
      </label>
      <fieldset>
        <legend>Members to insure</legend>
        {d.members.map((m, i) => (
          <div className="member-row" key={i}>
            <select
              aria-label={`Member ${i + 1} relationship`}
              value={m.relationship}
              onChange={(e) => setMember(i, { relationship: e.target.value as Relationship })}
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {RELATIONSHIP_LABELS[r]}
                </option>
              ))}
            </select>
            <input
              aria-label={`Member ${i + 1} date of birth`}
              type="date"
              value={m.dateOfBirth}
              min="1900-01-01"
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                const dateOfBirth = e.target.value;
                // The age follows the date of birth.
                setMember(i, {
                  dateOfBirth,
                  ...(dateOfBirth ? { age: String(ageOn(dateOfBirth, new Date())) } : {}),
                });
              }}
            />
            <input
              aria-label={`Member ${i + 1} age`}
              value={m.age}
              onChange={(e) => setMember(i, { age: e.target.value })}
              inputMode="numeric"
              placeholder="Age"
              maxLength={3}
              required
              readOnly={!!m.dateOfBirth}
            />
            <select
              aria-label={`Member ${i + 1} gender`}
              value={m.gender}
              onChange={(e) => setMember(i, { gender: e.target.value as Gender | '' })}
            >
              <option value="">Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="transgender">Transgender</option>
            </select>
            {d.members.length > 1 && (
              <button
                type="button"
                onClick={() => set({ members: d.members.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {hasSelf && (
          <label>
            Proposer&rsquo;s marital status
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
        )}
        {d.members.length < 12 && (
          <button
            type="button"
            onClick={() =>
              set({
                members: [
                  ...d.members,
                  { relationship: 'spouse', age: '', dateOfBirth: '', gender: '' },
                ],
              })
            }
          >
            Add member
          </button>
        )}
      </fieldset>
      <label className="check">
        <input
          type="checkbox"
          checked={d.withProposal}
          onChange={(e) => set({ withProposal: e.target.checked })}
        />
        Add proposal details (for e-proposal forms)
      </label>
      {d.withProposal && (
        <ProposalFields
          value={d.proposal}
          onChange={(proposal) => set({ proposal })}
          aadhaar={d.aadhaar}
          onAadhaarChange={(aadhaar) => set({ aadhaar })}
        />
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={d.withPreferences}
          onChange={(e) => set({ withPreferences: e.target.checked })}
        />
        Save quote details (needed to fetch quotes)
      </label>
      {d.withPreferences && (
        <>
          <label>
            Cover type
            <select
              value={d.coverType}
              onChange={(e) => set({ coverType: e.target.value as Draft['coverType'] })}
            >
              <option value="floater">Family floater</option>
              <option value="individual">Individual</option>
            </select>
          </label>
          <label>
            Sum insured (₹)
            <input
              value={d.sumInsuredRupees}
              onChange={(e) => set({ sumInsuredRupees: e.target.value.replace(/[,\s]/g, '') })}
              inputMode="numeric"
              placeholder="for example 1000000"
              required
            />
          </label>
          <label>
            Policy term (years)
            <select value={d.tenureYears} onChange={(e) => set({ tenureYears: e.target.value })}>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </>
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
          {busy ? 'Saving…' : 'Save client'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** A readable name for a rejected field path such as "client.members.1.age". */
function describeField(path: string): string {
  const parts = path.split('.').slice(1);
  if (parts[0] === 'customer')
    return (
      { name: 'name', phone: 'mobile', email: 'email', notes: 'notes' }[parts[1] ?? ''] ?? 'client'
    );
  if (parts[0] === 'members')
    return parts[1] !== undefined ? `member ${Number(parts[1]) + 1}` : 'members';
  if (parts[0] === 'preferences')
    return (
      { sumInsuredPaise: 'sum insured', tenureYears: 'policy term', coverType: 'cover type' }[
        parts[1] ?? ''
      ] ?? 'quote details'
    );
  if (parts[0] === 'pincode') return 'pincode';
  if (parts[0] === 'aadhaar') return 'Aadhaar number';
  if (parts[0] === 'proposal')
    return (
      {
        pan: 'PAN',
        address: 'address',
        state: 'state',
        city: 'city',
        village: 'village',
        occupation: 'occupation',
        landlineStdCode: 'landline STD code',
        landlineNumber: 'landline number',
        ckycNumber: 'CKYC number',
        eInsuranceAccountNumber: 'e-insurance account number',
        nomineeName: "nominee's name",
        nomineeRelationship: 'nominee relationship',
        nomineeAddress: "nominee's address",
        nomineeContact: "nominee's contact number",
        intermediaryPlace: "intermediary's place of signing",
      }[parts[1] ?? ''] ?? 'proposal details'
    );
  return 'details';
}

/** Fills an insurer's quote form for one saved client (United India health so far). */
function QuotePanel(props: { clientId: string }): React.JSX.Element {
  const [goodHealth, setGoodHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        clientId: props.clientId,
        insurerId: 'united-india',
        product: 'health',
        goodHealthConfirmed: goodHealth,
      })
      .catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };

  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>United India, health (calculator).</strong> Sign in to United India and leave it on
        its home page. The app opens the Health Policy Premium Calculator and fills it for this
        client, then stops at &ldquo;User Details&rdquo; for you to check the email and mobile and
        press Check Premium.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={goodHealth}
          onChange={(e) => setGoodHealth(e.target.checked)}
        />
        Every member is in good health: no obesity, diabetes, hypertension or pre-existing condition
        (United India&rsquo;s declaration, for this quote).
      </label>
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Filling United India…' : 'Fill United India calculator'}
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
        </div>
      )}
    </div>
  );
}

function ProposalFields(props: {
  value: ProposalDraft;
  onChange: (value: ProposalDraft) => void;
  aadhaar: AadhaarDraft;
  onAadhaarChange: (value: AadhaarDraft) => void;
}): React.JSX.Element {
  const a = props.aadhaar;
  const setAadhaar = (patch: Partial<AadhaarDraft>) => props.onAadhaarChange({ ...a, ...patch });
  const p = props.value;
  const set = (patch: Partial<ProposalDraft>) => props.onChange({ ...p, ...patch });
  const text = (
    key: ProposalTextKey,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label>
      {label}
      <input
        value={p[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        autoComplete="off"
        {...extra}
      />
    </label>
  );
  return (
    <fieldset>
      <legend>Proposal details (for e-proposal forms)</legend>
      <p className="insurer-note">
        Everything here is optional and stored encrypted. The Aadhaar number is kept apart, in the
        same secure vault as insurer passwords; after saving, only its last four digits are shown.
      </p>
      <h4>Proposer</h4>
      {text('pan', 'PAN', { maxLength: 10, placeholder: 'ABCDE1234F' })}
      <label>
        Aadhaar number
        {a.lastFour && !a.remove && !a.input ? (
          <span className="insurer-mode">
            Saved, ending {a.lastFour}{' '}
            <button type="button" onClick={() => setAadhaar({ remove: true })}>
              Remove
            </button>
          </span>
        ) : null}
        {a.remove && !a.input ? (
          <span className="insurer-mode">
            Will be removed when you save.{' '}
            <button type="button" onClick={() => setAadhaar({ remove: false })}>
              Keep it
            </button>
          </span>
        ) : null}
        <input
          value={a.input}
          onChange={(e) => setAadhaar({ input: e.target.value })}
          inputMode="numeric"
          maxLength={14}
          autoComplete="off"
          placeholder={a.lastFour ? 'Type a new number to replace it' : '12 digits'}
        />
      </label>
      {text('address', 'Address', { maxLength: 200 })}
      <div className="member-row">
        {text('state', 'State (as the insurer lists it)', { maxLength: 60 })}
        {text('city', 'City', { maxLength: 80 })}
      </div>
      {text('village', 'Village or locality (as the insurer lists it for the pincode)', {
        maxLength: 100,
      })}
      <label>
        Occupation
        <select value={p.occupation} onChange={(e) => set({ occupation: e.target.value })}>
          <option value="">Not given</option>
          {UIIC_OCCUPATIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <div className="member-row">
        {text('landlineStdCode', 'Landline STD code', { inputMode: 'numeric', maxLength: 6 })}
        {text('landlineNumber', 'Landline number', { inputMode: 'numeric', maxLength: 10 })}
      </div>
      {text('ckycNumber', 'CKYC number (14 digits)', { inputMode: 'numeric', maxLength: 16 })}
      {text('eInsuranceAccountNumber', 'E-insurance account number', { maxLength: 20 })}
      <label className="check">
        <input
          type="checkbox"
          checked={p.highRiskCustomer}
          onChange={(e) => set({ highRiskCustomer: e.target.checked })}
        />
        High-risk customer (high-net-worth individual, politically exposed person, NRI who is also
        HNI, or trust/NGO)
      </label>
      {p.highRiskCustomer && (
        <label>
          Type of high risk
          <select
            value={p.highRiskType}
            onChange={(e) => set({ highRiskType: e.target.value as HighRiskType | '' })}
          >
            <option value="">Not given</option>
            {HIGH_RISK_TYPES.map((t) => (
              <option key={t} value={t}>
                {HIGH_RISK_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      )}
      <h4>Nominee</h4>
      {text('nomineeName', "Nominee's name", { maxLength: 100 })}
      <label>
        Nominee relationship
        <select
          value={p.nomineeRelationship}
          onChange={(e) => set({ nomineeRelationship: e.target.value as NomineeRelationship | '' })}
        >
          <option value="">Not given</option>
          {NOMINEE_RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {NOMINEE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      {text('nomineeAddress', "Nominee's address", { maxLength: 200 })}
      {text('nomineeContact', "Nominee's contact number", { inputMode: 'tel', maxLength: 14 })}
      <h4>Intermediary</h4>
      {text('intermediaryPlace', 'Place of signing (your town or city)', { maxLength: 60 })}
    </fieldset>
  );
}

/** Fills United India's Family Medicare e-proposal (sections I-II) for a saved client. */
function FmProposalPanel(props: { clientId: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        clientId: props.clientId,
        insurerId: 'united-india',
        product: 'fm-proposal',
        goodHealthConfirmed: false,
      })
      .catch(() => null);
    setBusy(false);
    setResult(
      r?.ok ? r.data : { error: r ? r.error.message : 'The proposal could not be started.' },
    );
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>United India, Family Medicare e-proposal.</strong> Sign in to United India and leave
        it on its home page. The app opens the e-proposal form and fills the proposer details and
        nominee relationship, then stops. It never saves or submits the proposal: you complete the
        rest, check it, and press Save As Draft yourself.
      </p>
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Filling United India…' : 'Fill Family Medicare proposal'}
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
    </div>
  );
}
