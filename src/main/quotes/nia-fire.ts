// New India: nine fire quote forms (QuoteNonCustomer.html) for a property client, with the cover
// chosen for the run. Built from the recording new-india-2026-11-04T10-59-31-695Z, in which each
// form was opened from the dashboard (Product Selection, FIRE, the policy's tile), New India's PAN
// question answered and the sections opened. Nothing was typed and no premium was worked out, so
// the run stops before Save & Calculate Premium.
//
// The forms ask much the same about a property, under different field ids (hasLift,
// doesBuildingHaveElevator, vDoesBuildingHasLiftElevator…) and in different words (Yes, YES). So
// each detail of the property (FACTS) names the ids it may go into, and is filled into the one its
// form has, as nia-fire-fields.ts lists them from the recording. A detail the form does not ask is
// skipped; one it asks that the property client lacks is listed for the advisor. Every step may
// miss (a field New India hides until another answer is given): what is missed is listed.
// Before filling, every closed section is opened (never closing an open one).
import type { PropertyClient } from '../../shared/contracts/property';
import {
  NIA_FIRE_FORM_NAMES,
  NIA_FIRE_HOME_FORMS,
  type NiaFireForm,
  type NiaFireRun,
} from '../../shared/insurers/nia-fire';
import type { NiaHealthStep } from './nia-health';
import { marineHolderSteps } from './nia-marine';
import { NIA_FIRE_FIELDS, type FireFieldKind } from './nia-fire-fields';

const HEADINGS: Record<NiaFireForm, string> = {
  griha: 'New India Bharat Griha Raksha Insurance',
  'flexi-griha': 'New India Bharat Flexi Griha Raksha Insurance',
  'flexi-griha-long-term': 'New India Bharat Flexi Griha Raksha Policy (Long Term) Insurance',
  sookshma: 'Bharat Sookshma Udyam Suraksha Insurance',
  'flexi-sookshma': 'New India Flexi Sookshma Udyam Insurance',
  laghu: 'New India Bharat Laghu Udyam Suraksha Insurance',
  'flexi-laghu': 'New India Bharat Flexi Laghu Udyam Suraksha Insurance',
  sfsp: 'Standard Fire and Special Perils Insurance',
  war: 'STANDALONE WAR Insurance',
};

/** The form New India opens: its heading and the dashboard tile that likely opens it. */
export function niaFireForm(form: NiaFireForm): { name: string; heading: string; tiles: string[] } {
  const heading = HEADINGS[form];
  return {
    name: NIA_FIRE_FORM_NAMES[form],
    heading,
    tiles: [heading.replace(/\s*Insurance$/, '')],
  };
}

interface Context {
  form: NiaFireForm;
  client: PropertyClient;
  run: NiaFireRun;
  year: number;
}
type Value = string | number | boolean | undefined | null;

/**
 * A detail of the property: the ids it may go into (the first its form has; `all`: every one its
 * form has), and its value for a field of that kind (undefined: the client lacks it).
 */
interface Fact {
  label: string;
  ids: string[];
  value: (c: Context, kind: FireFieldKind, id: string) => Value;
  all?: boolean;
}
/** A yes/no asked as two radios (yes id, no id). */
interface RadioFact {
  label: string;
  radios: [string, string];
  value: (c: Context) => boolean | undefined;
}

const yesNo = (b: boolean | undefined) => (b === undefined ? undefined : b ? 'Yes' : 'No');
const pucca = (v: 'pucca' | 'kutcha' | undefined) =>
  v === undefined ? undefined : v === 'pucca' ? 'Pucca' : 'Kutcha';
const home = (c: Context) => NIA_FIRE_HOME_FORMS.includes(c.form);
const sum = (...v: (number | undefined)[]) =>
  v.every((x) => x === undefined) ? undefined : v.reduce<number>((a, x) => a + (x ?? 0), 0);

