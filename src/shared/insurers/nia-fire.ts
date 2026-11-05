// New India's fire quote forms the app fills for a property client (recording
// new-india-2026-11-04T10-59-31-695Z: nine forms opened from the dashboard, FIRE, their sections
// and lists; nothing typed, no premium). What is chosen for the run is not saved. Shared by the
// request contract and the property client screen; what is filled is in src/main/quotes/nia-fire.ts.
import { z } from 'zod';

export const NIA_FIRE_FORMS = [
  'griha',
  'flexi-griha',
  'flexi-griha-long-term',
  'sookshma',
  'flexi-sookshma',
  'laghu',
  'flexi-laghu',
  'sfsp',
  'war',
] as const;
export type NiaFireForm = (typeof NIA_FIRE_FORMS)[number];

export const NIA_FIRE_FORM_NAMES: Record<NiaFireForm, string> = {
  griha: 'Bharat Griha Raksha',
  'flexi-griha': 'Bharat Flexi Griha Raksha',
  'flexi-griha-long-term': 'Bharat Flexi Griha Raksha (Long Term)',
  sookshma: 'Bharat Sookshma Udyam Suraksha',
  'flexi-sookshma': 'Flexi Sookshma Udyam',
  laghu: 'Bharat Laghu Udyam Suraksha',
  'flexi-laghu': 'Bharat Flexi Laghu Udyam Suraksha',
  sfsp: 'Standard Fire and Special Perils',
  war: 'Standalone War',
};

/** The forms for homes; the others are for business premises (War and SFSP for either). */
export const NIA_FIRE_HOME_FORMS: readonly NiaFireForm[] = [
  'griha',
  'flexi-griha',
  'flexi-griha-long-term',
];

/** What to cover. Homes: building and/or contents; business: also stocks. */
export const NIA_FIRE_COVERS = {
  'building-contents': 'Building and contents',
  building: 'Building only',
  contents: 'Contents only',
  'building-contents-stocks': 'Building, contents and stocks',
} as const;
export type NiaFireCover = keyof typeof NIA_FIRE_COVERS;

export const niaFireRunSchema = z.strictObject({
  form: z.enum(NIA_FIRE_FORMS),
  cover: z.enum(Object.keys(NIA_FIRE_COVERS) as [NiaFireCover, ...NiaFireCover[]]),
});
export type NiaFireRun = z.output<typeof niaFireRunSchema>;
