// The details United India's forms require that this client's record lacks, asked in the quote
// drawer before the run (decision of 11 November 2026). Saved to the client's record when the
// advisor starts the run, so the run fills every required field and United India can work the
// premium out. The Aadhaar and passport numbers go to the secret vault, as from the client form.
import { useCallback, useEffect, useState } from 'react';
import {
  ageOn,
  GENDERS,
  HIGH_RISK_TYPES,
  NOMINEE_RELATIONSHIPS,
  UIIC_OCCUPATIONS,
  type Gender,
} from '../../../shared/contracts/client';
import { TRAVEL_OCCUPATIONS, type TravelOccupation } from '../../../shared/contracts/travel';
import {
  uiicMissingForClient,
  uiicMissingForTraveller,
  type UiicClientForm,
  type UiicRequiredKey,
  type UiicTravelForm,
} from '../../../shared/insurers/uiic-required';
import type { ClientView, TravellerView } from '../../../shared/ipc/contract';
import { HIGH_RISK_LABELS, NOMINEE_LABELS } from '../clients/proposal-fields';

export const TRAVEL_OCCUPATION_LABELS: Record<TravelOccupation, string> = {
  SelfEmployed: 'Self-employed',
  Unemployed: 'Unemployed',
  Salaried: 'Salaried',
  Service: 'Service',
  Professional: 'Professional',
};

const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  transgender: 'Transgender',
};

export type UiicSubject =
  | { kind: 'client'; id: string; form: UiicClientForm }
  | { kind: 'traveller'; id: string; form: UiicTravelForm };

interface FieldSpec {
  label: string;
  type?: 'text' | 'email' | 'tel' | 'date';
  options?: readonly (readonly [string, string])[];
  maxLength?: number;
  placeholder?: string;
  inputMode?: 'numeric' | 'text';
  /** A quick check of the format, as the record keeps it; the save checks it again. */
  valid?: (value: string) => boolean;
}

const FIELDS: Record<UiicRequiredKey, FieldSpec> = {
  email: {
    label: 'E-mail',
    type: 'email',
    maxLength: 254,
    valid: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  },
  phone: {
    label: 'Mobile',
    type: 'tel',
    maxLength: 14,
    placeholder: '10 digits',
    valid: (v) =>
      /^[6-9]\d{9}$/.test(v.replace(/[\s-]/g, '').replace(/^(?:\+91|91|0)(?=\d{10}$)/, '')),
  },
  dateOfBirth: { label: "Proposer's date of birth", type: 'date' },
  gender: { label: 'Gender', options: GENDERS.map((g) => [g, GENDER_LABELS[g]] as const) },
  // United India's forms offer Married or Single only.
  maritalStatus: {
    label: 'Marital status',
    options: [
      ['married', 'Married'],
      ['unmarried', 'Unmarried'],
    ],
  },
  occupation: { label: 'Occupation', options: UIIC_OCCUPATIONS.map((o) => [o, o] as const) },
  travelOccupation: {
    label: 'Occupation',
    options: TRAVEL_OCCUPATIONS.map((o) => [o, TRAVEL_OCCUPATION_LABELS[o]] as const),
  },
  pan: {
    label: 'PAN',
    maxLength: 10,
    placeholder: 'ABCDE1234F',
    valid: (v) => /^[A-Z]{5}\d{4}[A-Z]$/i.test(v.trim()),
  },
  address: { label: 'Address', maxLength: 200 },
  state: { label: 'State (as United India lists it)', maxLength: 60 },
  city: { label: 'City or district (as United India lists it)', maxLength: 80 },
  village: {
    label: 'Village or locality (as United India lists it for the PIN code)',
    maxLength: 100,
  },
  nomineeName: { label: "Nominee's name", maxLength: 100 },
  nomineeRelationship: {
    label: 'Nominee relationship',
    options: NOMINEE_RELATIONSHIPS.map((r) => [r, NOMINEE_LABELS[r]] as const),
  },
  nomineeAddress: { label: "Nominee's address", maxLength: 200 },
  intermediaryPlace: { label: 'Your place of signing (town or city)', maxLength: 60 },
  highRiskType: {
    label: 'Customer high risk type',
    options: HIGH_RISK_TYPES.map((t) => [t, HIGH_RISK_LABELS[t]] as const),
  },
  aadhaar: {
    label: 'Aadhaar number (kept in the secure vault)',
    inputMode: 'numeric',
    maxLength: 14,
    placeholder: '12 digits',
    valid: (v) => /^\d{12}$/.test(v.replace(/[\s-]/g, '')),
  },
  passportNumber: {
    label: 'Passport number (kept in the secure vault)',
    maxLength: 12,
    valid: (v) => /^[A-Z0-9]{6,12}$/i.test(v.replace(/\s/g, '')),
  },
};

/** The proposal details among the required keys (kept under the record's `proposal`). */
const PROPOSAL_KEYS = [
  'occupation',
  'pan',
  'address',
  'state',
  'city',
  'village',
  'nomineeName',
  'nomineeRelationship',
  'nomineeAddress',
  'intermediaryPlace',
  'highRiskType',
] as const satisfies readonly UiicRequiredKey[];

type View = { kind: 'client'; data: ClientView } | { kind: 'traveller'; data: TravellerView };

export interface UiicRequired {
  /** Still loading the record. */
  loading: boolean;
  /** The record could not be read. */
  error: string | null;
  missing: UiicRequiredKey[];
  values: Partial<Record<UiicRequiredKey, string>>;
  set: (key: UiicRequiredKey, value: string) => void;
  /** Every missing detail is given. */
  complete: boolean;
  /** Saves the details given to the record; the problem to show, or null once saved. */
  save: () => Promise<string | null>;
}

