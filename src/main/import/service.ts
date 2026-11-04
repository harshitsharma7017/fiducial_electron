// Client imports (health clients, travel clients, vehicles) from an .xlsx or .csv file.
//   template: saves a template the advisor fills (save dialog).
//   preview: the advisor picks a file (open dialog); every row is read and checked, and marked new,
//     duplicate (the same record is already saved, or appears earlier in the file) or with
//     problems. The checked rows stay here, in the main process, under a one-time token: the
//     screen sees names and short descriptions, never Aadhaar or passport numbers.
//   commit: saves the new rows (and the duplicates, if the advisor asks) through the client
//     service, exactly as the app's own forms do: same checks, numbers into the vault.
// Nothing about the file or its contents is logged; only the kind and counts.
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import type { ClientService } from '../clients/service';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import type { HealthClientImport } from '../../shared/import/health-clients';
import { IMPORT_SPECS, type ImportKind } from '../../shared/import/kinds';
import { loose } from '../../shared/import/cells';
import { layoutSheet } from '../../shared/import/sheet';
import type { TravellerImport } from '../../shared/import/travellers';
import type { VehicleInputRaw } from '../../shared/contracts/vehicle';
import type { ImportPreview, ImportCommitResult } from '../../shared/ipc/contract';
import { FILE_PROBLEMS, readSpreadsheet } from './read-file';
import { writeTemplate } from './template';

/** A checked import waits this long for the advisor to save it. */
const PENDING_MS = 30 * 60 * 1000;

interface Pending {
  kind: ImportKind;
  at: number;
  rows: { line: number; duplicate: boolean; value: unknown }[];
}

export interface ImportService {
  template(kind: ImportKind, format: 'xlsx' | 'csv'): Promise<{ saved: boolean }>;
  preview(kind: ImportKind): Promise<ImportPreview>;
  commit(token: string, includeDuplicates: boolean): Promise<ImportCommitResult>;
}

