// Compare quotes for a travel client (request of 26 November 2026: "also need comparison for
// travel clients, same basic and additional details"): United India (Overseas Travel, Overseas
// Mediclaim), HDFC ERGO (PIE Retail Travel) and ICICI Lombard (NYSA International Travel, Student
// Medical Travel) at once, or one alone, as for a health client (ComparePanel.tsx). The trip comes
// from the travel client's Additional details (saved with them), read again when Run is pressed:
// this page asks only which insurers, and each one's plan. Each insurer's form is filled and kept;
// Stop & make PDF on its card saves its PDF, and the comparison PDF follows.
import { useEffect, useState } from 'react';
import type { TravellerTrip } from '../../../shared/contracts/traveller';
import { TRAVEL_SUMS_INSURED, type OmpForm } from '../../../shared/contracts/travel';
import type { TravellerView } from '../../../shared/ipc/contract';
import { isInsurerPaused } from '../../../shared/insurers/availability';
import {
  ICICI_INTL_TRAVEL_DEFAULT_PLAN,
  ICICI_INTL_TRAVEL_PLANS,
  ICICI_TRAVEL_DESTINATION_NAMES,
} from '../../../shared/insurers/icici-nysa';
import { OMP_FORM_NAMES } from '../travellers/TravelProposalPanel';
import { CompareRunner, type Built, type CompareRow } from './ComparePanel';

/** Where the advisor adds what a run lacks. */
const WHERE = "in the travel client's Additional details (Travel clients → Edit)";

/** HDFC ERGO's Retail Travel plans offered here (PIE suggests by name as it is typed). */
const HDFC_TRAVEL_PLANS = ['Silver', 'Gold', 'Platinum'] as const;

/** United India's Overseas Mediclaim plans offered: by place in its list, lowest first. */
const OMP_PLAN_PLACES = [1, 2, 3, 4] as const;

const today = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Days of travel, counting the first. */
const daysOf = (t: TravellerTrip): number =>
  Math.round(
    (Date.parse(`${t.returnDate}T00:00:00Z`) - Date.parse(`${t.departureDate}T00:00:00Z`)) /
      86_400_000,
  ) + 1;

/** The Overseas Mediclaim form that fits the trip. */
const ompFormOf = (t: TravellerTrip): OmpForm =>
  t.student ? 'studies' : t.destination === 'schengen' ? 'schengen' : 'business-holiday';

/** United India's destination: worldwide, or worldwide excluding USA and Canada. */
const uiicDestinationOf = (t: TravellerTrip) =>
  t.destination === 'usa-canada'
    ? ('worldwide' as const)
    : ('worldwide-excluding-usa-canada' as const);

/** Each insurer's plans for this trip ([key, name]): the plan is all the page asks. */
function productsFor(insurer: string, trip: TravellerTrip): [string, string][] {
  switch (insurer) {
    case 'united-india': {
      const form = ompFormOf(trip);
      return [
        ...TRAVEL_SUMS_INSURED.filter(
          (s) => !(s === '500000' && trip.destination !== 'usa-canada'),
        ).map((s): [string, string] => [
          `travel:${s}`,
          `Overseas Travel, sum insured ${Number(s).toLocaleString('en-IN')}`,
        ]),
        ...OMP_PLAN_PLACES.map((n): [string, string] => [
          `omp:${form}:${n}`,
          `${OMP_FORM_NAMES[form]}, plan ${n}${n === 1 ? ' (lowest offered)' : ''}`,
        ]),
      ];
    }
    case 'hdfc-ergo':
      return HDFC_TRAVEL_PLANS.map((p) => [`hdfc-travel:${p}`, `Retail Travel, ${p}`]);
    case 'icici-lombard': {
      if (trip.student) {
        return [['icici-student', 'Student Medical Travel (you pick the plan in NYSA)']];
      }
      const first = ICICI_INTL_TRAVEL_DEFAULT_PLAN[trip.destination];
      const plans = [
        first,
        ...ICICI_INTL_TRAVEL_PLANS[trip.destination].filter((p) => p !== first),
      ];
      return plans.map((p) => [`icici-intl:${p}`, `International Travel, ${p}`]);
    }
    default:
      return [];
  }
}

