// Saved clients: the details quotes are fetched for, kept encrypted on this computer until the
// advisor deletes them. Members carry relationship and age, and optionally date of birth and
// gender (United India's calculator needs them); the proposer may have a marital status. Each
// client can be quoted from here ("Get quote"). The client form has two tabs (request of 24 November
// 2026): Basic details, and Additional details kept per insurer (PAN, address, occupation, nominee
// and so on, as each insurer's forms ask them); the Aadhaar number is kept apart, in the secret
// vault, and only its last four digits are ever shown. Vehicles are not part of a client: see
// ../vehicles/VehiclesPanel.tsx.
import { HeartPulse, MapPin, Pencil, Trash2, Users, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { plural } from '../ui/format';
import type { MenuEntry } from '../ui/Menu';
import { RecordPage, type RecordItem } from '../ui/RecordPage';
import { toast } from '../ui/toast';
import { IciciApiHealthPanel, useIciciApiReady } from '../quote/IciciApiPanels';
import { QuoteWorkspace, type QuoteOption } from '../quote/QuoteWorkspace';
import { isInsurerNamePaused, isInsurerPaused } from '../../../shared/insurers/availability';
import { IciciElevatePanel } from '../quote/IciciNysaPanels';
import {
  ageOn,
  CLIENT_DETAIL_INSURER_NAMES,
  CLIENT_DETAIL_INSURERS,
  INSURER_DETAIL_FIELDS,
  insurerDetailsOf,
  NIA_GRAMIN_OCCUPATIONS,
  UIIC_OCCUPATIONS,
  type ClientDetailInsurer,
  type ClientInputRaw,
  type ClientSummary,
  type Gender,
  type MaritalStatus,
} from '../../../shared/contracts/client';
import {
  aadhaarChange,
  EMPTY_PROPOSAL,
  hasInsurerDetails,
  insurerProposalToInput,
  MARITAL_LABELS,
  ProposalFields,
  proposalFromRecord,
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
  NIA_PA_FORM_NAMES,
  NIA_PA_FORMS,
  NIA_PA_STATUSES,
  type NiaPaForm,
} from '../../../shared/insurers/nia-pa';
import {
  NIVA_HEALTH_PLAN_NAMES,
  NIVA_HEALTH_PLANS,
  type NivaHealthPlan,
} from '../../../shared/insurers/niva-health';
import { HdfcRetailPanel } from '../insurers/HdfcPanels';
import { BajajPaPanel } from '../insurers/BajajPanels';
import { PAISE_PER_RUPEE } from '../../../shared/money';
import { runQuote } from '../quote/run';
import { UiicMissingNote, useUiicRequired } from '../quote/UiicRequiredFields';
import { QuoteChoicesFields } from './QuoteChoicesFields';
import {
  missingMessage,
  QuoteResult,
  readChoices,
  SavedChoicesNote,
  useSavedChoices,
} from './saved-choices';
import {
  hdfcMstFromChoices,
  niaPaFromChoices,
  nivaRunFromChoices,
  QUOTE_CHOICE_INSURER_NAMES,
  QUOTE_CHOICE_INSURERS,
  QUOTE_DEFAULTS,
  type ClientQuoteChoices,
  type QuoteChoiceInsurer,
} from '../../../shared/contracts/client-quote';

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
  /** Additional details, per insurer. */
  details: Record<ClientDetailInsurer, ProposalDraft>;
  /** What each insurer's quotes use besides the product. */
  choices: ClientQuoteChoices;
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
  choices: {},
  details: {
    'united-india': EMPTY_PROPOSAL,
    'new-india': EMPTY_PROPOSAL,
    'niva-bupa': EMPTY_PROPOSAL,
  },
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
    ...insurerDetailsInput(d),
    ...quoteChoicesInput(d.choices),
  };
}