/** Before the sections that follow from them. */
const POLICY_FACTS: Fact[] = [
  {
    label: 'Type of policy',
    ids: ['typeOfPolicy'],
    value: (c) => (c.client.holder.kind === 'organization' ? 'Commercial' : 'Retail'),
  },
  {
    label: 'Type of policy',
    ids: ['vTypePolicyDw'],
    value: (c) => (c.client.property.use === 'home' ? 'Residential' : 'Retail'),
  },
  {
    label: 'Previously insured',
    ids: ['whetherPolicyInPast', 'vHasPropertyPerils'],
    value: (c) => yesNo(c.client.property.risks.insuredBefore),
  },
  {
    label: 'Maximum ICR in the last 3 years',
    ids: ['maxICRinLast3Yr', 'vMaximumIcPolicy'],
    value: (c) => c.client.property.maxClaimRatioPercent,
  },
  {
    label: 'What to cover',
    ids: ['whatDoUWantToCover', 'doYouWantToOpt', 'vRiskOpted_3'],
    value: (c, _kind, id) => {
      const cover = c.run.cover;
      if (id === 'vRiskOpted_3') {
        return {
          'building-contents': 'Both Building and Content',
          building: 'Buildings',
          contents: 'Contents',
          'building-contents-stocks': null,
        }[cover];
      }
      if (home(c)) {
        return {
          'building-contents': 'Home Building & Home Contents',
          building: 'Home Building Only',
          contents: 'Home Content Only',
          'building-contents-stocks': null,
        }[cover];
      }
      return {
        'building-contents': 'Only Building & Contents',
        building: null,
        contents: null,
        'building-contents-stocks': 'Building, Contents & Stocks',
      }[cover];
    },
  },
];

