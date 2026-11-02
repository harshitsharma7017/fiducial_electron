// United India: Health Policy Premium Calculator, automated exactly as recorded on 2 November
// 2026 (recording united-india-2026-11-02T12-50-39-592Z):
//   home page tile → calculator pop-up → Base, Floater, sum insured, pincode →
//   proposer: date of birth (calendar), gender, marital status, good health "No" → Ok →
//   spouse (if any): Spouse → date of birth, gender, relation, marital status, good health "No"
//   → Ok → Save →
//   children (if any; recording united-india-2026-11-02T12-43-19-757Z, and the advisor's account
//   that children work like the spouse): Children → per child, a new row (Add Child if there is
//   no empty row) → date of birth, gender, Son/Daughter, Unmarried, good health "No" → Ok → Save →
//   Get Quote → the "User Details" pop-up (email, mobile, Check Premium).
// The automation stops at "User Details": the advisor enters or checks the email and mobile and
// presses Check Premium. Nothing beyond the recordings is automated, so a client outside them
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
      op: { op: 'waitForValue', selector: 'input[name="pincodeZone"]', timeoutMs: 20_000 },
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
  );
  return { ok: true, steps };
}
