// Rural clients, for New India's rural quote forms: kept apart from health and travel clients
// (decision of 4 November 2026), encrypted on this computer until the advisor deletes them. A
// rural client is a farmer: their details and nominee, their animals (cattle and livestock forms)
// and their farm house and contents (Farmers Package). Each can be filled into New India's four
// rural forms from here.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import type { Gender, MaritalStatus } from '../../../shared/contracts/client';
import {
  ANIMAL_KINDS,
  ANIMAL_ORIGINS,
  CATTLE_TYPES,
  RURAL_NOMINEE_RELATIONSHIPS,
  type AnimalKind,
  type AnimalOrigin,
  type CattleType,
  type RuralClientRaw,
  type RuralSummary,
} from '../../../shared/contracts/rural';
import {
  NIA_BLDA_BENEFICIARIES,
  NIA_CATTLE_SCHEMES,
  NIA_FARMERS_EXCESS,
  NIA_NON_SCHEME_SCHEMES,
  NIA_RURAL_FORM_NAMES,
  NIA_RURAL_FORMS,
  type NiaRuralForm,
  type NiaRuralRun,
} from '../../../shared/insurers/nia-rural';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';
import { MARITAL_LABELS } from '../clients/proposal-fields';

const KIND_LABELS: Record<AnimalKind, string> = {
  cattle: 'Cattle',
  horse: 'Horse',
  donkey: 'Donkey',
  pony: 'Pony',
  mule: 'Mule',
  yak: 'Yak',
  camel: 'Camel',
  pig: 'Pig',
  sheep: 'Sheep',
  goat: 'Goat',
};
const CATTLE_LABELS: Record<CattleType, string> = {
  buffalo: 'Buffalo',
  bullock: 'Bullock (castrated)',
  bull: 'Bull',
  'calf-heifer': 'Calf / heifer',
  'milch-buffalo': 'Milch buffalo',
  'milch-cow': 'Milch cow',
  mithun: 'Mithun',
  'stud-bull': 'Stud bull',
};
const ORIGIN_LABELS: Record<AnimalOrigin, string> = {
  indigenous: 'Indigenous',
  'cross-breed': 'Cross breed',
  exotic: 'Exotic',
};
const NOMINEE_LABELS: Record<(typeof RURAL_NOMINEE_RELATIONSHIPS)[number], string> = {
  spouse: 'Spouse',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  brother: 'Brother',
  sister: 'Sister',
  other: 'Other',
};

interface AnimalDraft {
  kind: AnimalKind;
  cattleType: CattleType;
  origin: AnimalOrigin;
  gender: 'male' | 'female';
  breed: string;
  ageYears: string;
  ageMonths: string;
  tagNumber: string;
  purpose: string;
  marketValue: string;
  sumInsured: string;
  fitnessCertificateDate: string;
  locationOfStable: string;
}
const NEW_ANIMAL: AnimalDraft = {
  kind: 'cattle',
  cattleType: 'milch-cow',
  origin: 'indigenous',
  gender: 'female',
  breed: '',
  ageYears: '',
  ageMonths: '0',
  tagNumber: '',
  purpose: '',
  marketValue: '',
  sumInsured: '',
  fitnessCertificateDate: '',
  locationOfStable: '',
};

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
  address: string;
  nomineeName: string;
  nomineeRelationship: (typeof RURAL_NOMINEE_RELATIONSHIPS)[number] | '';
  nomineeAddress: string;
  animals: AnimalDraft[];
  withFarm: boolean;
  dwellingSum: string;
  contentsSum: string;
  dwellingId: string;
  dwellingLocation: string;
  dwellingDescription: string;
  contentsDescription: string;
  katcha: '' | 'yes' | 'no';
  disabilities: string;
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
  address: '',
  nomineeName: '',
  nomineeRelationship: '',
  nomineeAddress: '',
  animals: [],
  withFarm: false,
  dwellingSum: '',
  contentsSum: '',
  dwellingId: '',
  dwellingLocation: '',
  dwellingDescription: '',
  contentsDescription: '',
  katcha: '',
  disabilities: '',
};

const text = (v: string) => (v.trim() ? v.trim() : undefined);
const whole = (v: string) => (v.trim() ? Number(v.replace(/[,\s]/g, '')) : undefined);

