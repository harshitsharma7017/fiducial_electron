// New India: the health quote forms (QuoteNonCustomer.html) of twelve policies, for a saved
// health client. Built from the recording new-india-2026-11-04T09-24-53-914Z, in which every
// health product's form was opened from the dashboard (Product Selection, HEALTH, the policy's
// tile), its sections opened and its members added. Nothing was typed in it and no premium was
// worked out, so:
//   - dates of birth are typed as dd/mm/yyyy (the boxes are labelled so and are not read-only);
//   - the run fills and stops: it never presses Save & Calculate Premium (that saves a quote on
//     New India) or Continue. The advisor checks the form and presses it.
// What every form shares: the sections Policy Period, Basic Information and Member Information
// (links whose text ends with a count New India keeps up to date); the proposer's date of birth
// (#proposerDob); one "Add …" button per member, each adding one row numbered in the order added
// (#spouseDob; #childDob0 or #daughterDob0, …; #parentDob0, …; #parentInLawDob0, …).
// What differs is in FORMS below. What the client record cannot answer (threshold limits of
// top-ups, plans, zones, smoking, earning member, the terms box) is left to the advisor and listed.
import { ageOn, type ClientInput, type ClientMember } from '../../shared/contracts/client';
import { type NiaHealthPolicy, NIA_HEALTH_POLICY_NAMES } from '../../shared/insurers/nia-health';
import type { PageOp } from './page-ops';
import type { PlanStep } from './uiic-health';

export interface NiaHealthStep extends PlanStep {
  /** The step opens one of New India's pop-ups on purpose (the postal codes list). */
  dialogOk?: boolean;
}

type ChildButtons = string | { son: string; daughter: string };
type ParentButtons = string | { father: string; mother: string };

interface NiaHealthForm {
  /** The form's heading, as recorded. */
  heading: string;
  /** Members the form takes besides the proposer: the button that adds each. */
  spouse?: string;
  children?: ChildButtons;
  parents?: ParentButtons;
  parentsInLaw?: string;
  /** Proposer only (one person per quote). */
  single?: boolean;
  /** Policy Period offers 1, 2 or 3 years (radios #policyPeriod1-3). */
  period?: boolean;
  /** What shows once Basic Information is open (to open it only if it is not). */
  basic?: { selector?: string; text?: string };
  /** Policy holder's pincode with New India's postal code search (Arogya Sanjeevani). */
  pincodeSearch?: boolean;
  /** One sum insured for the family (floater), in Basic Information. `tile`: the FLOATER tile
   * that shows it, when the form asks the cover type that way. */
  floaterSum?: { selector: string; tile?: boolean; rupees: readonly number[] };
  /** A sum insured asked of each member (#propSumInsured, #spouseSumInsured, …): individual cover. */
  memberSum?: { rupees: readonly number[] };
  /** Child's dependent type (a select per child), set to Normal for a child under 18. */
  childDependentType?: (i: number) => string;
  /** Diabetes and hypertension asked of each member (Yes/No radios): "No" when confirmed. */
  diabetesHypertension?: boolean;
  /** Gender asked of each member (radios). */
  genderRadios?: boolean;
  /** New India asks, before it opens the form, whether anyone has a listed condition. */
  askedOnOpen?: boolean;
  /** Always for the advisor, on this form. */
  byHand: string[];
}

const TERMS = 'New India\'s terms (the "I agree" box)';
const lakhs = (...l: number[]) => l.map((n) => n * 100_000);

