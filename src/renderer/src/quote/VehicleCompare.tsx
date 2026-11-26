// Compare quotes for a vehicle (requests of 26 November 2026: "multiple quotes should also be for
// vehicle clients"; "in vehicle, same like health, only the plan should be asked, not any other
// details"): United India, New India, HDFC ERGO (PIE) and ICICI Lombard (NYSA, and its partner API
// once set up) at once, or one alone, as for a health client (ComparePanel.tsx). What the motor
// forms ask on top of the vehicle (registration number, RTO city, previous policy, the owner) comes
// from the vehicle's Additional details (its quote details), read again when Run is pressed: this
// page asks only which insurers, and each one's plan. Each insurer's form is filled and kept; Stop
// & make PDF on its card saves its PDF, and the comparison PDF follows.
import { useEffect, useState } from 'react';
import type { VehicleQuoteDetails, VehicleRecord } from '../../../shared/contracts/vehicle';
import { HDFC_MOTOR_NAMES, hdfcProductFor } from '../../../shared/insurers/hdfc';
import { CompareRunner, type Built, type CompareRow } from './ComparePanel';
import { isInsurerPaused } from '../../../shared/insurers/availability';

/** Where the advisor adds what a run lacks. */
const WHERE = "in the vehicle's Additional details (Vehicles → Edit)";

/** The vehicle's saved quote details, with the forms' defaults for what is not given. */
function detailsOf(q: VehicleQuoteDetails | undefined) {
  return {
    registrationNumber: q?.registrationNumber ?? '',
    rtoCity: q?.rtoCity ?? '',
    cover: q?.cover ?? 'comprehensive',
    previousEnd: q?.previousPolicyEnd ?? '',
    previousType: q?.previousPolicyType ?? 'comprehensive',
    previousInsurer: q?.previousInsurer ?? '',
    ownerName: q?.ownerName ?? '',
    ownerEmail: q?.ownerEmail ?? '',
    ownerMobile: q?.ownerMobile ?? '',
    iciciIdv: q?.iciciIdv ?? 'insurer',
  } as const;
}