export function createImportService(deps: {
  clients: ClientService;
  window: () => BrowserWindow | null;
  logger: Logger;
  now?: () => Date;
}): ImportService {
  const pending = new Map<string, Pending>();
  const now = () => (deps.now ?? (() => new Date()))();
  const sweep = () => {
    for (const [token, p] of pending) {
      if (now().getTime() - p.at > PENDING_MS) pending.delete(token);
    }
  };
  const parent = () => {
    const win = deps.window();
    return win && !win.isDestroyed() ? win : null;
  };

  /** What identifies each saved record, as the row readers compute their keys. */
  const savedKeys = async (kind: ImportKind): Promise<Set<string>> => {
    const keys = new Set<string>();
    if (kind === 'clients') {
      const list = await deps.clients.list();
      if (!list.enabled) throw new AppException('UNSUPPORTED_FLOW');
      if (list.storageError) throw new AppException(list.storageError);
      for (const summary of list.clients) {
        const { client } = await deps.clients.get(summary.id);
        keys.add(`${loose(client.customer.name)}|${client.customer.phone ?? client.pincode}`);
      }
    } else if (kind === 'travellers') {
      for (const t of await deps.clients.listTravellers()) {
        keys.add(`${loose(t.name)}|${t.dateOfBirth}`);
      }
    } else {
      for (const summary of await deps.clients.listVehicles()) {
        const { saved } = await deps.clients.getVehicle(summary.id);
        keys.add(
          saved.vehicle.chassisNumber
            ? `chassis|${loose(saved.vehicle.chassisNumber)}`
            : `name|${loose(saved.name)}`,
        );
        // A row without a chassis number matches a saved vehicle by name, whatever its chassis.
        keys.add(`name|${loose(saved.name)}`);
      }
    }
    return keys;
  };

  return {
    template: async (kind, format) => {
      const spec = IMPORT_SPECS[kind];
      const options = {
        title: `Save the ${spec.noun} template`,
        defaultPath: `${spec.fileName}.${format}`,
        filters: [
          format === 'xlsx'
            ? { name: 'Excel workbook', extensions: ['xlsx'] }
            : { name: 'CSV file', extensions: ['csv'] },
        ],
      };
      const win = parent();
      const chosen = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (chosen.canceled || !chosen.filePath) return { saved: false };
      try {
        await writeTemplate(kind, format, chosen.filePath);
      } catch {
        throw new AppException('STORAGE_ERROR');
      }
      return { saved: true };
    },

    preview: async (kind) => {
      sweep();
      const spec = IMPORT_SPECS[kind];
      // Checked before the file is chosen: the feature may be off, or the store unreadable.
      const existing = await savedKeys(kind);
      const options = {
        title: `Import ${spec.noun}`,
        properties: ['openFile' as const],
        filters: [{ name: 'Excel or CSV', extensions: ['xlsx', 'csv'] }],
      };
      const win = parent();
      const chosen = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      const path = chosen.filePaths[0];
      if (chosen.canceled || !path) throw new AppException('CANCELLED');
      const fileName = basename(path).slice(0, 200);

      const file = await readSpreadsheet(path, spec.sheet);
      if (!file.ok)
        return {
          token: null,
          fileName,
          problem: FILE_PROBLEMS[file.reason],
          ignoredColumns: [],
          rows: [],
        };
      const layout = layoutSheet(file.rows, spec.columns);
      if (!layout.ok)
        return { token: null, fileName, problem: layout.reason, ignoredColumns: [], rows: [] };

      const today = now();
      const inFile = new Set<string>();
      const rows: ImportPreview['rows'] = [];
      const keep: Pending['rows'] = [];
      for (const row of layout.rows) {
        const read = spec.read(row, today);
        if (!read.ok) {
          rows.push({
            line: read.line,
            label: read.label.slice(0, 100),
            detail: read.detail.slice(0, 200),
            status: 'problems',
            problems: read.problems.slice(0, 20).map((p) => p.slice(0, 300)),
          });
          continue;
        }
        const duplicate = existing.has(read.key) || inFile.has(read.key);
        inFile.add(read.key);
        rows.push({
          line: read.line,
          label: read.label.slice(0, 100),
          detail: read.detail.slice(0, 200),
          status: existing.has(read.key) ? 'saved-already' : duplicate ? 'repeated' : 'new',
          problems: [],
        });
        keep.push({ line: read.line, duplicate, value: read.value });
      }
      const token = keep.length > 0 ? randomUUID() : null;
      // One waiting import per kind: a new preview replaces the last.
      for (const [t, p] of pending) if (p.kind === kind) pending.delete(t);
      if (token) pending.set(token, { kind, at: now().getTime(), rows: keep });
      deps.logger.info('import.previewed', { importKind: kind, rowCount: rows.length });
      return { token, fileName, problem: null, ignoredColumns: layout.ignored.slice(0, 50), rows };
    },

    commit: async (token, includeDuplicates) => {
      sweep();
      const p = pending.get(token);
      // Used once: a second press, or an expired preview, saves nothing.
      if (!p) throw new AppException('VALIDATION_FAILED');
      pending.delete(token);
      let saved = 0;
      let skipped = 0;
      const failed: ImportCommitResult['failed'] = [];
      for (const row of p.rows) {
        if (row.duplicate && !includeDuplicates) {
          skipped += 1;
          continue;
        }
        try {
          if (p.kind === 'clients') {
            const v = row.value as HealthClientImport;
            await deps.clients.save(null, v.client, v.aadhaar);
          } else if (p.kind === 'travellers') {
            const v = row.value as TravellerImport;
            await deps.clients.saveTraveller(null, v.traveller, {
              ...(v.aadhaar ? { aadhaar: v.aadhaar } : {}),
              ...(v.passport ? { passport: v.passport } : {}),
            });
          } else {
            await deps.clients.saveVehicle(null, row.value as VehicleInputRaw);
          }
          saved += 1;
        } catch (err) {
          const code = err instanceof AppException ? err.code : 'STORAGE_ERROR';
          failed.push({ line: row.line, code });
          // Without the vault or the database nothing further can be saved either.
          if (code === 'SECRET_STORE_UNAVAILABLE' || code === 'STORAGE_ERROR') {
            const rest = p.rows.slice(p.rows.indexOf(row) + 1);
            const notTried = rest.filter((r) => !r.duplicate || includeDuplicates);
            for (const r of notTried) failed.push({ line: r.line, code: 'CANCELLED' });
            skipped += rest.length - notTried.length;
            break;
          }
        }
      }
      deps.logger.info('import.saved', { importKind: p.kind, rowCount: saved });
      return { saved, skipped, failed: failed.slice(0, 2000) };
    },
  };
}
