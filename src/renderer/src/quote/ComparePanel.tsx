// Compare quotes (requests of 25 and 26 November 2026): its own page in the sidebar. One health
// client (or, VehicleCompare.tsx, one vehicle) quoted by several insurers at once (United India,
// Niva Bupa, HDFC ERGO, New India, ICICI Lombard), or by one alone. Every insurer chosen runs at the same time, each in its own
// tab; a card per insurer shows the step it is on, then the form it filled and kept. No PDF is
// made by itself: the advisor checks each insurer's form in its tab, changes anything, and
// presses Stop & make PDF on its card; the app reads the premium that page shows then, saves the
// insurer's PDF, and makes the comparison PDF again from every insurer saved so far. Nothing is
// ever submitted.
import { ExternalLink, FileDown, Square } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
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
import { InsurerAvatar } from '../insurers/branding';
import { readChoices, useSavedChoices } from '../clients/saved-choices';
import { openQuotePdf, showInsurerTab, stopAndMakePdf } from './run';
import { toast } from '../ui/toast';
import { isInsurerPaused } from '../../../shared/insurers/availability';

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

export type Built = { ok: true; request: QuoteRunRequest } | { ok: false; missing: string[] };

/** The run for one insurer, from the client's saved details (the same as its own panel's). */
function buildRequest(
  clientId: string,
  insurer: CompareInsurer,
  product: string,
  choices: ClientQuoteChoices | undefined,
): Built {
  return buildRun(clientId, insurer, product, choices);
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

/** A run that ended (or never started) and why. */
const SETTLED: QuoteProgressView['state'][] = ['ready', 'refused', 'failed', 'cancelled'];

const STATE_NAMES: Record<QuoteProgressView['state'], string> = {
  running: 'Filling',
  'handed-over': 'Filled: check it',
  ready: 'PDF saved',
  refused: 'Not started',
  failed: 'Stopped',
  cancelled: 'Discarded',
};

interface Started {
  product: string;
  /** Could not be started at all (the app's own message). */
  error: string | null;
}

/** One insurer on the compare page: its products ([key, name]) and why it cannot run, if so. */
export interface CompareRow {
  id: string;
  name: string;
  products: [string, string][];
  /** Why it cannot be chosen for this client or vehicle (shown, the row disabled). */
  blocked?: string | null;
  /** What its run lacks for a product (shown when chosen; it is then skipped). */
  missing?: (product: string) => string[];
}

/**
 * The compare page's working part, for a health client or a vehicle: the insurers chosen run at
 * once; a card each; Stop & make PDF per insurer; the comparison PDF made again after each.
 */
export function CompareRunner(props: {
  intro: ReactNode;
  rows: CompareRow[];
  /** The run's request for an insurer and product (read fresh when Run is pressed). */
  build: (insurerId: string, product: string) => Promise<Built>;
  compareWith: { clientId: string } | { vehicleId: string } | { travellerId: string };
  /** Why nothing can run (no members, say). */
  blocked?: string | null;
  /** Shared details above the insurers (a vehicle's quote details). */
  details?: ReactNode;
}): React.JSX.Element {
  const { rows } = props;
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? id;
  const [picked, setPicked] = useState<Partial<Record<string, boolean>>>({});
  const [products, setProducts] = useState<Partial<Record<string, string>>>({});
  const productsFor = (id: string) => rows.find((r) => r.id === id)?.products ?? [];
  const productOf = (id: string) => products[id] ?? productsFor(id)[0]?.[0] ?? '';
  const [batch, setBatch] = useState<{
    at: string;
    started: Partial<Record<string, Started>>;
  } | null>(null);
  const [progress, setProgress] = useState<QuoteProgressView[]>([]);
  const [comparison, setComparison] = useState<
    | { phase: 'making' }
    | { phase: 'done'; pdf: string; insurers: number }
    | { phase: 'error'; message: string }
    | null
  >(null);
  const [amounts, setAmounts] = useState<Partial<Record<string, string>>>({});
  const [stopping, setStopping] = useState<Partial<Record<string, boolean>>>({});

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

  const startedIds = batch ? Object.keys(batch.started) : [];
  /** This batch's progress for an insurer (not an earlier quote's). */
  const progressFor = (insurer: string): QuoteProgressView | null => {
    if (!batch) return null;
    const p = progress.find((x) => x.insurerId === insurer);
    return p && p.updatedAt >= batch.at ? p : null;
  };
  const settled = (insurer: string): boolean => {
    if (batch?.started[insurer]?.error) return true;
    const p = progressFor(insurer);
    return !!p && SETTLED.includes(p.state);
  };
  /** Still filling (or starting): not yet a form to check. */
  const filling = startedIds.some((i) => {
    if (batch?.started[i]?.error) return false;
    const p = progressFor(i);
    return !p || p.state === 'running';
  });
  const withPdf = startedIds.filter((i) => {
    const p = progressFor(i);
    return p?.state === 'ready' && !!p.premium;
  });

  /** The comparison PDF, from every insurer whose PDF is saved (made again each time). */
  const compare = async () => {
    if (!batch) return;
    setComparison({ phase: 'making' });
    const r = await window.fqf.quotes
      .compare({ ...props.compareWith, insurerIds: startedIds })
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

  // Each new insurer PDF (by its card's Stop, or the top bar's in the insurer's tab): the
  // comparison PDF made again, from every insurer saved so far.
  const savedKey = withPdf.join(',');
  const [comparedKey, setComparedKey] = useState('');
  useEffect(() => {
    if (!batch || savedKey === '' || savedKey === comparedKey) return;
    setComparedKey(savedKey);
    void compare();
  });

  const start = async () => {
    const chosen = rows.filter((r) => picked[r.id] && !r.blocked).map((r) => r.id);
    if (chosen.length === 0) return;
    const at = new Date().toISOString();
    const started: Partial<Record<string, Started>> = {};
    const requests: [string, QuoteRunRequest][] = [];
    for (const i of chosen) {
      const built = await props.build(i, productOf(i));
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
    setComparison(null);
    setComparedKey('');
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

  /**
   * Stop & make PDF: the premium the insurer's page shows now (or what the run read, when its page
   * cannot be read), saved as its PDF (the advisor choosing the plan when it shows several); the
   * comparison follows.
   */
  const stopAndPdf = async (insurerId: string, amount?: string) => {
    setStopping((g) => ({ ...g, [insurerId]: true }));
    const r = await stopAndMakePdf(insurerId, amount);
    setStopping((g) => ({ ...g, [insurerId]: false }));
    // Null: the plan question was cancelled (the form stays kept).
    if (!r) return;
    else if (!r.ok) toast(r.error.message);
    else if (r.data.outcome !== 'ready') toast(r.data.message);
    else {
      if (amount) setAmounts((a) => ({ ...a, [insurerId]: '' }));
      toast(`${nameOf(insurerId)} PDF saved in Downloads.`);
    }
  };

  const anyPicked = rows.some((r) => picked[r.id] && !r.blocked);
  return (
    <div className="quote-panel">
      {props.intro}
      {props.blocked && <p className="error">{props.blocked}</p>}
      {props.details}
      <fieldset className="compare-pick" disabled={filling || !!props.blocked}>
        <legend>Insurers</legend>
        {rows.map((row) => {
          const i = row.id;
          const missing = picked[i] && row.missing ? row.missing(productOf(i)) : [];
          const options = productsFor(i);
          return (
            <div key={i} className="compare-pick-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!picked[i] && !row.blocked}
                  disabled={!!row.blocked}
                  onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))}
                />
                {row.name}
              </label>
              {options.length > 1 ? (
                <select
                  aria-label={`${row.name} product`}
                  value={productOf(i)}
                  disabled={!picked[i]}
                  onChange={(e) => setProducts((p) => ({ ...p, [i]: e.target.value }))}
                >
                  {options.map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="compare-pick-product">{options[0]?.[1] ?? ''}</span>
              )}
              {row.blocked && <span className="compare-hint">{row.blocked}</span>}
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
          disabled={filling || !!props.blocked || !anyPicked}
          onClick={() => void start()}
        >
          {filling
            ? 'Filling…'
            : `Run ${rows.filter((r) => picked[r.id] && !r.blocked).length || ''} selected`}
        </button>
        {filling && (
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
            const kept = p?.state === 'handed-over';
            return (
              <section key={i} className={`compare-card compare-${state}`} aria-live="polite">
                <header>
                  <InsurerAvatar name={nameOf(i)} />
                  <div>
                    <strong>{nameOf(i)}</strong>
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
                    {kept ? `Shown now: ${p.premium.label}` : p.premium.label}{' '}
                    <strong>₹{p.premium.amount}</strong>
                  </p>
                )}
                {kept && p.toDo && p.toDo.length > 0 && (
                  <>
                    <p>
                      <strong>Still to do in the insurer&rsquo;s tab:</strong>
                    </p>
                    <ul>
                      {p.toDo.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </>
                )}
                {kept && (
                  <p className="compare-hint">
                    Check the form in its tab and change anything you need, then press Stop &amp;
                    make PDF: the premium shown then is saved, with what you changed.
                  </p>
                )}
                <div className="insurer-actions">
                  {kept && (
                    <button
                      type="button"
                      className="primary"
                      disabled={!!stopping[i]}
                      onClick={() => void stopAndPdf(i)}
                    >
                      <Square size={14} aria-hidden="true" />{' '}
                      {stopping[i] ? 'Reading the premium…' : 'Stop & make PDF'}
                    </button>
                  )}
                  {(state === 'running' || kept || state === 'failed') && (
                    <button type="button" onClick={() => void showInsurerTab(i)}>
                      <ExternalLink size={14} aria-hidden="true" /> Open tab
                    </button>
                  )}
                  {(state === 'running' || kept) && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void window.fqf.quotes.cancel(i).catch(() => null)}
                    >
                      {state === 'running' ? 'Cancel' : 'Discard'}
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
                {kept && (
                  <form
                    className="compare-amount"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const amount = amounts[i]?.trim();
                      if (amount) void stopAndPdf(i, amount);
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
                    <button type="submit" disabled={!amounts[i]?.trim() || !!stopping[i]}>
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
                  : `Made each time you press Stop & make PDF on an insurer (${withPdf.length} of ${startedIds.length} saved so far).`}
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
              disabled={withPdf.length === 0 || comparison?.phase === 'making'}
              onClick={() => void compare()}
            >
              Make it again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A health client's insurers, each run built from the client's saved details. */
export function ComparePanel(props: {
  client: ClientSummary;
  iciciApi: boolean;
}): React.JSX.Element {
  const { client, iciciApi } = props;
  const saved = useSavedChoices(client.id);
  const ids: CompareInsurer[] = [
    'united-india',
    'niva-bupa',
    'hdfc-ergo',
    'new-india',
    'icici-lombard',
  ];
  // A paused insurer is not offered (shared/insurers/availability.ts).
  const rows: CompareRow[] = ids
    .filter((i) => !isInsurerPaused(i))
    .map((i) => ({
      id: i,
      name: INSURER_NAMES[i],
      products: productsOf(i, iciciApi),
      blocked:
        i === 'united-india' && !client.hasPreferences
          ? 'Add the quote details (cover, sum insured) first.'
          : null,
      missing: (product) => {
        if (saved === undefined || saved === null) return [];
        const built = buildRequest(client.id, i, product, saved);
        return built.ok ? [] : built.missing;
      },
    }));
  const build = async (insurerId: string, product: string): Promise<Built> => {
    const read = await readChoices(client.id);
    if ('error' in read) return { ok: false, missing: [read.error] };
    return buildRequest(client.id, insurerId as CompareInsurer, product, read.choices);
  };
  return (
    <CompareRunner
      intro={
        <p className="insurer-note">
          <strong>Compare quotes for {client.name}.</strong> Choose one insurer or several: they all
          run at the same time, each in its own tab, with the details saved with the client. When an
          insurer&rsquo;s form is filled, check it in its tab (change anything you need), then press
          Stop &amp; make PDF on its card: the app reads the premium shown then, saves that
          insurer&rsquo;s PDF and makes the comparison PDF again. No PDF is made until you do.
          Nothing is ever submitted. Sign in to each insurer first.
        </p>
      }
      rows={rows}
      build={build}
      compareWith={{ clientId: client.id }}
      blocked={client.memberCount === 0 ? 'Add members to this client first.' : null}
    />
  );
}
