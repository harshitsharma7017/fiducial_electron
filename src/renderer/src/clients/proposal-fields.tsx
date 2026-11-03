// Proposal details for e-proposal forms (PAN, address, high risk, nominee, intermediary…), as
// health clients and travel clients both keep them, and the Aadhaar number (kept apart, in the
// secret vault: the form only knows its last four digits).
import {
  HIGH_RISK_TYPES,
  NOMINEE_RELATIONSHIPS,
  UIIC_OCCUPATIONS,
  type HighRiskType,
  type MaritalStatus,
  type NomineeRelationship,
  type ProposalDetails,
} from '../../../shared/contracts/client';

export const MARITAL_LABELS: Record<MaritalStatus, string> = {
  married: 'Married',
  unmarried: 'Unmarried',
  widowed: 'Widow / widower',
  divorced: 'Divorced',
};

export const NOMINEE_LABELS: Record<NomineeRelationship, string> = {
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
export const PROPOSAL_TEXT = [
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
export type ProposalTextKey = (typeof PROPOSAL_TEXT)[number];

export type ProposalDraft = Record<ProposalTextKey, string> & {
  nomineeRelationship: NomineeRelationship | '';
  highRiskCustomer: boolean;
  highRiskType: HighRiskType | '';
};

export const HIGH_RISK_LABELS: Record<HighRiskType, string> = {
  hni: 'High-net-worth individual (HNI)',
  pep: 'Politically exposed person (PEP) or close relative',
  'nri-hni': 'NRI / foreign resident who is also HNI',
  'trust-ngo': 'Trust / NGO paying over ₹10 lakh premium a year',
};

export const EMPTY_PROPOSAL: ProposalDraft = {
  ...(Object.fromEntries(PROPOSAL_TEXT.map((k) => [k, ''])) as Record<ProposalTextKey, string>),
  nomineeRelationship: '',
  highRiskCustomer: false,
  highRiskType: '',
};

/** The Aadhaar number, kept apart (secret vault): the form only knows its last four digits. */
export interface AadhaarDraft {
  lastFour: string | null;
  /** A new number typed in (replaces any saved one). */
  input: string;
  remove: boolean;
}

/** The details given, for saving: empty boxes are not saved. */
export function proposalToInput(
  d: ProposalDraft,
  options: { occupation?: boolean } = {},
): Record<string, unknown> {
  const keys = PROPOSAL_TEXT.filter((k) => options.occupation !== false || k !== 'occupation');
  return {
    ...Object.fromEntries(keys.filter((k) => d[k].trim()).map((k) => [k, d[k].trim()])),
    ...(d.nomineeRelationship ? { nomineeRelationship: d.nomineeRelationship } : {}),
    highRiskCustomer: d.highRiskCustomer,
    ...(d.highRiskCustomer && d.highRiskType ? { highRiskType: d.highRiskType } : {}),
  };
}

/** A saved record's details, for the form. */
export function proposalFromRecord(p: Partial<ProposalDetails> | undefined): ProposalDraft {
  return {
    ...(Object.fromEntries(PROPOSAL_TEXT.map((k) => [k, p?.[k] ?? ''])) as Record<
      ProposalTextKey,
      string
    >),
    nomineeRelationship: p?.nomineeRelationship ?? '',
    highRiskCustomer: p?.highRiskCustomer ?? false,
    highRiskType: p?.highRiskType ?? '',
  };
}

/** The Aadhaar change to send with a save: a new number, null to remove it, or nothing. */
export function aadhaarChange(a: AadhaarDraft): { aadhaar?: string | null } {
  return a.input.trim() ? { aadhaar: a.input.trim() } : a.remove ? { aadhaar: null } : {};
}

export function ProposalFields(props: {
  value: ProposalDraft;
  onChange: (value: ProposalDraft) => void;
  aadhaar: AadhaarDraft;
  onAadhaarChange: (value: AadhaarDraft) => void;
  /** The health forms' occupation list (not shown for travel clients, who have their own). */
  occupation?: boolean;
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
      {props.occupation !== false && (
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
      )}
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
