// United India: Health Policy Premium Calculator, automated exactly as recorded on 2 November
// 2026 (recording united-india-2026-11-02T12-50-39-592Z):
//   home page tile → calculator pop-up → Base, Floater, sum insured, pincode →
//   proposer: date of birth (calendar), gender, marital status, good health "No" → Ok →
//   spouse (if any): Spouse → date of birth, gender, relation, marital status, good health "No"
//   → Ok → Save →
//   children (if any; recording united-india-2026-11-02T12-43-19-757Z, and the advisor's account
//   that children work like the spouse): Children → per child, a new row (Add Child if there is
//   no empty row) → date of birth, gender, Son/Daughter, Unmarried, good health "No" → Ok → Save →
//   Get Quote → the "User Details" pop-up: the client's e-mail and mobile, Check Premium → the
//   premium, read and returned.
// Check Premium is pressed with the client's own e-mail and mobile (decision of 11 November 2026:
// United India may send the quote to them). What United India shows after it was not recorded: the
// premium is read after its caption, and a failure says what the page showed instead.
// Nothing else beyond the recordings is automated, so a client outside them
// (parents, individual cover, a health condition, a sum insured United India does not offer) is
// refused with the reason, before anything is touched. Children are entered as unmarried (saved
// clients hold no marital status for children).
import { ageOn, type ClientInput, type ClientMember } from '../../shared/contracts/client';
import type { PageOp } from './page-ops';

/** Sum insured options of the calculator, in rupees (from the recording). */
export const UIIC_SUM_INSURED_RUPEES = [
  50000, 100000, 150000, 200000, 250000, 300000, 350000, 400000, 450000, 500000, 550000, 600000,
  650000, 700000, 750000, 800000, 850000, 900000, 950000, 1000000, 1500000, 2000000, 2500000,
] as const;

const GENDER = { male: 'Male', female: 'Female', transgender: 'Transgender' } as const;
const MARITAL = {
  married: 'Married',
  unmarried: 'Unmarried',
  widowed: 'Widow/Widower',
  divorced: 'Divorcee',
} as const;

const FORM = 'healthPolicyData.HealthPolicyFormBean';

/** United India's own messages about what it lacks ("Please enter valid mobile number." …). */
const UIIC_COMPLAINTS =
  'please (enter|provide|select)|cannot be blank|not valid|invalid|conversion from string|ErrorList';
/**
 * A select found by its AngularJS model, under any of the attribute spellings AngularJS accepts
 * (ng-model, data-ng-model, x-ng-model): the recorder notes the model name, not the spelling.
 */
export const byModel = (name: string): string =>
  ['ng-model', 'data-ng-model', 'x-ng-model'].map((a) => `select[${a}="${name}"]`).join(', ');
const model = (name: string) => byModel(`${FORM}.${name}`);

export interface PlanStep {
  /** Shown to the advisor if this step fails. */
  label: string;
  op: PageOp;
  /** A step the page may not need (for example closing a pop-up that may not show): its failure
   * does not stop the run. */
  optional?: boolean;
  /** United India may answer this step with its ERRORS pop-up about fields the advisor fills by
   * hand: the pop-up is closed, its message kept for the advisor, and the run goes on. */
  closeErrors?: boolean;
  /** For an optional step: what the advisor is told if the page could not take it. */
  ifMissed?: string;
  /** Keeps the value the step returns (a premium, a plan's code) under this name for the result. */
  keep?: string;
  /** What the advisor is told if this step stops the run (instead of the general message). */
  ifStuck?: string;
}

export type UiicHealthPlan = { ok: true; steps: PlanStep[] } | { ok: false; problems: string[] };

function memberProblems(member: ClientMember, who: string): string[] {
  const problems: string[] = [];
  if (!member.dateOfBirth) problems.push(`Add the ${who}'s date of birth.`);
  if (!member.gender) problems.push(`Add the ${who}'s gender.`);
  return problems;
}

/**
 * Checks that the client fits the recorded flow and lists every step. `goodHealth` is the
 * advisor's confirmation, for this quote, that no member has obesity, diabetes, hypertension or
 * a pre-existing condition (the recording answers "No" for every member).
 */
