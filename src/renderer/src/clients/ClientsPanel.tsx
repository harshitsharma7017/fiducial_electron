// Saved clients: the details quotes are fetched for, kept encrypted on this computer until the
// advisor deletes them. Members carry relationship and age, and optionally date of birth and
// gender (United India's calculator needs them); the proposer may have a marital status. Each
// client can be quoted from here ("Get quote"). Proposal details (PAN, address, occupation, nominee
// and so on) are for e-proposal forms; the Aadhaar number is kept apart, in the secret vault, and
// only its last four digits are ever shown. Vehicles are not part of a client: see
// ../vehicles/VehiclesPanel.tsx.
import { HeartPulse, MapPin, Pencil, Trash2, Users, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { plural } from '../ui/format';
import type { MenuEntry } from '../ui/Menu';
import { RecordPage, type RecordItem } from '../ui/RecordPage';
import { toast } from '../ui/toast';
import { QuoteWorkspace, type QuoteOption } from '../quote/QuoteWorkspace';
import {
  ageOn,
  type ClientInputRaw,
  type ClientSummary,
  type Gender,
  type MaritalStatus,
} from '../../../shared/contracts/client';
import {
  aadhaarChange,
  EMPTY_PROPOSAL,
  MARITAL_LABELS,
  ProposalFields,
  proposalFromRecord,
  proposalToInput,
  type AadhaarDraft,
  type ProposalDraft,
} from './proposal-fields';
import { RELATIONSHIPS, type Relationship } from '../../../shared/contracts/customer';
import type { ClientListResponse, QuoteRunResultView } from '../../../shared/ipc/contract';
import {
  NIA_HEALTH_POLICIES,
  NIA_HEALTH_POLICY_NAMES,
  type NiaHealthPolicy,
} from '../../../shared/insurers/nia-health';
import {
  NIA_PA_EXCESS,
  NIA_PA_FORM_NAMES,
  NIA_PA_FORMS,
  NIA_PA_STATUSES,
  NIA_PA_SUMS,
  type NiaPaForm,
  type NiaPaRun,
} from '../../../shared/insurers/nia-pa';
import {
  NIVA_HEALTH_PLAN_NAMES,
  NIVA_HEALTH_PLANS,
  NIVA_KNOWN_ADD_ONS,
  NIVA_SUMS_INSURED,
  type NivaHealthPlan,
} from '../../../shared/insurers/niva-health';
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
    ...(d.withProposal ? { proposal: proposalToInput(d.proposal) } : {}),
  };
}

