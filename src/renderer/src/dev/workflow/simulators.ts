// DEVELOPMENT-ONLY insurer SIMULATORS for the demo workflow. Nothing here contacts an insurer,
// a portal or the network: each simulator builds a synthetic JSON response in memory from the
// quote request, with a deterministic, invented price. Prices are not market prices and the
// tax line is an arbitrary synthetic amount, not a statement of any tax rate.
//
// Each simulator implements the M3 `InsurerAdapter` contract: `parse` turns the simulator's own
// response format into the `InsurerResultInput` that manual entry also produces, so every
// response goes through the existing normaliser and comparison engine unchanged.
import {
  type AdapterRunContext,
  type AdapterSnapshot,
  type InsurerAdapter,
  adapterMetadataSchema,
} from '../../../../shared/contracts/adapter';
import type { Member } from '../../../../shared/contracts/customer';
import type { InsurerResultInput, QuoteRequest } from '../../../../shared/contracts/quote';
import { formatInr, parseInrAmount, rupees } from '../../../../shared/money';
import { abortableDelay, systemClock, systemTimers, waitForAbort } from './clock';

export const SIMULATOR_NOTICE = 'DEMO SIMULATOR — synthetic response. No insurer was contacted.';

/** What a simulator run receives: the adapter contract's context plus demo-only controls. */
export interface SimulatorRunContext extends AdapterRunContext {
  /** 1 for the first attempt; retries count up. */
  attempt: number;
  now(): string;
  /** Waits, or rejects if the run is cancelled or times out. */
  delay(ms: number): Promise<void>;
}

export interface SimulatorAdapter extends InsurerAdapter {
  readonly simulated: true;
  /** Plain-language description of the deterministic behaviour, for the UI. */
  readonly scenario: string;
  /** Time each simulated step takes, so the job states can be watched. */
  readonly stepDelayMs: number;
  /** Produces the simulated response the orchestrator records before parsing it. */
  fetchSnapshot(context: SimulatorRunContext): Promise<AdapterSnapshot>;
  /** `parse`, with the time to use if the response carries none (keeps parsing pure). */
  parseAt(snapshot: AdapterSnapshot, now: string): InsurerResultInput;
}

type ResultMembers = NonNullable<NonNullable<InsurerResultInput['coverage']>['members']>;
type ResultMember = ResultMembers[number];

// ---- Synthetic pricing ------------------------------------------------------------------------

/** Invented yearly rate per member by age, in whole rupees. Not derived from any insurer. */
const SYNTHETIC_AGE_RATES: readonly [maxAge: number, rupeesPerYear: number][] = [
  [17, 2_400],
  [35, 4_800],
  [45, 6_600],
  [60, 9_600],
  [120, 14_500],
];

function ageRate(age: number): number {
  return SYNTHETIC_AGE_RATES.find(([max]) => age <= max)?.[1] ?? 14_500;
}

/**
 * A deterministic synthetic base premium in whole rupees for the whole quoted tenure. Floater
 * cover charges the oldest member in full and the others at 60%; the sum insured scales the
 * price by the square root of (sum insured / ₹5 lakh). `factor` is a per-simulator percentage.
 */
export function syntheticBaseRupees(request: QuoteRequest, factor: number): number {
  const rates = request.members.map((m) => ageRate(m.age)).sort((a, b) => b - a);
  const memberRupees =
    request.coverType === 'floater'
      ? rates.reduce((total, rate, i) => total + (i === 0 ? rate : Math.round(rate * 0.6)), 0)
      : rates.reduce((total, rate) => total + rate, 0);
  const siPerMille = Math.round(Math.sqrt(request.sumInsuredPaise / rupees(5_00_000)) * 1000);
  return Math.round((((memberRupees * siPerMille) / 1000) * factor) / 100) * request.tenureYears;
}

const echoMembers = (members: readonly Member[]) =>
  members.map((m) => ({ relation: m.relationship.toUpperCase(), age: m.age }));

function snapshot(body: object): AdapterSnapshot {
  return { kind: 'json', content: JSON.stringify({ _notice: SIMULATOR_NOTICE, ...body }, null, 2) };
}

// ---- Parsing helpers --------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const int = (v: unknown): number | undefined =>
  Number.isSafeInteger(v) ? (v as number) : undefined;

