// The kinds of client import. Kept apart from the row readers (./kinds.ts) so the IPC contract
// and the preload's types do not pull them in.
export const IMPORT_KINDS = ['clients', 'travellers', 'vehicles'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