/** The run for one insurer and plan, from the travel client's saved details, or what it lacks. */
function buildFor(
  travellerId: string,
  insurer: string,
  product: string,
  view: TravellerView,
): Built {
  const trip = view.traveller.trip;
  if (!trip) return { ok: false, missing: [`the trip ${WHERE}`] };
  const missing: string[] = [];
  if (trip.departureDate < today()) missing.push('a trip that starts today or later');
  const days = daysOf(trip);
  const [kind, a, b] = product.split(':');
  switch (insurer) {
    case 'united-india': {
      if (days > 365) missing.push('a trip of a year or less');
      if (missing.length > 0) return { ok: false, missing: [`${missing.join(', ')} ${WHERE}`] };
      if (kind === 'omp') {
        return {
          ok: true,
          request: {
            product: 'omp-proposal',
            travellerId,
            insurerId: 'united-india',
            trip: {
              form: a as OmpForm,
              destination: uiicDestinationOf(trip),
              startDate: trip.departureDate,
              days,
              plan: Number(b),
            },
          },
        };
      }
      return {
        ok: true,
        request: {
          product: 'travel-proposal',
          travellerId,
          insurerId: 'united-india',
          trip: {
            destination: uiicDestinationOf(trip),
            sumInsured: a as (typeof TRAVEL_SUMS_INSURED)[number],
            startDate: trip.departureDate,
            days,
          },
        },
      };
    }
    case 'hdfc-ergo':
      if (missing.length > 0) return { ok: false, missing: [`${missing.join(', ')} ${WHERE}`] };
      return {
        ok: true,
        request: {
          product: 'hdfc-travel',
          travellerId,
          insurerId: 'hdfc-ergo',
          run: {
            departureDate: trip.departureDate,
            returnDate: trip.returnDate,
            plan: a ?? 'Gold',
          },
        },
      };
    case 'icici-lombard': {
      const state = view.traveller.proposal?.state?.trim() ?? '';
      if (state.length < 3) missing.push("the traveller's state (proposal details)");
      if (missing.length > 0) return { ok: false, missing: [`${missing.join(', ')} ${WHERE}`] };
      const dates = { departureDate: trip.departureDate, returnDate: trip.returnDate, state };
      return kind === 'icici-student'
        ? {
            ok: true,
            request: {
              product: 'icici-student-travel',
              travellerId,
              insurerId: 'icici-lombard',
              run: { ...dates, visitingUsaCanada: trip.destination === 'usa-canada' },
            },
          }
        : {
            ok: true,
            request: {
              product: 'icici-intl-travel',
              travellerId,
              insurerId: 'icici-lombard',
              run: { ...dates, destination: trip.destination, plan: a ?? '' },
            },
          };
    }
    default:
      return { ok: false, missing: ['an insurer the app quotes travel with'] };
  }
}

const INSURERS: { id: string; name: string }[] = [
  { id: 'united-india', name: 'United India' },
  { id: 'hdfc-ergo', name: 'HDFC ERGO' },
  { id: 'icici-lombard', name: 'ICICI Lombard' },
];

export function TravelComparePanel(props: { travellerId: string }): React.JSX.Element {
  const { travellerId } = props;
  const [view, setView] = useState<TravellerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void window.fqf.travellers
      .get(travellerId)
      .then((r) => {
        if (!live) return;
        if (r.ok) setView(r.data);
        else setError(r.error.message);
      })
      .catch(() => live && setError('The travel client could not be read.'));
    return () => {
      live = false;
    };
  }, [travellerId]);
  if (error) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }
  if (!view) return <p className="insurer-note">Reading the travel client…</p>;

  const trip = view.traveller.trip;
  // A paused insurer is not offered (shared/insurers/availability.ts). New India's travel form is
  // not in Compare quotes (it asks the advisor to confirm the traveller's health first).
  const rows: CompareRow[] = INSURERS.filter((i) => !isInsurerPaused(i.id)).map((i) => ({
    ...i,
    products: trip ? productsFor(i.id, trip) : [],
    missing: (product) => {
      const built = buildFor(travellerId, i.id, product, view);
      return built.ok ? [] : built.missing;
    },
  }));
  const details = trip ? (
    <p className="insurer-note">
      <strong>The trip, from the Additional details:</strong>{' '}
      {ICICI_TRAVEL_DESTINATION_NAMES[trip.destination]}, {trip.departureDate} to {trip.returnDate}{' '}
      ({daysOf(trip)} days){trip.student ? ', to study' : ''}. To change it, edit the travel client
      (Travel clients → Edit → Additional details); it is read again when you press Run.
    </p>
  ) : null;
  return (
    <CompareRunner
      intro={
        <p className="insurer-note">
          <strong>Compare quotes for {view.traveller.customer.name}.</strong> Choose the insurers
          and each one&rsquo;s plan: they all run at the same time, each in its own tab, with the
          details saved with the travel client. When an insurer&rsquo;s form is filled, check it in
          its tab (change anything you need), then press Stop &amp; make PDF on its card: the app
          reads the premium shown then, saves that insurer&rsquo;s PDF and makes the comparison PDF
          again. Nothing is ever submitted. Sign in to each insurer first.
        </p>
      }
      details={details}
      rows={rows}
      build={async (insurerId, product) => {
        // Read again: the travel client may have been edited since this page was opened.
        const fresh = await window.fqf.travellers.get(travellerId).catch(() => null);
        if (!fresh?.ok) return { ok: false, missing: ['the travel client (it could not be read)'] };
        return buildFor(travellerId, insurerId, product, fresh.data);
      }}
      compareWith={{ travellerId }}
      blocked={trip ? null : `Add the trip first (where to, and when) ${WHERE}.`}
    />
  );
}
