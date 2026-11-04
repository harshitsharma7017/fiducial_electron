// New India: four rural quote forms (QuoteNonCustomer.html) for a rural client, with what the
// advisor chooses for the run. Built from the recording new-india-2026-11-04T09-57-52-227Z, in
// which each form was opened from the dashboard (Product Selection, RURAL, the product's tile),
// New India's PAN question answered, the sections opened and the lists looked through. Nothing was
// typed and no premium was worked out, so dates are typed as dd/mm/yyyy and the run stops before
// Save & Calculate Premium.
//   Cattle Insurance: New Quote/Policy issuance, Policy Details (scheme, claim ratio), Animal
//     Details (Cattle, Calf Heifer Insurance). The animals' own fields were not recorded.
//   Farmers Package: Policy Period (start date), Risk Details (disabilities, nominee, sums insured
//     on the dwelling and contents, excess), Fire Allied Perils Earthquake (the dwelling).
//   Livestock (BLDA scheme), a form without a heading (known by its Add Animal button): Policy
//     Details (scheme, claim ratio, beneficiary), one row per animal (Add Animal), by kind.
//   Cattle (Non-scheme), a form without a heading (known by its Add Cattle button): Insured
//     Details (scheme, one row per head of cattle).
// The two forms without a heading were not opened from a recorded tile: the advisor opens them.
// Policy holder information is filled as on the travel forms, each step allowed to miss (these
// forms use another version of the section).
import type { Animal, RuralClient } from '../../shared/contracts/rural';
import {
  NIA_CATTLE_SCHEMES,
  NIA_NON_SCHEME_SCHEMES,
  NIA_RURAL_FORM_NAMES,
  type NiaRuralForm,
  type NiaRuralRun,
} from '../../shared/insurers/nia-rural';
import type { NiaHealthStep } from './nia-health';
import type { PageOp } from './page-ops';
import { policyHolderSteps } from './nia-travel';
import { iso } from './uiic-travel-proposal';

/** The form New India opens: its heading (or the button only it has) and its dashboard tiles. */
export function niaRuralForm(form: NiaRuralForm): {
  name: string;
  heading: string | null;
  marker?: string;
  tiles: string[];
} {
  const name = NIA_RURAL_FORM_NAMES[form];
  switch (form) {
    case 'cattle':
      return { name, heading: 'Cattle Insurance', tiles: ['Cattle', 'Cattle Insurance'] };
    case 'farmers-package':
      return {
        name,
        heading: 'Farmers Package Insurance Insurance',
        tiles: ['Farmers Package Insurance', 'Farmers Package'],
      };
    case 'livestock-blda':
      return { name, heading: null, marker: 'Add Animal', tiles: [] };
    case 'cattle-non-scheme':
      return { name, heading: null, marker: 'Add Cattle', tiles: [] };
  }
}

/** Animal kinds as the livestock form lists them. */
const KIND = {
  cattle: 'Cattle',
  horse: 'Horse Donkey Pony Mule Yak',
  donkey: 'Horse Donkey Pony Mule Yak',
  pony: 'Horse Donkey Pony Mule Yak',
  mule: 'Horse Donkey Pony Mule Yak',
  yak: 'Horse Donkey Pony Mule Yak',
  camel: 'Camel',
  pig: 'Pig',
  sheep: 'Sheep & Goat',
  goat: 'Sheep & Goat',
} as const;
/** The livestock form's cattle list (its spelling). */
const BLDA_CATTLE = {
  buffalo: 'Buffaloes',
  bullock: 'Bullocks (Castrated Bulls and Castrated Male Buffaloes)',
  bull: 'Bulls',
  'calf-heifer': 'Calves/Heifers',
  'milch-buffalo': 'Mitch Buffaloes',
  'milch-cow': 'Mitch Cows',
  mithun: 'Mithuns',
  'stud-bull': 'Stud Bulls (Cow and Buffalo)',
} as const;
/** The non-scheme cattle form's list: fewer types. */
const NON_SCHEME_CATTLE: Partial<Record<keyof typeof BLDA_CATTLE, string>> = {
  buffalo: 'Buffaloes',
  bullock: 'Bullocks (Castrated bulls & Castrated male buffaloes)',
  'milch-buffalo': 'Milch Buffaloes',
  'milch-cow': 'Milch Cows',
  'stud-bull': 'Stud Bulls (Cow & Buffalo)',
};
const BLDA_ORIGIN = { indigenous: 'Indigeneous', 'cross-breed': 'Cross Breed', exotic: 'Exotic' };
const NON_SCHEME_ORIGIN = {
  indigenous: 'Indigenous',
  'cross-breed': 'Cross Breed',
  exotic: 'Exotic',
};
const NOMINEE = {
  spouse: 'Spouse',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  brother: 'Brother',
  sister: 'Sister',
  other: 'Any other',
} as const;

