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
import { FormGrid, FormSection, Optional } from '../ui/FormSection';
import { FormShell } from '../ui/FormShell';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { shortDate } from '../ui/format';
import type { MenuEntry } from '../ui/Menu';
import { RecordPage, type RecordItem } from '../ui/RecordPage';
import { toast } from '../ui/toast';
import { QuoteWorkspace, type QuoteOption } from '../quote/QuoteWorkspace';
import { isInsurerNamePaused } from '../../../shared/insurers/availability';
import type { Gender, MaritalStatus } from '../../../shared/contracts/client';
import { OMP_FORMS, type OmpForm, type TravelOccupation } from '../../../shared/contracts/travel';
import {
  TRIP_DESTINATIONS,
  type TravellerRaw,
  type TravellerSummary,
  type TripDestination,
} from '../../../shared/contracts/traveller';
import { ICICI_TRAVEL_DESTINATION_NAMES } from '../../../shared/insurers/icici-nysa';
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
import { IciciTravelPanel } from '../quote/IciciNysaPanels';

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
  /** The trip (Additional details): every travel quote and Compare quotes start from it. */
  trip: TripDraft;
}

interface TripDraft {
  departureDate: string;
  returnDate: string;
  destination: TripDestination | '';
  student: boolean;
}

const EMPTY_TRIP: TripDraft = {
  departureDate: '',
  returnDate: '',
  destination: '',
  student: false,
};

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
  trip: EMPTY_TRIP,
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
    // Saved once it is complete (dates and where to); a half-given trip is checked on save.
    ...(d.trip.departureDate || d.trip.returnDate || d.trip.destination
      ? {
          trip: {
            departureDate: d.trip.departureDate,
            returnDate: d.trip.returnDate,
            destination: d.trip.destination as TripDestination,
            ...(d.trip.student ? { student: true } : {}),
          },
        }
      : {}),
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
  if (section === 'trip')
    return (
      {
        departureDate: 'trip departure date',
        returnDate: 'trip return date (on or after the departure)',
        destination: 'trip destination',
      }[field ?? ''] ?? 'trip'
    );
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
      trip: t.trip
        ? {
            departureDate: t.trip.departureDate,
            returnDate: t.trip.returnDate,
            destination: t.trip.destination,
            student: t.trip.student ?? false,
          }
        : EMPTY_TRIP,
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
      // Quotes start from the card's Quote button; its menu only edits and deletes.
      const menu: MenuEntry[] = [
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
        subtitle={draft?.id && draft.name ? `Travel client · ${draft.name}` : 'Travel client'}
        onClose={() => setDraft(null)}
        size="xl"
        fill
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
            {quote.product === 'icici-intl-travel' && (
              <IciciTravelPanel travellerId={quote.id} form="international" />
            )}
            {quote.product === 'icici-student-travel' && (
              <IciciTravelPanel travellerId={quote.id} form="student" />
            )}
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
/** (Paused insurers' are left out: shared/insurers/availability.ts.) */
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
  {
    key: 'icici-intl-travel',
    insurer: 'ICICI Lombard',
    label: 'International Travel premium (NYSA)',
    description: 'Fills NYSA’s health site and reads the premium',
  },
  {
    key: 'icici-student-travel',
    insurer: 'ICICI Lombard',
    label: 'Student Medical Travel premium (NYSA)',
    description: 'Fills NYSA’s health site; you pick the plan if ICICI asks',
  },
].filter((o) => !isInsurerNamePaused(o.insurer));

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
  // As a health client's form (request of 26 November 2026): Basic details, Additional details.
  const [tab, setTab] = useState<'basic' | 'additional'>('basic');
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
      // Show the tab the first problem is on (the passport, Aadhaar and proposal details are the
      // Additional details).
      const first = fields?.[0]?.path.split('.') ?? [];
      if (first.length > 0) {
        const additional =
          first[0] === 'passport' ||
          first[0] === 'aadhaar' ||
          first[1] === 'passport' ||
          first[1] === 'proposal' ||
          first[1] === 'trip';
        setTab(additional ? 'additional' : 'basic');
      }
    }
  };

  const tripGiven = !!(d.trip.departureDate || d.trip.returnDate || d.trip.destination);
  return (
    <FormShell
      label="Travel client details"
      tabs={[
        { id: 'basic', title: 'Basic details', hint: 'Traveller, contact, personal details' },
        {
          id: 'additional',
          title: 'Additional details',
          hint: tripGiven ? 'Trip, passport, proposal · trip saved' : 'Trip, passport, proposal',
        },
      ]}
      tab={tab}
      onTab={setTab}
      onSubmit={(e) => void submit(e)}
      onCancel={props.onCancel}
      busy={busy}
      saveLabel="Save travel client"
      error={error}
    >
      {tab === 'basic' && (
        <div className="cf-stack">
          <FormSection
            title="Traveller"
            description="The proposer and insured, as on the passport."
          >
            <FormGrid columns={4}>
              <label>
                Name (as on the passport)
                <input
                  value={d.name}
                  onChange={(e) => set({ name: e.target.value })}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                <span>
                  Mobile <Optional />
                </span>
                <input
                  value={d.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                  inputMode="tel"
                  maxLength={16}
                />
              </label>
              <label>
                <span>
                  E-mail <Optional />
                </span>
                <input
                  type="email"
                  value={d.email}
                  onChange={(e) => set({ email: e.target.value })}
                  maxLength={254}
                />
              </label>
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
            </FormGrid>
          </FormSection>
          <div className="cf-pair">
            <FormSection
              title="Personal details"
              description="The forms price plans by age and ask these of the insured."
            >
              <FormGrid columns={2}>
                <label>
                  Date of birth
                  <input
                    type="date"
                    value={d.dateOfBirth}
                    onChange={(e) => set({ dateOfBirth: e.target.value })}
                    required
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
              </FormGrid>
            </FormSection>
            <FormSection title="Notes">
              <FormGrid columns={2}>
                <label className="span-full">
                  <span className="visually-hidden">Notes</span>
                  <textarea
                    aria-label="Notes"
                    value={d.notes}
                    onChange={(e) => set({ notes: e.target.value })}
                    maxLength={1000}
                    rows={3}
                    placeholder="Optional"
                  />
                </label>
              </FormGrid>
            </FormSection>
          </div>
        </div>
      )}
      {tab === 'additional' && (
        <div className="cf-stack">
          <p className="insurer-note">
            The trip, passport and proposal details the travel quotes ask (United India&rsquo;s
            Overseas Travel and Overseas Mediclaim, HDFC ERGO, ICICI Lombard). Compare quotes asks
            only the plan: everything else comes from here. Stored encrypted.
          </p>
          <FormSection
            title="Trip"
            description="Where to and when: Compare quotes fills every insurer’s travel form from it."
            actions={
              tripGiven && (
                <button type="button" className="btn-sm" onClick={() => set({ trip: EMPTY_TRIP })}>
                  Clear the trip
                </button>
              )
            }
          >
            <FormGrid columns={3}>
              <label>
                Departure
                <input
                  type="date"
                  value={d.trip.departureDate}
                  onChange={(e) => set({ trip: { ...d.trip, departureDate: e.target.value } })}
                />
              </label>
              <label>
                Return
                <input
                  type="date"
                  value={d.trip.returnDate}
                  min={d.trip.departureDate || undefined}
                  onChange={(e) => set({ trip: { ...d.trip, returnDate: e.target.value } })}
                />
              </label>
              <label>
                Destination
                <select
                  value={d.trip.destination}
                  onChange={(e) =>
                    set({
                      trip: { ...d.trip, destination: e.target.value as TripDestination | '' },
                    })
                  }
                >
                  <option value="">Choose…</option>
                  {TRIP_DESTINATIONS.map((x) => (
                    <option key={x} value={x}>
                      {ICICI_TRAVEL_DESTINATION_NAMES[x]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check span-full">
                <input
                  type="checkbox"
                  checked={d.trip.student}
                  onChange={(e) => set({ trip: { ...d.trip, student: e.target.checked } })}
                />
                Travelling to study (ICICI&rsquo;s Student Medical Travel, United India&rsquo;s
                Studies)
              </label>
            </FormGrid>
          </FormSection>
          <FormSection
            title="Passport"
            description="The number is kept apart, in the same secure vault as insurer passwords; after saving, only its last four characters are shown."
          >
            <FormGrid columns={2}>
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
                  placeholder={
                    pp.lastFour ? 'Type a new number to replace it' : 'for example Z1234567'
                  }
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
            </FormGrid>
          </FormSection>
          <ProposalFields
            value={d.proposal}
            onChange={(proposal) => set({ proposal })}
            aadhaar={d.aadhaar}
            onAadhaarChange={(aadhaar) => set({ aadhaar })}
            occupation={false}
          />
        </div>
      )}
    </FormShell>
  );
}
