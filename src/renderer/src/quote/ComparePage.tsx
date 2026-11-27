// Compare quotes, its own page in the sidebar (requests of 26 November 2026: "the multi quote
// should not be a modal, it should be a new page in the side bar"; "multiple quotes should also be
// for vehicle clients"; "also need comparison for travel clients"). The advisor picks a health
// client, a vehicle or a travel client, then runs one insurer or several for it (ComparePanel,
// VehicleComparePanel, TravelComparePanel), each from the details saved with it. The lists are
// read when the page is shown, so one added or edited elsewhere is there.
import { Car, HeartPulse, Plane, Scale, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ClientSummary } from '../../../shared/contracts/client';
import type { VehicleSummary } from '../../../shared/contracts/vehicle';
import type { TravellerSummary } from '../../../shared/contracts/traveller';
import { EmptyState, PageHeader } from '../ui/PageHeader';
import { ComparePanel } from './ComparePanel';
import { useIciciApiReady } from './IciciApiPanels';
import { VehicleComparePanel } from './VehicleCompare';
import { TravelComparePanel } from './TravelCompare';

type Kind = 'client' | 'vehicle' | 'traveller';

const KINDS: { kind: Kind; tab: string; icon: LucideIcon; empty: string; text: string }[] = [
  {
    kind: 'client',
    tab: 'Health client',
    icon: HeartPulse,
    empty: 'No health clients yet',
    text: 'Add a health client first (Health clients), then come back to compare insurers for them.',
  },
  {
    kind: 'vehicle',
    tab: 'Vehicle',
    icon: Car,
    empty: 'No vehicles yet',
    text: 'Add a vehicle first (Vehicles), then come back to compare insurers for it.',
  },
  {
    kind: 'traveller',
    tab: 'Travel client',
    icon: Plane,
    empty: 'No travel clients yet',
    text: 'Add a travel client first (Travel clients), then come back to compare insurers for them.',
  },
];

export function ComparePage(props: { active: boolean }): React.JSX.Element {
  const [kind, setKind] = useState<Kind>('client');
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [vehicles, setVehicles] = useState<VehicleSummary[] | null>(null);
  const [travellers, setTravellers] = useState<TravellerSummary[] | null>(null);
  const [travellerId, setTravellerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const iciciApi = useIciciApiReady();

  useEffect(() => {
    if (!props.active) return;
    let live = true;
    void Promise.all([
      window.fqf.clients.list().catch(() => null),
      window.fqf.vehicles.list().catch(() => null),
      window.fqf.travellers.list().catch(() => null),
    ]).then(([c, v, t]) => {
      if (!live) return;
      if (c?.ok) setClients(c.data.clients);
      if (v?.ok) setVehicles(v.data.vehicles);
      if (t?.ok) setTravellers(t.data.travellers);
      setError(
        c?.ok && v?.ok && t?.ok
          ? null
          : 'The clients, vehicles or travel clients could not be loaded.',
      );
    });
    return () => {
      live = false;
    };
  }, [props.active]);

  const client = clients?.find((c) => c.id === clientId) ?? null;
  const vehicle = vehicles?.find((v) => v.id === vehicleId) ?? null;
  const traveller = travellers?.find((t) => t.id === travellerId) ?? null;
  const list = kind === 'client' ? clients : kind === 'vehicle' ? vehicles : travellers;
  const shown = KINDS.find((k) => k.kind === kind)!;
  return (
    <>
      <PageHeader
        icon={Scale}
        title="Compare quotes"
        subtitle="Quote a health client, a vehicle or a travel client with several insurers at once. Each insurer's form is filled in its tab; check it, then press Stop & make PDF to save its PDF and the comparison."
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="compare-page">
        <section className="compare-section compare-subject" aria-label="Quote for">
          <div className="compare-subject-kind">
            <span className="compare-subject-label">Quote for</span>
            <div className="compare-kinds" role="tablist" aria-label="Quote for">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    role="tab"
                    aria-selected={kind === k.kind}
                    onClick={() => setKind(k.kind)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {k.tab}
                  </button>
                );
              })}
            </div>
          </div>
          {!(list && list.length === 0) &&
            (kind === 'client' ? (
              <label className="compare-client">
                Health client
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">{clients ? 'Choose a client…' : 'Loading clients…'}</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.pincode}
                    </option>
                  ))}
                </select>
              </label>
            ) : kind === 'traveller' ? (
              <label className="compare-client">
                Travel client
                <select value={travellerId} onChange={(e) => setTravellerId(e.target.value)}>
                  <option value="">
                    {travellers ? 'Choose a travel client…' : 'Loading travel clients…'}
                  </option>
                  {(travellers ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.pincode}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="compare-client">
                Vehicle
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">{vehicles ? 'Choose a vehicle…' : 'Loading vehicles…'}</option>
                  {(vehicles ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.condition === 'new' ? 'new' : 'renewal'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </section>
        {list && list.length === 0 ? (
          <EmptyState icon={Scale} title={shown.empty} text={shown.text} />
        ) : (
          <>
            {!(kind === 'client' ? client : kind === 'vehicle' ? vehicle : traveller) && list && (
              <p className="compare-choose">
                Choose{' '}
                {kind === 'client'
                  ? 'a health client'
                  : kind === 'vehicle'
                    ? 'a vehicle'
                    : 'a travel client'}{' '}
                above to see the insurers that can quote {kind === 'vehicle' ? 'it' : 'them'}.
              </p>
            )}
            {/* Kept per client or vehicle: choosing another starts afresh. */}
            {kind === 'client' && client && (
              <ComparePanel key={client.id} client={client} iciciApi={iciciApi} />
            )}
            {kind === 'vehicle' && vehicle && (
              <VehicleComparePanel key={vehicle.id} vehicleId={vehicle.id} iciciApi={iciciApi} />
            )}
            {kind === 'traveller' && traveller && (
              <TravelComparePanel key={traveller.id} travellerId={traveller.id} />
            )}
          </>
        )}
      </div>
    </>
  );
}
