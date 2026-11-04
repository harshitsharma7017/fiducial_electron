// New India's health policies the app can open and fill a quote form for (recording
// new-india-2026-11-04T09-24-53-914Z: every health product's quote form opened from the
// dashboard, its sections and members added; nothing typed, no premium). Shared by the request
// contract and the client screen; what is filled is in src/main/quotes/nia-health.ts.
export const NIA_HEALTH_POLICIES = [
  'arogya-pragati-plus',
  'arogya-sanjeevani',
  'jan-arogya-bima',
  'janata-mediclaim',
  'asha-kiran',
  'cancer-guard',
  'criti-protect',
  'mediclaim',
  'premier-mediclaim',
  'top-up-mediclaim',
  'universal-health',
  'yuva-bharat',
] as const;
export type NiaHealthPolicy = (typeof NIA_HEALTH_POLICIES)[number];

/** The policy's name, as the advisor knows it. */
export const NIA_HEALTH_POLICY_NAMES: Record<NiaHealthPolicy, string> = {
  'arogya-pragati-plus': 'Arogya Pragati Plus (Top up Reinvented)',
  'arogya-sanjeevani': 'Arogya Sanjeevani',
  'jan-arogya-bima': 'Jan Arogya Bima',
  'janata-mediclaim': 'Janata Mediclaim',
  'asha-kiran': 'Asha Kiran',
  'cancer-guard': 'Cancer Guard',
  'criti-protect': 'Criti Protect',
  mediclaim: 'New India Mediclaim',
  'premier-mediclaim': 'Premier Mediclaim',
  'top-up-mediclaim': 'TOP-UP Mediclaim',
  'universal-health': 'Universal Health Insurance Scheme (APL)',
  'yuva-bharat': 'Yuva Bharat Health',
};