/** The additional details to save, per insurer (none when nothing is given). */
function insurerDetailsInput(d: Draft): { insurerDetails?: Record<string, unknown> } {
  const given = CLIENT_DETAIL_INSURERS.flatMap((insurer) => {
    const details = insurerProposalToInput(insurer, d.details[insurer]);
    return details ? [[insurer, details] as const] : [];
  });
  return given.length > 0 ? { insurerDetails: Object.fromEntries(given) } : {};
}

/** The quote choices to save: each insurer's given ones (none when nothing is given). */
function quoteChoicesInput(c: ClientQuoteChoices): { quoteChoices?: ClientQuoteChoices } {
  const kept = Object.fromEntries(
    Object.entries(c)
      .map(([insurer, choices]) => [
        insurer,
        Object.fromEntries(
          Object.entries(choices ?? {}).filter(([, v]) => v !== undefined && v !== ''),
        ),
      ])
      .filter(([, choices]) => Object.keys(choices as object).length > 0),
  ) as ClientQuoteChoices;
  return Object.keys(kept).length > 0 ? { quoteChoices: kept } : {};
}

/** Each insurer's occupation list (Niva Bupa's forms do not ask one). */
const OCCUPATIONS: Record<ClientDetailInsurer, readonly string[]> = {
  'united-india': UIIC_OCCUPATIONS,
  'new-india': NIA_GRAMIN_OCCUPATIONS,
  'niva-bupa': [],
};

/** What each insurer's additional details are used for, as the tab says. */
const DETAILS_USE: Record<ClientDetailInsurer, string> = {
  'united-india':
    'Used by United India’s health e-proposals (Family Medicare, Individual Health, Arogya Sanjeevani, Super Top-up, Yuvaan).',
  'new-india': 'Used by New India’s personal accident forms (Sukshma, Janata, Pension).',
  'niva-bupa': 'Used by Niva Bupa’s premium calculator (the city, as Niva Bupa lists it).',
};