export function useUiicRequired(subject: UiicSubject): UiicRequired {
  const { kind, id, form } = subject;
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Partial<Record<UiicRequiredKey, string>>>({});

  const load = useCallback(async (): Promise<void> => {
    const r =
      kind === 'client'
        ? await window.fqf.clients
            .get(id)
            .then((x) => (x.ok ? ({ kind, data: x.data } as const) : null))
            .catch(() => null)
        : await window.fqf.travellers
            .get(id)
            .then((x) => (x.ok ? ({ kind, data: x.data } as const) : null))
            .catch(() => null);
    if (r) {
      setView(r);
      setError(null);
    } else setError("The client's details could not be read.");
  }, [kind, id]);

  useEffect(() => {
    setView(null);
    setValues({});
    void load();
  }, [load]);

  const missing: UiicRequiredKey[] = !view
    ? []
    : view.kind === 'client'
      ? uiicMissingForClient(form as UiicClientForm, view.data.client, {
          aadhaar: view.data.aadhaarLastFour !== null,
        })
      : uiicMissingForTraveller(form as UiicTravelForm, view.data.traveller, {
          passport: view.data.passportLastFour !== null,
        });
  const given = (k: UiicRequiredKey): string => (values[k] ?? '').trim();
  const complete = missing.every((k) => given(k) !== '');

  const save = async (): Promise<string | null> => {
    if (!view || missing.length === 0) return null;
    const wrong = missing.filter((k) => FIELDS[k].valid && !FIELDS[k].valid(given(k)));
    if (wrong.length > 0) return `Check: ${wrong.map((k) => FIELDS[k].label).join(', ')}.`;
    const proposalPatch = Object.fromEntries(
      PROPOSAL_KEYS.filter((k) => missing.includes(k)).map((k) => [
        k,
        k === 'pan' ? given(k).toUpperCase() : given(k),
      ]),
    );
    const customerPatch = {
      ...(missing.includes('email') ? { email: given('email') } : {}),
      ...(missing.includes('phone') ? { phone: given('phone') } : {}),
    };
    let result: Awaited<ReturnType<typeof window.fqf.clients.save>> | null;
    if (view.kind === 'client') {
      const client = view.data.client;
      const dob = given('dateOfBirth');
      const members = client.members.map((m) =>
        m.relationship !== 'self'
          ? m
          : {
              ...m,
              ...(dob ? { dateOfBirth: dob, age: ageOn(dob, new Date()) } : {}),
              ...(missing.includes('gender') ? { gender: given('gender') as Gender } : {}),
            },
      );
      result = await window.fqf.clients
        .save({
          id: view.data.id,
          client: {
            ...client,
            customer: { ...client.customer, ...customerPatch },
            members,
            ...(missing.includes('maritalStatus')
              ? { proposerMaritalStatus: given('maritalStatus') as 'married' | 'unmarried' }
              : {}),
            proposal: { ...client.proposal, ...proposalPatch },
          },
          ...(missing.includes('aadhaar') ? { aadhaar: given('aadhaar') } : {}),
        })
        .catch(() => null);
    } else {
      const t = view.data.traveller;
      result = await window.fqf.travellers
        .save({
          id: view.data.id,
          traveller: {
            ...t,
            customer: { ...t.customer, ...customerPatch },
            ...(missing.includes('gender') ? { gender: given('gender') as Gender } : {}),
            ...(missing.includes('maritalStatus')
              ? { maritalStatus: given('maritalStatus') as 'married' | 'unmarried' }
              : {}),
            ...(missing.includes('travelOccupation')
              ? { occupation: given('travelOccupation') as TravelOccupation }
              : {}),
            proposal: { ...t.proposal, ...proposalPatch },
          },
          ...(missing.includes('passportNumber') ? { passport: given('passportNumber') } : {}),
        })
        .catch(() => null);
    }
    if (!result?.ok) {
      return result?.error.code === 'VALIDATION_FAILED'
        ? 'A detail is not valid: check the boxes above.'
        : (result?.error.message ?? "The client's details could not be saved.");
    }
    setValues({});
    await load();
    return null;
  };

  return {
    loading: !view && !error,
    error,
    missing,
    values,
    set: (key, value) => setValues((v) => ({ ...v, [key]: value })),
    complete,
    save,
  };
}

/** The missing details, as boxes; nothing when the record has them all. */
export function UiicRequiredFields(props: { required: UiicRequired }): React.JSX.Element | null {
  const { required } = props;
  if (required.error) {
    return (
      <p className="error" role="alert">
        {required.error}
      </p>
    );
  }
  if (required.missing.length === 0) return null;
  return (
    <fieldset className="uiic-required">
      <legend>United India needs these first</legend>
      <p className="insurer-note">
        This client&rsquo;s record lacks details United India requires before it works the premium
        out. Fill them in: they are saved to the client when you start, and the app fills them in
        United India&rsquo;s form.
      </p>
      {required.missing.map((key) => {
        const f = FIELDS[key];
        const value = required.values[key] ?? '';
        return (
          <label key={key}>
            {f.label}
            {f.options ? (
              <select value={value} onChange={(e) => required.set(key, e.target.value)}>
                <option value="">Choose…</option>
                {f.options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type ?? 'text'}
                value={value}
                onChange={(e) => required.set(key, e.target.value)}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                inputMode={f.inputMode}
                autoComplete="off"
              />
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