function toInput(d: Draft): RuralClientRaw {
  return {
    customer: {
      name: d.name.trim(),
      ...(text(d.phone) ? { phone: text(d.phone) } : {}),
      ...(text(d.email) ? { email: text(d.email) } : {}),
      ...(text(d.notes) ? { notes: text(d.notes) } : {}),
    },
    pincode: d.pincode,
    ...(d.dateOfBirth ? { dateOfBirth: d.dateOfBirth } : {}),
    ...(d.gender ? { gender: d.gender } : {}),
    ...(d.maritalStatus ? { maritalStatus: d.maritalStatus } : {}),
    ...(text(d.address) ? { address: text(d.address) } : {}),
    ...(text(d.nomineeName) ? { nomineeName: text(d.nomineeName) } : {}),
    ...(d.nomineeRelationship ? { nomineeRelationship: d.nomineeRelationship } : {}),
    ...(text(d.nomineeAddress) ? { nomineeAddress: text(d.nomineeAddress) } : {}),
    animals: d.animals.map((a) => ({
      kind: a.kind,
      ...(a.kind === 'cattle' ? { cattleType: a.cattleType } : {}),
      origin: a.origin,
      gender: a.gender,
      breed: a.breed.trim(),
      ageYears: Number(a.ageYears || 'NaN'),
      ageMonths: Number(a.ageMonths || '0'),
      ...(text(a.tagNumber) ? { tagNumber: text(a.tagNumber) } : {}),
      ...(text(a.purpose) ? { purpose: text(a.purpose) } : {}),
      marketValueRupees: whole(a.marketValue) ?? NaN,
      ...(whole(a.sumInsured) !== undefined ? { sumInsuredRupees: whole(a.sumInsured) } : {}),
      ...(a.fitnessCertificateDate ? { fitnessCertificateDate: a.fitnessCertificateDate } : {}),
      ...(text(a.locationOfStable) ? { locationOfStable: text(a.locationOfStable) } : {}),
    })),
    ...(d.withFarm
      ? {
          farm: {
            ...(whole(d.dwellingSum) !== undefined
              ? { dwellingSumInsuredRupees: whole(d.dwellingSum) }
              : {}),
            ...(whole(d.contentsSum) !== undefined
              ? { contentsSumInsuredRupees: whole(d.contentsSum) }
              : {}),
            ...(text(d.dwellingId) ? { dwellingId: text(d.dwellingId) } : {}),
            ...(text(d.dwellingLocation) ? { dwellingLocation: text(d.dwellingLocation) } : {}),
            ...(text(d.dwellingDescription)
              ? { dwellingDescription: text(d.dwellingDescription) }
              : {}),
            ...(text(d.contentsDescription)
              ? { contentsDescription: text(d.contentsDescription) }
              : {}),
            ...(d.katcha ? { katcha: d.katcha === 'yes' } : {}),
            ...(text(d.disabilities) ? { disabilities: text(d.disabilities) } : {}),
          },
        }
      : {}),
  };
}

