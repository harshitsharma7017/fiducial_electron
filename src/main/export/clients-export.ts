// Every saved client in one Excel workbook, a sheet per kind (src/shared/export/client-workbook.ts
// lays them out), saved where the advisor chooses. The Aadhaar and passport numbers are never
// read for it: they stay in the encrypted vault. Nothing about the clients is logged, only how many
// rows were written.
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import writeXlsxFile from 'write-excel-file/node';
import type { ClientService } from '../clients/service';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import {
  clientWorkbook,
  type ClientExport,
  type ExportSheet,
} from '../../shared/export/client-workbook';

export interface ClientExportService {
  /** Asks where to save, then writes the workbook; the file's name, or null if cancelled. */
  exportAll(): Promise<{ saved: boolean; file: string | null }>;
}

const two = (n: number) => String(n).padStart(2, '0');

/** Writes the sheets, and an "About" sheet saying what is and is not in them. */
export async function writeClientWorkbook(
  path: string,
  sheets: ExportSheet[],
  at: Date,
): Promise<void> {
  const bold = { fontWeight: 'bold' as const };
  const stamp = `${two(at.getDate())}/${two(at.getMonth() + 1)}/${at.getFullYear()} ${two(at.getHours())}:${two(at.getMinutes())}`;
  const buffer = await writeXlsxFile(
    [
      ...sheets.map((s) => ({
        sheet: s.name,
        data: [
          s.headers.map((h) => ({ value: h, ...bold })),
          ...s.rows.map((row) => row.map((value) => (value === null ? null : { value }))),
        ],
        columns: s.headers.map((h) => ({ width: Math.max(12, Math.min(36, h.length + 4)) })),
        stickyRowsCount: 1,
      })),
      {
        sheet: 'About',
        data: [
          [{ value: 'Clients exported from Fiducial Quote Fetcher', ...bold }],
          [`Exported on ${stamp}.`],
          [],
          [
            { value: 'Sheet', ...bold },
            { value: 'Rows', ...bold },
          ],
          ...sheets.map((s) => [s.name, s.rows.length]),
          [],
          [
            'Aadhaar and passport numbers are not in this file: they stay in the encrypted vault of the app.',
          ],
          [
            'The Health clients, Travel clients and Vehicles sheets use the import columns: they can be edited and imported back (Import, on each screen).',
          ],
          [
            'This file holds clients’ personal details and is not encrypted: keep it as you would any client document.',
          ],
        ],
        columns: [{ width: 60 }, { width: 10 }],
      },
    ],
    {},
  ).toBuffer();
  await writeFile(path, buffer);
}

export function createClientExportService(deps: {
  clients: ClientService;
  window: () => BrowserWindow | null;
  logger: Logger;
  now?: () => Date;
}): ClientExportService {
  const now = () => (deps.now ?? (() => new Date()))();

  /** Every saved record of every kind (never the vault's numbers). */
  const readAll = async (): Promise<ClientExport> => {
    const list = await deps.clients.list();
    if (!list.enabled) throw new AppException('UNSUPPORTED_FLOW');
    if (list.storageError) throw new AppException(list.storageError);
    const all = <S extends { id: string }, R>(summaries: S[], get: (id: string) => Promise<R>) =>
      Promise.all(summaries.map((s) => get(s.id)));
    return {
      clients: await all(list.clients, (id) => deps.clients.get(id)),
      travellers: await all(await deps.clients.listTravellers(), (id) =>
        deps.clients.getTraveller(id),
      ),
      vehicles: await all(await deps.clients.listVehicles(), (id) => deps.clients.getVehicle(id)),
      rural: await all(await deps.clients.listRural(), (id) => deps.clients.getRural(id)),
      marine: await all(await deps.clients.listMarine(), (id) => deps.clients.getMarine(id)),
      properties: await all(await deps.clients.listProperties(), (id) =>
        deps.clients.getProperty(id),
      ),
    };
  };

  return {
    exportAll: async () => {
      const at = now();
      const options = {
        title: 'Export all clients to Excel',
        defaultPath: `Clients ${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}.xlsx`,
        filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
      };
      const win = deps.window();
      const parent = win && !win.isDestroyed() ? win : null;
      const chosen = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options);
      if (chosen.canceled || !chosen.filePath) return { saved: false, file: null };
      const sheets = clientWorkbook(await readAll());
      try {
        await writeClientWorkbook(chosen.filePath, sheets, at);
      } catch {
        throw new AppException('STORAGE_ERROR');
      }
      deps.logger.info('clients.exported', {
        rowCount: sheets.reduce((n, s) => n + s.rows.length, 0),
      });
      return { saved: true, file: basename(chosen.filePath) };
    },
  };
}
