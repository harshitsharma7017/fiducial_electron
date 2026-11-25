// Proposal details for e-proposal forms (PAN, address, high risk, nominee, intermediary…), as
// health clients (per insurer, in their Additional details) and travel clients keep them, and the
// Aadhaar number (kept apart, in the secret vault: the form only knows its last four digits).
import {
  HIGH_RISK_TYPES,
  NOMINEE_RELATIONSHIPS,
  UIIC_OCCUPATIONS,
  type HighRiskType,
  type NomineeRelationship,
} from '../../../shared/contracts/client';
import {
  HIGH_RISK_LABELS,
  NOMINEE_LABELS,
  type AadhaarDraft,
  type ProposalDraft,
  type ProposalTextKey,
} from './proposal-draft';

export * from './proposal-draft';

export function ProposalFields(props: {
  value: ProposalDraft;
  onChange: (value: ProposalDraft) => void;
  /** The Aadhaar number (one per client): not shown when absent. */
  aadhaar?: AadhaarDraft;
  onAadhaarChange?: (value: AadhaarDraft) => void;
  /** The health forms' occupation list (not shown for travel clients, who have their own). */
  occupation?: boolean;
  /** The occupation list to choose from (United India's when absent). */
  occupations?: readonly string[];
  /** Only these fields (an insurer's); all when absent. */
  fields?: readonly string[];
  legend?: string;
  note?: React.ReactNode;
}): React.JSX.Element {
  const a = props.aadhaar;
  const setAadhaar = (patch: Partial<AadhaarDraft>) =>
    a && props.onAadhaarChange?.({ ...a, ...patch });
  const p = props.value;
  const set = (patch: Partial<ProposalDraft>) => props.onChange({ ...p, ...patch });
  const shown = props.fields ? new Set(props.fields) : null;
  const has = (key: string) => shown === null || shown.has(key);
  const occupations = props.occupations ?? UIIC_OCCUPATIONS;
  const text = (
    key: ProposalTextKey,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) =>
    has(key) ? (
      <label>
        {label}
        <input
          value={p[key]}
          onChange={(e) => set({ [key]: e.target.value })}
          autoComplete="off"
          {...extra}
        />
      </label>
    ) : null;
  const nominee = ['nomineeName', 'nomineeRelationship', 'nomineeAddress', 'nomineeContact'].some(
    has,
  );
  return (
    <fieldset>
      <legend>{props.legend ?? 'Proposal details (for e-proposal forms)'}</legend>
      {props.note ?? (
        <p className="insurer-note">
          Everything here is optional and stored encrypted. The Aadhaar number is kept apart, in the
          same secure vault as insurer passwords; after saving, only its last four digits are shown.
        </p>
      )}
      <h4>Proposer</h4>
      {text('pan', 'PAN', { maxLength: 10, placeholder: 'ABCDE1234F' })}
      {a && (
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
      )}
      {text('address', 'Address', { maxLength: 200 })}
      {(has('state') || has('city')) && (
        <div className="member-row">
          {text('state', 'State (as the insurer lists it)', { maxLength: 60 })}
          {text('city', 'City (as the insurer lists it)', { maxLength: 80 })}
        </div>
      )}
      {text('village', 'Village or locality (as the insurer lists it for the pincode)', {
        maxLength: 100,
      })}
      {props.occupation !== false && has('occupation') && (
        <label>
          Occupation
          <select value={p.occupation} onChange={(e) => set({ occupation: e.target.value })}>
            <option value="">Not given</option>
            {/* A saved occupation this list does not have is still shown (as saved). */}
            {p.occupation && !occupations.includes(p.occupation) && (
              <option value={p.occupation}>{p.occupation}</option>
            )}
            {occupations.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      )}
      {(has('landlineStdCode') || has('landlineNumber')) && (
        <div className="member-row">
          {text('landlineStdCode', 'Landline STD code', { inputMode: 'numeric', maxLength: 6 })}
          {text('landlineNumber', 'Landline number', { inputMode: 'numeric', maxLength: 10 })}
        </div>
      )}
      {text('ckycNumber', 'CKYC number (14 digits)', { inputMode: 'numeric', maxLength: 16 })}
      {text('eInsuranceAccountNumber', 'E-insurance account number', { maxLength: 20 })}
      {has('highRiskCustomer') && (
        <label className="check">
          <input
            type="checkbox"
            checked={p.highRiskCustomer}
            onChange={(e) => set({ highRiskCustomer: e.target.checked })}
          />
          High-risk customer (high-net-worth individual, politically exposed person, NRI who is also
          HNI, or trust/NGO)
        </label>
      )}
      {has('highRiskCustomer') && p.highRiskCustomer && (
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
      {nominee && <h4>Nominee</h4>}
      {text('nomineeName', "Nominee's name", { maxLength: 100 })}
      {has('nomineeRelationship') && (
        <label>
          Nominee relationship
          <select
            value={p.nomineeRelationship}
            onChange={(e) =>
              set({ nomineeRelationship: e.target.value as NomineeRelationship | '' })
            }
          >
            <option value="">Not given</option>
            {NOMINEE_RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {NOMINEE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      )}
      {text('nomineeAddress', "Nominee's address", { maxLength: 200 })}
      {text('nomineeContact', "Nominee's contact number", { inputMode: 'tel', maxLength: 14 })}
      {has('intermediaryPlace') && <h4>Intermediary</h4>}
      {text('intermediaryPlace', 'Place of signing (your town or city)', { maxLength: 60 })}
    </fieldset>
  );
}
