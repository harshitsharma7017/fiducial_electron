// Compare insurers (request of 25 November 2026): one health client quoted by several insurers
// at once (United India, Niva Bupa, HDFC ERGO, New India, ICICI Lombard), or by one alone. Every
// insurer chosen runs at the same time, each in its own tab; a card per insurer shows the step it
// is on, its premium and its PDF. A form an insurer leaves for the advisor (handed over) shows what
// to fill and a button to its tab, while the others keep going; the app then watches that form for
// its premium (or takes the premium the advisor types). Once every insurer has finished, the app
// makes one PDF comparing their premiums, beside each insurer's own PDF. Nothing is ever submitted.
import { ExternalLink, FileDown, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  hdfcMstFromChoices,
  hdfcRetailFromChoices,
  iciciElevateFromChoices,
  iciciHealthFromChoices,
  nivaRunFromChoices,
  type ClientQuoteChoices,
} from '../../../shared/contracts/client-quote';
import type { ClientSummary } from '../../../shared/contracts/client';
import type { QuoteProgressView, QuoteRunRequest } from '../../../shared/ipc/contract';
import {
  HDFC_RETAIL_NAMES,
  HDFC_RETAIL_PRODUCTS,
  type HdfcRetailProduct,
} from '../../../shared/insurers/hdfc';
import {
  ICICI_HEALTH_NAMES,
  ICICI_HEALTH_PRODUCTS,
  type IciciHealthProduct,
} from '../../../shared/insurers/icici-api';
import {
  NIA_HEALTH_POLICIES,
  NIA_HEALTH_POLICY_NAMES,
  type NiaHealthPolicy,
} from '../../../shared/insurers/nia-health';
import {
  NIVA_HEALTH_PLAN_NAMES,
  NIVA_HEALTH_PLANS,
  type NivaHealthPlan,
} from '../../../shared/insurers/niva-health';
import { rememberedPosp } from '../insurers/hdfc-posp';
import { showAppScreens } from '../insurers/PortalTabs';
import { InsurerAvatar } from '../insurers/branding';
import { readChoices, useSavedChoices } from '../clients/saved-choices';
import { openQuotePdf, showInsurerTab } from './run';
import { toast } from '../ui/toast';

type CompareInsurer = 'united-india' | 'niva-bupa' | 'hdfc-ergo' | 'new-india' | 'icici-lombard';

const INSURER_NAMES: Record<CompareInsurer, string> = {
  'united-india': 'United India',
  'niva-bupa': 'Niva Bupa',
  'hdfc-ergo': 'HDFC ERGO',
  'new-india': 'New India Assurance',
  'icici-lombard': 'ICICI Lombard',
};

/** The products each insurer can quote here, as [key, name]. */
function productsOf(insurer: CompareInsurer, iciciApi = false): [string, string][] {
  switch (insurer) {
    case 'united-india':
      return [['health', 'Health calculator']];
    case 'niva-bupa':
      return NIVA_HEALTH_PLANS.map((p) => [p, NIVA_HEALTH_PLAN_NAMES[p]]);
    case 'hdfc-ergo':
      return [
        ...HDFC_RETAIL_PRODUCTS.map((p): [string, string] => [p, HDFC_RETAIL_NAMES[p]]),
        ['mst', 'MST (Medisure Super Top-up)'],
      ];
    case 'new-india':
      return NIA_HEALTH_POLICIES.map((p) => [p, NIA_HEALTH_POLICY_NAMES[p]]);
    case 'icici-lombard':
      // Elevate on NYSA's health site; by the partner API too, once it is set up.
      return [
        ['nysa-elevate', 'Elevate (NYSA)'],
        ...(iciciApi
          ? ICICI_HEALTH_PRODUCTS.map((p): [string, string] => [
              p,
              `${ICICI_HEALTH_NAMES[p]} (partner API)`,
            ])
          : []),
      ];
  }
}

type Built = { ok: true; request: QuoteRunRequest } | { ok: false; missing: string[] };

/** The run for one insurer, from the client's saved details (the same as its own panel's). */
function buildRequest(
  clientId: string,
  insurer: CompareInsurer,
  product: string,
  choices: ClientQuoteChoices | undefined,
  /** "Let me change it first": the form is left for the advisor, even with a premium. */
  adjust = false,
): Built {
  const built = buildRun(clientId, insurer, product, choices);
  if (!built.ok || !adjust || built.request.product === 'icici-api-health') return built;
  return { ok: true, request: { ...built.request, adjust: true } as QuoteRunRequest };
}

