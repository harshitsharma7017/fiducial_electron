// Compare quotes (requests of 25 and 26 November 2026): its own page in the sidebar. One health
// client (or, VehicleCompare.tsx, one vehicle) quoted by several insurers at once (United India,
// Niva Bupa, HDFC ERGO, New India, ICICI Lombard), or by one alone. Every insurer chosen runs at the same time, each in its own
// tab; a card per insurer shows the step it is on, then the form it filled and kept. No PDF is
// made by itself: the advisor checks each insurer's form in its tab, changes anything, and
// presses Stop & make PDF on its card; the app reads the premium that page shows then, saves the
// insurer's PDF, and makes the comparison PDF again from every insurer saved so far. Nothing is
// ever submitted.
import {
  ChevronDown,
  CircleCheck,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  Square,
  TriangleAlert,
} from 'lucide-react';
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

/** How a run's state is shown: its name and tone (the card's edge and badge follow it). */
const STATUS: Record<QuoteProgressView['state'] | 'waiting', { label: string; tone: string }> = {
  waiting: { label: 'Starting', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  'handed-over': { label: 'Needs your check', tone: 'warning' },
  ready: { label: 'PDF saved', tone: 'success' },
  refused: { label: 'Not started', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Stopped', tone: 'stopped' },
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
  /** Each result's issues, shown or folded away (each insurer's on its own). */
  const [expanded, setExpanded] = useState<Partial<Record<string, boolean>>>({});

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
    setExpanded({});
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
  const pickedCount = rows.filter((r) => picked[r.id] && !r.blocked).length;
  return (
    <div className="quote-panel compare-runner">
      {props.intro && <div className="compare-intro">{props.intro}</div>}
      {props.blocked && (
        <p className="error" role="alert">
          {props.blocked}
        </p>
      )}
      {props.details}

      <section className="compare-section" aria-labelledby="compare-insurers-title">
        <header className="compare-section-head">
          <div>
            <h3 id="compare-insurers-title">Insurers</h3>
            <p>Choose the insurers to quote, and each one&rsquo;s product or plan.</p>
          </div>
          <span className="compare-count">
            {pickedCount} of {rows.filter((r) => !r.blocked).length} selected
          </span>
        </header>
        <fieldset className="compare-grid" disabled={filling || !!props.blocked}>
          <legend className="visually-hidden">Insurers</legend>
          {rows.map((row) => {
            const i = row.id;
            const on = !!picked[i] && !row.blocked;
            const missing = picked[i] && row.missing ? row.missing(productOf(i)) : [];
            const options = productsFor(i);
            return (
              <div
                key={i}
                className="compare-option"
                data-selected={on}
                data-blocked={!!row.blocked}
              >
                <label className="compare-option-head">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!!row.blocked}
                    onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))}
                  />
                  <InsurerAvatar name={row.name} />
                  <span className="compare-option-name">{row.name}</span>
                </label>
                {options.length > 1 ? (
                  <select
                    aria-label={`${row.name} product`}
                    value={productOf(i)}
                    disabled={!on}
                    onChange={(e) => setProducts((p) => ({ ...p, [i]: e.target.value }))}
                  >
                    {options.map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="compare-option-product">{options[0]?.[1] ?? '—'}</span>
                )}
                {row.blocked && <p className="compare-option-note">{row.blocked}</p>}
                {missing.length > 0 && (
                  <p className="compare-option-note" data-tone="warning">
                    <TriangleAlert size={13} aria-hidden="true" />
                    <span>Needs {missing.join('; ')}. It will be skipped until then.</span>
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>
        <div className="compare-run-bar">
          <button
            type="button"
            className="primary"
            disabled={filling || !!props.blocked || !anyPicked}
            onClick={() => void start()}
          >
            {filling ? (
              <>
                <Loader2 size={15} className="spin" aria-hidden="true" /> Filling…
              </>
            ) : (
              <>
                <Play size={15} aria-hidden="true" /> Run {pickedCount || ''} selected
              </>
            )}
          </button>
          {filling && (
            <button type="button" onClick={cancelAll}>
              <Square size={14} aria-hidden="true" /> Cancel all
            </button>
          )}
          {!anyPicked && !filling && !props.blocked && (
            <span className="compare-run-hint">Select at least one insurer to run.</span>
          )}
        </div>
      </section>

      {batch && (
        <section className="compare-section" aria-labelledby="compare-results-title">
          <header className="compare-section-head">
            <div>
              <h3 id="compare-results-title">Results</h3>
              <p>Each insurer&rsquo;s form, filled in its own tab.</p>
            </div>
          </header>
          <div className="compare-grid">
            {startedIds.map((i) => {
              const s = batch.started[i]!;
              const p = progressFor(i);
              const state: QuoteProgressView['state'] | 'waiting' = s.error
                ? 'refused'
                : (p?.state ?? 'waiting');
              const status = STATUS[state];
              const productName = productsFor(i).find(([k]) => k === s.product)?.[1] ?? s.product;
              const kept = p?.state === 'handed-over';
              // The issues, only as the run reported them: why it could not start or stopped, and
              // what is left to fill by hand.
              const reason =
                s.error ??
                (p && (p.state === 'failed' || p.state === 'refused') ? p.message : null);
              const toDo = kept ? (p.toDo ?? []) : [];
              const issues = (reason ? 1 : 0) + toDo.length;
              const summary = !s.error && p && kept ? p.message : null;
              const shown = !!expanded[i];
              const settledOk = state === 'ready' || kept;
              return (
                <article
                  key={i}
                  className="compare-result"
                  data-tone={status.tone}
                  aria-live="polite"
                >
                  <header className="compare-result-head">
                    <InsurerAvatar name={nameOf(i)} />
                    <div className="compare-result-title">
                      <strong>{nameOf(i)}</strong>
                      <span title={productName}>{productName}</span>
                    </div>
                    <span className={`status status-${status.tone}`}>
                      {state === 'running' || state === 'waiting' ? (
                        <Loader2 size={12} className="spin" aria-hidden="true" />
                      ) : (
                        <span className="status-dot" aria-hidden="true" />
                      )}
                      {status.label}
                    </span>
                  </header>
                  {(state === 'running' || state === 'waiting') && (
                    <p className="compare-result-line">
                      {p?.step ? `${p.step}…` : 'Opening the insurer’s form…'}
                    </p>
                  )}
                  {state === 'cancelled' && p?.message && (
                    <p className="compare-result-line">{p.message}</p>
                  )}
                  {p?.premium && (
                    <p className="compare-result-premium">
                      <span>{kept ? `Shown now: ${p.premium.label}` : p.premium.label}</span>
                      <strong>₹{p.premium.amount}</strong>
                    </p>
                  )}
                  {(issues > 0 || summary || settledOk) && (
                    <div className="compare-issues">
                      {issues > 0 || summary ? (
                        <button
                          type="button"
                          className="compare-issues-toggle"
                          aria-expanded={shown}
                          aria-controls={`compare-issues-${i}`}
                          onClick={() => setExpanded((x) => ({ ...x, [i]: !x[i] }))}
                        >
                          <TriangleAlert size={14} aria-hidden="true" />
                          {issues > 0
                            ? `${issues} issue${issues > 1 ? 's' : ''}`
                            : 'What the run did'}
                          <span className="compare-issues-action">
                            {shown ? 'Hide details' : 'View details'}
                            <ChevronDown size={14} aria-hidden="true" data-open={shown} />
                          </span>
                        </button>
                      ) : (
                        <p className="compare-issues-ok">
                          <CircleCheck size={14} aria-hidden="true" /> No issues
                        </p>
                      )}
                      {shown && (
                        <div className="compare-issues-body" id={`compare-issues-${i}`}>
                          {reason && <p className="compare-issues-reason">{reason}</p>}
                          {summary && <p>{summary}</p>}
                          {toDo.length > 0 && (
                            <>
                              <p className="compare-issues-label">
                                Still to do in the insurer&rsquo;s tab
                              </p>
                              <ol>
                                {toDo.map((t) => (
                                  <li key={t}>{t}</li>
                                ))}
                              </ol>
                            </>
                          )}
                          {kept && (
                            <p className="compare-issues-hint">
                              Check the form in its tab and change anything you need, then press
                              Stop &amp; make PDF: the premium shown then is saved, with what you
                              changed.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="compare-result-actions">
                    {kept && (
                      <button
                        type="button"
                        className="primary btn-sm"
                        disabled={!!stopping[i]}
                        onClick={() => void stopAndPdf(i)}
                      >
                        {stopping[i] ? (
                          <Loader2 size={14} className="spin" aria-hidden="true" />
                        ) : (
                          <Square size={14} aria-hidden="true" />
                        )}
                        {stopping[i] ? 'Reading the premium…' : 'Stop & make PDF'}
                      </button>
                    )}
                    {(state === 'running' || kept || state === 'failed') && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void showInsurerTab(i)}
                      >
                        <ExternalLink size={14} aria-hidden="true" /> Open tab
                      </button>
                    )}
                    {(state === 'running' || kept) && (
                      <button
                        type="button"
                        className="ghost btn-sm"
                        onClick={() => void window.fqf.quotes.cancel(i).catch(() => null)}
                      >
                        {state === 'running' ? 'Cancel' : 'Discard'}
                      </button>
                    )}
                    {p?.pdf && (
                      <button
                        type="button"
                        className="btn-sm"
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
                      <button
                        type="submit"
                        className="btn-sm"
                        disabled={!amounts[i]?.trim() || !!stopping[i]}
                      >
                        Save PDF
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {batch && (
        <section
          className="compare-section compare-report"
          aria-labelledby="compare-report-title"
          role="status"
        >
          <div className="compare-report-main">
            <span className="compare-report-icon" aria-hidden="true">
              <FileText size={20} />
            </span>
            <div>
              <h3 id="compare-report-title">Comparison PDF</h3>
              <p>
                <strong>
                  {withPdf.length} of {startedIds.length}
                </strong>{' '}
                insurer PDF{startedIds.length > 1 ? 's' : ''} saved.{' '}
                {comparison?.phase === 'making'
                  ? 'Making the comparison…'
                  : comparison?.phase === 'done'
                    ? `Saved in Downloads: ${comparison.pdf} (${comparison.insurers} insurer${comparison.insurers > 1 ? 's' : ''}).`
                    : comparison?.phase === 'error'
                      ? comparison.message
                      : 'It is made each time you press Stop & make PDF on an insurer.'}
              </p>
              <div
                className="compare-report-bar"
                role="progressbar"
                aria-label="Insurer PDFs saved"
                aria-valuemin={0}
                aria-valuemax={startedIds.length}
                aria-valuenow={withPdf.length}
              >
                <span
                  style={{
                    width: `${startedIds.length ? (withPdf.length / startedIds.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="compare-report-actions">
            <button
              type="button"
              className={comparison?.phase === 'done' ? 'btn-sm' : 'primary btn-sm'}
              disabled={withPdf.length === 0 || comparison?.phase === 'making'}
              title={withPdf.length === 0 ? 'Save at least one insurer’s PDF first' : undefined}
              onClick={() => void compare()}
            >
              {comparison?.phase === 'making' ? (
                <Loader2 size={14} className="spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={14} aria-hidden="true" />
              )}
              {comparison?.phase === 'done' ? 'Make it again' : 'Make comparison PDF'}
            </button>
            {comparison?.phase === 'done' && (
              <button
                type="button"
                className="primary btn-sm"
                onClick={() =>
                  void openQuotePdf(comparison.pdf).then(
                    (ok) => ok || toast('The PDF could not be opened.'),
                  )
                }
              >
                <FileDown size={14} aria-hidden="true" /> Open comparison
              </button>
            )}
          </div>
        </section>
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
