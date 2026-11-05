// Travel clients, for travel e-proposals: kept apart from health clients (decision of 3 November
// 2026), encrypted on this computer until the advisor deletes them. A travel client is one
// traveller (the proposer and insured), with their proposal details and passport. The passport and
// Aadhaar numbers are kept apart, in the secret vault: after saving, only their last four
// characters are shown. Each travel client can be filled into United India's Overseas Travel and
// Overseas Mediclaim (B&H, SCHENGEN, Studies) e-proposals, and New India's overseas travel quote
// forms, from here.
import { Cake, MapPin, Pencil, Plane, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { shortDate } from '../ui/format';
import type { MenuEntry } from '../ui/Menu';
import { RecordPage, type RecordItem } from '../ui/RecordPage';
import { toast } from '../ui/toast';
import { QuoteWorkspace, type QuoteOption } from '../quote/QuoteWorkspace';
import type { Gender, MaritalStatus } from '../../../shared/contracts/client';
import { OMP_FORMS, type OmpForm, type TravelOccupation } from '../../../shared/contracts/travel';
import type { TravellerRaw, TravellerSummary } from '../../../shared/contracts/traveller';
import {
  aadhaarChange,
  EMPTY_PROPOSAL,
  MARITAL_LABELS,
  ProposalFields,
  proposalFromRecord,
  proposalToInput,
  type AadhaarDraft,
  type ProposalDraft,
} from '../clients/proposal-fields';
import {
  OMP_FORM_NAMES,
  TRAVEL_OCCUPATION_LABELS,
  TRAVEL_OCCUPATION_LIST,
  TravelProposalPanel,
} from './TravelProposalPanel';
import { NiaTravelPanel } from './NiaTravelPanel';
import { HdfcTravelPanel } from '../insurers/HdfcPanels';

/** The passport number, kept apart (secret vault): the form only knows its last four characters. */
interface PassportDraft {
  lastFour: string | null;
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
  dateOfBirth: string;
  gender: Gender | '';
  maritalStatus: MaritalStatus | '';
  occupation: TravelOccupation | '';
  passportNumber: PassportDraft;
  issuingAuthority: string;
  issueDate: string;
  expiryDate: string;
  proposal: ProposalDraft;
  aadhaar: AadhaarDraft;
}

const EMPTY: Draft = {
  id: null,
  name: '',
  phone: '',
  email: '',
  notes: '',
  pincode: '',
  dateOfBirth: '',
  gender: '',
  maritalStatus: '',
  occupation: '',
  passportNumber: { lastFour: null, input: '', remove: false },
  issuingAuthority: '',
  issueDate: '',
  expiryDate: '',
  proposal: EMPTY_PROPOSAL,
  aadhaar: { lastFour: null, input: '', remove: false },
};

function toInput(d: Draft): TravellerRaw {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  const phone = optional(d.phone);
  const email = optional(d.email);
  const notes = optional(d.notes);
  const issuingAuthority = optional(d.issuingAuthority);
  const passport = {
    ...(issuingAuthority ? { issuingAuthority } : {}),
    ...(d.issueDate ? { issueDate: d.issueDate } : {}),
    ...(d.expiryDate ? { expiryDate: d.expiryDate } : {}),
  };
  return {
    customer: {
      name: d.name.trim(),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(notes ? { notes } : {}),
    },
    pincode: d.pincode,
    dateOfBirth: d.dateOfBirth,
    ...(d.gender ? { gender: d.gender } : {}),
    ...(d.maritalStatus ? { maritalStatus: d.maritalStatus } : {}),
    ...(d.occupation ? { occupation: d.occupation } : {}),
    proposal: proposalToInput(d.proposal, { occupation: false }),
    ...(Object.keys(passport).length > 0 ? { passport } : {}),
  };
}

/** A readable name for a rejected field path such as "traveller.passport.expiryDate". */
function describeField(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'passport') return 'passport number';
  if (parts[0] === 'aadhaar') return 'Aadhaar number';
  const [section, field] = [parts[1], parts[2]];
  if (section === 'customer')
    return { name: 'name', phone: 'mobile', email: 'email', notes: 'notes' }[field ?? ''] ?? 'name';
  if (section === 'passport')
    return (
      {
        issuingAuthority: 'passport issuing authority',
        issueDate: 'passport issue date',
        expiryDate: 'passport expiry date (after the issue date)',
      }[field ?? ''] ?? 'passport'
    );
  if (section === 'proposal') return 'proposal details';
  return (
    {
      pincode: 'pincode',
      dateOfBirth: 'date of birth',
      gender: 'gender',
      maritalStatus: 'marital status',
      occupation: 'occupation',
    }[section ?? ''] ?? 'details'
  );
}