export type NiaRuralPlan =
  { ok: true; steps: NiaHealthStep[]; byHand: string[] } | { ok: false; problems: string[] };

const describe = (a: Animal, i: number) => `Animal ${i + 1} (${a.cattleType ?? a.kind})`;

export function planNiaRuralQuote(
  rural: RuralClient,
  run: NiaRuralRun,
  options: { today: Date },
): NiaRuralPlan {
  const problems: string[] = [];
  const { animals, farm } = rural;
  const name = NIA_RURAL_FORM_NAMES[run.form];
  if (run.form === 'farmers-package') {
    if (run.startDate < iso(options.today)) problems.push('The policy start date has passed.');
    if (!farm?.dwellingSumInsuredRupees || !farm.contentsSumInsuredRupees) {
      problems.push(
        'Add the farm details to this rural client: the sums insured on the dwelling and on its contents.',
      );
    }
  } else {
    if (animals.length === 0) problems.push('Add the animals to this rural client.');
    if (run.form !== 'livestock-blda') {
      animals.forEach((a, i) => {
        if (a.kind !== 'cattle') problems.push(`${describe(a, i)}: ${name} is for cattle only.`);
        else if (run.form === 'cattle-non-scheme' && !NON_SCHEME_CATTLE[a.cattleType!]) {
          problems.push(`${describe(a, i)}: ${name} does not list this type of cattle.`);
        }
      });
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const steps: NiaHealthStep[] = [];
  const byHand: string[] = [];
  const add = (label: string, op: PageOp, more: Partial<NiaHealthStep> = {}) =>
    steps.push({ label, op, ...more });
  const section = (link: string, selector: string) =>
    add(link, { op: 'ensureShown', shown: { selector }, open: { link }, timeoutMs: 8000 });
  const field = (label: string, selector: string, value: string, optional = false) =>
    add(
      label,
      { op: 'setField', selector, value },
      optional ? { optional: true, ifMissed: label.toLowerCase() } : {},
    );

  if (run.form === 'cattle') {
    // Choosing a new quote makes New India ask for the PAN (the advisor answers it).
    add('New Quote/Policy issuance', { op: 'check', selector: '#checkPolicy1', checked: true });
  }

  policyHolderSteps(
    {
      name: rural.customer.name,
      gender: rural.gender,
      maritalStatus: rural.maritalStatus,
      dateOfBirth: rural.dateOfBirth,
      address: rural.address,
      phone: rural.customer.phone,
      email: rural.customer.email,
    },
    steps,
    byHand,
    { optional: true },
  );

  switch (run.form) {
    case 'cattle': {
      section('Policy Details', '#Scheme');
      field('Scheme type', '#Scheme', NIA_CATTLE_SCHEMES[run.scheme]);
      if (run.claimRatio) field('Claim ratio', 'input[name="Claim Ratio"]', run.claimRatio);
      else byHand.push('claim ratio');
      section('Animal Details', '#cattleCheck');
      if (animals.some((a) => a.cattleType !== 'calf-heifer')) {
        add('Cattle', { op: 'check', selector: '#cattleCheck', checked: true });
      }
      if (animals.some((a) => a.cattleType === 'calf-heifer')) {
        add('Calf Heifer Insurance', { op: 'check', selector: '#calfCheck', checked: true });
      }
      byHand.push(
        "each animal's details under Cattle / Calf Heifer Insurance (not recorded field by field)",
      );
      break;
    }
    case 'farmers-package': {
      const f = farm!;
      section('Policy Period', '#policyStartDate');
      add('Policy start date', { op: 'typeDate', input: '#policyStartDate', date: run.startDate });
      section('Risk Details', '#preExistingIllness');
      if (f.disabilities)
        field('Existing physical disabilities', '#preExistingIllness', f.disabilities);
      else byHand.push('details of existing physical disabilities ("None" if none)');
      if (rural.nomineeName) field('Nominee name', '#nomineeName', rural.nomineeName);
      else byHand.push("nominee's name");
      if (rural.nomineeRelationship) {
        field('Nominee relationship', '#nomineeRelationship', NOMINEE[rural.nomineeRelationship]);
      } else byHand.push("nominee's relationship");
      if (rural.nomineeAddress) field('Nominee address', '#addressOfNominee', rural.nomineeAddress);
      else byHand.push("nominee's address");
      field(
        'Sum insured on the dwelling',
        '#sumInsuredDwelling',
        String(f.dwellingSumInsuredRupees),
      );
      field(
        'Sum insured on the contents',
        '#sumInsuredContents',
        String(f.contentsSumInsuredRupees),
      );
      field('Excess', '#excess', run.excess);
      section('Fire Allied Perils Earthquake (SC)', '#identificationNo');
      if (f.dwellingId)
        field('Identification no. of the dwelling', '#identificationNo', f.dwellingId);
      else byHand.push('identification number of the dwelling unit or house');
      if (f.dwellingLocation)
        field('Location of the dwelling', '#locationDwelling', f.dwellingLocation);
      else byHand.push('location of the dwelling unit or house');
      if (f.dwellingDescription) {
        field('Description of the dwelling', '#descriptionDwelling', f.dwellingDescription);
      } else byHand.push('description of the dwelling unit or house');
      if (f.katcha !== undefined) {
        add('Katcha construction', {
          op: 'check',
          selector: f.katcha ? '#katchaConst0' : '#katchaConst1',
          checked: true,
        });
      } else byHand.push('katcha construction (yes or no)');
      if (f.contentsDescription) {
        field('Description of the contents', '#descriptionContents', f.contentsDescription);
      } else byHand.push('description of the contents in the dwelling');
      byHand.push('tractor risk, loading and the optional additional coverages');
      break;
    }
    case 'livestock-blda': {
      section('Policy Details', '#Scheme');
      add(
        'Policy type: Scheme',
        { op: 'check', selector: '#PolicyType2', checked: true },
        { optional: true, ifMissed: 'policy type (Scheme)' },
      );
      field('Scheme type', '#Scheme', 'BLDA Scheme');
      if (run.claimRatio) field('Claim ratio', 'input[name="claimRatio"]', run.claimRatio);
      else byHand.push('claim ratio');
      field('Type of beneficiary', '#Beneficiary', run.beneficiary);
      section('Animal Details', 'select[name="typeOfAnimal0"]');
      animals.forEach((a, i) => {
        const who = describe(a, i);
        const by = (n: string) => `[name="${n}${i}"]`;
        add(`${who}: add`, {
          op: 'ensureShown',
          shown: { selector: `select${by('typeOfAnimal')}` },
          open: { button: 'Add Animal' },
          timeoutMs: 10_000,
        });
        field(`${who}: type of animal`, `select${by('typeOfAnimal')}`, KIND[a.kind]);
        // New India draws the kind's own fields.
        add(`${who}: type of animal`, { op: 'pause', ms: 800 });
        field(`${who}: origin`, `select${by('originType')}`, BLDA_ORIGIN[a.origin]);
        add(`${who}: gender`, {
          op: 'check',
          selector: `#cgender${a.gender === 'male' ? 0 : 1}${i}`,
          checked: true,
        });
        field(`${who}: breed, colour, marks`, by('breed'), a.breed);
        field(`${who}: age (years)`, by('AgeinYrs'), String(a.ageYears));
        field(`${who}: age (months)`, by('AgeinMths'), String(a.ageMonths));
        if (a.kind === 'cattle') {
          field(
            `${who}: type of cattle`,
            `select${by('typeOfCattle')}`,
            BLDA_CATTLE[a.cattleType!],
          );
          if (a.tagNumber) field(`${who}: tag number`, by('TagNumber'), a.tagNumber);
          else byHand.push(`${who.toLowerCase()}: tag number`);
          if (a.purpose) field(`${who}: purpose of use`, by('purpose'), a.purpose);
        } else if (a.kind === 'sheep' || a.kind === 'goat') {
          field(
            `${who}: type of sheep and goat`,
            `select${by('typeOfRiskSheepAndGoat')}`,
            a.kind === 'sheep' ? 'Sheep' : 'Goat',
          );
          if (a.purpose) field(`${who}: purpose of use`, by('purposeOfSheepGoat'), a.purpose);
          if (a.tagNumber)
            field(`${who}: registration no.`, by('registrationNo'), a.tagNumber, true);
        } else if (a.kind === 'camel' || a.kind === 'pig') {
          if (a.purpose) field(`${who}: purpose of use`, by('purposeOfCamelPig'), a.purpose);
          byHand.push(`${who.toLowerCase()}: details of the animal`);
        } else {
          field(
            `${who}: type of horse, donkey, pony, mule or yak`,
            `select${by('typeOfHDPMY')}`,
            a.kind[0]!.toUpperCase() + a.kind.slice(1),
          );
          if (a.purpose) field(`${who}: purpose of use`, by('purposeOfCamelPig'), a.purpose);
        }
        if (!a.purpose) byHand.push(`${who.toLowerCase()}: purpose of use`);
        // Recorded for cattle; the other kinds were looked at without their values.
        const other = a.kind !== 'cattle';
        field(`${who}: market value`, by('MarkectValue'), String(a.marketValueRupees), other);
        if (a.sumInsuredRupees) {
          field(`${who}: sum insured`, by('mpsumInsured'), String(a.sumInsuredRupees), other);
        } else byHand.push(`${who.toLowerCase()}: sum insured`);
        if (a.locationOfStable) {
          field(`${who}: location of stable`, by('locationOfStable'), a.locationOfStable, true);
        }
      });
      byHand.push("each animal's proposer ID");
      break;
    }
    case 'cattle-non-scheme': {
      section('Insured Details', '#Scheme');
      add(
        'Policy type: Non-scheme',
        { op: 'check', selector: '#PolicyType1', checked: true },
        { optional: true, ifMissed: 'policy type (Non-scheme)' },
      );
      field('Scheme type', '#Scheme', NIA_NON_SCHEME_SCHEMES[run.scheme]);
      animals.forEach((a, i) => {
        const who = `Cattle ${i + 1} (${a.cattleType})`;
        add(`${who}: add`, {
          op: 'ensureShown',
          shown: { selector: `#typeOfRiskForCattle${i}` },
          open: { button: 'Add Cattle' },
          timeoutMs: 10_000,
        });
        field(
          `${who}: type of cattle`,
          `#typeOfRiskForCattle${i}`,
          NON_SCHEME_CATTLE[a.cattleType!]!,
        );
        add(`${who}: gender`, {
          op: 'check',
          selector: `#cgender${a.gender === 'male' ? 0 : 1}${i}`,
          checked: true,
        });
        field(`${who}: age (years)`, `#AgeinYrs${i}`, String(a.ageYears));
        field(`${who}: age (months)`, `#AgeinMths${i}`, String(a.ageMonths));
        field(`${who}: origin`, `#originType${i}`, NON_SCHEME_ORIGIN[a.origin]);
        field(`${who}: breed, colour, marks`, `#breed${i}`, a.breed);
        if (a.purpose) field(`${who}: purpose of use`, `#purpose${i}`, a.purpose);
        else byHand.push(`${who.toLowerCase()}: purpose of use`);
        if (a.tagNumber) field(`${who}: tag number`, `#TagNumber${i}`, a.tagNumber);
        else byHand.push(`${who.toLowerCase()}: tag number`);
        if (a.fitnessCertificateDate) {
          add(`${who}: fitness certificate date`, {
            op: 'typeDate',
            input: `#fitnessCertificateDate${i}`,
            date: a.fitnessCertificateDate,
          });
        } else byHand.push(`${who.toLowerCase()}: fitness certificate date`);
        field(`${who}: market value`, `#ycMarkectValue${i}`, String(a.marketValueRupees));
      });
      byHand.push('transit cover (No unless chosen) and the declaration');
      break;
    }
  }
  return { ok: true, steps, byHand };
}