export function planUiicHealthQuote(
  client: ClientInput,
  options: { goodHealth: boolean; today: Date },
): UiicHealthPlan {
  const problems: string[] = [];
  const prefs = client.preferences;
  if (!prefs) problems.push('Add the quote details (cover type and sum insured) to this client.');
  else {
    if (prefs.coverType !== 'floater') {
      problems.push('Only family floater cover is automated for United India so far.');
    }
    const rupees = prefs.sumInsuredPaise / 100;
    if (!(UIIC_SUM_INSURED_RUPEES as readonly number[]).includes(rupees)) {
      problems.push(
        'United India does not offer this sum insured. Choose one of: ' +
          UIIC_SUM_INSURED_RUPEES.map((r) => r.toLocaleString('en-IN')).join(', ') +
          '.',
      );
    }
  }
  const selves = client.members.filter((m) => m.relationship === 'self');
  const spouses = client.members.filter((m) => m.relationship === 'spouse');
  const children = client.members.filter(
    (m) => m.relationship === 'son' || m.relationship === 'daughter',
  );
  const others = client.members.filter(
    (m) => !['self', 'spouse', 'son', 'daughter'].includes(m.relationship),
  );
  if (selves.length !== 1) problems.push('The client needs exactly one member who is "Self".');
  if (spouses.length > 1) problems.push('Only one spouse can be added.');
  if (others.length > 0) {
    problems.push(
      'Only self, spouse and children are automated for United India so far (no parents).',
    );
  }
  const self = selves[0];
  const spouse = spouses[0];
  if (!client.customer.email || !client.customer.phone) {
    problems.push(
      "Add the client's e-mail and mobile: United India asks for them (User Details) before it shows the premium.",
    );
  }
  if (self) problems.push(...memberProblems(self, 'proposer (self)'));
  if (spouse) problems.push(...memberProblems(spouse, 'spouse'));
  children.forEach((child, i) => problems.push(...memberProblems(child, `child ${i + 1}`)));
  if (!client.proposerMaritalStatus) problems.push("Add the proposer's marital status.");
  if (spouse && client.proposerMaritalStatus && client.proposerMaritalStatus !== 'married') {
    problems.push('A spouse is listed, so the proposer must be married.');
  }
  if (!options.goodHealth) {
    problems.push(
      'United India asks every member to declare good health. Only that answer ("No" to obesity, diabetes, hypertension and pre-existing conditions) is automated; fill this quote by hand otherwise.',
    );
  }
  for (const m of [self, spouse]) {
    if (m?.dateOfBirth && ageOn(m.dateOfBirth, options.today) < 18) {
      problems.push('The proposer and spouse must be adults.');
    }
  }
  if (problems.length > 0 || !self || !prefs) return { ok: false, problems };

  const steps: PlanStep[] = [
    {
      label: 'Open the calculator form',
      op: { op: 'waitFor', selector: '#selectProductType', timeoutMs: 30_000 },
    },
    { label: 'Product: Base', op: { op: 'select', selector: '#selectProductType', value: 'Base' } },
    {
      label: 'Cover type: Floater',
      op: { op: 'select', selector: '#selectCoverType', value: 'familyFloater' },
    },
    { label: 'Sum insured', op: { op: 'waitFor', selector: '#selectCoverReq', timeoutMs: 15_000 } },
    {
      label: 'Sum insured',
      op: { op: 'select', selector: '#selectCoverReq', value: String(prefs.sumInsuredPaise / 100) },
    },
    { label: 'Pincode', op: { op: 'type', selector: '#pincodeString', value: client.pincode } },
    {
      label: 'Pincode zone',
      op: {
        op: 'waitForValue',
        selector: 'input[name="pincodeZone"]',
        timeoutMs: 20_000,
        // United India's lookup can fail on its server: the PIN code is typed again, once.
        retype: { selector: '#pincodeString', value: client.pincode },
      },
      ifStuck: `United India could not look up PIN code ${client.pincode} (its page said "Some Error occure please try again", or showed no zone), even when asked twice. Press OK on its message if one is open, check United India is still signed in, then try again.`,
    },
    {
      label: "Proposer's date of birth",
      op: {
        op: 'pickDate',
        trigger: '[id="proposerDOBId"] button',
        input: 'input#proposerDOBId',
        date: self.dateOfBirth!,
      },
    },
    {
      // United India works the age out on its server and shows "0" until then; it resets the
      // member's other answers when the age arrives, so nothing else is set before it.
      label: "Proposer's age",
      op: {
        op: 'waitForValue',
        selector: 'input#proposerAgeId',
        rejectValues: ['0'],
        timeoutMs: 20_000,
      },
    },
    { label: "Proposer's age", op: { op: 'pause', ms: 800 } },
    {
      label: "Proposer's gender",
      op: { op: 'select', selector: model('proposerGender'), value: GENDER[self.gender!] },
    },
    {
      label: "Proposer's marital status",
      op: {
        op: 'select',
        selector: model('proposerMaritalStatus'),
        value: MARITAL[client.proposerMaritalStatus!],
      },
    },
    {
      label: "Proposer's good health declaration",
      op: { op: 'radio', name: 'ynProposerHyperDiaChol', value: 'No' },
    },
    {
      label: "Proposer's good health declaration",
      op: { op: 'clickButton', text: 'Ok', within: 'Good Health Declaration', timeoutMs: 10_000 },
    },
  ];
  if (spouse) {
    const inSpouse = 'Add Spouse';
    steps.push(
      { label: 'Add spouse', op: { op: 'clickButton', text: 'Spouse', timeoutMs: 10_000 } },
      { label: 'Add spouse', op: { op: 'waitForDialog', text: inSpouse, timeoutMs: 15_000 } },
      {
        label: "Spouse's date of birth",
        op: {
          op: 'pickDate',
          trigger: '[id="spouseDOB"] button',
          input: 'input#spouseDOB',
          date: spouse.dateOfBirth!,
          within: inSpouse,
        },
      },
      {
        label: "Spouse's age",
        op: {
          op: 'waitForValue',
          selector: 'input#spouseAgeAgeId',
          within: inSpouse,
          rejectValues: ['0'],
          timeoutMs: 20_000,
        },
      },
      { label: "Spouse's age", op: { op: 'pause', ms: 800 } },
      {
        label: "Spouse's gender",
        op: {
          op: 'select',
          selector: model('spouseGender'),
          value: GENDER[spouse.gender!],
          within: inSpouse,
        },
      },
      {
        label: "Spouse's relation",
        op: {
          op: 'select',
          selector: model('spouseRelationtype'),
          value: 'Spouse',
          within: inSpouse,
        },
      },
      {
        label: "Spouse's marital status",
        op: {
          op: 'select',
          selector: model('spouseMaritalStatus'),
          value: 'Married',
          within: inSpouse,
        },
      },
      {
        label: "Spouse's good health declaration",
        op: { op: 'radio', name: 'ynSpouseHyperDiaChol', value: 'No', within: inSpouse },
      },
      {
        label: "Spouse's good health declaration",
        op: { op: 'clickButton', text: 'Ok', within: 'Good Health Declaration', timeoutMs: 10_000 },
      },
      {
        label: 'Save spouse',
        op: { op: 'clickButton', text: 'Save', within: inSpouse, timeoutMs: 10_000 },
      },
      {
        label: 'Save spouse',
        op: { op: 'waitForValue', selector: 'input#spouseDOBId', timeoutMs: 15_000 },
      },
    );
  }
  if (children.length > 0) {
    const inChildren = 'Add Children';
    const childModel = (name: string) => byModel(`newChild.${name}`);
    steps.push(
      { label: 'Add children', op: { op: 'clickButton', text: 'Children', timeoutMs: 10_000 } },
      { label: 'Add children', op: { op: 'waitForDialog', text: inChildren, timeoutMs: 15_000 } },
    );
    children.forEach((child, i) => {
      const who = `Child ${i + 1}`;
      const [cy, cm, cd] = child.dateOfBirth!.split('-');
      // United India redraws the child's row once its date of birth is chosen: the later steps
      // find the row again by that date.
      const rowKey = { within: inChildren, input: 'input#childDOB', value: `${cd}/${cm}/${cy}` };
      steps.push(
        {
          label: `${who}: new row`,
          op: {
            op: 'ensureEmptyRow',
            selector: childModel('gender'),
            within: inChildren,
            addButton: 'Add Child',
            timeoutMs: 10_000,
          },
        },
        {
          label: `${who}: date of birth`,
          op: {
            op: 'pickDate',
            trigger: '[id="childDOB"] button',
            input: 'input#childDOB',
            date: child.dateOfBirth!,
            within: inChildren,
            row: 'current',
          },
        },
        {
          label: `${who}: age`,
          op: {
            op: 'waitForValue',
            selector: ['ng-model', 'data-ng-model', 'x-ng-model']
              .map((a) => `input[${a}="newChild.age"]`)
              .join(', '),
            row: 'current',
            rowKey,
            // A child under one is 0 years old: then only "filled in" can be waited for.
            rejectValues: ageOn(child.dateOfBirth!, options.today) > 0 ? ['0'] : [],
            // Soft: if the row never shows the age, carry on; a reset of the child's answers is
            // caught by the select and radio re-checks, and a rejection by United India's ERRORS.
            soft: true,
            timeoutMs: 8_000,
          },
        },
        { label: `${who}: age`, op: { op: 'pause', ms: 800 } },
        {
          label: `${who}: gender`,
          op: {
            op: 'select',
            selector: childModel('gender'),
            value: GENDER[child.gender!],
            within: inChildren,
            row: 'current',
            rowKey,
          },
        },
        {
          label: `${who}: relation`,
          op: {
            op: 'select',
            selector: childModel('relationType'),
            value: child.relationship === 'son' ? 'Son' : 'Daughter',
            within: inChildren,
            row: 'current',
            rowKey,
          },
        },
        {
          label: `${who}: marital status`,
          op: {
            op: 'select',
            selector: childModel('maritalStatus'),
            value: 'Unmarried',
            within: inChildren,
            row: 'current',
            rowKey,
          },
        },
        {
          label: `${who}: good health declaration`,
          op: {
            op: 'radio',
            name: 'ynHyperDiaChol',
            value: 'No',
            within: inChildren,
            row: 'current',
            rowKey,
          },
        },
        {
          label: `${who}: good health declaration`,
          op: {
            op: 'clickButton',
            text: 'Ok',
            within: 'Good Health Declaration',
            timeoutMs: 10_000,
          },
        },
      );
    });
    // Every child row's Yes/No shares one name, and United India's reply to each child's date of
    // birth comes back with the other children's answers empty (11 November 2026: the premium then
    // fails with "Conversion from string "" to type Boolean is not valid."). So once the last date
    // is in, each earlier child is answered again (the last one was answered after its own date).
    // A child United India has taken in is redrawn read-only: its date in a plain box
    // (newChild.dob, no calendar); only the child being entered has the #childDOB box.
    const CHILD_DATE_BOXES = [
      'input#childDOB',
      ...['ng-model', 'data-ng-model', 'x-ng-model'].map((a) => `input[${a}="newChild.dob"]`),
    ].join(', ');
    children.slice(0, -1).forEach((child, i) => {
      const who = `Child ${i + 1}`;
      const [cy, cm, cd] = child.dateOfBirth!.split('-');
      // Twins share a date of birth: the n-th row with that date.
      const keyIndex = children
        .slice(0, i)
        .filter((c) => c.dateOfBirth === child.dateOfBirth).length;
      steps.push(
        {
          label: `${who}: good health declaration (again)`,
          op: {
            op: 'radio',
            name: 'ynHyperDiaChol',
            value: 'No',
            within: inChildren,
            row: 'key',
            rowKey: { within: inChildren, input: CHILD_DATE_BOXES, value: `${cd}/${cm}/${cy}` },
            keyIndex,
          },
        },
        {
          label: `${who}: good health declaration (again)`,
          op: {
            op: 'clickButton',
            text: 'Ok',
            within: 'Good Health Declaration',
            timeoutMs: 10_000,
          },
        },
      );
    });
    steps.push(
      {
        label: 'Save children',
        op: { op: 'clickButton', text: 'Save', within: inChildren, timeoutMs: 10_000 },
      },
      {
        label: 'Save children',
        op: { op: 'waitForDialogGone', text: inChildren, timeoutMs: 15_000 },
      },
    );
  }
  steps.push(
    { label: 'Get Quote', op: { op: 'clickButton', text: 'Get Quote', timeoutMs: 10_000 } },
    { label: 'Get Quote', op: { op: 'waitForDialog', text: 'User Details', timeoutMs: 20_000 } },
    // User Details (recorded: input name="email", and the mobile's box is named "sideCar").
    {
      label: 'E-mail (User Details)',
      op: {
        op: 'setField',
        within: 'User Details',
        selector: 'input[name="email"]',
        value: client.customer.email ?? '',
        // The pop-up's form is a template United India downloads after its title shows.
        waitMs: 15_000,
      },
    },
    {
      label: 'Mobile (User Details)',
      op: {
        op: 'setField',
        within: 'User Details',
        selector: 'input[name="sideCar"]',
        value: client.customer.phone ?? '',
        waitMs: 15_000,
      },
    },
    {
      label: 'Check Premium',
      op: { op: 'clickButton', text: 'Check Premium', within: 'User Details', timeoutMs: 10_000 },
    },
    // The quotes United India works out (11 November 2026): its "Insurance Quotes" table, one
    // column per plan (for example Individual Family Medicare and Arogya Sanjeevani), each with its
    // premium excluding GST. Only that table counts, never a number already on the calculator.
    {
      label: 'Read the premiums',
      op: {
        op: 'readPlans',
        header: 'Policy Type',
        row: 'Premium',
        errorPattern: UIIC_COMPLAINTS,
        timeoutMs: 60_000,
      },
    },
  );
  return { ok: true, steps };
}
