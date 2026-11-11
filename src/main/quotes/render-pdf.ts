// Prints the app's own HTML documents (quote-document.ts) to PDF: in a hidden window with scripts
// switched off, in a session of its own (in memory, nothing kept) that loads nothing but the one
// document, written to a private temporary file and removed afterwards.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, session } from 'electron';
import type { Logger } from '../logging/logger';
import { hardenSession, setSessionPolicy } from '../security/navigation-policy';

export function createPdfRenderer(logger: Logger): (html: string) => Promise<Buffer> {
  return async (html) => {
    const dir = await mkdtemp(join(tmpdir(), 'fqf-quote-'));
    const file = join(dir, 'quote.html');
    const url = pathToFileURL(file).href;
    await writeFile(file, html, { encoding: 'utf8', mode: 0o600 });
    // A fresh session per document: it may load the document and nothing else.
    const ses = session.fromPartition(`fqf-quote-pdf-${Date.now()}`);
    hardenSession(ses, logger);
    setSessionPolicy(ses, { navigate: (target) => target === url, popup: () => null });
    ses.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: details.url !== url });
    });
    const win = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: {
        session: ses,
        javascript: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    try {
      await win.loadURL(url);
      return await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
    } finally {
      win.destroy();
      await rm(dir, { recursive: true, force: true });
    }
  };
}
