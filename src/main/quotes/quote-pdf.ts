// A fetched quote, saved as a PDF in the advisor's Downloads folder (requests of 11 November 2026):
// the app's own quote document (quote-document.ts: the client, every plan and its premium, the
// notes), printed by `render`. The app opens only the files it wrote
// itself (by name, never a path from the app's page).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { quoteDocumentHtml, type QuoteDocument } from './quote-document';

export interface QuotePdfs {
  /** Writes the quote document to a new PDF named after `title`; returns the file's name. */
  save(doc: QuoteDocument, title: string): Promise<string>;
  /** Opens a PDF this app saved; false for any other name. */
  open(name: string): Promise<boolean>;
}

const two = (n: number) => String(n).padStart(2, '0');

/** A file name from free text: no path or reserved characters, kept short. */
export function pdfFileName(title: string, at: Date): string {
  const safe = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const stamp = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}${two(at.getMinutes())}`;
  return `${safe || 'Quote'} ${stamp}.pdf`;
}

export function createQuotePdfs(deps: {
  /** The folder the PDFs go to (the Downloads folder). */
  dir: () => string;
  openPath: (path: string) => Promise<string>;
  /** Prints an HTML document (no scripts) to PDF bytes. */
  render: (html: string) => Promise<Buffer>;
  now?: () => Date;
}): QuotePdfs {
  /** The PDFs saved in this session, by name. */
  const written = new Map<string, string>();
  return {
    save: async (doc, title) => {
      const data = await deps.render(quoteDocumentHtml(doc));
      const dir = deps.dir();
      await mkdir(dir, { recursive: true });
      const base = pdfFileName(title, (deps.now ?? (() => new Date()))());
      // Never over an existing file: "… (2).pdf" and so on.
      for (let n = 1; n < 100; n += 1) {
        const name = n === 1 ? base : base.replace(/\.pdf$/, ` (${n}).pdf`);
        const path = join(dir, name);
        try {
          await writeFile(path, data, { flag: 'wx' });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
          throw err;
        }
        written.set(name, path);
        return name;
      }
      throw new Error('no free file name');
    },
    open: async (name) => {
      const path = written.get(name);
      if (!path) return false;
      return (await deps.openPath(path)) === '';
    },
  };
}