const FACTS: Fact[] = [
  // Where the property is.
  {
    label: 'Pin code',
    ids: ['pinCode', 'vPinCodeRisk', 'vPincodeSa_1'],
    value: (c) => c.client.property.pincode,
  },
  {
    label: 'Location pin',
    ids: ['locationPin0', 'pinCode0'],
    value: (c) => c.client.property.pincode,
  },
  {
    label: 'Building name',
    ids: ['riskLocationBuildingName'],
    value: (c) => c.client.property.buildingName,
  },
  {
    label: 'Nearby landmark',
    ids: ['riskLocationNearbyLandmark', 'vRiskLocationC'],
    value: (c) => c.client.property.landmark,
  },
  {
    label: 'Location address',
    ids: ['locationAddress0', 'addressOfTheLocation0', 'vLocationAddress', 'vAddressLocationSa_1'],
    value: (c) => c.client.property.address,
    all: true,
  },
  // Sums insured.
  {
    label: 'Carpet area (sq. m)',
    ids: ['carpetArea0'],
    value: (c) => c.client.property.carpetAreaSqm,
  },
  {
    label: 'Rate of cost of construction (Rs/sq. m)',
    ids: ['rateOfCostOfCons0'],
    value: (c) => c.client.property.constructionRatePerSqm,
  },
  {
    label: 'Building sum insured',
    ids: ['buildingIncludingAdditionalStructuresI0', 'vBuildingSuperStructure0', 'vSiBuildings'],
    value: (c) => c.client.property.buildingSumInsured,
  },
  {
    label: 'Furniture, fixtures and fittings sum insured',
    ids: ['furniFixFitSI0'],
    value: (c) => c.client.property.furnitureSumInsured,
  },
  {
    label: 'Electrical/electronic sum insured',
    ids: ['eleclElectroSI0'],
    value: (c) => c.client.property.electricalSumInsured,
  },
  {
    label: 'Other contents sum insured',
    ids: ['otherGenContSI0', 'otherContentsSI0'],
    value: (c) => c.client.property.otherContentsSumInsured,
  },
  {
    label: 'Furniture, fixtures and other equipment sum insured',
    ids: ['furnitureFixFittEquip0'],
    value: (c) =>
      sum(c.client.property.furnitureSumInsured, c.client.property.electricalSumInsured),
  },
  {
    label: 'Furniture, fittings and other contents sum insured',
    ids: ['vFurnitureFittingsFixturesOtherContents0', 'vSiFurnitureFixturesFittingsOtherContents'],
    value: (c) =>
      sum(
        c.client.property.furnitureSumInsured,
        c.client.property.electricalSumInsured,
        c.client.property.otherContentsSumInsured,
      ),
  },
  {
    label: 'Other contents details',
    ids: ['otherContentDetails0'],
    value: (c) => c.client.property.otherContentsDescription,
  },
  {
    label: 'Plant and machinery sum insured',
    ids: ['plantMachinery0', 'vPlantMachineryAccessories0', 'vSiPlantMachinery'],
    value: (c) => c.client.property.plantMachinerySumInsured,
  },
  {
    label: 'Stocks sum insured',
    ids: ['stocksInProcessSI0', 'vStocksStocksProcess0', 'vSiStocks'],
    value: (c) => c.client.property.stocksSumInsured,
  },
  {
    label: 'Description of stocks',
    ids: ['stockDesc0'],
    value: (c) => c.client.property.stocksDescription,
  },
  // The building.
  {
    label: 'Construction: walls',
    ids: ['typeOfConsWalls0', 'typeOfConstructionWalls0'],
    value: (c) => pucca(c.client.property.walls),
  },
  {
    label: 'Construction: floor',
    ids: ['typeOfConsFloor0', 'typeOfConstructionFloor0'],
    value: (c) => pucca(c.client.property.floor),
  },
  {
    label: 'Construction: roof',
    ids: ['typeOfConsRoof0', 'typeOfConstructionRoof0'],
    value: (c) => pucca(c.client.property.roof),
  },
  {
    label: 'Type of industry / occupation',
    ids: ['typeOfIndustry', 'vTypeIndustryOccupation_3'],
    value: (c) => c.client.property.industry,
  },
  {
    label: 'Year of construction',
    ids: ['yearOfCons', 'yearOfConstruction', 'vYearConstruction_2'],
    value: (c) => c.client.property.yearOfConstruction,
  },
  {
    label: 'Age of the building',
    ids: ['ageOfBuilding', 'buildingAge'],
    value: (c) =>
      c.client.property.yearOfConstruction === undefined
        ? undefined
        : c.year - c.client.property.yearOfConstruction,
  },
  {
    label: 'Building older than 30 years',
    ids: ['ageOfBuilding30Yr', 'ageOfBuildingMoreThan30'],
    value: (c) =>
      c.client.property.yearOfConstruction === undefined
        ? undefined
        : yesNo(c.year - c.client.property.yearOfConstruction > 30),
  },
  {
    label: 'Number of floors',
    ids: ['noOfFloorOccupancy', 'numberOfFloor', 'numberOfFloors', 'vNumberFloorsOccupancy'],
    value: (c) => c.client.property.floors,
  },
  {
    label: 'Floor of the occupancy',
    ids: ['insuredOccu', 'onWhichFloor', 'vInsuredOccupancySituatedWhichFloor'],
    value: (c, kind) => {
      const f = c.client.property.occupancyFloor;
      if (f === undefined) return undefined;
      return kind === 'select' ? (f === 0 ? 'Ground Floor' : 'Higher Floor') : f;
    },
  },
  {
    label: 'Height of the building (m)',
    ids: ['heightofBuild', 'heightOfBuilding', 'buildingHeight', 'vHeightBuildingMeters_3'],
    value: (c) => c.client.property.heightMeters,
  },
  {
    label: 'Owned by',
    ids: ['nameOfOwner', 'ownedBy', 'vOwned'],
    value: (c) => c.client.holder.customer.name,
  },
  // The risk questions.
  {
    label: 'Lift/elevator',
    ids: ['hasLift', 'doesBuildingHaveElevator', 'vDoesBuildingHasLiftElevator'],
    value: (c) => yesNo(c.client.property.risks.lift),
  },
  {
    label: 'Risk located in the basement',
    ids: [
      'isRiskLocatedInBasement',
      'riskLocatedInBasement',
      'entireRiskLocatedInBasement',
      'vEntireRiskLocatedBasement',
    ],
    value: (c) => yesNo(c.client.property.risks.inBasement),
  },
  {
    label: 'Centrally air-conditioned',
    ids: [
      'centralizedAC',
      'centralAC',
      'isBuildingAirConditioned',
      'vBuildingCentrallyAirConditioned',
    ],
    value: (c) => yesNo(c.client.property.risks.centralAC),
  },
  {
    label: 'Unoccupied for more than 30 days',
    ids: [
      'unoccupiedForAMonth',
      'premiseUnoccupied30Days',
      'willPremisesRemainUnoccupiedFor30Days',
      'vWillPremisesRemainUnoccupiedMoreThan30Days',
    ],
    value: (c) => yesNo(c.client.property.risks.unoccupied30Days),
  },
  {
    label: 'Operational fire hydrant / sprinkler / alarm',
    ids: ['operationalDetectors', 'operationalFireHydrant'],
    value: (c) => yesNo(c.client.property.risks.fireProtection),
  },
  {
    label: 'Electrical installations well maintained',
    ids: ['electricalInstallations', 'electriaclInstallation'],
    value: (c) => yesNo(c.client.property.risks.electricalWellMaintained),
  },
  {
    label: 'Storm water drain and plinth level',
    ids: ['waterDrainSystems', 'provisionOfStorm'],
    value: (c) => yesNo(c.client.property.risks.stormWaterDrain),
  },
  {
    label: 'Security 24 x 7 and CCTV',
    ids: ['security', 'highStandarndSecurity'],
    value: (c) => yesNo(c.client.property.risks.security24x7),
  },
  {
    label: 'Past 3 years claims ratio',
    ids: ['past3YrClaimRatio', 'past3YearsClaimRatio'],
    value: (c, _kind, id) => {
      const r = c.client.property.claimRatio;
      // Griha Raksha's list spells the last one "200 above".
      return r === 'Above 200' && id === 'past3YrClaimRatio' && c.form === 'griha'
        ? '200 above'
        : r;
    },
  },
  {
    label: 'Basement used for operations or storage',
    ids: ['basementUsedforOperations', 'basementUsedForOp'],
    value: (c) => yesNo(c.client.property.risks.basementUsedForOperations),
  },
  {
    label: 'Within 1 km of a water body',
    ids: ['insuredPremisesLocatedWithin1KM', 'premiSesLocated1KM'],
    value: (c) => yesNo(c.client.property.risks.nearWaterBody),
  },
  {
    label: 'No access for the fire brigade',
    ids: ['riskLocatedWithNoAcessToFireBrigade', 'riskLocatedinThickPop'],
    value: (c) => yesNo(c.client.property.risks.noFireBrigadeAccess),
  },
  {
    label: 'Fire protection details',
    ids: [
      'fireProtectionDetail',
      'fireProtectionDetails',
      'vFireProtectionDet',
      'fireFightingArrangementsBldg',
      'fireFightingArrangementsForBuilding',
      'fireFightingArrangementsForRisk',
      'vDetailsFireFightingArrangementsBuilding',
    ],
    value: (c) => c.client.property.fireProtectionDetails,
    all: true,
  },
  {
    label: 'Distance from the fire brigade (km)',
    ids: ['distanceFromPublicFireBrigade', 'vDistanceNearestPublicFireBrigadeKms_1'],
    value: (c) => c.client.property.fireBrigadeDistanceKm,
  },
  {
    label: 'Fire brigade response time (minutes)',
    ids: ['approxTimeOfArrival', 'vApproximateResponseTimeArrivalPublicFireBrigadeMinutes_1'],
    value: (c) => c.client.property.fireBrigadeMinutes,
  },
  {
    label: 'Property mortgaged',
    ids: ['isPropertyMortgagedt', 'propertyMortgage', 'vPropertyMortgaged'],
    value: (c) => yesNo(c.client.property.risks.mortgaged),
  },
  {
    label: 'Past losses from fire or allied perils',
    ids: ['lossDueToFireOrAlliedPeril', 'vWhetherRiskPremises_2'],
    value: (c) => yesNo(c.client.property.risks.pastFireLoss),
  },
];