function buildRun(
  clientId: string,
  insurer: CompareInsurer,
  product: string,
  choices: ClientQuoteChoices | undefined,
): Built {
  switch (insurer) {
    case 'united-india':
      return {
        ok: true,
        request: {
          clientId,
          insurerId: insurer,
          product: 'health',
          goodHealthConfirmed: choices?.['united-india']?.goodHealth ?? false,
        },
      };
    case 'new-india':
      return {
        ok: true,
        request: {
          clientId,
          insurerId: insurer,
          product: 'nia-health',
          policy: product as NiaHealthPolicy,
          goodHealthConfirmed: choices?.['new-india']?.goodHealth ?? false,
        },
      };
    case 'niva-bupa': {
      const built = nivaRunFromChoices(product as NivaHealthPlan, choices);
      return built.ok
        ? {
            ok: true,
            request: { clientId, insurerId: insurer, product: 'niva-health', run: built.value },
          }
        : built;
    }
    case 'hdfc-ergo': {
      if (product === 'mst') {
        return {
          ok: true,
          request: {
            clientId,
            insurerId: insurer,
            product: 'hdfc-mst',
            run: hdfcMstFromChoices(choices),
          },
        };
      }
      const built = hdfcRetailFromChoices(product as HdfcRetailProduct, choices, rememberedPosp());
      return built.ok
        ? {
            ok: true,
            request: { clientId, insurerId: insurer, product: 'hdfc-retail', run: built.value },
          }
        : built;
    }
    case 'icici-lombard': {
      if (product === 'nysa-elevate') {
        const elevate = iciciElevateFromChoices(choices);
        return elevate.ok
          ? {
              ok: true,
              request: {
                clientId,
                insurerId: 'icici-lombard',
                product: 'icici-elevate',
                run: elevate.value,
              },
            }
          : elevate;
      }
      const built = iciciHealthFromChoices(product as IciciHealthProduct, choices);
      return built.ok
        ? {
            ok: true,
            request: {
              clientId,
              insurerId: insurer,
              product: 'icici-api-health',
              run: built.value,
            },
          }
        : built;
    }
  }
}

/** How long the app watches a handed-over form for its premium. */
const WATCH_MS = 30 * 60_000;

/** A run that ended (or never started) and why. */
const SETTLED: QuoteProgressView['state'][] = ['ready', 'refused', 'failed', 'cancelled'];

const STATE_NAMES: Record<QuoteProgressView['state'], string> = {
  running: 'Filling',
  'handed-over': 'Needs you',
  ready: 'Premium ready',
  refused: 'Not started',
  failed: 'Stopped',
  cancelled: 'Cancelled',
};

interface Started {
  product: string;
  /** Could not be started at all (the app's own message). */
  error: string | null;
}

