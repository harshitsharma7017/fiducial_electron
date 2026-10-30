// The "no plaintext on disk" scan of S3 and S5. The spike's own folders (user-data and the output
// folder, which holds the captured logs) must be read completely: a file there that cannot be
// read is reported as a problem, never treated as clean. Chromium's session data (a separate
// folder for S3 and S5, see index.ts) is scanned too; on Windows Chromium keeps some of its files
// open without read sharing, and those are listed in the evidence instead of stopping the run.
import { app } from 'electron';
import { scanFiles } from '../shared/file-scan';
import type { SpikeContext } from './spike-context';
import { sanitisePath } from './util';

export interface PlaintextScan {
  /** Hits and unreadable spike files; the check passes only when this is empty. */
  problems: string[];
  /** Chromium session files that could not be read (with the error code), for the record. */
  sessionFilesNotScanned: string[];
}

export function plaintextScan(ctx: SpikeContext, needles: readonly Buffer[]): PlaintextScan {
  const own = scanFiles([app.getPath('userData'), ctx.outDir], needles);
  const sessionData = app.getPath('sessionData');
  const session =
    sessionData === app.getPath('userData')
      ? { hits: [], unreadable: [] }
      : scanFiles([sessionData], needles);
  return {
    problems: [
      ...[...own.hits, ...session.hits].map(sanitisePath),
      ...own.unreadable.map((u) => `unreadable (${u.code}): ${sanitisePath(u.file)}`),
    ],
    sessionFilesNotScanned: session.unreadable.map((u) => `${u.code}: ${sanitisePath(u.file)}`),
  };
}
