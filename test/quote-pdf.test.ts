// A fetched quote saved as a PDF: the app's own quote document (the client, every plan quoted and
// its premium, the notes), printed into the Downloads folder under a safe name, never over another file; the app opens only the PDFs it saved.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/main/logging/logger';
import { quoteDocumentHtml, rupees, type QuoteDocument } from '../src/main/quotes/quote-document';
import { createQuotePdfs, pdfFileName } from '../src/main/quotes/quote-pdf';
import { createQuoteService } from '../src/main/quotes/service';

vi.mock('electron', () => ({}));

const AT = new Date(2026, 10, 11, 14, 5);
const DOC: QuoteDocument = {
  title: 'Health insurance quote',
  insurer: 'United India',
  product: 'Health insurance',
  issuedAt: AT,
  reference: 'QF-20261111-1405',
  clientName: 'Synthetic Couple',
  details: [
    ['PIN code', '247776'],
    ['Sum insured', '₹3,00,000'],
  ],
  members: [
    { person: 'Proposer', dateOfBirth: '14/03/1985', age: '41', gender: 'Male' },
    { person: 'Spouse', dateOfBirth: '04/11/1986', age: '40', gender: 'Female' },
  ],
  plans: [
    { name: 'Individual Family Medicare Policy', amount: '11948' },
    { name: 'Arogya Sanjeevani Policy', amount: '14605' },
  ],
  amountLabel: 'Premium (excluding GST)',
  notes: ['Premiums exclude GST.'],
};

describe('quote PDF file names', () => {
  it('name the insurer, product and client, and the time', () => {
    expect(pdfFileName('United India health quote - Synthetic Couple', AT)).toBe(
      'United India health quote - Synthetic Couple 2026-11-11 1405.pdf',
    );
  });

  it('keep no path or reserved characters', () => {
    const name = pdfFileName('../../etc/pass:wd*?"<>|\u0007 quote', AT);
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect([...name].every((c) => c.charCodeAt(0) >= 0x20)).toBe(true);
    expect(name.endsWith(' 2026-11-11 1405.pdf')).toBe(true);
  });
});

describe('the quote document', () => {
  const html = quoteDocumentHtml(DOC);

  it('lists every plan with its premium in rupees, the lowest marked', () => {
    expect(html).toContain('Individual Family Medicare Policy<span class="tag">Lowest</span>');
    expect(html).toContain('₹11,948');
    expect(html).toContain('Arogya Sanjeevani Policy</td><td class="num">₹14,605');
    expect(html.match(/>Lowest</g)).toHaveLength(1);
    expect(html).toContain('Premium (excluding GST)');
  });

  it('shows the client, the cover, the insured persons, the reference and the notes', () => {
    for (const text of [
      'Synthetic Couple',
      '247776',
      '₹3,00,000',
      '04/11/1986',
      'Spouse',
      'QF-20261111-1405',
      'Premiums exclude GST.',
    ])
      expect(html).toContain(text);
  });

  it('marks no plan when only one was quoted', () => {
    expect(quoteDocumentHtml({ ...DOC, plans: [DOC.plans[0]!] })).not.toContain('class="tag"');
  });

  it('escapes every value and carries no script', () => {
    const hostile = quoteDocumentHtml({
      ...DOC,
      clientName: '<script>alert(1)</script>',
      plans: [{ name: '<img src=x onerror=alert(1)>', amount: '100' }],
    });
    expect(hostile).not.toMatch(/<script|<img src=x|javascript:/i);
    expect(hostile).toContain('&lt;script&gt;');
  });

  it("has no image of the insurer's screen", () => {
    expect(html).not.toMatch(/<img|Appendix/);
  });

  it('writes rupees in Indian grouping', () => {
    expect(rupees('11948')).toBe('₹11,948');
    expect(rupees('1,25,000')).toBe('₹1,25,000');
    expect(rupees('1500000')).toBe('₹15,00,000');
    expect(rupees('99.5')).toBe('₹99.50');
    expect(rupees('on request')).toBe('on request');
  });
});

describe('saving quote PDFs', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'fqf-pdf-'));
    const openPath = vi.fn(() => Promise.resolve(''));
    const render = vi.fn((html: string) => Promise.resolve(Buffer.from(`%PDF-1.4 ${html.length}`)));
    return {
      dir,
      openPath,
      render,
      pdfs: createQuotePdfs({ dir: () => dir, openPath, render, now: () => AT }),
    };
  };

  it('prints the quote document to a PDF in the folder', async () => {
    const { dir, render, pdfs } = setup();
    const name = await pdfs.save(DOC, 'United India health quote');
    expect(render).toHaveBeenCalledWith(quoteDocumentHtml(DOC));
    expect(readFileSync(join(dir, name), 'utf8')).toMatch(/^%PDF-1\.4 \d+$/);
  });

  it('never writes over an existing file', async () => {
    const { dir, pdfs } = setup();
    writeFileSync(join(dir, pdfFileName('Same quote', AT)), 'the advisor’s own file');
    const name = await pdfs.save(DOC, 'Same quote');
    expect(name).toBe('Same quote 2026-11-11 1405 (2).pdf');
    expect(readFileSync(join(dir, pdfFileName('Same quote', AT)), 'utf8')).toBe(
      'the advisor’s own file',
    );
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it('opens only the PDFs it saved', async () => {
    const { dir, openPath, pdfs } = setup();
    const name = await pdfs.save(DOC, 'United India health quote');
    expect(await pdfs.open(name)).toBe(true);
    expect(openPath).toHaveBeenCalledWith(join(dir, name));
    expect(await pdfs.open('../../something-else.pdf')).toBe(false);
    expect(openPath).toHaveBeenCalledTimes(1);
  });
});