export function ComparePanel(props: {
  client: ClientSummary;
  iciciApi: boolean;
}): React.JSX.Element {
  const clientId = props.client.id;
  const insurers: CompareInsurer[] = [
    'united-india',
    'niva-bupa',
    'hdfc-ergo',
    'new-india',
    'icici-lombard',
  ];
  const saved = useSavedChoices(clientId);
  const [picked, setPicked] = useState<Partial<Record<CompareInsurer, boolean>>>({});
  const [products, setProducts] = useState<Partial<Record<CompareInsurer, string>>>({});
  const [adjusts, setAdjusts] = useState<Partial<Record<CompareInsurer, boolean>>>({});
  const productsFor = (i: CompareInsurer) => productsOf(i, props.iciciApi);
  const productOf = (i: CompareInsurer) => products[i] ?? productsFor(i)[0]![0];
  const [batch, setBatch] = useState<{
    at: string;
    started: Partial<Record<CompareInsurer, Started>>;
  } | null>(null);
  const [progress, setProgress] = useState<QuoteProgressView[]>([]);
  const [comparison, setComparison] = useState<
    | { phase: 'making' }
    | { phase: 'done'; pdf: string; insurers: number }
    | { phase: 'error'; message: string }
    | null
  >(null);
  const [amounts, setAmounts] = useState<Partial<Record<string, string>>>({});
  const [generating, setGenerating] = useState<Partial<Record<string, boolean>>>({});
  const watching = useRef(new Set<string>());
  const compared = useRef(false);

  // The insurers' progress, while this screen is open (a long poll: answers when something moves).
  useEffect(() => {
    let live = true;
    let since = 0;
    void (async () => {
      while (live) {
        const r = await window.fqf.quotes.progress(since).catch(() => null);
        if (!live) return;
        if (r?.ok) {
          since = r.data.version;
          setProgress(r.data.items);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const startedIds = batch ? (Object.keys(batch.started) as CompareInsurer[]) : [];
  /** This batch's progress for an insurer (not an earlier quote's). */
  const progressFor = (insurer: string): QuoteProgressView | null => {
    if (!batch) return null;
    const p = progress.find((x) => x.insurerId === insurer);
    return p && p.updatedAt >= batch.at ? p : null;
  };
  const settled = (insurer: CompareInsurer): boolean => {
    if (batch?.started[insurer]?.error) return true;
    const p = progressFor(insurer);
    return !!p && SETTLED.includes(p.state);
  };
  const running = startedIds.some((i) => !settled(i));
  const withPremium = startedIds.filter((i) => {
    const p = progressFor(i);
    return p?.state === 'ready' && !!p.premium;
  });

  const watch = (insurerId: string) => {
    if (watching.current.has(insurerId)) return;
    watching.current.add(insurerId);
    void window.fqf.quotes
      .finish({ waitMs: WATCH_MS, insurerId })
      .catch(() => null)
      .finally(() => watching.current.delete(insurerId));
  };

  // A form handed over: the app watches it for the premium the advisor gets (keep going, come back).
  useEffect(() => {
    for (const i of startedIds) {
      const p = progressFor(i);
      // Not a form the advisor is changing: they press Generate PDF when it is right.
      if (p?.state === 'handed-over' && p.finish && !p.watching && !p.adjust) watch(i);
    }
  });

  const compare = async () => {
    if (!batch) return;
    setComparison({ phase: 'making' });
    const r = await window.fqf.quotes
      .compare({ clientId, insurerIds: startedIds })
      .catch(() => null);
    if (r?.ok && r.data.ok) {
      setComparison({ phase: 'done', pdf: r.data.pdf.name, insurers: r.data.insurers });
      toast('Comparison PDF saved in Downloads.');
    } else {
      setComparison({
        phase: 'error',
        message: r
          ? r.ok
            ? r.data.ok
              ? ''
              : r.data.message
            : r.error.message
          : 'The comparison could not be made.',
      });
    }
  };

  // Every insurer finished: back to the app (the tabs are done with), and the comparison PDF,
  // once per batch, if any gave a premium.
  useEffect(() => {
    if (!batch || running || compared.current) return;
    compared.current = true;
    showAppScreens();
    if (withPremium.length > 0) void compare();
  });

  const start = async () => {
    const chosen = insurers.filter((i) => picked[i]);
    if (chosen.length === 0) return;
    const read = await readChoices(clientId);
    if ('error' in read) {
      toast(read.error);
      return;
    }
    const at = new Date().toISOString();
    const started: Partial<Record<CompareInsurer, Started>> = {};
    const requests: [CompareInsurer, QuoteRunRequest][] = [];
    for (const i of chosen) {
      const built = buildRequest(clientId, i, productOf(i), read.choices, !!adjusts[i]);
      if (built.ok) {
        started[i] = { product: productOf(i), error: null };
        requests.push([i, built.request]);
      } else {
        started[i] = {
          product: productOf(i),
          error: `Not started: add ${built.missing.join('; ')}.`,
        };
      }
    }
    compared.current = false;
    setComparison(null);
    setAmounts({});
    setBatch({ at, started });
    // All at the same time; each insurer's result comes in through its progress.
    for (const [i, request] of requests) {
      void window.fqf.quotes
        .run(request)
        .catch(() => null)
        .then((r) => {
          // Refused (another quote for this insurer still running, say): its reason, as the
          // service gives no progress for a run it never began.
          if (r?.ok && r.data.outcome !== 'refused') return;
          const message = r
            ? r.ok
              ? r.data.message
              : r.error.message
            : 'The quote could not be started.';
          setBatch((b) =>
            b && b.at === at
              ? { ...b, started: { ...b.started, [i]: { ...b.started[i]!, error: message } } }
              : b,
          );
        });
    }
  };

  const cancelAll = () => {
    for (const i of startedIds) {
      if (!settled(i)) void window.fqf.quotes.cancel(i).catch(() => null);
    }
  };

  /** The premium shown now on the form the advisor changed: saved as the PDF. */
  const generatePdf = async (insurerId: string) => {
    setGenerating((g) => ({ ...g, [insurerId]: true }));
    const r = await window.fqf.quotes.finish({ waitMs: 0, insurerId }).catch(() => null);
    setGenerating((g) => ({ ...g, [insurerId]: false }));
    if (!r) toast('The PDF could not be made.');
    else if (!r.ok) toast(r.error.message);
    else if (r.data.outcome !== 'ready') toast(r.data.message);
  };

  const typePremium = async (insurerId: string) => {
    const amount = amounts[insurerId]?.trim();
    if (!amount) return;
    const r = await window.fqf.quotes.finish({ waitMs: 0, amount, insurerId }).catch(() => null);
    if (r && !r.ok) toast(r.error.message);
    else setAmounts((a) => ({ ...a, [insurerId]: '' }));
  };

  const missingFor = (i: CompareInsurer): string[] => {
    if (saved === undefined || saved === null) return [];
    const built = buildRequest(clientId, i, productOf(i), saved);
    return built.ok ? [] : built.missing;
  };

  const noMembers = props.client.memberCount === 0;
  const uiicNeeds = !props.client.hasPreferences
    ? 'Add the quote details (cover, sum insured) first.'
    : null;

  return (
    <div className="quote-panel">
      <p className="insurer-note">
        <strong>Compare insurers.</strong> Choose one insurer or several: they all run at the same
        time, each in its own tab, with the details saved with the client. A form that needs you
        shows here with what to fill; the others keep going. Tick &ldquo;Let me change it before the
        PDF&rdquo; to change an insurer&rsquo;s form yourself first: the app fills it, you change it
        and get the premium, then press Generate PDF on its card. Each premium is saved as the
        insurer&rsquo;s own PDF, and once all have finished, one PDF compares them. Nothing is ever
        submitted. Sign in to each insurer first.
      </p>
      {noMembers && <p className="error">Add members to this client first.</p>}
      <fieldset className="compare-pick" disabled={running || noMembers}>
        <legend>Insurers</legend>
        {insurers.map((i) => {
          const missing = picked[i] ? missingFor(i) : [];
          const products = productsFor(i);
          const blocked = i === 'united-india' ? uiicNeeds : null;
          return (
            <div key={i} className="compare-pick-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!picked[i] && !blocked}
                  disabled={!!blocked}
                  onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))}
                />
                {INSURER_NAMES[i]}
              </label>
              {products.length > 1 ? (
                <select
                  aria-label={`${INSURER_NAMES[i]} product`}
                  value={productOf(i)}
                  disabled={!picked[i]}
                  onChange={(e) => setProducts((p) => ({ ...p, [i]: e.target.value }))}
                >
                  {products.map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="compare-pick-product">{products[0]![1]}</span>
              )}
              {(i !== 'icici-lombard' || productOf(i) === 'nysa-elevate') && (
                <label className="check compare-adjust">
                  <input
                    type="checkbox"
                    checked={!!adjusts[i]}
                    disabled={!picked[i] || !!blocked}
                    onChange={(e) => setAdjusts((a) => ({ ...a, [i]: e.target.checked }))}
                  />
                  Let me change it before the PDF
                </label>
              )}
              {blocked && <span className="compare-hint">{blocked}</span>}
              {missing.length > 0 && (
                <span className="compare-hint">
                  Needs {missing.join('; ')}. It will be skipped until then.
                </span>
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="insurer-actions">
        <button
          type="button"
          className="primary"
          disabled={running || noMembers || !insurers.some((i) => picked[i])}
          onClick={() => void start()}
        >
          {running ? 'Working…' : `Run ${insurers.filter((i) => picked[i]).length || ''} selected`}
        </button>
        {running && (
          <button type="button" onClick={cancelAll}>
            <Square size={14} aria-hidden="true" /> Cancel all
          </button>
        )}
      </div>

      {batch && (
        <div className="compare-cards">
          {startedIds.map((i) => {
            const s = batch.started[i]!;
            const p = progressFor(i);
            const state: QuoteProgressView['state'] | 'waiting' = s.error
              ? 'refused'
              : (p?.state ?? 'waiting');
            const productName = productsFor(i).find(([k]) => k === s.product)?.[1] ?? s.product;
            return (
              <section key={i} className={`compare-card compare-${state}`} aria-live="polite">
                <header>
                  <InsurerAvatar name={INSURER_NAMES[i]} />
                  <div>
                    <strong>{INSURER_NAMES[i]}</strong>
                    <span>{productName}</span>
                  </div>
                  <span className="compare-state">
                    {state === 'waiting' ? 'Starting' : STATE_NAMES[state]}
                  </span>
                </header>
                {state === 'running' && p?.step && <p className="compare-step">{p.step}…</p>}
                {s.error && <p>{s.error}</p>}
                {!s.error && p && p.state !== 'running' && p.message && <p>{p.message}</p>}
                {p?.premium && (
                  <p className="premium">
                    {p.state === 'handed-over'
                      ? `Shown for now: ${p.premium.label}`
                      : p.premium.label}{' '}
                    <strong>₹{p.premium.amount}</strong>
                  </p>
                )}
                {p?.state === 'handed-over' && p.toDo && p.toDo.length > 0 && (
                  <>
                    <p>
                      <strong>Fill in the insurer&rsquo;s tab:</strong>
                    </p>
                    <ul>
                      {p.toDo.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </>
                )}
                {p?.state === 'handed-over' && p.adjust && (
                  <p className="compare-hint">
                    Open the tab, change what you need and get the premium there, then press
                    Generate PDF: the premium shown then is the quote, and the PDF names what you
                    changed.
                  </p>
                )}
                {p?.state === 'handed-over' && !p.adjust && (
                  <p className="compare-hint">
                    {p.watching
                      ? `Watching for the premium${p.finish?.button ? ` after you press ${p.finish.button}` : ''}: the PDF is saved by itself.`
                      : 'Not watching: type the premium below, or watch again.'}
                  </p>
                )}
                <div className="insurer-actions">
                  {(state === 'running' || state === 'handed-over' || state === 'failed') && (
                    <button
                      type="button"

                      onClick={() => void showInsurerTab(i)}
                    >
                      <ExternalLink size={14} aria-hidden="true" /> Open tab
                    </button>
                  )}
                  {(state === 'running' || state === 'handed-over') && (
                    <button
                      type="button"

                      onClick={() => void window.fqf.quotes.cancel(i).catch(() => null)}
                    >
                      {state === 'running' ? 'Cancel' : p?.adjust ? 'Discard' : 'Stop watching'}
                    </button>
                  )}
                  {p?.state === 'handed-over' && p.adjust && (
                    <button
                      type="button"
                      className="primary"
                      disabled={!!generating[i]}
                      onClick={() => void generatePdf(i)}
                    >
                      <FileDown size={14} aria-hidden="true" />{' '}
                      {generating[i] ? 'Reading the premium…' : 'Generate PDF'}
                    </button>
                  )}
                  {p?.state === 'handed-over' && !p.watching && !p.adjust && (
                    <button type="button" onClick={() => watch(i)}>
                      Watch again
                    </button>
                  )}
                  {p?.pdf && (
                    <button
                      type="button"
                      onClick={() =>
                        void openQuotePdf(p.pdf!.name).then(
                          (ok) => ok || toast('The PDF could not be opened.'),
                        )
                      }
                    >
                      <FileDown size={14} aria-hidden="true" /> Open PDF
                    </button>
                  )}
                </div>
                {p?.state === 'handed-over' && (
                  <form
                    className="compare-amount"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void typePremium(i);
                    }}
                  >
                    <label>
                      Or type the premium shown
                      <input
                        inputMode="decimal"
                        placeholder="₹"
                        value={amounts[i] ?? ''}
                        onChange={(e) => setAmounts((a) => ({ ...a, [i]: e.target.value }))}
                      />
                    </label>
                    <button type="submit" disabled={!amounts[i]?.trim()}>
                      Save PDF
                    </button>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      )}

      {batch && (
        <div role="status" className="compare-summary">
          <p>
            <strong>Comparison PDF.</strong>{' '}
            {comparison?.phase === 'making'
              ? 'Making it…'
              : comparison?.phase === 'done'
                ? `Saved in Downloads: ${comparison.pdf} (${comparison.insurers} insurer${comparison.insurers > 1 ? 's' : ''}).`
                : comparison?.phase === 'error'
                  ? comparison.message
                  : running
                    ? `Made by itself once every insurer has finished (${withPremium.length} of ${startedIds.length} with a premium so far).`
                    : 'No premium to compare yet.'}
          </p>
          <div className="insurer-actions">
            {comparison?.phase === 'done' && (
              <button
                type="button"
                onClick={() =>
                  void openQuotePdf(comparison.pdf).then(
                    (ok) => ok || toast('The PDF could not be opened.'),
                  )
                }
              >
                <FileDown size={14} aria-hidden="true" /> Open comparison
              </button>
            )}
            <button
              type="button"

              disabled={withPremium.length === 0 || comparison?.phase === 'making'}
              onClick={() => void compare()}
            >
              {comparison?.phase === 'done' ? 'Make it again' : 'Make it now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