export function VehicleComparePanel(props: {
  vehicleId: string;
  iciciApi: boolean;
}): React.JSX.Element {
  const [record, setRecord] = useState<VehicleRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void window.fqf.vehicles
      .get(props.vehicleId)
      .then((r) => {
        if (!live) return;
        if (r.ok) setRecord(r.data);
        else setError(r.error.message);
      })
      .catch(() => live && setError('The vehicle could not be read.'));
    return () => {
      live = false;
    };
  }, [props.vehicleId]);
  if (error) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }
  if (!record) return <p className="insurer-note">Reading the vehicle…</p>;

  const vehicle = record.saved.vehicle;
  const vehicleId = record.id;
  const renewal = vehicle.condition === 'pre-owned';
  const newIndiaFits =
    (vehicle.vehicleClass === 'private-car' || vehicle.vehicleClass === 'two-wheeler') &&
    vehicle.condition === 'new';
  const hdfcProduct = hdfcProductFor(vehicle.vehicleClass);
  const has = (v: string) => v.trim() !== '';

  /** Each insurer's request from the vehicle and its saved quote details, or what it lacks. */
  const buildFor = (
    insurerId: string,
    product: string,
    saved: VehicleQuoteDetails | undefined = vehicle.quoteDetails,
  ): Built => {
    const d = detailsOf(saved);
    const missing: string[] = [];
    const need = (ok: boolean, what: string) => {
      if (!ok) missing.push(what);
    };
    const withWhere = (m: string[]) => (m.length > 0 ? [`${m.join(', ')} ${WHERE}`] : m);
    switch (insurerId) {
      case 'united-india':
      case 'new-india':
        return { ok: true, request: { product: 'motor', vehicleId, insurerId } };
      case 'hdfc-ergo': {
        need(has(d.rtoCity), 'the RTO city (as PIE lists it)');
        need(has(d.ownerName), "the owner's name");
        need(has(d.ownerEmail), "the owner's email");
        need(/^[6-9]\d{9}$/.test(d.ownerMobile.trim()), "the owner's 10-digit mobile");
        if (renewal) {
          need(has(d.registrationNumber), 'the registration number');
          need(d.previousEnd !== '', "the previous policy's end date");
        }
        if (missing.length > 0 || !hdfcProduct) return { ok: false, missing: withWhere(missing) };
        return {
          ok: true,
          request: {
            product: 'hdfc-motor',
            vehicleId,
            insurerId,
            run: {
              product: hdfcProduct,
              cover: d.cover,
              customerType: 'individual',
              rtoCity: d.rtoCity.trim(),
              ...(has(d.registrationNumber) ? { registrationNumber: d.registrationNumber } : {}),
              ...(renewal
                ? {
                    previous: {
                      endDate: d.previousEnd,
                      policyType: d.previousType,
                      ...(has(d.previousInsurer) ? { insurer: d.previousInsurer.trim() } : {}),
                    },
                  }
                : {}),
              customer: {
                name: d.ownerName.trim(),
                email: d.ownerEmail.trim(),
                mobile: d.ownerMobile.trim(),
              },
            },
          },
        };
      }
      case 'icici-lombard': {
        // NYSA reads a renewal by its number; a new vehicle's form is handed over (New Business).
        if (renewal || product === 'icici-api-motor') {
          need(has(d.registrationNumber), 'the registration number');
        }
        if (product === 'icici-api-motor' && renewal) {
          need(d.previousEnd !== '', "the previous policy's end date");
        }
        if (missing.length > 0) return { ok: false, missing: withWhere(missing) };
        if (product === 'icici-api-motor') {
          return {
            ok: true,
            request: {
              product: 'icici-api-motor',
              vehicleId,
              insurerId: 'icici-lombard',
              run: {
                cover: d.cover === 'liability' ? 'liability' : 'package',
                years: 1,
                used: false,
                registrationNumber: d.registrationNumber,
                ...(renewal
                  ? { previous: { expiryDate: d.previousEnd, type: d.previousType } }
                  : {}),
                idv: d.iciciIdv === 'vehicle' ? 'vehicle' : 'avg',
                addOns: [],
                hasExistingPaCover: false,
              },
            },
          };
        }
        return {
          ok: true,
          request: {
            product: 'icici-motor',
            vehicleId,
            insurerId,
            run: {
              ...(has(d.registrationNumber) && renewal
                ? { registrationNumber: d.registrationNumber }
                : {}),
              ownershipChanged: false,
              idv: d.iciciIdv,
            },
          },
        };
      }
      default:
        return { ok: false, missing: ['an insurer the app quotes vehicles with'] };
    }
  };

  const iciciProducts: [string, string][] = [
    [
      'icici-motor',
      renewal ? 'Motor (NYSA)' : 'Motor (NYSA): New Business chosen, you fill the vehicle there',
    ],
    ...(props.iciciApi ? ([['icici-api-motor', 'Motor (partner API)']] as [string, string][]) : []),
  ];
  const base: Omit<CompareRow, 'missing'>[] = [
    { id: 'united-india', name: 'United India', products: [['motor', 'Motor premium']] },
    {
      id: 'new-india',
      name: 'New India Assurance',
      products: [['motor', vehicle.vehicleClass === 'two-wheeler' ? 'Two Wheeler' : 'Private Car']],
      blocked: newIndiaFits
        ? null
        : "New India's motor forms are automated for new private cars and two-wheelers only.",
    },
    {
      id: 'hdfc-ergo',
      name: 'HDFC ERGO',
      products: hdfcProduct ? [[hdfcProduct, HDFC_MOTOR_NAMES[hdfcProduct]]] : [],
      blocked: hdfcProduct ? null : "HDFC ERGO's PIE motor forms do not take this kind of vehicle.",
    },
    {
      id: 'icici-lombard',
      name: 'ICICI Lombard',
      products: iciciProducts,
      blocked: null,
    },
  ];
  // A paused insurer is not offered (shared/insurers/availability.ts).
  const rows: CompareRow[] = base
    .filter((row) => !isInsurerPaused(row.id))
    .map((row) => ({
      ...row,
      missing: (product: string) => {
        const built = buildFor(row.id, product);
        return built.ok ? [] : built.missing;
      },
    }));

  const q = detailsOf(vehicle.quoteDetails);
  const given = [
    q.registrationNumber && `registration ${q.registrationNumber}`,
    q.rtoCity && `RTO ${q.rtoCity}`,
    q.cover === 'liability' ? 'liability only' : 'comprehensive',
    renewal && q.previousEnd && `previous policy ends ${q.previousEnd}`,
    q.ownerName && `owner ${q.ownerName}`,
    `ICICI at ${q.iciciIdv === 'vehicle' ? "the vehicle's IDV" : "ICICI's own IDV"}`,
  ].filter(Boolean);
  const details = (
    <p className="insurer-note">
      <strong>From the vehicle&rsquo;s Additional details:</strong> {given.join(' · ')}. To change
      them, edit the vehicle (Vehicles → Edit → Additional details); they are read again when you
      press Run.
    </p>
  );

  return (
    <CompareRunner
      intro={
        <p className="insurer-note">
          <strong>Compare quotes for {record.saved.name}.</strong> Choose the insurers and each
          one&rsquo;s plan: they all run at the same time, each in its own tab, with the details
          saved with the vehicle. When an insurer&rsquo;s form is filled, check it in its tab
          (change anything you need), then press Stop &amp; make PDF on its card: the app reads the
          premium shown then, saves that insurer&rsquo;s PDF and makes the comparison PDF again.
          Nothing is ever submitted. Sign in to each insurer first.
        </p>
      }
      details={details}
      rows={rows}
      build={async (insurerId, product) => {
        // Read again: the vehicle may have been edited since this page was opened.
        const fresh = await window.fqf.vehicles.get(vehicleId).catch(() => null);
        if (!fresh?.ok) return { ok: false, missing: ['the vehicle (it could not be read)'] };
        return buildFor(insurerId, product, fresh.data.saved.vehicle.quoteDetails);
      }}
      compareWith={{ vehicleId }}
    />
  );
}