export function RuralPanel(): React.JSX.Element | null {
  const [list, setList] = useState<RuralSummary[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.rural.list().catch(() => null);
    if (result?.ok) {
      setList(result.data.rural);
      setError(null);
    } else if (result && result.error.code === 'UNSUPPORTED_FLOW') {
      setHidden(true);
    } else {
      setError(result ? result.error.message : 'Rural clients could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (hidden) return null;

  const edit = async (summary: RuralSummary) => {
    setError(null);
    const result = await window.fqf.rural.get(summary.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const r = result.data.rural;
    const n = (v: number | undefined) => (v === undefined ? '' : String(v));
    setDraft({
      id: summary.id,
      name: r.customer.name,
      phone: r.customer.phone ?? '',
      email: r.customer.email ?? '',
      notes: r.customer.notes ?? '',
      pincode: r.pincode,
      dateOfBirth: r.dateOfBirth ?? '',
      gender: r.gender ?? '',
      maritalStatus: r.maritalStatus ?? '',
      address: r.address ?? '',
      nomineeName: r.nomineeName ?? '',
      nomineeRelationship: r.nomineeRelationship ?? '',
      nomineeAddress: r.nomineeAddress ?? '',
      animals: r.animals.map((a) => ({
        kind: a.kind,
        cattleType: a.cattleType ?? 'milch-cow',
        origin: a.origin,
        gender: a.gender,
        breed: a.breed,
        ageYears: String(a.ageYears),
        ageMonths: String(a.ageMonths),
        tagNumber: a.tagNumber ?? '',
        purpose: a.purpose ?? '',
        marketValue: String(a.marketValueRupees),
        sumInsured: n(a.sumInsuredRupees),
        fitnessCertificateDate: a.fitnessCertificateDate ?? '',
        locationOfStable: a.locationOfStable ?? '',
      })),
      withFarm: r.farm !== undefined,
      dwellingSum: n(r.farm?.dwellingSumInsuredRupees),
      contentsSum: n(r.farm?.contentsSumInsuredRupees),
      dwellingId: r.farm?.dwellingId ?? '',
      dwellingLocation: r.farm?.dwellingLocation ?? '',
      dwellingDescription: r.farm?.dwellingDescription ?? '',
      contentsDescription: r.farm?.contentsDescription ?? '',
      katcha: r.farm?.katcha === undefined ? '' : r.farm.katcha ? 'yes' : 'no',
      disabilities: r.farm?.disabilities ?? '',
    });
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const result = await window.fqf.rural.delete(id);
    if (!result.ok) setError(result.error.message);
    await refresh();
  };

  return (
    <section className="panel insurers" aria-labelledby="rural-heading">
      <h2 id="rural-heading">Rural clients</h2>
      <p className="lead">
        Rural clients are for New India&rsquo;s rural forms: a farmer with their animals and farm
        house, kept apart from health and travel clients. They are stored encrypted on this computer
        until you delete them.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {list && (
        <div className="insurer-actions">
          <button type="button" className="primary" onClick={() => setDraft({ ...EMPTY })}>
            Add rural client
          </button>
        </div>
      )}
      <Modal
        open={draft !== null}
        title={draft?.id ? 'Edit rural client' : 'New rural client'}
        onClose={() => setDraft(null)}
      >
        {draft && (
          <RuralForm
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
          {list.map((r) => (
            <li key={r.id} className="insurer-row">
              <div className="insurer-main">
                <div>
                  <strong>{r.name}</strong>
                  <span className="insurer-mode">
                    Pincode {r.pincode} · {r.animalCount}{' '}
                    {r.animalCount === 1 ? 'animal' : 'animals'}
                    {r.hasFarm ? ' · farm house' : ''}
                  </span>
                </div>
                <div className="insurer-actions">
                  <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    New India rural quote
                  </button>
                  <button type="button" onClick={() => void edit(r)}>
                    Edit
                  </button>
                  {confirmDelete === r.id ? (
                    <>
                      <button type="button" className="danger" onClick={() => void remove(r.id)}>
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="danger" onClick={() => setConfirmDelete(r.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {open === r.id && <NiaRuralPanel ruralId={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RuralForm(props: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { draft: d, onChange } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const setAnimal = (i: number, patch: Partial<AnimalDraft>) =>
    set({ animals: d.animals.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await window.fqf.rural
      .save({ ...(d.id ? { id: d.id } : {}), rural: toInput(d) })
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
          ? `Check these details: ${[...new Set(fields.map((f) => f.path.replace(/^rural\./, '')))].join(', ')}.`
          : (result?.error.message ?? 'The rural client could not be saved.'),
      );
    }
  };

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
      <label>
        Farmer&rsquo;s name
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
        Address (building no., street)
        <input
          value={d.address}
          onChange={(e) => set({ address: e.target.value })}
          maxLength={200}
        />
      </label>
      <fieldset>
        <legend>Nominee</legend>
        <div className="member-row">
          <label>
            Name
            <input
              value={d.nomineeName}
              onChange={(e) => set({ nomineeName: e.target.value })}
              maxLength={100}
            />
          </label>
          <label>
            Relationship
            <select
              value={d.nomineeRelationship}
              onChange={(e) =>
                set({ nomineeRelationship: e.target.value as Draft['nomineeRelationship'] })
              }
            >
              <option value="">Not given</option>
              {RURAL_NOMINEE_RELATIONSHIPS.map((k) => (
                <option key={k} value={k}>
                  {NOMINEE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Address
          <input
            value={d.nomineeAddress}
            onChange={(e) => set({ nomineeAddress: e.target.value })}
            maxLength={200}
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>Animals</legend>
        {d.animals.map((a, i) => (
          <div key={i} className="animal">
            <div className="member-row">
              <label>
                Animal
                <select
                  value={a.kind}
                  onChange={(e) => setAnimal(i, { kind: e.target.value as AnimalKind })}
                >
                  {ANIMAL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              {a.kind === 'cattle' && (
                <label>
                  Type of cattle
                  <select
                    value={a.cattleType}
                    onChange={(e) => setAnimal(i, { cattleType: e.target.value as CattleType })}
                  >
                    {CATTLE_TYPES.map((k) => (
                      <option key={k} value={k}>
                        {CATTLE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Gender
                <select
                  value={a.gender}
                  onChange={(e) => setAnimal(i, { gender: e.target.value as 'male' | 'female' })}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              <label>
                Origin
                <select
                  value={a.origin}
                  onChange={(e) => setAnimal(i, { origin: e.target.value as AnimalOrigin })}
                >
                  {ANIMAL_ORIGINS.map((k) => (
                    <option key={k} value={k}>
                      {ORIGIN_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="member-row">
              <label>
                Breed, colour, marks
                <input
                  value={a.breed}
                  onChange={(e) => setAnimal(i, { breed: e.target.value })}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Age (years)
                <input
                  value={a.ageYears}
                  onChange={(e) => setAnimal(i, { ageYears: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  maxLength={2}
                  required
                />
              </label>
              <label>
                Months
                <input
                  value={a.ageMonths}
                  onChange={(e) => setAnimal(i, { ageMonths: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  maxLength={2}
                />
              </label>
            </div>
            <div className="member-row">
              <label>
                Tag number
                <input
                  value={a.tagNumber}
                  onChange={(e) => setAnimal(i, { tagNumber: e.target.value })}
                  maxLength={40}
                />
              </label>
              <label>
                Purpose of use
                <input
                  value={a.purpose}
                  onChange={(e) => setAnimal(i, { purpose: e.target.value })}
                  maxLength={100}
                  placeholder="for example milk"
                />
              </label>
            </div>
            <div className="member-row">
              <label>
                Market value (₹)
                <input
                  value={a.marketValue}
                  onChange={(e) => setAnimal(i, { marketValue: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  maxLength={10}
                  required
                />
              </label>
              <label>
                Sum insured (₹, livestock form)
                <input
                  value={a.sumInsured}
                  onChange={(e) => setAnimal(i, { sumInsured: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  maxLength={10}
                />
              </label>
              <label>
                Fitness certificate date
                <input
                  type="date"
                  value={a.fitnessCertificateDate}
                  onChange={(e) => setAnimal(i, { fitnessCertificateDate: e.target.value })}
                />
              </label>
            </div>
            <label>
              Location of stable
              <input
                value={a.locationOfStable}
                onChange={(e) => setAnimal(i, { locationOfStable: e.target.value })}
                maxLength={200}
              />
            </label>
            <div className="insurer-actions">
              <button
                type="button"
                className="danger"
                onClick={() => set({ animals: d.animals.filter((_, j) => j !== i) })}
              >
                Remove animal {i + 1}
              </button>
            </div>
          </div>
        ))}
        {d.animals.length < 20 && (
          <div className="insurer-actions">
            <button
              type="button"
              onClick={() => set({ animals: [...d.animals, { ...NEW_ANIMAL }] })}
            >
              Add animal
            </button>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Farm house (Farmers Package)</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={d.withFarm}
            onChange={(e) => set({ withFarm: e.target.checked })}
          />
          The farmer has a farm house to insure
        </label>
        {d.withFarm && (
          <>
            <div className="member-row">
              <label>
                Sum insured on the dwelling (₹)
                <input
                  value={d.dwellingSum}
                  onChange={(e) => set({ dwellingSum: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  maxLength={10}
                />
              </label>
              <label>
                Sum insured on the contents (₹)
                <input
                  value={d.contentsSum}
                  onChange={(e) => set({ contentsSum: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  maxLength={10}
                />
              </label>
            </div>
            <div className="member-row">
              <label>
                House identification no.
                <input
                  value={d.dwellingId}
                  onChange={(e) => set({ dwellingId: e.target.value })}
                  maxLength={60}
                />
              </label>
              <label>
                Katcha construction
                <select
                  value={d.katcha}
                  onChange={(e) => set({ katcha: e.target.value as Draft['katcha'] })}
                >
                  <option value="">Not given</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
            <label>
              Location of the house
              <input
                value={d.dwellingLocation}
                onChange={(e) => set({ dwellingLocation: e.target.value })}
                maxLength={200}
              />
            </label>
            <label>
              Description of the house
              <input
                value={d.dwellingDescription}
                onChange={(e) => set({ dwellingDescription: e.target.value })}
                maxLength={200}
              />
            </label>
            <label>
              Description of the contents
              <input
                value={d.contentsDescription}
                onChange={(e) => set({ contentsDescription: e.target.value })}
                maxLength={200}
              />
            </label>
            <label>
              Existing physical disabilities of the farmer (&ldquo;None&rdquo; if none)
              <input
                value={d.disabilities}
                onChange={(e) => set({ disabilities: e.target.value })}
                maxLength={200}
              />
            </label>
          </>
        )}
      </fieldset>
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
          {busy ? 'Saving…' : 'Save rural client'}
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

/** Fills one of New India's rural quote forms for a rural client, stopping before the premium. */
function NiaRuralPanel(props: { ruralId: string }): React.JSX.Element {
  const [form, setForm] = useState<NiaRuralForm>('cattle-non-scheme');
  const [cattleScheme, setCattleScheme] =
    useState<keyof typeof NIA_CATTLE_SCHEMES>('individual-owner');
  const [nonScheme, setNonScheme] = useState<keyof typeof NIA_NON_SCHEME_SCHEMES>('bank-financed');
  const [beneficiary, setBeneficiary] = useState<(typeof NIA_BLDA_BENEFICIARIES)[number]>('GEN');
  const [claimRatio, setClaimRatio] = useState('');
  const [startDate, setStartDate] = useState(tomorrow);
  const [excess, setExcess] = useState<(typeof NIA_FARMERS_EXCESS)[number]>('0');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuoteRunResultView | { error: string } | null>(null);

  const ratio = claimRatio.trim() ? { claimRatio: claimRatio.trim() } : {};
  const runOf = (): NiaRuralRun =>
    form === 'cattle'
      ? { form, scheme: cattleScheme, ...ratio }
      : form === 'farmers-package'
        ? { form, startDate, excess }
        : form === 'livestock-blda'
          ? { form, beneficiary, ...ratio }
          : { form, scheme: nonScheme };

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const r = await window.fqf.quotes
      .run({ product: 'nia-rural', ruralId: props.ruralId, insurerId: 'new-india', run: runOf() })
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
  const unnamed = form === 'livestock-blda' || form === 'cattle-non-scheme';

  return (
    <form className="quote-panel login-form" onSubmit={(e) => void run(e)}>
      <p className="insurer-note">
        <strong>New India, rural quote.</strong> Sign in to New India and leave it on its dashboard
        {unnamed
          ? ': this form’s tile was not recorded, so open the form yourself first'
          : ' (or open the form yourself)'}
        . The app fills the farmer and their animals or farm house, then stops. When New India asks
        whether the client has a PAN, answer it on its page and press Fill again. It never presses
        Save &amp; Calculate Premium: you check the form and press it.
      </p>
      <label>
        Form
        <select value={form} onChange={(e) => setForm(e.target.value as NiaRuralForm)}>
          {NIA_RURAL_FORMS.map((f) => (
            <option key={f} value={f}>
              {NIA_RURAL_FORM_NAMES[f]}
            </option>
          ))}
        </select>
      </label>
      {form === 'cattle' && (
        <label>
          Scheme type
          <select
            value={cattleScheme}
            onChange={(e) => setCattleScheme(e.target.value as typeof cattleScheme)}
          >
            {Object.entries(NIA_CATTLE_SCHEMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      {form === 'cattle-non-scheme' && (
        <label>
          Scheme type
          <select
            value={nonScheme}
            onChange={(e) => setNonScheme(e.target.value as typeof nonScheme)}
          >
            {Object.entries(NIA_NON_SCHEME_SCHEMES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      {form === 'livestock-blda' && (
        <label>
          Type of beneficiary (BLDA)
          <select
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value as typeof beneficiary)}
          >
            {NIA_BLDA_BENEFICIARIES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      )}
      {(form === 'cattle' || form === 'livestock-blda') && (
        <label>
          Claim ratio (optional)
          <input
            value={claimRatio}
            onChange={(e) => setClaimRatio(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            maxLength={7}
          />
        </label>
      )}
      {form === 'farmers-package' && (
        <div className="member-row">
          <label>
            Policy start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          <label>
            Excess (%)
            <select value={excess} onChange={(e) => setExcess(e.target.value as typeof excess)}>
              {NIA_FARMERS_EXCESS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Filling New India…' : `Fill ${NIA_RURAL_FORM_NAMES[form]} form`}
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
