// Why the client database could not be used: logged and shown as codes, never with client data.
// Kept free of the database module so the logger can import it.

export const STORE_PROBLEMS = [
  'vault-unavailable',
  'database-key-missing',
  'database-key-invalid',
  'database-unreadable',
  'durability-refused',
  'schema-too-new',
  'write-failed',
] as const;

export type StoreProblem = (typeof STORE_PROBLEMS)[number];
