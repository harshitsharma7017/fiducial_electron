// A health client's quote choices for one insurer, in the client form's Additional details
// (request of 24 November 2026): what the quote screens used to ask besides the product, saved with
// the client so a quote asks only the product. See src/shared/contracts/client-quote.ts. Each
// insurer's choices are shown as titled section cards (the client form's redesign).
import { useState } from 'react';
import { FormGrid, FormSection } from '../ui/FormSection';
import {
  iciciSumsFor,
  QUOTE_DEFAULTS,
  type ClientQuoteChoices,
  type QuoteChoiceInsurer,
} from '../../../shared/contracts/client-quote';
import { NIVA_KNOWN_ADD_ONS, NIVA_SUMS_INSURED } from '../../../shared/insurers/niva-health';
import { NIA_PA_EXCESS, NIA_PA_STATUSES, NIA_PA_SUMS } from '../../../shared/insurers/nia-pa';
import {
  HDFC_CITIES,
  HDFC_ENERGY_PLANS,
  HDFC_OPTIMA_SECURE_PLANS,
} from '../../../shared/insurers/hdfc';
import { ICICI_BOOSTER_DEDUCTIBLES, ICICI_ELEVATE_SUMS } from '../../../shared/insurers/icici-api';
import { BAJAJ_OCCUPATIONS, type BajajOccupation } from '../../../shared/insurers/bajaj';
import { rememberedPosp, rememberPosp } from '../insurers/hdfc-posp';
import { ICICI_NYSA_ELEVATE_SUMS } from '../../../shared/insurers/icici-nysa';

const lakh = (n: number) => `₹${(n / 100000).toLocaleString('en-IN')} lakh`;
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const YEARS = [1, 2, 3] as const;

type Of<K extends QuoteChoiceInsurer> = NonNullable<ClientQuoteChoices[K]>;

/** A yes/no answer kept as a checkbox; unticked is saved as "no". */
function Check(props: {
  checked: boolean | undefined;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="check span-full">
      <input
        type="checkbox"
        checked={props.checked ?? false}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.children}
    </label>
  );
}

export function QuoteChoicesFields(props: {
  insurer: QuoteChoiceInsurer;
  value: ClientQuoteChoices;
  onChange: (value: ClientQuoteChoices) => void;
}): React.JSX.Element {
  const { insurer, value } = props;
  const patch = <K extends QuoteChoiceInsurer>(key: K, change: Partial<Of<K>>) =>
    props.onChange({ ...value, [key]: { ...(value[key] ?? {}), ...change } });
  return (
    <>
      {insurer === 'united-india' && (
        <FormSection title="Quote choices" description={CHOICES_NOTE}>
          <FormGrid>
            <Check
              checked={value['united-india']?.goodHealth}
              onChange={(goodHealth) => patch('united-india', { goodHealth })}
            >
              Every member is in good health: no obesity, diabetes, hypertension or pre-existing
              condition (United India&rsquo;s declaration for its health calculator).
            </Check>
          </FormGrid>
        </FormSection>
      )}
      {insurer === 'new-india' && (
        <NewIndia value={value['new-india'] ?? {}} patch={(c) => patch('new-india', c)} />
      )}
      {insurer === 'niva-bupa' && (
        <Niva value={value['niva-bupa'] ?? {}} patch={(c) => patch('niva-bupa', c)} />
      )}
      {insurer === 'hdfc-ergo' && (
        <Hdfc value={value['hdfc-ergo'] ?? {}} patch={(c) => patch('hdfc-ergo', c)} />
      )}
      {insurer === 'bajaj-allianz' && (
        <Bajaj value={value['bajaj-allianz'] ?? {}} patch={(c) => patch('bajaj-allianz', c)} />
      )}
      {insurer === 'icici-lombard' && (
        <Icici value={value['icici-lombard'] ?? {}} patch={(c) => patch('icici-lombard', c)} />
      )}
    </>
  );
}

/** What the quote choices are, said once at the top of an insurer's first choices section. */
const CHOICES_NOTE =
  'What this insurer’s quotes use besides the product: the quote screen asks only the product. A choice left as it is uses the default shown.';