/** What a travel client can be filled into: Overseas Travel, then the three Overseas Mediclaim. */
const PROPOSALS: { key: string; label: string; ompForm?: OmpForm }[] = [
  { key: 'travel', label: 'Overseas Travel proposal' },
  ...OMP_FORMS.map((f) => ({
    key: `omp-${f}`,
    label: `${OMP_FORM_NAMES[f]} proposal`,
    ompForm: f,
  })),
];

export function TravellersPanel(): React.JSX.Element | null {
  const [travellers, setTravellers] = useState<TravellerSummary[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** The quote workspace: for which travel client, and which product is chosen (null: none). */
  const [quote, setQuote] = useState<{ id: string; product: string | null } | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.travellers.list().catch(() => null);
    if (result?.ok) {
      setTravellers(result.data.travellers);
      setError(null);
    } else if (result && result.error.code === 'UNSUPPORTED_FLOW') {
      // The automation features are switched off (FQF_INSURER_PORTALS=0): no travel clients screen.
      setHidden(true);
    } else {
      setError(result ? result.error.message : 'Travel clients could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (hidden) return null;

  const edit = async (summary: TravellerSummary) => {
    setError(null);
    const result = await window.fqf.travellers.get(summary.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const t = result.data.traveller;
    setDraft({
      id: summary.id,
      name: t.customer.name,
      phone: t.customer.phone ?? '',
      email: t.customer.email ?? '',
      notes: t.customer.notes ?? '',
      pincode: t.pincode,
      dateOfBirth: t.dateOfBirth,
      gender: t.gender ?? '',
      maritalStatus: t.maritalStatus ?? '',
      occupation: t.occupation ?? '',
      passportNumber: { lastFour: result.data.passportLastFour, input: '', remove: false },
      issuingAuthority: t.passport?.issuingAuthority ?? '',
      issueDate: t.passport?.issueDate ?? '',
      expiryDate: t.passport?.expiryDate ?? '',
      proposal: proposalFromRecord(t.proposal),
      aadhaar: { lastFour: result.data.aadhaarLastFour, input: '', remove: false },
    });
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const result = await window.fqf.travellers.delete(id);
    if (!result.ok) setError(result.error.message);
    else toast('Travel client deleted.');
    await refresh();
  };
  const quoteFor = quote ? (travellers?.find((t) => t.id === quote.id) ?? null) : null;
  const toDelete = confirmDelete ? travellers?.find((t) => t.id === confirmDelete) : undefined;
  const items: RecordItem[] | null =
    travellers?.map((t) => {
      const menu: MenuEntry[] = [
        { heading: 'Quote with' },
        ...TRAVEL_OPTIONS.map((o) => ({
          label: `${o.insurer}: ${o.label}`,
          onSelect: () => setQuote({ id: t.id, product: o.key }),
        })),
        'separator',
        { label: 'Edit travel client', icon: Pencil, onSelect: () => void edit(t) },
        {
          label: 'Delete travel client',
          icon: Trash2,
          danger: true,
          onSelect: () => setConfirmDelete(t.id),
        },
      ];
      return {
        id: t.id,
        title: t.name,
        subtitle: 'Travel client',
        icon: Plane,
        hue: 5,
        meta: [
          { icon: MapPin, text: `Pincode ${t.pincode}` },
          { icon: Cake, text: `Born ${shortDate(t.dateOfBirth)}` },
        ],
        updatedAt: t.updatedAt,
        primary: {
          label: 'Quote',
          icon: Zap,
          onClick: () => setQuote({ id: t.id, product: null }),
        },
        menu,
        search: `${t.name} ${t.pincode}`,
      };
    }) ?? null;

  return (
    <RecordPage
      view="travellers"
      icon={Plane}
      title="Travel clients"
      subtitle="One traveller each, for travel quotes and e-proposals. Passport and Aadhaar numbers are kept in the secure vault."
      noun={{ one: 'travel client', many: 'travel clients' }}
      addLabel="Add travel client"
      onAdd={() => setDraft({ ...EMPTY })}
      importKind="travellers"
      onImported={() => void refresh()}
      items={items}
      failed={!travellers && !!error}
      empty={{
        icon: Plane,
        title: 'No travel clients yet',
        text: 'Add a traveller with their passport details, or import them from an Excel or CSV file.',
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
        title={draft?.id ? 'Edit travel client' : 'New travel client'}
        subtitle="Travel client"
        onClose={() => setDraft(null)}
      >
        {draft && (
          <TravellerForm
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSaved={() => {
              toast(draft.id ? 'Travel client updated.' : 'Travel client saved.');
              setDraft(null);
              void refresh();
            }}
          />
        )}
      </Modal>
      <QuoteWorkspace
        open={quote !== null && quoteFor !== null}
        subject={quoteFor?.name ?? ''}
        options={TRAVEL_OPTIONS}
        selected={quote?.product ?? null}
        onSelect={(product) => quote && setQuote({ id: quote.id, product })}
        onClose={() => setQuote(null)}
      >
        {quote && quoteFor && (
          <>
            {PROPOSALS.map(
              (p) =>
                quote.product === p.key && (
                  <TravelProposalPanel
                    key={p.key}
                    travellerId={quote.id}
                    {...(p.ompForm ? { ompForm: p.ompForm } : {})}
                  />
                ),
            )}
            {quote.product === 'nia-travel' && <NiaTravelPanel travellerId={quote.id} />}
            {quote.product === 'hdfc-travel' && <HdfcTravelPanel travellerId={quote.id} />}
          </>
        )}
      </QuoteWorkspace>
      <ConfirmDialog
        open={toDelete !== undefined}
        title="Delete this travel client?"
        message={`${toDelete?.name ?? 'The travel client'} and their passport and Aadhaar numbers will be deleted from this computer. This cannot be undone.`}
        confirmLabel="Delete travel client"
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </RecordPage>
  );
}

/** What a travel client can be filled into, by insurer (the list's actions, in its order). */
const TRAVEL_OPTIONS: QuoteOption[] = [
  ...PROPOSALS.map((p) => ({
    key: p.key,
    insurer: 'United India',
    label: p.label.replace(/ proposal$/, ''),
    description: p.ompForm ? 'Mediclaim e-proposal' : 'Overseas Travel e-proposal',
  })),
  {
    key: 'nia-travel',
    insurer: 'New India Assurance',
    label: 'Overseas travel quote',
    description: 'Fills the travel quote form',
  },
  {
    key: 'hdfc-travel',
    insurer: 'HDFC ERGO',
    label: 'Retail travel premium',
    description: 'Fills PIE and reads the premium',
  },
];

function TravellerForm(props: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { draft: d, onChange } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const pp = d.passportNumber;
  const setPassport = (patch: Partial<PassportDraft>) =>
    set({ passportNumber: { ...pp, ...patch } });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const passport = pp.input.trim()
      ? { passport: pp.input.trim() }
      : pp.remove
        ? { passport: null }
        : {};
    const result = await window.fqf.travellers
      .save({
        ...(d.id ? { id: d.id } : {}),
        traveller: toInput(d),
        ...aadhaarChange(d.aadhaar),
        ...passport,
      })
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
          : (result?.error.message ?? 'The travel client could not be saved.'),
      );
    }
  };

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
      <label>
        Name (as on the passport)
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
          Date of birth
          <input
            type="date"
            value={d.dateOfBirth}
            onChange={(e) => set({ dateOfBirth: e.target.value })}
            required
          />
        </label>
      </div>
      <div className="member-row">
        <label>
          Gender
          <select value={d.gender} onChange={(e) => set({ gender: e.target.value as Gender | '' })}>
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
      <label>
        Occupation (as the travel forms list it)
        <select
          value={d.occupation}
          onChange={(e) => set({ occupation: e.target.value as TravelOccupation | '' })}
        >
          <option value="">Not given</option>
          {TRAVEL_OCCUPATION_LIST.map((o) => (
            <option key={o} value={o}>
              {TRAVEL_OCCUPATION_LABELS[o]}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Passport</legend>
        <p className="insurer-note">
          The passport number is kept apart, in the same secure vault as insurer passwords; after
          saving, only its last four characters are shown.
        </p>
        <label>
          Passport number
          {pp.lastFour && !pp.remove && !pp.input ? (
            <span className="insurer-mode">
              Saved, ending {pp.lastFour}{' '}
              <button type="button" onClick={() => setPassport({ remove: true })}>
                Remove
              </button>
            </span>
          ) : null}
          {pp.remove && !pp.input ? (
            <span className="insurer-mode">
              Will be removed when you save.{' '}
              <button type="button" onClick={() => setPassport({ remove: false })}>
                Keep it
              </button>
            </span>
          ) : null}
          <input
            value={pp.input}
            onChange={(e) => setPassport({ input: e.target.value })}
            maxLength={20}
            autoComplete="off"
            placeholder={pp.lastFour ? 'Type a new number to replace it' : 'for example Z1234567'}
          />
        </label>
        <label>
          Issuing authority
          <input
            value={d.issuingAuthority}
            onChange={(e) => set({ issuingAuthority: e.target.value })}
            maxLength={80}
            placeholder="for example Passport Office, Bengaluru"
          />
        </label>
        <div className="member-row">
          <label>
            Issue date
            <input
              type="date"
              value={d.issueDate}
              onChange={(e) => set({ issueDate: e.target.value })}
            />
          </label>
          <label>
            Expiry date
            <input
              type="date"
              value={d.expiryDate}
              onChange={(e) => set({ expiryDate: e.target.value })}
            />
          </label>
        </div>
      </fieldset>
      <ProposalFields
        value={d.proposal}
        onChange={(proposal) => set({ proposal })}
        aadhaar={d.aadhaar}
        onAadhaarChange={(aadhaar) => set({ aadhaar })}
        occupation={false}
      />
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
          {busy ? 'Saving…' : 'Save travel client'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