const FORMS: Record<NiaHealthPolicy, NiaHealthForm> = {
  'arogya-pragati-plus': {
    heading: 'Arogya Pragati Plus (Top up Reinvented) (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: 'Add Child',
    parents: 'Add Parent',
    period: true,
    childDependentType: (i) => `#dependentType${i}`,
    byHand: [
      'cover type (Floater or Individual) and plan (Gold or Platinum)',
      'threshold limit and sum insured (for each member on individual cover)',
      TERMS,
    ],
  },
  'arogya-sanjeevani': {
    heading: 'Arogya Sanjeevani Policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: 'Add Children',
    parents: 'Add Parent',
    parentsInLaw: 'Add Parent-In-Law',
    basic: { selector: '#pincodeAdd' },
    pincodeSearch: true,
    floaterSum: {
      selector: '#propSumInsuredFloater',
      tile: true,
      rupees: Array.from({ length: 20 }, (_, i) => (i + 1) * 50_000),
    },
    childDependentType: (i) => `#childDepType${i}`,
    diabetesHypertension: true,
    byHand: ['premium payment frequency', 'height and weight of each member (optional)', TERMS],
  },
  'jan-arogya-bima': {
    heading: 'Jan Arogya Bima Policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: { son: 'Add Son', daughter: 'Add Daughter' },
    period: true,
    // The sum insured is fixed by New India.
    byHand: [TERMS],
  },
  'janata-mediclaim': {
    heading: 'Janata Mediclaim Policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: { son: 'Add Son', daughter: 'Add Daughter' },
    parents: { father: 'Add Father', mother: 'Add Mother' },
    period: true,
    memberSum: { rupees: [50_000, 75_000] },
    byHand: [TERMS],
  },
  'asha-kiran': {
    heading: 'New India Asha Kiran Policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: { son: '', daughter: 'Add Daughter' },
    basic: { selector: '#propSumInsured' },
    floaterSum: { selector: '#propSumInsured', rupees: lakhs(2, 3, 5, 8, 10, 12, 15) },
    childDependentType: (i) => `#dependentType${i}`,
    byHand: ['city of residence (Zone I, II or III)', TERMS],
  },
  'cancer-guard': {
    heading: 'New India Cancer Guard Policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: 'Add Children',
    parents: 'Add Parent',
    period: true,
    genderRadios: true,
    byHand: [
      'sum insured of each member',
      'smoking and tobacco answers of each member',
      'whether the parents were diagnosed with cancer',
      'the declaration that no member holds a Cancer Guard policy',
      TERMS,
    ],
  },
  'criti-protect': {
    heading: 'New India Criti Protect Policy (Cashless facility available) Insurance',
    single: true,
    byHand: [
      'critical illnesses plan',
      'earning member and occupation',
      'height and weight',
      'policy period',
      TERMS,
    ],
  },
  mediclaim: {
    heading: 'New India Mediclaim Policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: 'Add Child',
    parents: 'Add Parent',
    period: true,
    memberSum: { rupees: lakhs(1, 2, 3, 5, 8, 10, 12, 15) },
    byHand: [
      'whether the client has a previous health policy',
      'zone (I: Maharashtra and Gujarat; II: rest of India)',
      "each child's dependent type",
      TERMS,
    ],
  },
  'premier-mediclaim': {
    heading: 'New India Premier Mediclaim Policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: 'Add Child',
    askedOnOpen: true,
    byHand: ['plan (A or B), cover type and sum insured', TERMS],
  },
  'top-up-mediclaim': {
    heading: 'New India TOP-UP Mediclaim Policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: 'Add Child',
    childDependentType: (i) => `#dependentType${i}`,
    byHand: ['cover type, threshold limit and sum insured', TERMS],
  },
  'universal-health': {
    heading: 'Universal Health Insurance Scheme (APL)(Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: 'Add Child',
    // The sum insured is fixed by New India.
    byHand: ['policy start date', TERMS],
  },
  'yuva-bharat': {
    heading: 'Yuva Bharat Health policy (Cashless facility available) Insurance',
    spouse: 'Add Spouse',
    children: 'Add Child',
    period: true,
    basic: { text: 'FLOATER' },
    floaterSum: {
      selector: '#propSumInsuredFloater',
      tile: true,
      rupees: lakhs(5, 10, 15, 25, 50, 75, 100),
    },
    byHand: [
      'zone and plan type (Base, Gold or Platinum), premium payment frequency',
      'blood pressure, diabetes (HbA1c) and hospitalisation answers',
      'maternity cover',
      TERMS,
    ],
  },
};

/** The form New India opens for a policy: its heading and the dashboard tiles that may open it. */
export function niaHealthForm(policy: NiaHealthPolicy): {
  name: string;
  heading: string;
  tiles: string[];
  askedOnOpen: boolean;
} {
  const form = FORMS[policy];
  const full = form.heading.replace(/\s*Insurance$/, '');
  // The tile likely reads as the heading without "Insurance" (as on the motor tiles); else
  // without New India's "(Cashless facility available)" note.
  const short = full.replace(/\s*\(Cashless facility available\)\s*$/, '').trim();
  return {
    name: NIA_HEALTH_POLICY_NAMES[policy],
    heading: form.heading,
    tiles: [...new Set([full, short])],
    askedOnOpen: form.askedOnOpen ?? false,
  };
}