function NewIndia(props: {
  value: Of<'new-india'>;
  patch: (c: Partial<Of<'new-india'>>) => void;
}): React.JSX.Element {
  const { value: c, patch } = props;
  return (
    <>
      <FormSection title="Health policies" description={CHOICES_NOTE}>
        <FormGrid>
          <Check checked={c.goodHealth} onChange={(goodHealth) => patch({ goodHealth })}>
            No member has diabetes, hypertension, a critical, chronic or recurring illness or an
            adverse medical history (New India&rsquo;s questions).
          </Check>
        </FormGrid>
      </FormSection>
      <FormSection title="Personal accident (Sukshma, Janata)">
        <FormGrid columns={4}>
          <label>
            Sum insured
            <select
              value={c.paSumInsured ?? QUOTE_DEFAULTS.paSumInsured}
              onChange={(e) =>
                patch({ paSumInsured: e.target.value as Of<'new-india'>['paSumInsured'] })
              }
            >
              {NIA_PA_SUMS.map((s) => (
                <option key={s} value={s}>
                  {rupees(Number(s))}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status of the insured
            <select
              value={c.paStatus ?? QUOTE_DEFAULTS.paStatus}
              onChange={(e) => patch({ paStatus: e.target.value as Of<'new-india'>['paStatus'] })}
            >
              {Object.entries(NIA_PA_STATUSES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Years
            <select
              value={c.paTerm ?? QUOTE_DEFAULTS.paTerm}
              onChange={(e) => patch({ paTerm: Number(e.target.value) })}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            Excess (Janata, %)
            <select
              value={c.paExcess ?? QUOTE_DEFAULTS.paExcess}
              onChange={(e) => patch({ paExcess: e.target.value as Of<'new-india'>['paExcess'] })}
            >
              {NIA_PA_EXCESS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        </FormGrid>
      </FormSection>
      <FormSection title="Personal accident (Pension)">
        <FormGrid>
          <label>
            Monthly pension (₹)
            <input
              inputMode="numeric"
              value={c.monthlyPensionRupees ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ''));
                patch({ monthlyPensionRupees: n > 0 ? n : undefined });
              }}
            />
          </label>
          <label>
            Organisation before retirement
            <input
              maxLength={30}
              value={c.pensionOrganisation ?? ''}
              onChange={(e) => patch({ pensionOrganisation: e.target.value || undefined })}
            />
          </label>
        </FormGrid>
      </FormSection>
      <FormSection title="Declarations">
        <FormGrid>
          <Check checked={c.noClaims} onChange={(noClaims) => patch({ noClaims })}>
            No claim in the previous three years (New India does not issue the policy online
            otherwise).
          </Check>
          <Check
            checked={c.noDisabilities}
            onChange={(noDisabilities) => patch({ noDisabilities })}
          >
            The insured has no physical disabilities or defects.
          </Check>
        </FormGrid>
      </FormSection>
    </>
  );
}

function Niva(props: {
  value: Of<'niva-bupa'>;
  patch: (c: Partial<Of<'niva-bupa'>>) => void;
}): React.JSX.Element {
  const { value: c, patch } = props;
  const addOns = c.addOns ?? [];
  const known = addOns.filter((a) => (NIVA_KNOWN_ADD_ONS as readonly string[]).includes(a));
  const [others, setOthers] = useState(
    addOns.filter((a) => !(NIVA_KNOWN_ADD_ONS as readonly string[]).includes(a)).join(', '),
  );
  const setAddOns = (nextKnown: string[], nextOthers: string) => {
    const typed = nextOthers
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length >= 2);
    patch({ addOns: [...nextKnown, ...typed] });
  };
  return (
    <>
      <FormSection title="Quote choices" description={CHOICES_NOTE}>
        <FormGrid>
          <label>
            Sum insured
            <select
              value={c.sumInsured ?? QUOTE_DEFAULTS.nivaSumInsured}
              onChange={(e) => patch({ sumInsured: Number(e.target.value) })}
            >
              {NIVA_SUMS_INSURED.map((s) => (
                <option key={s} value={s}>
                  {rupees(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Policy period
            <select
              value={c.years ?? QUOTE_DEFAULTS.nivaYears}
              onChange={(e) => patch({ years: Number(e.target.value) as 1 | 2 | 3 })}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y} year{y > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
        </FormGrid>
      </FormSection>
      <FormSection
        title="Key add-ons"
        description="Ticked add-ons are chosen on Niva Bupa's calculator."
      >
        <div className="check-grid">
          {NIVA_KNOWN_ADD_ONS.map((a) => (
            <Check
              key={a}
              checked={known.includes(a)}
              onChange={(on) =>
                setAddOns(on ? [...known, a] : known.filter((k) => k !== a), others)
              }
            >
              {a}
            </Check>
          ))}
        </div>
        <FormGrid>
          <label className="span-full">
            Others, as Niva Bupa names them (comma-separated)
            <input
              value={others}
              onChange={(e) => {
                setOthers(e.target.value);
                setAddOns(known, e.target.value);
              }}
            />
          </label>
        </FormGrid>
      </FormSection>
      <FormSection title="Network and declarations">
        <FormGrid>
          <Check checked={c.tieredNetwork} onChange={(tieredNetwork) => patch({ tieredNetwork })}>
            Tiered Network (Niva Bupa&rsquo;s discount with a co-pay)
          </Check>
          <Check
            checked={c.medicalPractitioner}
            onChange={(medicalPractitioner) => patch({ medicalPractitioner })}
          >
            An insured member is a medical practitioner
          </Check>
          <label>
            Porting a current health policy: its end date (leave empty if not porting)
            <input
              type="date"
              value={c.previousPolicyEndDate ?? ''}
              onChange={(e) => patch({ previousPolicyEndDate: e.target.value || undefined })}
            />
          </label>
        </FormGrid>
      </FormSection>
    </>
  );
}

function Hdfc(props: {
  value: Of<'hdfc-ergo'>;
  patch: (c: Partial<Of<'hdfc-ergo'>>) => void;
}): React.JSX.Element {
  const { value: c, patch } = props;
  const [posp, setPosp] = useState(rememberedPosp);
  const years = (v: number | undefined, key: 'years' | 'mstYears', fallback: number) => (
    <select
      value={v ?? fallback}
      onChange={(e) => patch({ [key]: Number(e.target.value) as 1 | 2 | 3 })}
    >
      {YEARS.map((y) => (
        <option key={y} value={y}>
          {y} year{y > 1 ? 's' : ''}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <FormSection title="MST (Medisure Super Top-up)" description={CHOICES_NOTE}>
        <FormGrid>
          <label>
            Cover
            <select
              value={c.mstCover ?? QUOTE_DEFAULTS.mstCover}
              onChange={(e) => patch({ mstCover: e.target.value as Of<'hdfc-ergo'>['mstCover'] })}
            >
              <option value="family-floater">Family floater</option>
              <option value="individual">Individual</option>
            </select>
          </label>
          <label>
            Term
            {years(c.mstYears, 'mstYears', QUOTE_DEFAULTS.mstYears)}
          </label>
        </FormGrid>
      </FormSection>
      <FormSection title="Optima Secure, Optima Restore, Energy">
        <FormGrid columns={3}>
          <label>
            Cover (Optima)
            <select
              value={c.cover ?? QUOTE_DEFAULTS.hdfcCover}
              onChange={(e) => patch({ cover: e.target.value as Of<'hdfc-ergo'>['cover'] })}
            >
              <option value="individual">Individual</option>
              <option value="family">Family</option>
            </select>
          </label>
          <label>
            Policy period
            {years(c.years, 'years', QUOTE_DEFAULTS.hdfcYears)}
          </label>
          <label>
            Sum insured (lakh, Optima)
            <input
              type="number"
              min={1}
              max={500}
              value={c.sumInsuredLacs ?? QUOTE_DEFAULTS.hdfcSumInsuredLacs}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({ sumInsuredLacs: n >= 1 && n <= 500 ? Math.round(n) : undefined });
              }}
            />
          </label>
          <label>
            Optima Secure plan
            <select
              value={c.optimaSecurePlan ?? ''}
              onChange={(e) => patch({ optimaSecurePlan: e.target.value || undefined })}
            >
              <option value="">(PIE&rsquo;s first)</option>
              {HDFC_OPTIMA_SECURE_PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Energy plan
            <select
              value={c.energyPlan ?? ''}
              onChange={(e) => patch({ energyPlan: e.target.value || undefined })}
            >
              <option value="">(PIE&rsquo;s first)</option>
              {HDFC_ENERGY_PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            I stay in (Optima Restore, Energy)
            <select
              value={c.city ?? QUOTE_DEFAULTS.hdfcCity}
              onChange={(e) => patch({ city: e.target.value as Of<'hdfc-ergo'>['city'] })}
            >
              {HDFC_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
          <label>
            Existing health insurance sum insured (₹, Energy, if any)
            <input
              inputMode="numeric"
              value={c.existingSumInsured ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ''));
                patch({ existingSumInsured: n > 0 ? n : undefined });
              }}
            />
          </label>
        </FormGrid>
      </FormSection>
      <FormSection
        title="Intermediary"
        description="Yours, not the client's: kept on this computer for every client."
      >
        <FormGrid>
          <label>
            Your SP/POSP name or code
            <input
              value={posp}
              onChange={(e) => {
                setPosp(e.target.value);
                rememberPosp(e.target.value.trim());
              }}
            />
          </label>
        </FormGrid>
      </FormSection>
    </>
  );
}

function Icici(props: {
  value: Of<'icici-lombard'>;
  patch: (c: Partial<Of<'icici-lombard'>>) => void;
}): React.JSX.Element {
  const { value: c, patch } = props;
  // Elevate's sums, then Activate Booster's others.
  const sums = [...new Set([...ICICI_ELEVATE_SUMS, ...iciciSumsFor('activate-booster')])].sort(
    (a, b) => a - b,
  );
  return (
    <>
      <FormSection title="Partner API (Elevate, Activate Booster)" description={CHOICES_NOTE}>
        <FormGrid>
          <label>
            Sum insured (partner API; Elevate: ₹5, 10 or 25 lakh)
            <select
              value={c.sumInsured ?? QUOTE_DEFAULTS.iciciSumInsured}
              onChange={(e) => patch({ sumInsured: Number(e.target.value) })}
            >
              {sums.map((s) => (
                <option key={s} value={s}>
                  {lakh(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deductible (Activate Booster&rsquo;s base cover)
            <select
              value={c.deductible ?? QUOTE_DEFAULTS.iciciDeductible}
              onChange={(e) => patch({ deductible: Number(e.target.value) })}
            >
              {ICICI_BOOSTER_DEDUCTIBLES.map((d) => (
                <option key={d} value={d}>
                  {lakh(d)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Term
            <select
              value={c.tenure ?? QUOTE_DEFAULTS.iciciTenure}
              onChange={(e) => patch({ tenure: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  {y} year{y > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment
            <select
              value={c.paymentOption ?? QUOTE_DEFAULTS.iciciPayment}
              onChange={(e) =>
                patch({ paymentOption: e.target.value as Of<'icici-lombard'>['paymentOption'] })
              }
            >
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </label>
        </FormGrid>
      </FormSection>
      <FormSection title="Elevate on NYSA">
        <FormGrid>
          <label>
            Sum insured on NYSA (Elevate)
            <select
              value={c.nysaSumInsured ?? QUOTE_DEFAULTS.iciciNysaSumInsured}
              onChange={(e) => patch({ nysaSumInsured: Number(e.target.value) })}
            >
              {ICICI_NYSA_ELEVATE_SUMS.map((s) => (
                <option key={s} value={s}>
                  {lakh(s)}
                </option>
              ))}
            </select>
          </label>
          <Rupees
            label="Applicant's annual income (Elevate on NYSA)"
            value={c.annualIncome}
            onChange={(annualIncome) => patch({ annualIncome })}
          />
        </FormGrid>
      </FormSection>
      <FormSection title="Declarations">
        <FormGrid>
          <label>
            Any member with a pre-existing disease?
            <select
              value={c.preExistingDisease === undefined ? '' : c.preExistingDisease ? 'yes' : 'no'}
              onChange={(e) =>
                patch({
                  preExistingDisease: e.target.value === '' ? undefined : e.target.value === 'yes',
                })
              }
            >
              <option value="">Not asked yet</option>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
        </FormGrid>
      </FormSection>
    </>
  );
}

/** A whole number of rupees typed in a box, or nothing. */
function Rupees(props: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}): React.JSX.Element {
  return (
    <label>
      {props.label}
      <input
        inputMode="numeric"
        value={props.value ?? ''}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''));
          props.onChange(n > 0 ? n : undefined);
        }}
      />
    </label>
  );
}

function Bajaj(props: {
  value: Of<'bajaj-allianz'>;
  patch: (c: Partial<Of<'bajaj-allianz'>>) => void;
}): React.JSX.Element {
  const { value: c, patch } = props;
  return (
    <>
      <FormSection title="Personal Accident" description={CHOICES_NOTE}>
        <FormGrid>
          <label>
            Policy tenure
            <select
              value={c.paTenureYears ?? 1}
              onChange={(e) => patch({ paTenureYears: Number(e.target.value) as 1 | 2 | 3 })}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y} year{y > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <Rupees
            label="Family income, a year (₹)"
            value={c.familyIncome}
            onChange={(familyIncome) => patch({ familyIncome })}
          />
          <Rupees
            label="Gross monthly income (₹)"
            value={c.monthlyIncome}
            onChange={(monthlyIncome) => patch({ monthlyIncome })}
          />
          <label>
            Occupation (Bajaj's list)
            <select
              value={c.occupation ?? ''}
              onChange={(e) =>
                patch({ occupation: (e.target.value || undefined) as BajajOccupation | undefined })
              }
            >
              <option value="">Not given</option>
              {(Object.entries(BAJAJ_OCCUPATIONS) as [BajajOccupation, string][]).map(
                ([code, n]) => (
                  <option key={code} value={code}>
                    {n}
                  </option>
                ),
              )}
            </select>
          </label>
        </FormGrid>
      </FormSection>
      <FormSection title="Sums insured" description="At least one cover, as Bajaj asks.">
        <FormGrid columns={3}>
          <Rupees
            label="Death (₹)"
            value={c.deathSumInsured}
            onChange={(deathSumInsured) => patch({ deathSumInsured })}
          />
          <Rupees
            label="Permanent partial disability (₹)"
            value={c.partialDisabilitySumInsured}
            onChange={(partialDisabilitySumInsured) => patch({ partialDisabilitySumInsured })}
          />
          <Rupees
            label="Permanent total disability (₹)"
            value={c.totalDisabilitySumInsured}
            onChange={(totalDisabilitySumInsured) => patch({ totalDisabilitySumInsured })}
          />
        </FormGrid>
      </FormSection>
    </>
  );
}