export function ClientsPanel(): React.JSX.Element | null {
  const [list, setList] = useState<ClientListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** The quote workspace: for which client, and which product is chosen (null: none yet). */
  const [quote, setQuote] = useState<{ id: string; product: string | null } | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.clients.list().catch(() => null);
    if (result?.ok) setList(result.data);
    else setError(result ? result.error.message : 'Clients could not be loaded.');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The automation features are off (FQF_INSURER_PORTALS): no clients screen.
  if (list && !list.enabled) return null;

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
      proposal: proposalFromRecord(client.proposal),
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
    else toast('Client deleted.');
    await refresh();
  };
  const clients = list?.clients ?? null;
  const quoteClient = quote ? (clients?.find((c) => c.id === quote.id) ?? null) : null;
  const toDelete = confirmDelete ? clients?.find((c) => c.id === confirmDelete) : undefined;
  const items: RecordItem[] | null =
    clients?.map((c) => {
      const options = healthQuoteOptions(c);
      const menu: MenuEntry[] = [
        { heading: 'Quote with' },
        ...options.map((o) => ({
          label: `${o.insurer}: ${o.label}`,
          disabled: !!o.unavailable,
          ...(o.unavailable ? { hint: o.unavailable } : {}),
          onSelect: () => setQuote({ id: c.id, product: o.key }),
        })),
        'separator',
        { label: 'Edit client', icon: Pencil, onSelect: () => void edit(c) },
        {
          label: 'Delete client',
          icon: Trash2,
          danger: true,
          onSelect: () => setConfirmDelete(c.id),
        },
      ];
      return {
        id: c.id,
        title: c.name,
        subtitle: 'Health client',
        icon: HeartPulse,
        hue: 4,
        meta: [
          { icon: MapPin, text: `Pincode ${c.pincode}` },
          { icon: Users, text: plural(c.memberCount, 'member', 'members') },
        ],
        badge: c.hasPreferences
          ? { label: 'Ready to quote', tone: 'success' as const }
          : { label: 'Quote details missing', tone: 'warning' as const },
        updatedAt: c.updatedAt,
        primary: {
          label: 'Quote',
          icon: Zap,
          onClick: () => setQuote({ id: c.id, product: null }),
        },
        menu,
        search: `${c.name} ${c.pincode}`,
      };
    }) ?? null;

  return (
    <RecordPage
      view="clients"
      icon={HeartPulse}
      title="Health clients"
      subtitle="Clients for health quotes and health e-proposals. Stored encrypted on this computer; Aadhaar numbers are kept in the secure vault."
      noun={{ one: 'client', many: 'clients' }}
      {...(list?.storageError
        ? {}
        : {
            addLabel: 'Add client',
            onAdd: () => setDraft({ ...EMPTY, members: [...EMPTY.members] }),
            importKind: 'clients' as const,
            onImported: () => void refresh(),
          })}
      items={list?.storageError ? [] : items}
      failed={!list && !!error}
      filters={[
        {
          id: 'ready',
          label: 'Ready to quote',
          test: (id) => !!clients?.find((c) => c.id === id)?.hasPreferences,
        },
        {
          id: 'missing',
          label: 'Details missing',
          test: (id) => !clients?.find((c) => c.id === id)?.hasPreferences,
        },
      ]}
      empty={{
        icon: Users,
        title: 'No health clients yet',
        text: 'Add a client with their family members, or import them from an Excel or CSV file.',
      }}
      alerts={
        <>
          {list?.storageError && (
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
        </>
      }
    >
      <Modal
        open={draft !== null}
        title={draft?.id ? 'Edit client' : 'New client'}
        subtitle="Health client"
        onClose={() => setDraft(null)}
      >
        {draft && (
          <ClientForm
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSaved={() => {
              toast(draft.id ? 'Client updated.' : 'Client saved.');
              setDraft(null);
              void refresh();
            }}
          />
        )}
      </Modal>
      <QuoteWorkspace
        open={quote !== null && quoteClient !== null}
        subject={quoteClient?.name ?? ''}
        options={quoteClient ? healthQuoteOptions(quoteClient) : []}
        selected={quote?.product ?? null}
        onSelect={(product) => quote && setQuote({ id: quote.id, product })}
        onClose={() => setQuote(null)}
      >
        {quote && quoteClient && (
          <>
            {quote.product === 'uiic-health' && <QuotePanel clientId={quote.id} />}
            {quote.product === 'nia-health' && <NiaHealthPanel clientId={quote.id} />}
            {quote.product === 'nia-pa' && <NiaPaPanel clientId={quote.id} />}
            {quote.product === 'niva-health' && <NivaHealthPanel clientId={quote.id} />}
            {PROPOSAL_FORMS.map(
              (f) =>
                quote.product === f.product && (
                  <ProposalPanel key={f.product} clientId={quote.id} form={f} />
                ),
            )}
          </>
        )}
      </QuoteWorkspace>
      <ConfirmDialog
        open={toDelete !== undefined}
        title="Delete this client?"
        message={`${toDelete?.name ?? 'The client'}, their members and their Aadhaar number will be deleted from this computer. This cannot be undone.`}
        confirmLabel="Delete client"
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </RecordPage>
  );
}

/**
 * What a health client can be quoted or filled into, by insurer. The conditions are the ones the
 * client list always applied (members for every form; quote details for United India's
 * calculator).
 */
function healthQuoteOptions(c: ClientSummary): QuoteOption[] {
  const noMembers = c.memberCount > 0 ? {} : { unavailable: 'Add members to this client first.' };
  return [
    {
      key: 'uiic-health',
      insurer: 'United India',
      label: 'Health calculator',
      description: 'Fills the premium calculator',
      ...(c.memberCount === 0
        ? noMembers
        : c.hasPreferences
          ? {}
          : { unavailable: 'Add the quote details (cover, sum insured) first.' }),
    },
    ...PROPOSAL_FORMS.map((f) => ({
      key: f.product,
      insurer: 'United India',
      label: `${f.name} e-proposal`,
      description: 'Fills the proposer and nominee',
      ...noMembers,
    })),
    {
      key: 'nia-health',
      insurer: 'New India Assurance',
      label: 'Health quote',
      description: 'Fills the health quote form',
    },
    {
      key: 'nia-pa',
      insurer: 'New India Assurance',
      label: 'Personal accident',
      description: 'Fills the PA quote form',
    },
    {
      key: 'niva-health',
      insurer: 'Niva Bupa',
      label: 'Health premium',
      description: 'Calculates and reads the premium',
    },
  ];
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
    const aadhaar = aadhaarChange(d.aadhaar);
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

/** United India's health e-proposals the app fills (sections I-II), never saving them. */
const PROPOSAL_FORMS = [
  { product: 'fm-proposal', name: 'Family Medicare' },
  { product: 'ihp-proposal', name: 'Individual Health' },
  { product: 'as-proposal', name: 'Arogya Sanjeevani' },
  { product: 'stu-proposal', name: 'Super Top-up' },
  { product: 'yhp-proposal', name: 'Yuvaan Health' },
] as const;

/** Fills one of United India's health e-proposals (sections I-II) for a saved client. */
function ProposalPanel(props: {
  clientId: string;
  form: (typeof PROPOSAL_FORMS)[number];
}): React.JSX.Element {
  const { form } = props;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        clientId: props.clientId,
        insurerId: 'united-india',
        product: form.product,
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
        <strong>United India, {form.name} e-proposal.</strong> Sign in to United India and leave it
        on its home page. The app opens the e-proposal form and fills the proposer details and
        nominee relationship, then stops. It never saves or submits the proposal: you complete the
        rest, check it, and press Save As Draft yourself.
      </p>
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Filling United India…' : `Fill ${form.name} proposal`}
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

/** Fills Niva Bupa's premium calculator for a saved client and works the premium out. */
function NivaHealthPanel(props: { clientId: string }): React.JSX.Element {
  const [plan, setPlan] = useState<NivaHealthPlan>('reassure-2');
  const [sumInsured, setSumInsured] = useState<number>(500000);
  const [years, setYears] = useState<1 | 2 | 3>(1);
  const [known, setKnown] = useState<string[]>([]);
  const [otherAddOns, setOtherAddOns] = useState('');
  const [tieredNetwork, setTieredNetwork] = useState(false);
  const [medicalPractitioner, setMedicalPractitioner] = useState(false);
  const [porting, setPorting] = useState(false);
  const [previousEnd, setPreviousEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const addOns = [
      ...known,
      ...otherAddOns
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length >= 2),
    ];
    const r = await window.fqf.quotes
      .run({
        clientId: props.clientId,
        insurerId: 'niva-bupa',
        product: 'niva-health',
        run: {
          plan,
          sumInsured,
          years,
          addOns,
          tieredNetwork,
          medicalPractitioner,
          ...(porting && previousEnd ? { previousPolicyEndDate: previousEnd } : {}),
        },
      })
      .catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>Niva Bupa, premium calculator.</strong> Sign in to Niva Bupa and leave it on
        UNO&rsquo;s home page (or the calculator&rsquo;s first step). The app opens the Premium
        Calculator, chooses &ldquo;I Know My Plan&rdquo; and the plan, fills the members, dates of
        birth, city, phone and questions, then the sum insured, policy period and add-ons, presses
        Calculate Premium and reads the premium. It stops before the summary that asks the
        customer&rsquo;s name and email.
      </p>
      <label>
        Plan{' '}
        <select value={plan} onChange={(e) => setPlan(e.target.value as NivaHealthPlan)}>
          {NIVA_HEALTH_PLANS.map((p) => (
            <option key={p} value={p}>
              {NIVA_HEALTH_PLAN_NAMES[p]}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Sum insured{' '}
        <select value={sumInsured} onChange={(e) => setSumInsured(Number(e.target.value))}>
          {NIVA_SUMS_INSURED.map((s) => (
            <option key={s} value={s}>
              ₹{s.toLocaleString('en-IN')}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Policy period{' '}
        <select value={years} onChange={(e) => setYears(Number(e.target.value) as 1 | 2 | 3)}>
          <option value={1}>1 year</option>
          <option value={2}>2 years</option>
          <option value={3}>3 years</option>
        </select>
      </label>
      <fieldset>
        <legend>Key Add-Ons</legend>
        {NIVA_KNOWN_ADD_ONS.map((a) => (
          <label key={a} className="check">
            <input
              type="checkbox"
              checked={known.includes(a)}
              onChange={(e) =>
                setKnown(e.target.checked ? [...known, a] : known.filter((k) => k !== a))
              }
            />
            {a}
          </label>
        ))}
        <label>
          Others, as Niva Bupa names them (comma-separated){' '}
          <input value={otherAddOns} onChange={(e) => setOtherAddOns(e.target.value)} />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={tieredNetwork}
            onChange={(e) => setTieredNetwork(e.target.checked)}
          />
          Tiered Network (Niva Bupa&rsquo;s discount with a co-pay)
        </label>
      </fieldset>
      <label className="check">
        <input
          type="checkbox"
          checked={medicalPractitioner}
          onChange={(e) => setMedicalPractitioner(e.target.checked)}
        />
        An insured member is a medical practitioner
      </label>
      <label className="check">
        <input type="checkbox" checked={porting} onChange={(e) => setPorting(e.target.checked)} />
        Transfer (port) a current health policy
      </label>
      {porting && (
        <label>
          Previous policy end date{' '}
          <input type="date" value={previousEnd} onChange={(e) => setPreviousEnd(e.target.value)} />
        </label>
      )}
      <div className="insurer-actions">
        <button
          type="button"
          disabled={busy || (porting && !previousEnd)}
          onClick={() => void run()}
        >
          {busy ? 'Working on Niva Bupa…' : `Get ${NIVA_HEALTH_PLAN_NAMES[plan]} premium`}
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
            <p>
              <strong>{result.premium.amount}</strong> &mdash; {result.premium.label}
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
              <p>Still to do by hand:</p>
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

/** Fills one of New India's health quote forms for a saved client, stopping before its premium. */
function NiaHealthPanel(props: { clientId: string }): React.JSX.Element {
  const [policy, setPolicy] = useState<NiaHealthPolicy>('arogya-sanjeevani');
  const [goodHealth, setGoodHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        clientId: props.clientId,
        insurerId: 'new-india',
        product: 'nia-health',
        policy,
        goodHealthConfirmed: goodHealth,
      })
      .catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>New India, health quote.</strong> Sign in to New India and leave it on its dashboard
        (or open the policy&rsquo;s quote form yourself). The app opens the policy&rsquo;s form and
        fills the client&rsquo;s members, then stops. It never presses Save &amp; Calculate Premium:
        you check the form and press it.
      </p>
      <label>
        Policy{' '}
        <select value={policy} onChange={(e) => setPolicy(e.target.value as NiaHealthPolicy)}>
          {NIA_HEALTH_POLICIES.map((p) => (
            <option key={p} value={p}>
              {NIA_HEALTH_POLICY_NAMES[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={goodHealth}
          onChange={(e) => setGoodHealth(e.target.checked)}
        />
        No member has diabetes, hypertension, a critical, chronic or recurring illness or an adverse
        medical history (New India&rsquo;s questions, for this quote).
      </label>
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Filling New India…' : `Fill ${NIA_HEALTH_POLICY_NAMES[policy]} form`}
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

/** Fills one of New India's Personal Accident forms for the client's proposer ("Self"). */
function NiaPaPanel(props: { clientId: string }): React.JSX.Element {
  const [form, setForm] = useState<NiaPaForm>('janta');
  const [sumInsured, setSumInsured] = useState<(typeof NIA_PA_SUMS)[number]>('100000');
  const [status, setStatus] = useState<keyof typeof NIA_PA_STATUSES>('earning');
  const [term, setTerm] = useState(1);
  const [excess, setExcess] = useState<(typeof NIA_PA_EXCESS)[number]>('0');
  const [pension, setPension] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [noClaims, setNoClaims] = useState(false);
  const [noDisabilities, setNoDisabilities] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);

  const runOf = (): NiaPaRun =>
    form === 'pension'
      ? { form, monthlyPensionRupees: Number(pension || 'NaN'), organisation: organisation.trim() }
      : form === 'janta'
        ? { form, sumInsured, status, term, excess }
        : { form, sumInsured, status, term };
  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({
        clientId: props.clientId,
        insurerId: 'new-india',
        product: 'nia-pa',
        run: runOf(),
        noClaimsConfirmed: noClaims,
        noDisabilitiesConfirmed: noDisabilities,
      })
      .catch(() => null);
    setBusy(false);
    setResult(
      r?.ok
        ? r.data
        : {
            error:
              r?.ok === false && r.error.code === 'VALIDATION_FAILED'
                ? 'Check the details: one is missing or not valid.'
                : (r?.error.message ?? 'The quote could not be started.'),
          },
    );
  };
  return (
    <form className="quote-panel login-form" onSubmit={(e) => void run(e)}>
      <p className="insurer-note">
        <strong>New India, Personal Accident quote.</strong> The client&rsquo;s proposer
        (&ldquo;Self&rdquo;) is the insured. Sign in to New India and leave it on its dashboard (or
        open the form yourself). When New India asks whether the client has a PAN, answer it on its
        page and press Fill again. The app never presses Save &amp; Calculate.
      </p>
      <label>
        Policy
        <select value={form} onChange={(e) => setForm(e.target.value as NiaPaForm)}>
          {NIA_PA_FORMS.map((f) => (
            <option key={f} value={f}>
              {NIA_PA_FORM_NAMES[f]}
            </option>
          ))}
        </select>
      </label>
      {form === 'pension' ? (
        <div className="member-row">
          <label>
            Monthly pension (₹)
            <input
              value={pension}
              onChange={(e) => setPension(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              maxLength={8}
              required
            />
          </label>
          <label>
            Organisation before retirement
            <input
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              maxLength={30}
              required
            />
          </label>
        </div>
      ) : (
        <div className="member-row">
          <label>
            Sum insured (₹)
            <select
              value={sumInsured}
              onChange={(e) => setSumInsured(e.target.value as typeof sumInsured)}
            >
              {NIA_PA_SUMS.map((s) => (
                <option key={s} value={s}>
                  {Number(s).toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status of the insured
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              {Object.entries(NIA_PA_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Years
            <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
              {[1, 2, 3].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          {form === 'janta' && (
            <label>
              Excess (%)
              <select value={excess} onChange={(e) => setExcess(e.target.value as typeof excess)}>
                {NIA_PA_EXCESS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={noClaims} onChange={(e) => setNoClaims(e.target.checked)} />
        No claim in the previous three years (New India does not issue the policy online otherwise).
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={noDisabilities}
          onChange={(e) => setNoDisabilities(e.target.checked)}
        />
        The insured has no physical disabilities or defects.
      </label>
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Filling New India…' : `Fill ${NIA_PA_FORM_NAMES[form]} form`}
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
