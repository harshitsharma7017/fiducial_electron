// New India's lists for its Private Car and Two Wheeler quote forms, as shown in the recordings
// of 4 November 2026 (new-india-2026-11-04T07-28-34-221Z). Used by the vehicle form (to offer the
// same choices) and by the automation (src/main/quotes/nia-motor.ts).
import type { FuelType } from '../contracts/vehicle';

/** "Type of body" on the Private Car form. */
export const NIA_BODY_TYPES = [
  'Convertible',
  'Coupe',
  'Crossover',
  'Estate',
  'Hatch-Back',
  'Hybrid/Electric',
  'Jeep',
  'Limousine',
  'Micro-car',
  'Mini Hatchback',
  'Minivan/Van',
  'MUV/MPV',
  'Open',
  'Pickup Truck',
  'Saloon',
  'Sedan',
  'Sports Car/Super Car',
  'Station Wagon/Wagon',
  'SUV',
] as const;

/** "Colour of vehicle" on both forms; anything else is entered as "Other Color". */
export const NIA_COLOURS = [
  'A G Metallic',
  'Artic Silver',
  'Beige',
  'Black',
  'Blue',
  'Brown',
  'Champaigne',
  'Dark Red',
  'Dark Blue',
  'Dark Green',
  'Forest Dew',
  'Gold',
  'Graphine',
  'Green',
  'Grey',
  'Ivory',
  'Lemon Yellow',
  'Light Blue',
  'Light Green',
  'Maroon',
  'Mauve',
  'Orange',
  'Peach',
  'Pearl White',
  'Pink',
  'Platinum',
  'Purple',
  'Real Earth',
  'Red',
  'Sandal',
  'Silver',
  'Simpson Red',
  'Super White',
  'Violet',
  'Warm Silver',
  'White',
  'Yellow',
] as const;
export const NIA_OTHER_COLOUR = 'Other Color';

/** "Type of fuel": the option text on each form (Two Wheeler offers fewer). */
export const NIA_FUEL: Record<FuelType, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  cng: 'CNG',
  lpg: 'LPG',
  lng: 'LNG',
  electric: 'Electric',
  hybrid: 'Hybrid',
  'mild-hybrid': 'MILD HYBRID',
  bifuel: 'Bifuel',
};
export const NIA_TWO_WHEELER_FUELS: readonly FuelType[] = [
  'petrol',
  'diesel',
  'electric',
  'hybrid',
  'bifuel',
];

/** Compares names as New India's lists may write them (case and spacing). */
export const sameName = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