describe('the quote service', () => {
  const record = {
    id: 'c1',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    client: {
      customer: { name: 'Synthetic Couple', phone: '9876543210', email: 'couple@example.test' },
      pincode: '247776',
      proposerMaritalStatus: 'married',
      members: [
        { relationship: 'self', age: 41, dateOfBirth: '1985-03-14', gender: 'male' },
        { relationship: 'spouse', age: 40, dateOfBirth: '1986-11-04', gender: 'female' },
      ],
      preferences: { coverType: 'floater', sumInsuredPaise: 300000_00, tenureYears: 1 },
    },
  };
  const unused = () => Promise.reject(new Error('not used'));
  const PLANS = [
    { name: 'Individual Family Medicare Policy', amount: '11948' },
    { name: 'Arogya Sanjeevani Policy', amount: '14605' },
  ];
  /** United India's home page, whose calculator tile opens a calculator where every step works. */
  const pages = (plans: typeof PLANS | null) => {
    let opened = false;
    const wc = (id: number, url: string) => ({
      id,
      isDestroyed: () => false,
      getURL: () => url,
      executeJavaScriptInIsolatedWorld: (_world: number, scripts: { code: string }[]) => {
        if (scripts[0]!.code.includes('"op":"clickLink"')) opened = true;
        if (scripts[0]!.code.includes('"op":"readPlans"')) {
          return Promise.resolve(plans ? { ok: true, plans } : { ok: false, detail: 'not-shown' });
        }
        return Promise.resolve({ ok: true });
      },
    });
    const home = {
      isDestroyed: () => false,
      focus: () => undefined,
      webContents: wc(1, 'https://www.uiic.in/GCWebPortal/login/HomeAction.do'),
    };
    const calculator = {
      isDestroyed: () => false,
      focus: () => undefined,
      webContents: wc(2, 'https://www.uiic.in/CustomerAppLive/data/HealthPolicyNewQuote.html'),
    };
    return { windowsOf: () => (opened ? [home, calculator] : [home]) };
  };
  const service = (
    windowsOf: () => unknown[],
    save: (doc: QuoteDocument, title: string) => Promise<string>,
  ) =>
    createQuoteService({
      enabled: true,
      clients: {
        get: () => Promise.resolve(record),
        aadhaarFor: () => Promise.resolve(null),
        getVehicle: unused,
        getTraveller: unused,
        passportFor: () => Promise.resolve(null),
        getRural: unused,
        getMarine: unused,
        getProperty: unused,
      } as never,
      windowsOf: windowsOf as never,
      logger: createLogger([]),
      now: () => AT,
      pdfs: { save, open: () => Promise.resolve(true) },
    });
  const request = {
    clientId: 'c1',
    insurerId: 'united-india',
    product: 'health' as const,
    goodHealthConfirmed: true,
  };

  it('reads every plan, and saves a quote document with them and the client', async () => {
    const { windowsOf } = pages(PLANS);
    const save = vi.fn((_doc: QuoteDocument, _title: string) =>
      Promise.resolve('United India health quote - Synthetic Couple.pdf'),
    );
    const result = await service(windowsOf, save).run(request);
    expect(result).toMatchObject({
      outcome: 'ready',
      premium: { label: 'Individual Family Medicare Policy', amount: '11948' },
      plans: PLANS,
      pdf: { name: 'United India health quote - Synthetic Couple.pdf' },
    });
    expect(result.message).toContain('Arogya Sanjeevani Policy ₹14605');
    const [doc, title] = save.mock.calls[0]!;
    expect(title).toBe('United India health quote - Synthetic Couple');
    expect(doc).toMatchObject({
      title: 'Health insurance quote',
      product: 'Health insurance',
      clientName: 'Synthetic Couple',
      plans: PLANS,
      amountLabel: 'Premium (excluding GST)',
    });
    expect(doc.members).toHaveLength(2);
    expect(doc.details).toContainEqual(['Sum insured', '₹3,00,000']);
    expect(doc.notes.join(' ')).toMatch(/exclude GST/);
  }, 20_000);

  it('saves nothing when no premium was fetched', async () => {
    const { windowsOf } = pages(null);
    const save = vi.fn(() => Promise.resolve('x.pdf'));
    const result = await service(windowsOf, save).run(request);
    expect(result.outcome).toBe('failed');
    expect(result.pdf).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
  }, 20_000);

  it('keeps the quote when the PDF cannot be saved, and says so', async () => {
    const { windowsOf } = pages(PLANS);
    const result = await service(windowsOf, () => Promise.reject(new Error('disk full'))).run(
      request,
    );
    expect(result).toMatchObject({ outcome: 'ready', plans: PLANS });
    expect(result.pdf).toBeUndefined();
    expect(result.message).toMatch(/could not be saved as a PDF/);
  }, 20_000);
});