export type NiaHealthPlan =
  { ok: true; steps: NiaHealthStep[]; byHand: string[] } | { ok: false; problems: string[] };

const GENDER_INDEX = { male: 0, female: 1, transgender: 2 } as const;
const rupeesText = (r: number) => `₹${r.toLocaleString('en-IN')}`;

/**
 * Checks the client against the policy's form and lists every step. `goodHealth`: the advisor's
 * confirmation, for this quote, that no member has diabetes, hypertension or another listed
 * condition (answers "No" where the form asks it).
 */
export function planNiaHealthQuote(
  client: ClientInput,
  options: { policy: NiaHealthPolicy; goodHealth: boolean; today: Date },
): NiaHealthPlan {
  const form = FORMS[options.policy];
  const name = NIA_HEALTH_POLICY_NAMES[options.policy];
  const problems: string[] = [];
  const byHand: string[] = [];

  const of = (...r: ClientMember['relationship'][]) =>
    client.members.filter((m) => r.includes(m.relationship));
  const selves = of('self');
  const spouses = of('spouse');
  const children = of('son', 'daughter');
  const parents = of('father', 'mother');
  const inLaws = of('father_in_law', 'mother_in_law');
  if (selves.length !== 1) problems.push('The client needs exactly one member who is "Self".');
  if (spouses.length > 1) problems.push('Only one spouse can be added.');
  const self = selves[0];

  const childButton = (m: ClientMember): string | undefined =>
    typeof form.children === 'string'
      ? form.children
      : form.children?.[m.relationship === 'son' ? 'son' : 'daughter'] || undefined;
  const parentButton = (m: ClientMember): string | undefined =>
    typeof form.parents === 'string'
      ? form.parents
      : form.parents?.[m.relationship === 'father' ? 'father' : 'mother'];

  if (!form.single) {
    if (spouses.length > 0 && !form.spouse) problems.push(`${name} does not cover a spouse.`);
    if (children.some((c) => !childButton(c))) {
      problems.push(
        form.children
          ? `${name} covers daughters only, not sons.`
          : `${name} does not cover children.`,
      );
    }
    if (parents.length > 0 && !form.parents) problems.push(`${name} does not cover parents.`);
    if (inLaws.length > 0 && !form.parentsInLaw) {
      problems.push(`${name} does not cover parents-in-law.`);
    }
  }
  const covered = form.single
    ? selves
    : [...selves, ...spouses, ...children, ...parents, ...inLaws];
  for (const m of covered) {
    const who = m.relationship === 'self' ? 'proposer (self)' : m.relationship.replace(/_/g, ' ');
    if (!m.dateOfBirth) problems.push(`Add the ${who}'s date of birth.`);
    if (form.genderRadios && !m.gender) problems.push(`Add the ${who}'s gender.`);
  }
  if (form.askedOnOpen && !options.goodHealth) {
    problems.push(
      `Before it opens ${name}, New India asks whether anyone to be insured has hypertension, diabetes, a critical, chronic or recurring illness or an adverse medical history, and opens the form only if not. Confirm good health for this quote, or open the form by hand.`,
    );
  }
  if (problems.length > 0 || !self) return { ok: false, problems };

  const steps: NiaHealthStep[] = [];
  const add = (label: string, op: PageOp, more: Partial<NiaHealthStep> = {}) =>
    steps.push({ label, op, ...more });
  const prefs = client.preferences;

  // Policy Period: 1 year is New India's default.
  if (form.period && prefs && prefs.tenureYears > 1) {
    if (prefs.tenureYears > 3) byHand.push('policy period (New India offers 1, 2 or 3 years)');
    else {
      add(
        'Policy Period',
        {
          op: 'ensureShown',
          shown: { selector: '#policyPeriod1' },
          open: { link: 'Policy Period' },
          timeoutMs: 8000,
        },
        { optional: true, ifMissed: `policy period (${prefs.tenureYears} years)` },
      );
      add(
        'Policy Period',
        { op: 'check', selector: `#policyPeriod${prefs.tenureYears}`, checked: true },
        { optional: true, ifMissed: `policy period (${prefs.tenureYears} years)` },
      );
    }
  }

  // Basic Information.
  if (form.basic) {
    add(
      'Basic Information',
      {
        op: 'ensureShown',
        shown: form.basic,
        open: { link: 'Basic Information' },
        timeoutMs: 8000,
      },
      { optional: true, ifMissed: 'Basic Information (open it and check it)' },
    );
  }
  if (form.pincodeSearch) {
    const pick = 'Please select one of the following postal codes';
    add('Policy holder pincode', {
      op: 'setField',
      selector: '#pincodeAdd',
      value: client.pincode,
    });
    add(
      'Policy holder pincode',
      { op: 'clickButton', text: 'Search', timeoutMs: 5000 },
      { dialogOk: true },
    );
    add(
      'Policy holder pincode',
      { op: 'waitForDialog', text: pick, timeoutMs: 15_000 },
      { dialogOk: true },
    );
    // The postal codes listed for the pincode: the first (the zone goes by the pincode).
    add('Policy holder pincode', {
      op: 'clickButton',
      text: client.pincode,
      within: pick,
      timeoutMs: 5000,
    });
  }
  if (form.floaterSum) {
    const { selector, tile, rupees } = form.floaterSum;
    const wanted = prefs ? prefs.sumInsuredPaise / 100 : null;
    if (!prefs) byHand.push('cover type and sum insured (no quote details saved for the client)');
    else if (prefs.coverType !== 'floater') {
      byHand.push('cover type (Individual) and the sum insured of each member');
    } else if (!rupees.includes(wanted!)) {
      byHand.push(
        `sum insured: New India offers ${rupees.map(rupeesText).join(', ')} on ${name}, not ${rupeesText(wanted!)}`,
      );
    } else {
      if (tile) {
        add(
          'Cover type: Floater',
          {
            op: 'ensureShown',
            shown: { selector },
            open: { text: 'FLOATER' },
            timeoutMs: 8000,
          },
          { optional: true, ifMissed: 'cover type (Floater) and sum insured' },
        );
      }
      add(
        'Sum insured',
        { op: 'setField', selector, value: String(wanted) },
        { optional: true, ifMissed: `sum insured (${rupeesText(wanted!)})` },
      );
    }
  }

  // Member Information: the proposer, then each member in turn.
  // Open once the proposer's date of birth, or a button to add the proposer or the spouse, shows.
  add('Member Information', {
    op: 'ensureShown',
    shown: {
      selector: '#proposerDob',
      text: form.single ? undefined : (form.spouse ?? 'Add Proposer'),
    },
    open: { link: 'Member Information' },
    timeoutMs: 8000,
  });

  const memberSum = form.memberSum;
  const sumWanted =
    memberSum && prefs && prefs.coverType === 'individual' ? prefs.sumInsuredPaise / 100 : null;
  if (memberSum) {
    if (sumWanted === null) {
      byHand.push(
        `sum insured of each member (${name} asks one per member; the client is not on individual cover)`,
      );
    } else if (!memberSum.rupees.includes(sumWanted)) {
      byHand.push(
        `sum insured of each member: New India offers ${memberSum.rupees.map(rupeesText).join(', ')} on ${name}, not ${rupeesText(sumWanted)}`,
      );
    }
  }
  const fillSum = sumWanted !== null && memberSum!.rupees.includes(sumWanted);
  const healthAnswers = form.diabetesHypertension && options.goodHealth;
  if (form.diabetesHypertension && !options.goodHealth) {
    byHand.push('diabetes and hypertension answers of each member');
  }

  interface Row {
    who: string;
    member: ClientMember;
    dob: string;
    button?: string;
    sum: string;
    diabetes?: string;
    hypertension?: string;
    gender?: (g: 0 | 1 | 2) => string;
    dependentType?: string;
  }
  const rows: Row[] = [
    {
      who: 'Proposer',
      member: self,
      dob: '#proposerDob',
      sum: '#propSumInsured',
      diabetes: 'propSufferingDiabetes',
      hypertension: 'propSufferingHypertension',
      gender: (g) => `#gender${g}`,
    },
  ];
  if (!form.single) {
    for (const spouse of spouses) {
      rows.push({
        who: 'Spouse',
        member: spouse,
        dob: '#spouseDob',
        button: form.spouse!,
        sum: '#spouseSumInsured',
        diabetes: 'spouseSufferingDiabetes',
        hypertension: 'spouseSufferingHypertension',
        gender: (g) => `#spouseGender${g}`,
      });
    }
    children.forEach((child, i) => {
      rows.push({
        who: `Child ${i + 1}`,
        member: child,
        // Sons and daughters share one numbering (Jan Arogya Bima: #daughterDob1 after Add Son).
        dob: `#childDob${i}, #daughterDob${i}`,
        button: childButton(child)!,
        sum: `#childSumInsured${i}`,
        diabetes: `childSufferingDiabetes${i}`,
        hypertension: `childSufferingHyperTension${i}`,
        gender: (g) => `#childGender${g}${i}`,
        dependentType: form.childDependentType?.(i),
      });
    });
    parents.forEach((parent, i) => {
      rows.push({
        who: `Parent ${i + 1}`,
        member: parent,
        dob: `#parentDob${i}`,
        button: parentButton(parent)!,
        sum: `#parentSumInsured${i}`,
        diabetes: `parentSufferingDiabetes${i}`,
        hypertension: `parentSufferingHyperTension${i}`,
        gender: (g) => `#parentgender${g}${i}`,
      });
    });
    inLaws.forEach((inLaw, i) => {
      rows.push({
        who: `Parent-in-law ${i + 1}`,
        member: inLaw,
        dob: `#parentInLawDob${i}`,
        button: form.parentsInLaw!,
        sum: `#parentInLawSumInsured${i}`,
        diabetes: `parentInLawSufferingDiabetes${i}`,
        hypertension: `parentInLawSufferingHyperTension${i}`,
      });
    });
  } else if (client.members.length > 1) {
    byHand.push(`${name} quotes one person: only the proposer is filled`);
  }

  let childrenToType = false;
  for (const row of rows) {
    const { who, member } = row;
    add(`${who}: add`, {
      op: 'ensureShown',
      shown: { selector: row.dob },
      open: { button: row.button ?? 'Add Proposer' },
      timeoutMs: 10_000,
    });
    add(`${who}: date of birth`, { op: 'typeDate', input: row.dob, date: member.dateOfBirth! });
    // New India works the age out (and may redraw the member) once the date is in.
    add(`${who}: date of birth`, { op: 'pause', ms: 800 });
    if (form.genderRadios && row.gender) {
      add(`${who}: gender`, {
        op: 'check',
        selector: row.gender(GENDER_INDEX[member.gender!]),
        checked: true,
      });
    }
    if (row.dependentType) {
      if (ageOn(member.dateOfBirth!, options.today) < 18) {
        add(
          `${who}: dependent type`,
          { op: 'setField', selector: row.dependentType, value: 'Normal' },
          { optional: true, ifMissed: `${who.toLowerCase()}'s dependent type` },
        );
      } else childrenToType = true;
    }
    if (fillSum) {
      add(
        `${who}: sum insured`,
        { op: 'setField', selector: row.sum, value: String(sumWanted) },
        { optional: true, ifMissed: `${who.toLowerCase()}'s sum insured` },
      );
    }
    if (healthAnswers && row.diabetes && row.hypertension) {
      add(`${who}: diabetes`, { op: 'radio', name: row.diabetes, value: 'N' });
      add(`${who}: hypertension`, { op: 'radio', name: row.hypertension, value: 'N' });
    }
  }
  if (childrenToType) byHand.push('dependent type of each child aged 18 or over');

  if (form.single) {
    add(
      'Type of insured member',
      { op: 'setField', selector: '#typeOfMember', value: 'Proposer' },
      { optional: true, ifMissed: 'type of insured member (Proposer)' },
    );
    if (options.goodHealth) {
      add(
        'Good health',
        { op: 'setField', selector: '#healthCondition', value: 'Yes' },
        { optional: true, ifMissed: 'good health answer' },
      );
    } else byHand.push('good health answer');
    const wanted = prefs ? prefs.sumInsuredPaise / 100 : null;
    if (wanted !== null && lakhs(5, 10, 15, 20).includes(wanted)) {
      add(
        'Sum insured',
        { op: 'setField', selector: '#sumInsured', value: `${wanted / 100_000} lacs` },
        { optional: true, ifMissed: `sum insured (${rupeesText(wanted)})` },
      );
    } else {
      byHand.push(
        `sum insured (New India offers ${lakhs(5, 10, 15, 20).map(rupeesText).join(', ')} on ${name})`,
      );
    }
  }

  return { ok: true, steps, byHand: [...byHand, ...form.byHand] };
}