const RADIO_FACTS: RadioFact[] = [
  {
    label: 'Previously insured',
    radios: ['whetherPolicyInPast0', 'whetherPolicyInPast1'],
    value: (c) => c.client.property.risks.insuredBefore,
  },
  {
    label: 'Risk located in the basement',
    radios: ['istheRiskLocatedinBase0', 'istheRiskLocatedinBase1'],
    value: (c) => c.client.property.risks.inBasement,
  },
  {
    label: 'Property mortgaged',
    radios: ['propertyMortaged0', 'propertyMortaged1'],
    value: (c) => c.client.property.risks.mortgaged,
  },
];

export type NiaFirePlan =
  { ok: true; steps: NiaHealthStep[]; byHand: string[] } | { ok: false; problems: string[] };

export function planNiaFireQuote(
  client: PropertyClient,
  run: NiaFireRun,
  options: { today: Date },
): NiaFirePlan {
  const isHome = NIA_FIRE_HOME_FORMS.includes(run.form);
  const name = NIA_FIRE_FORM_NAMES[run.form];
  const problems: string[] = [];
  if (isHome && client.property.use !== 'home') {
    problems.push(`${name} is for homes; this property is business premises.`);
  }
  if (!isHome && run.form !== 'sfsp' && run.form !== 'war' && client.property.use === 'home') {
    problems.push(`${name} is for business premises; this property is a home.`);
  }
  if (isHome && run.cover === 'building-contents-stocks') {
    problems.push('A home has no stocks: choose building and/or contents.');
  }
  if (problems.length > 0) return { ok: false, problems };

  const fields: Record<string, FireFieldKind> = NIA_FIRE_FIELDS[run.form];
  const c: Context = { form: run.form, client, run, year: options.today.getFullYear() };
  const steps: NiaHealthStep[] = [];
  const byHand: string[] = [];

  marineHolderSteps(client.holder, steps, byHand);

  const fill = (facts: Fact[]) => {
    for (const fact of facts) {
      const ids = fact.ids.filter((id) => id in fields);
      for (const id of fact.all ? ids : ids.slice(0, 1)) {
        const kind = fields[id]!;
        const value = fact.value(c, kind, id);
        if (value === undefined || value === null) {
          if (!byHand.includes(fact.label.toLowerCase())) byHand.push(fact.label.toLowerCase());
          continue;
        }
        steps.push({
          label: fact.label,
          op: { op: 'setField', selector: `#${CSS_ID(id)}`, value: String(value) },
          optional: true,
          ifMissed: fact.label.toLowerCase(),
        });
      }
    }
  };
  steps.push({ label: 'Open the sections', op: { op: 'openSections' } });
  fill(POLICY_FACTS);
  // The cover and policy answers may draw more sections.
  steps.push({ label: 'Open the sections', op: { op: 'pause', ms: 800 } });
  steps.push({ label: 'Open the sections', op: { op: 'openSections' } });
  fill(FACTS);
  for (const fact of RADIO_FACTS) {
    if (!(fact.radios[0] in fields)) continue;
    const answer = fact.value(c);
    if (answer === undefined) {
      if (!byHand.includes(fact.label.toLowerCase())) byHand.push(fact.label.toLowerCase());
      continue;
    }
    steps.push({
      label: fact.label,
      op: { op: 'check', selector: `#${fact.radios[answer ? 0 : 1]}`, checked: true },
      optional: true,
      ifMissed: fact.label.toLowerCase(),
    });
  }
  byHand.push(
    'earthquake state and district (zone)',
    'pre-acceptance inspection',
    'add-on covers and the remaining underwriting questions',
  );
  return { ok: true, steps, byHand };
}

/** An id as a CSS selector (ids here are letters, digits and underscores). */
function CSS_ID(id: string): string {
  return /^[A-Za-z][\w-]*$/.test(id) ? id : id.replace(/([^\w-])/g, '\\$1');
}