function readJson(content: string): Json | null {
  try {
    const value: unknown = JSON.parse(content);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** A result that says the response could not be read; the orchestrator sets the IDs. */
function unreadable(insurerId: string, retrievedAt: string): InsurerResultInput {
  return {
    resultId: 'pending',
    insurerId,
    status: 'failed',
    source: 'automated',
    retrievedAt,
    errorCode: 'PARSE_FAILED',
  };
}

/**
 * Maps the simulator's member list as it stands. Values are not checked here: a relationship
 * or age the contract does not accept makes the normaliser reject the whole result.
 */
function members(list: unknown): ResultMembers | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list.map((m: unknown): ResultMember => {
    const item = isObject(m) ? m : {};
    return {
      relationship: (
        text(item['relation']) ??
        text(item['rel']) ??
        ''
      ).toLowerCase() as ResultMember['relationship'],
      age: Number(item['age']),
    };
  });
}

/** An amount term in paise, or unknown if the text is not a single rupee amount. */
function amountTerm(value: unknown) {
  if (int(value) !== undefined) return { status: 'known' as const, value: value as number };
  const parsed = typeof value === 'string' ? parseInrAmount(value) : null;
  return parsed?.ok
    ? { status: 'known' as const, value: parsed.paise }
    : { status: 'unknown' as const };
}

// ---- Simulator A: complete response with an itemised tax line ----------------------------------

function parseStyleA(insurerId: string, content: string, now: string): InsurerResultInput {
  const body = readJson(content);
  if (!body) return unreadable(insurerId, now);
  const premium = isObject(body['premium']) ? body['premium'] : {};
  const cover = isObject(body['cover']) ? body['cover'] : {};
  const benefits = isObject(body['benefits']) ? body['benefits'] : null;
  const product = isObject(body['product']) ? body['product'] : {};
  const room = text(benefits?.['roomRent']);
  const roomKnown = room === 'NO_LIMIT';
  const reviewFlags: 'ambiguous_coverage'[] = [];
  if (benefits && room !== undefined && !roomKnown) reviewFlags.push('ambiguous_coverage');
  const total = text(premium['totalPayable']);
  const base = text(premium['basePremium']);
  const tax = text(premium['taxesAndCharges']);
  const sumInsured = text(cover['sumInsured']);
  const coverType = text(cover['coverType'])?.toLowerCase();
  return {
    resultId: 'pending',
    insurerId,
    status: body['status'] === 'QUOTED' ? 'completed' : 'failed',
    source: 'automated',
    retrievedAt: text(body['quotedAt']) ?? now,
    ...(text(product['name']) ? { planLabel: text(product['name']) } : {}),
    ...(text(body['currency']) ? { currency: text(body['currency']) } : {}),
    premium: {
      ...(total !== undefined ? { total: { text: total } } : {}),
      ...(base !== undefined ? { base: { text: base } } : {}),
      ...(tax !== undefined ? { gst: { text: tax } } : {}),
      ...(typeof premium['taxIncluded'] === 'boolean'
        ? { basis: premium['taxIncluded'] ? ('incl_gst' as const) : ('excl_gst' as const) }
        : {}),
    },
    coverage: {
      ...(sumInsured !== undefined ? { sumInsured: { text: sumInsured } } : {}),
      ...(coverType === 'floater' || coverType === 'individual' ? { coverType } : {}),
      ...(int(cover['policyYears']) !== undefined
        ? { tenureYears: int(cover['policyYears']) }
        : {}),
      ...(members(cover['insured']) ? { members: members(cover['insured']) } : {}),
      ...(benefits
        ? {
            terms: {
              coPay:
                int(benefits['coPayPercent']) !== undefined
                  ? { status: 'known' as const, value: int(benefits['coPayPercent'])! }
                  : { status: 'unknown' as const },
              deductible: amountTerm(benefits['deductible']),
              roomRent: roomKnown
                ? { status: 'known' as const, value: { kind: 'no_limit' as const } }
                : { status: 'unknown' as const },
              addOns: Array.isArray(benefits['addOns'])
                ? { status: 'known' as const, value: benefits['addOns'] as string[] }
                : { status: 'unknown' as const },
            },
          }
        : {}),
    },
    ...(reviewFlags.length > 0 ? { reviewFlags } : {}),
  };
}

// ---- Simulator B: different format, amounts in paise -------------------------------------------

function parseStyleB(insurerId: string, content: string, now: string): InsurerResultInput {
  const body = readJson(content);
  if (!body) return unreadable(insurerId, now);
  const amounts = isObject(body['amounts_paise']) ? body['amounts_paise'] : {};
  const room = isObject(body['room_rent']) ? body['room_rent'] : {};
  const policyType = text(body['policy_type']);
  return {
    resultId: 'pending',
    insurerId,
    status: body['outcome'] === 'ok' ? 'completed' : 'failed',
    source: 'automated',
    retrievedAt: text(body['issued_at']) ?? now,
    ...(text(body['plan_name']) ? { planLabel: text(body['plan_name']) } : {}),
    ...(text(body['currency_code']) ? { currency: text(body['currency_code']) } : {}),
    premium: {
      ...(int(amounts['gross']) !== undefined ? { total: { paise: int(amounts['gross'])! } } : {}),
      ...(int(amounts['net']) !== undefined ? { base: { paise: int(amounts['net'])! } } : {}),
      ...(int(amounts['tax']) !== undefined ? { gst: { paise: int(amounts['tax'])! } } : {}),
      ...(typeof body['gross_includes_tax'] === 'boolean'
        ? { basis: body['gross_includes_tax'] ? ('incl_gst' as const) : ('excl_gst' as const) }
        : {}),
    },
    coverage: {
      ...(int(body['sum_insured_paise']) !== undefined
        ? { sumInsured: { paise: int(body['sum_insured_paise'])! } }
        : {}),
      ...(policyType === 'family_floater'
        ? { coverType: 'floater' as const }
        : policyType === 'individual'
          ? { coverType: 'individual' as const }
          : {}),
      ...(int(body['term_years']) !== undefined ? { tenureYears: int(body['term_years']) } : {}),
      ...(members(body['lives']) ? { members: members(body['lives']) } : {}),
      terms: {
        coPay:
          int(body['co_pay_pct']) !== undefined
            ? { status: 'known' as const, value: int(body['co_pay_pct'])! }
            : { status: 'unknown' as const },
        deductible: amountTerm(body['deductible_paise']),
        roomRent:
          room['type'] === 'no_limit'
            ? { status: 'known' as const, value: { kind: 'no_limit' as const } }
            : { status: 'unknown' as const },
        addOns: Array.isArray(body['riders'])
          ? { status: 'known' as const, value: body['riders'] as string[] }
          : { status: 'unknown' as const },
      },
    },
  };
}

// ---- The four demo simulators -------------------------------------------------------------------

interface SimulatorSpec {
  letter: 'a' | 'b' | 'c' | 'd';
  scenario: string;
  stepDelayMs: number;
  requiredFields: InsurerAdapter['requiredFields'];
  respond(context: SimulatorRunContext, insurerId: string): Promise<AdapterSnapshot>;
  parse(insurerId: string, content: string, now: string): InsurerResultInput;
}

const SPECS: readonly SimulatorSpec[] = [
  {
    letter: 'a',
    scenario: 'Returns a complete quote with an itemised tax line.',
    stepDelayMs: 450,
    requiredFields: ['request.pincode'],
    respond: async (ctx, insurerId) => {
      await ctx.delay(450);
      const base = syntheticBaseRupees(ctx.request, 100);
      const tax = 1_250;
      return snapshot({
        simulator: insurerId,
        quoteReference: `SIM-A-${ctx.runId}`,
        quotedAt: ctx.now(),
        status: 'QUOTED',
        product: { name: 'Demo Family Shield (simulated)' },
        currency: 'INR',
        premium: {
          basePremium: formatInr(rupees(base)),
          taxesAndCharges: formatInr(rupees(tax)),
          totalPayable: formatInr(rupees(base + tax)),
          taxIncluded: true,
        },
        cover: {
          sumInsured: formatInr(ctx.request.sumInsuredPaise),
          coverType: ctx.request.coverType.toUpperCase(),
          policyYears: ctx.request.tenureYears,
          insured: echoMembers(ctx.request.members),
        },
        benefits: { coPayPercent: 0, deductible: '₹0', roomRent: 'NO_LIMIT', addOns: [] },
      });
    },
    parse: parseStyleA,
  },
  {
    letter: 'b',
    scenario:
      'Times out on the first attempt (no response). A retry returns a complete quote in a different response format.',
    stepDelayMs: 400,
    requiredFields: ['request.pincode'],
    respond: async (ctx, insurerId) => {
      if (ctx.attempt === 1) return waitForAbort(ctx.signal);
      await ctx.delay(400);
      const net = syntheticBaseRupees(ctx.request, 94);
      const tax = 1_180;
      return snapshot({
        simulator: insurerId,
        ref: `SIM-B-${ctx.runId}`,
        issued_at: ctx.now(),
        outcome: 'ok',
        plan_name: 'Demo Care Plus (simulated)',
        currency_code: 'INR',
        amounts_paise: { net: rupees(net), tax: rupees(tax), gross: rupees(net + tax) },
        gross_includes_tax: true,
        sum_insured_paise: ctx.request.sumInsuredPaise,
        policy_type: ctx.request.coverType === 'floater' ? 'family_floater' : 'individual',
        term_years: ctx.request.tenureYears,
        lives: ctx.request.members.map((m) => ({ rel: m.relationship, age: m.age })),
        co_pay_pct: 0,
        deductible_paise: 0,
        room_rent: { type: 'no_limit' },
        riders: [],
      });
    },
    parse: parseStyleB,
  },
  {
    letter: 'c',
    scenario:
      'Returns the lowest price, but its room-rent term is "as per plan terms", which cannot be mapped: the quote is flagged for review.',
    stepDelayMs: 600,
    requiredFields: ['request.pincode', 'customer.email'],
    respond: async (ctx, insurerId) => {
      await ctx.delay(600);
      const total = syntheticBaseRupees(ctx.request, 90);
      return snapshot({
        simulator: insurerId,
        quoteReference: `SIM-C-${ctx.runId}`,
        quotedAt: ctx.now(),
        status: 'QUOTED',
        product: { name: 'Demo Value Health (simulated)' },
        currency: 'INR',
        premium: { totalPayable: formatInr(rupees(total)), taxIncluded: true },
        cover: {
          sumInsured: formatInr(ctx.request.sumInsuredPaise),
          coverType: ctx.request.coverType.toUpperCase(),
          policyYears: ctx.request.tenureYears,
          insured: echoMembers(ctx.request.members),
        },
        benefits: { coPayPercent: 0, deductible: '₹0', roomRent: 'As per plan terms', addOns: [] },
      });
    },
    parse: parseStyleA,
  },
  {
    letter: 'd',
    scenario:
      'Returns an incomplete response: the premium reads "Quote on request" and the cover details are missing.',
    stepDelayMs: 500,
    requiredFields: [],
    respond: async (ctx, insurerId) => {
      await ctx.delay(500);
      return snapshot({
        simulator: insurerId,
        quoteReference: `SIM-D-${ctx.runId}`,
        quotedAt: ctx.now(),
        status: 'QUOTED',
        product: { name: 'Demo Basic Health (simulated)' },
        currency: 'INR',
        premium: { totalPayable: 'Quote on request' },
        cover: { coverType: ctx.request.coverType.toUpperCase() },
      });
    },
    parse: parseStyleA,
  },
];

function makeSimulator(spec: SimulatorSpec): SimulatorAdapter {
  const id = `demo-sim-${spec.letter}`;
  const metadata = adapterMetadataSchema.parse({
    id,
    displayName: `Demo Insurer ${spec.letter.toUpperCase()} (simulator)`,
    version: '0.1.0',
    mode: 'automated',
    // No origins: a simulator never loads any page or contacts any server.
    allowedOrigins: [],
    requiredFields: spec.requiredFields,
  });
  const adapter: SimulatorAdapter = {
    ...metadata,
    simulated: true,
    scenario: spec.scenario,
    stepDelayMs: spec.stepDelayMs,
    fetchSnapshot: (context) => spec.respond(context, id),
    parseAt: (snap, now) => spec.parse(id, snap.content, now),
    parse: (snap) => spec.parse(id, snap.content, systemClock.now()),
    /** The contract's one-call form: fetch, then parse. */
    run: async (context) => {
      const full: SimulatorRunContext = {
        ...context,
        attempt: 1,
        now: () => systemClock.now(),
        delay: (ms) => abortableDelay(systemTimers, ms, context.signal),
      };
      return adapter.parse(await adapter.fetchSnapshot(full));
    },
  };
  return adapter;
}

export const DEMO_SIMULATORS: readonly SimulatorAdapter[] = SPECS.map(makeSimulator);