export function ClientsPanel(): React.JSX.Element | null {
  const [list, setList] = useState<ClientListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** The quote workspace: for which client, and which product is chosen (null: none yet). */
  const [quote, setQuote] = useState<{ id: string; product: string | null } | null>(null);
  const iciciApi = useIciciApiReady();

  const refresh = useCallback(async () => {
    const result = await window.fqf.clients.list().catch(() => null);
    if (result?.ok) setList(result.data);
    else setError(result ? result.error.message : 'Clients could not be loaded.');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The automation features are switched off (FQF_INSURER_PORTALS=0): no clients screen.
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
      aadhaar: { lastFour: result.data.aadhaarLastFour, input: '', remove: false },
      // A client saved before 24 November 2026 has one set: United India's (insurerDetailsOf).
      choices: client.quoteChoices ?? {},
      details: (() => {
        const all = insurerDetailsOf(client);
        return {
          'united-india': proposalFromRecord(all['united-india']),
          'new-india': proposalFromRecord(all['new-india']),
          'niva-bupa': proposalFromRecord(all['niva-bupa']),
        };
      })(),
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
      const options = healthQuoteOptions(c, iciciApi).filter(
        (o) => !isInsurerNamePaused(o.insurer),
      );
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
        options={quoteClient ? healthQuoteOptions(quoteClient, iciciApi) : []}
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
            {quote.product === 'hdfc-mst' && <HdfcMstPanel clientId={quote.id} />}
            {quote.product === 'bajaj-pa' && <BajajPaPanel clientId={quote.id} />}
            {quote.product === 'hdfc-retail' && <HdfcRetailPanel clientId={quote.id} />}
            {quote.product === 'icici-api-health' && <IciciApiHealthPanel clientId={quote.id} />}
            {quote.product === 'icici-elevate' && <IciciElevatePanel clientId={quote.id} />}
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
function healthQuoteOptions(c: ClientSummary, iciciApi: boolean): QuoteOption[] {
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
    {
      key: 'icici-elevate',
      insurer: 'ICICI Lombard',
      label: 'Elevate premium (NYSA)',
      description: 'Fills NYSA’s health site and reads the plans',
      ...noMembers,
    },
    // ICICI by its Partner API: listed once the API is set up.
    ...(iciciApi
      ? [
          {
            key: 'icici-api-health',
            insurer: 'ICICI Lombard',
            label: 'Elevate, Activate Booster (super top-up) premium',
            description: 'Asks ICICI’s partner API for the premium',
            ...noMembers,
          },
        ]
      : []),
    {
      key: 'bajaj-pa',
      insurer: 'Bajaj Allianz',
      label: 'Personal Accident premium',
      description: 'Fills the partner portal and reads the premium',
      ...noMembers,
    },
    {
      key: 'hdfc-mst',
      insurer: 'HDFC ERGO',
      label: 'MST (Medisure Super Top-up) premium',
      description: 'Fills PIE and reads the premium',
      ...noMembers,
    },
    {
      key: 'hdfc-retail',
      insurer: 'HDFC ERGO',
      label: 'Optima Secure, Optima Restore, Energy premium',
      description: 'Fills PIE and reads the premium',
      ...noMembers,
    },
  ];
}

/** HDFC ERGO's MST: nothing is chosen here, the cover and term are the client's details. */
function HdfcMstPanel(props: { clientId: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const saved = useSavedChoices(props.clientId);
  const shown = hdfcMstFromChoices(saved ?? undefined);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const read = await readChoices(props.clientId);
    if ('error' in read) {
      setBusy(false);
      setResult(read);
      return;
    }
    const r = await runQuote({
      clientId: props.clientId,
      insurerId: 'hdfc-ergo',
      product: 'hdfc-mst',
      run: hdfcMstFromChoices(read.choices),
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>HDFC ERGO, MST (Medisure Super Top-up), PIE.</strong> Sign in to HDFC&rsquo;s 1up.
        From 1up&rsquo;s home page the app opens PIE itself (Issue Quotes &amp; Policy, then PIE
        Dashboard), then opens the MST form, fills the cover, term and members, and reads the
        premium PIE works out. It never presses Generate Quote.
      </p>
      <SavedChoicesNote
        insurer="hdfc-ergo"
        lines={[
          shown.cover === 'individual' ? 'Individual' : 'Family Floater',
          `${shown.years} year${shown.years > 1 ? 's' : ''}`,
        ]}
      />
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Working on PIE…' : 'Get MST premium'}
        </button>
      </div>
      <QuoteResult result={result} />
    </div>
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
  const [tab, setTab] = useState<'basic' | 'additional'>('basic');
  const [insurer, setInsurer] = useState<QuoteChoiceInsurer>('united-india');
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
      // Show the tab (and insurer) the first problem is on.
      const first = fields?.[0]?.path.split('.') ?? [];
      if (first[1] === 'insurerDetails' || first[1] === 'quoteChoices' || first[0] === 'aadhaar') {
        setTab('additional');
        const at = first[0] === 'aadhaar' ? 'united-india' : first[2];
        if ((QUOTE_CHOICE_INSURERS as readonly string[]).includes(at ?? ''))
          setInsurer(at as QuoteChoiceInsurer);
      } else if (fields?.length) setTab('basic');
    }
  };

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
      <div className="form-tabs" role="tablist" aria-label="Client details">
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
      {tab === 'additional' && (
        <AdditionalDetails
          draft={d}
          insurer={insurer}
          onInsurer={setInsurer}
          onChange={(details) => set({ details })}
          onChoices={(choices) => set({ choices })}
          onAadhaarChange={(aadhaar) => set({ aadhaar })}
        />
      )}
      {tab === 'basic' && (
        <>
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
                <select
                  value={d.tenureYears}
                  onChange={(e) => set({ tenureYears: e.target.value })}
                >
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
        </>
      )}
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

/**
 * The Additional details tab: one sub-tab per insurer, each with the details its forms use and the
 * choices its quotes use besides the product.
 */
function AdditionalDetails(props: {
  draft: Draft;
  insurer: QuoteChoiceInsurer;
  onInsurer: (insurer: QuoteChoiceInsurer) => void;
  onChange: (details: Draft['details']) => void;
  onChoices: (choices: ClientQuoteChoices) => void;
  onAadhaarChange: (aadhaar: AadhaarDraft) => void;
}): React.JSX.Element {
  const { draft: d, insurer } = props;
  const withForms = (CLIENT_DETAIL_INSURERS as readonly string[]).includes(insurer)
    ? (insurer as ClientDetailInsurer)
    : null;
  const marked = (i: QuoteChoiceInsurer): boolean =>
    Object.values(d.choices[i] ?? {}).some((v) => v !== undefined) ||
    ((CLIENT_DETAIL_INSURERS as readonly string[]).includes(i) &&
      hasInsurerDetails(i as ClientDetailInsurer, d.details[i as ClientDetailInsurer]));
  return (
    <>
      <p className="insurer-note">
        Each insurer&rsquo;s details are filled in separately, as its forms and quotes ask them;
        nothing is copied from one insurer to another, and a quote or proposal uses only that
        insurer&rsquo;s. A quote asks only the product: everything else comes from here. Stored
        encrypted.
      </p>
      <div className="form-tabs small" role="tablist" aria-label="Insurer">
        {QUOTE_CHOICE_INSURERS.filter((i) => !isInsurerPaused(i)).map((i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={insurer === i}
            onClick={() => props.onInsurer(i)}
          >
            {QUOTE_CHOICE_INSURER_NAMES[i]}
            {marked(i) && (
              <span className="tab-mark" aria-label="(has details)">
                •
              </span>
            )}
          </button>
        ))}
      </div>
      {withForms && (
        <ProposalFields
          key={withForms}
          legend={`${CLIENT_DETAIL_INSURER_NAMES[withForms]}’s details`}
          note={<p className="insurer-note">{DETAILS_USE[withForms]}</p>}
          value={d.details[withForms]}
          onChange={(value) => props.onChange({ ...d.details, [withForms]: value })}
          fields={INSURER_DETAIL_FIELDS[withForms]}
          occupations={OCCUPATIONS[withForms]}
          // The Aadhaar number is one per client, asked by United India's e-proposals.
          {...(withForms === 'united-india'
            ? { aadhaar: d.aadhaar, onAadhaarChange: props.onAadhaarChange }
            : {})}
        />
      )}
      <QuoteChoicesFields
        key={`choices-${insurer}`}
        insurer={insurer}
        value={d.choices}
        onChange={props.onChoices}
      />
    </>
  );
}

/** Labels of the additional details, for a rejected field. */
const DETAIL_LABELS: Record<string, string> = {
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
};

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
  if (parts[0] === 'proposal') return DETAIL_LABELS[parts[1] ?? ''] ?? 'proposal details';
  if (parts[0] === 'quoteChoices') {
    const name = QUOTE_CHOICE_INSURER_NAMES[parts[1] as QuoteChoiceInsurer] ?? 'an insurer';
    return `quote choices (${name}, Additional details)`;
  }
  if (parts[0] === 'insurerDetails') {
    const at = parts[1] as ClientDetailInsurer;
    const name = CLIENT_DETAIL_INSURER_NAMES[at] ?? 'an insurer';
    return `${DETAIL_LABELS[parts[2] ?? ''] ?? 'details'} (${name}, Additional details)`;
  }
  return 'details';
}

/** United India's health calculator: nothing is chosen here, the declaration is the client's. */
function QuotePanel(props: { clientId: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const required = useUiicRequired({ kind: 'client', id: props.clientId, form: 'health' });
  const saved = useSavedChoices(props.clientId);

  const run = async () => {
    setBusy(true);
    setResult(null);
    const read = await readChoices(props.clientId);
    if ('error' in read) {
      setBusy(false);
      setResult(read);
      return;
    }
    const r = await runQuote({
      clientId: props.clientId,
      insurerId: 'united-india',
      product: 'health',
      goodHealthConfirmed: read.choices?.['united-india']?.goodHealth ?? false,
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };

  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>United India, health (calculator).</strong> Sign in to United India and leave it on
        its home page. The app opens the Health Policy Premium Calculator, fills it for this client,
        enters the client&rsquo;s e-mail and mobile in &ldquo;User Details&rdquo;, presses Check
        Premium and shows the premium. United India may send the quote to that e-mail and mobile.
      </p>
      <SavedChoicesNote
        insurer="united-india"
        lines={[
          saved?.['united-india']?.goodHealth
            ? 'every member in good health (confirmed)'
            : 'good-health declaration not confirmed',
        ]}
      />
      <UiicMissingNote required={required} />
      <div className="insurer-actions">
        <button type="button" disabled={busy || required.loading} onClick={() => void run()}>
          {busy ? 'Filling United India…' : 'Get United India premium'}
        </button>
      </div>
      <QuoteResult result={result} />
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
  const required = useUiicRequired({ kind: 'client', id: props.clientId, form: 'proposal' });
  const run = async () => {
    setBusy(true);
    setResult(null);
    const r = await runQuote({
      clientId: props.clientId,
      insurerId: 'united-india',
      product: form.product,
      goodHealthConfirmed: false,
    }).catch(() => null);
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
      <UiicMissingNote required={required} />
      <div className="insurer-actions">
        <button type="button" disabled={busy || required.loading} onClick={() => void run()}>
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

/** Niva Bupa's premium calculator: the plan is chosen here, the rest is the client's details. */
function NivaHealthPanel(props: { clientId: string }): React.JSX.Element {
  const [plan, setPlan] = useState<NivaHealthPlan>('reassure-2');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const saved = useSavedChoices(props.clientId);
  const c = saved?.['niva-bupa'] ?? {};
  const lines = [
    `sum insured ₹${(c.sumInsured ?? QUOTE_DEFAULTS.nivaSumInsured).toLocaleString('en-IN')}`,
    `${c.years ?? QUOTE_DEFAULTS.nivaYears} year${(c.years ?? 1) > 1 ? 's' : ''}`,
    c.addOns?.length ? `add-ons: ${c.addOns.join(', ')}` : 'no add-ons',
    ...(c.tieredNetwork ? ['Tiered Network'] : []),
    ...(c.medicalPractitioner ? ['a medical practitioner insured'] : []),
    ...(c.previousPolicyEndDate ? [`porting, ends ${c.previousPolicyEndDate}`] : []),
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
    const built = nivaRunFromChoices(plan, read.choices);
    if (!built.ok) {
      setBusy(false);
      setResult({ error: missingMessage(built.missing) });
      return;
    }
    const r = await runQuote({
      clientId: props.clientId,
      insurerId: 'niva-bupa',
      product: 'niva-health',
      run: built.value,
    }).catch(() => null);
    setBusy(false);
    setResult(r?.ok ? r.data : { error: r ? r.error.message : 'The quote could not be started.' });
  };
  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>Niva Bupa, premium calculator.</strong> Sign in to Niva Bupa and leave it on
        UNO&rsquo;s home page (or the calculator&rsquo;s first step). The app opens the Premium
        Calculator, presses &ldquo;I Know My Plan&rdquo;, picks the plan, fills the client&rsquo;s
        Basic Details, presses Continue, chooses the sum insured, period and add-ons, reads the
        premium, then goes on to Plan Summary and fills the customer&rsquo;s name, email and mobile.
        It never presses Generate Quote.
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
      </label>
      <SavedChoicesNote insurer="niva-bupa" lines={lines} />
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Working on Niva Bupa…' : `Get ${NIVA_HEALTH_PLAN_NAMES[plan]} premium`}
        </button>
      </div>
      <QuoteResult result={result} />
    </div>
  );
}

/** New India's health forms: the policy is chosen here, the declaration is the client's details. */
function NiaHealthPanel(props: { clientId: string }): React.JSX.Element {
  const [policy, setPolicy] = useState<NiaHealthPolicy>('arogya-sanjeevani');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const saved = useSavedChoices(props.clientId);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const read = await readChoices(props.clientId);
    if ('error' in read) {
      setBusy(false);
      setResult(read);
      return;
    }
    const r = await runQuote({
      clientId: props.clientId,
      insurerId: 'new-india',
      product: 'nia-health',
      policy,
      goodHealthConfirmed: read.choices?.['new-india']?.goodHealth ?? false,
    }).catch(() => null);
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
      <SavedChoicesNote
        insurer="new-india"
        lines={[
          saved?.['new-india']?.goodHealth
            ? 'no member has diabetes, hypertension or a chronic illness (confirmed)'
            : 'health questions not confirmed',
        ]}
      />
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Filling New India…' : `Fill ${NIA_HEALTH_POLICY_NAMES[policy]} form`}
        </button>
      </div>
      <QuoteResult result={result} />
    </div>
  );
}

/** New India's personal accident forms: the form is chosen here, the rest is the client's details. */
function NiaPaPanel(props: { clientId: string }): React.JSX.Element {
  const [form, setForm] = useState<NiaPaForm>('janta');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);
  const saved = useSavedChoices(props.clientId);
  const c = saved?.['new-india'] ?? {};
  const lines =
    form === 'pension'
      ? [
          c.monthlyPensionRupees
            ? `monthly pension ₹${c.monthlyPensionRupees.toLocaleString('en-IN')}`
            : 'monthly pension not given',
          c.pensionOrganisation
            ? `organisation ${c.pensionOrganisation}`
            : 'organisation not given',
        ]
      : [
          `sum insured ₹${Number(c.paSumInsured ?? QUOTE_DEFAULTS.paSumInsured).toLocaleString('en-IN')}`,
          NIA_PA_STATUSES[c.paStatus ?? QUOTE_DEFAULTS.paStatus],
          `${c.paTerm ?? QUOTE_DEFAULTS.paTerm} year${(c.paTerm ?? 1) > 1 ? 's' : ''}`,
          ...(form === 'janta' ? [`excess ${c.paExcess ?? QUOTE_DEFAULTS.paExcess}%`] : []),
        ];
  lines.push(c.noClaims ? 'no claims (confirmed)' : 'no-claims not confirmed');
  lines.push(c.noDisabilities ? 'no disabilities (confirmed)' : 'no-disabilities not confirmed');
  const run = async () => {
    setBusy(true);
    setResult(null);
    const read = await readChoices(props.clientId);
    if ('error' in read) {
      setBusy(false);
      setResult(read);
      return;
    }
    const built = niaPaFromChoices(form, read.choices);
    if (!built.ok) {
      setBusy(false);
      setResult({ error: missingMessage(built.missing) });
      return;
    }
    const r = await runQuote({
      clientId: props.clientId,
      insurerId: 'new-india',
      product: 'nia-pa',
      run: built.value.run,
      noClaimsConfirmed: built.value.noClaims,
      noDisabilitiesConfirmed: built.value.noDisabilities,
    }).catch(() => null);
    setBusy(false);
    setResult(
      r?.ok
        ? r.data
        : {
            error:
              r?.ok === false && r.error.code === 'VALIDATION_FAILED'
                ? "Check the client's details: one is missing or not valid."
                : (r?.error.message ?? 'The quote could not be started.'),
          },
    );
  };
  return (
    <div className="quote-panel">
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
      <SavedChoicesNote insurer="new-india" lines={lines} />
      <div className="insurer-actions">
        <button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? 'Filling New India…' : `Fill ${NIA_PA_FORM_NAMES[form]} form`}
        </button>
      </div>
      <QuoteResult result={result} />
    </div>
  );
}
