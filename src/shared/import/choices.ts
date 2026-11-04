// The values the import accepts in its list columns: for each value the app saves, the words an
// advisor may write for it (the first is what the template's "How to fill" sheet shows). Pure.
import {
  HIGH_RISK_TYPES,
  NOMINEE_RELATIONSHIPS,
  type Gender,
  type HighRiskType,
  type MaritalStatus,
  type NomineeRelationship,
} from '../contracts/client';
import type { CoverType } from '../contracts/coverage';
import type { Relationship } from '../contracts/customer';
import type { TravelOccupation } from '../contracts/travel';
import type { FuelType, VehicleClass } from '../contracts/vehicle';

export interface Choice<V extends string> {
  value: V;
  names: readonly string[];
}

export const GENDER_CHOICES: Choice<Gender>[] = [
  { value: 'male', names: ['Male', 'M'] },
  { value: 'female', names: ['Female', 'F'] },
  { value: 'transgender', names: ['Transgender', 'T', 'Third gender'] },
];

export const MARITAL_CHOICES: Choice<MaritalStatus>[] = [
  { value: 'married', names: ['Married'] },
  { value: 'unmarried', names: ['Unmarried', 'Single'] },
  { value: 'widowed', names: ['Widowed', 'Widow', 'Widower', 'Widow / widower'] },
  { value: 'divorced', names: ['Divorced', 'Divorcee'] },
];

export const RELATIONSHIP_CHOICES: Choice<Relationship>[] = [
  { value: 'self', names: ['Self', 'Proposer'] },
  { value: 'spouse', names: ['Spouse', 'Wife', 'Husband'] },
  { value: 'son', names: ['Son'] },
  { value: 'daughter', names: ['Daughter'] },
  { value: 'father', names: ['Father'] },
  { value: 'mother', names: ['Mother'] },
  { value: 'father_in_law', names: ['Father-in-law'] },
  { value: 'mother_in_law', names: ['Mother-in-law'] },
];

const NOMINEE_NAMES: Record<NomineeRelationship, readonly string[]> = {
  spouse: ['Spouse', 'Wife', 'Husband'],
  father: ['Father'],
  mother: ['Mother'],
  son: ['Son'],
  daughter: ['Daughter'],
  father_in_law: ['Father-in-law'],
  mother_in_law: ['Mother-in-law'],
  brother: ['Brother'],
  sister: ['Sister'],
};
export const NOMINEE_CHOICES: Choice<NomineeRelationship>[] = NOMINEE_RELATIONSHIPS.map((v) => ({
  value: v,
  names: NOMINEE_NAMES[v],
}));

const HIGH_RISK_NAMES: Record<HighRiskType, readonly string[]> = {
  hni: ['HNI', 'High-net-worth individual'],
  pep: ['PEP', 'Politically exposed person'],
  'nri-hni': ['NRI HNI', 'NRI / foreign resident who is also HNI'],
  'trust-ngo': ['Trust / NGO', 'Trust', 'NGO'],
};
export const HIGH_RISK_CHOICES: Choice<HighRiskType>[] = HIGH_RISK_TYPES.map((v) => ({
  value: v,
  names: HIGH_RISK_NAMES[v],
}));

export const COVER_CHOICES: Choice<CoverType>[] = [
  { value: 'floater', names: ['Floater', 'Family floater'] },
  { value: 'individual', names: ['Individual'] },
];

export const TRAVEL_OCCUPATION_CHOICES: Choice<TravelOccupation>[] = [
  { value: 'SelfEmployed', names: ['Self-employed', 'Self employed', 'Business'] },
  { value: 'Unemployed', names: ['Unemployed', 'Not working'] },
  { value: 'Salaried', names: ['Salaried'] },
  { value: 'Service', names: ['Service'] },
  { value: 'Professional', names: ['Professional'] },
];

export const VEHICLE_CLASS_CHOICES: Choice<VehicleClass>[] = [
  { value: 'private-car', names: ['Private car', 'Car'] },
  { value: 'two-wheeler', names: ['Two-wheeler', 'Two wheeler', 'Motorcycle', 'Scooter', 'Bike'] },
  { value: 'taxi-upto-6', names: ['Taxi (up to 6 passengers)', 'Taxi'] },
  { value: 'bus-above-6', names: ['Bus (more than 6 passengers)', 'Bus'] },
  { value: 'passenger-2w', names: ['Passenger 2-wheeler'] },
  { value: 'passenger-3w-upto-6', names: ['Passenger 3-wheeler (up to 6)', 'Auto rickshaw'] },
  { value: 'passenger-3w-7-to-17', names: ['Passenger 3-wheeler (7 to 17)'] },
  { value: 'goods-private', names: ['Goods carrier, private'] },
  { value: 'goods-public', names: ['Goods carrier, public'] },
  { value: 'goods-3w-private', names: ['Goods 3-wheeler, private'] },
  { value: 'goods-3w-public', names: ['Goods 3-wheeler, public'] },
  { value: 'e-cart-private', names: ['E-cart, private'] },
  { value: 'e-cart-public', names: ['E-cart, public'] },
  { value: 'e-rickshaw', names: ['E-rickshaw'] },
  { value: 'special', names: ['Special vehicle', 'Miscellaneous / special vehicle'] },
];

export const CONDITION_CHOICES: Choice<'new' | 'pre-owned'>[] = [
  { value: 'new', names: ['New'] },
  { value: 'pre-owned', names: ['Pre-owned', 'Used', 'Renewal', 'Old'] },
];

export const ZONE_CHOICES: Choice<'A' | 'B' | 'C'>[] = [
  { value: 'A', names: ['A', 'Zone A'] },
  { value: 'B', names: ['B', 'Zone B'] },
  { value: 'C', names: ['C', 'Zone C'] },
];

export const BUS_CHOICES: Choice<'school' | 'other'>[] = [
  { value: 'school', names: ['School bus', 'School'] },
  { value: 'other', names: ['Other', 'Others'] },
];

export const FUEL_CHOICES: Choice<FuelType>[] = [
  { value: 'petrol', names: ['Petrol'] },
  { value: 'diesel', names: ['Diesel'] },
  { value: 'cng', names: ['CNG'] },
  { value: 'lpg', names: ['LPG'] },
  { value: 'lng', names: ['LNG'] },
  { value: 'electric', names: ['Electric', 'Battery', 'EV'] },
  { value: 'hybrid', names: ['Hybrid'] },
  { value: 'mild-hybrid', names: ['Mild hybrid'] },
  { value: 'bifuel', names: ['Bi-fuel', 'Bifuel'] },
];

/** The accepted values of a list column, for the "How to fill" sheet. */
export const listOf = (choices: readonly Choice<string>[]): string =>
  choices.map((c) => c.names[0]).join(', ');
