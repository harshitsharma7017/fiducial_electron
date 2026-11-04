// The three client imports, by kind: their columns, row reader, sheet name and wording. Pure.
import { HEALTH_CLIENT_COLUMNS, readHealthClientRow } from './health-clients';
import type { ImportRow } from './result';
import type { Column } from './sheet';
import { readTravellerRow, TRAVELLER_COLUMNS } from './travellers';
import { readVehicleRow, VEHICLE_COLUMNS } from './vehicles';
import type { SheetRow } from './cells';

import type { ImportKind } from './import-kinds';

export { IMPORT_KINDS, type ImportKind } from './import-kinds';

export interface ImportSpec {
  columns: readonly Column[];
  read: (row: SheetRow, today: Date) => ImportRow<unknown>;
  /** The data sheet's name in the template (and the sheet the import looks for first). */
  sheet: string;
  /** "health clients", for messages; and the template's file name. */
  noun: string;
  fileName: string;
}

export const IMPORT_SPECS: Record<ImportKind, ImportSpec> = {
  clients: {
    columns: HEALTH_CLIENT_COLUMNS,
    read: readHealthClientRow,
    sheet: 'Clients',
    noun: 'health clients',
    fileName: 'Health clients import',
  },
  travellers: {
    columns: TRAVELLER_COLUMNS,
    read: readTravellerRow,
    sheet: 'Travel clients',
    noun: 'travel clients',
    fileName: 'Travel clients import',
  },
  vehicles: {
    columns: VEHICLE_COLUMNS,
    read: readVehicleRow,
    sheet: 'Vehicles',
    noun: 'vehicles',
    fileName: 'Vehicles import',
  },
};
