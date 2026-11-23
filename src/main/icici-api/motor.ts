// ICICI Lombard motor premium by API ("Generic 4W" and the two-wheeler kit: POST
// generic/motor-fw|motor-tw/generic/premium). Builds the request from a saved vehicle and the run's
// choices, and turns ICICI's answer into the run's result: the final premium (including GST), the
// IDV used and its range, and the breakdown for the PDF. Never calls the proposal endpoint.
import type { Vehicle } from '../../shared/contracts/vehicle';
import {
  ICICI_MOTOR_ADDONS,
  iciciMotorProductCode,
  type IciciApiMotorRun,
  type IciciMotorVehicle,
} from '../../shared/insurers/icici-api';
import type { QuoteRunResult } from '../quotes/run-uiic-health';
import { requestId, type IciciApiClient } from './client';

const PATH: Record<IciciMotorVehicle, string> = {
  '4w': '/generic/motor-fw/generic/premium',
  '2w': '/generic/motor-tw/generic/premium',
};
const VEHICLE_NAME: Record<IciciMotorVehicle, string> = { '4w': 'car', '2w': 'two-wheeler' };
const COVER_NAME = {
  package: 'package (comprehensive)',
  'own-damage': 'own damage',
  liability: 'third-party liability',
} as const;

export const iciciMotorVehicle = (v: Vehicle): IciciMotorVehicle | null =>
  v.vehicleClass === 'private-car' ? '4w' : v.vehicleClass === 'two-wheeler' ? '2w' : null;

/**
 * A date as ICICI's samples send it: midnight in India, in UTC ("2017-03-31T18:30:00Z" for
 * 1 April 2017).
 */
export function iciciDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - 330 * 60_000).toISOString().replace('.000Z', 'Z');
}

export type IciciMotorPlan =
  | { ok: true; vehicle: IciciMotorVehicle; productCode: number; body: Record<string, unknown> }
  | { ok: false; problems: string[] };

export function planIciciMotorPremium(v: Vehicle, run: IciciApiMotorRun): IciciMotorPlan {
  const problems: string[] = [];
  const vehicle = iciciMotorVehicle(v);
  if (!vehicle) {
    return {
      ok: false,
      problems: ['ICICI Lombard’s motor API covers private cars and two-wheelers only.'],
    };
  }
  const kind = v.condition === 'new' ? 'new' : run.used ? 'used' : 'rollover';
  const productCode = iciciMotorProductCode(vehicle, kind, run.cover, run.years);
  if (productCode === null) {
    problems.push(
      kind === 'rollover'
        ? `ICICI Lombard offers ${COVER_NAME[run.cover]} cover for one year only.`
        : `ICICI Lombard offers a ${kind} ${VEHICLE_NAME[vehicle]} one-year package cover only.`,
    );
  }
  const codes = [run.makeCode, run.modelCode, run.rtoCode].filter((c) => c !== undefined).length;
  if (kind !== 'new' && !run.registrationNumber) problems.push('Add the registration number.');
  if (codes === 0 && !run.registrationNumber) {
    problems.push("Add the registration number, or ICICI's make, model and RTO codes.");
  }
  if (kind === 'rollover' && !run.previous) {
    problems.push("Add the previous policy's expiry date and type.");
  }
  if (run.cover === 'own-damage' && !run.activeTp) {
    problems.push(
      'Own damage cover needs the running third-party policy (number, dates, insurer).',
    );
  }
  if (kind !== 'rollover' && run.cover !== 'package') {
    problems.push('Own damage and liability-only cover are for renewals.');
  }
  const unknown = run.addOns.filter((a) => !(a in ICICI_MOTOR_ADDONS[vehicle]));
  if (unknown.length > 0) {
    problems.push(
      `ICICI Lombard lists no ${VEHICLE_NAME[vehicle]} add-on called ${unknown.join(', ')}.`,
    );
  }
  if (problems.length > 0 || productCode === null) return { ok: false, problems };

  const previous = run.previous;
  const body: Record<string, unknown> = {
    ProductCode: productCode,
    OwnerType: 1,
    // Only the codes given: by the registration number alone, ICICI is left to find the vehicle.
    ...(run.makeCode !== undefined ? { MakeCode: run.makeCode } : {}),
    ...(run.modelCode !== undefined ? { ModelCode: run.modelCode } : {}),
    ...(run.rtoCode !== undefined ? { RTOCode: run.rtoCode } : {}),
    RegistrationNo: run.registrationNumber ?? '',
    RegistrationDate: iciciDate(v.registrationDate),
    ...(run.idv === 'vehicle'
      ? { IDV: v.idvRupees }
      : { IDVType: { min: 1, max: 2, avg: 3 }[run.idv] }),
    HasExistingPACover: run.hasExistingPaCover,
    PreviousPolicyClaimed: kind === 'rollover' ? (v.claimLastYear ?? false) : false,
    PreviousPolicyNcbPercentage: kind === 'rollover' ? (v.previousNcbPercent ?? 0) : 0,
    ...(previous
      ? {
          PreviousPolicyExpiryDate: iciciDate(previous.expiryDate),
          PreviousPolicyType: previous.type === 'tp' ? 2 : 1,
          PreviousInsurerCode: previous.insurerCode ?? '',
        }
      : {}),
    ...(run.activeTp
      ? {
          ActiveTpPolicyNumber: run.activeTp.policyNumber,
          ActiveTpStartDate: iciciDate(run.activeTp.startDate),
          ActiveTpEndDate: iciciDate(run.activeTp.endDate),
          ActiveTpInsurerCode: run.activeTp.insurerCode,
        }
      : {}),
    AddOns: run.addOns,
    Pincode: run.pincode ?? '',
    RequestId: requestId(),
    IsLive: true,
  };
  return { ok: true, vehicle, productCode, body };
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const amount = (n: number): string => String(Math.round(n * 100) / 100);
const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** ICICI's add-on premiums in its answer (MotorPremium.MotorOwnDamage), by the add-on's name. */
const ADDON_PREMIUMS: Record<string, string> = {
  ZeroDepreciationPremium: 'Zero depreciation',
  RsaPremium: 'Roadside assistance',
  EngineProtectPlusPremium: 'Engine protect',
  KeyProtectPremium: 'Key protect',
  ConsumablePremium: 'Consumables',
  TyreProtectPremium: 'Tyre protect',
  GarageCashPremium: 'Garage cash',
  LossOfPersonalBelongingsPremium: 'Loss of personal belongings',
  ReturnToInvoicePremium: 'Return to invoice',
  BatteryProtectPremium: 'Battery protect',
  DrivingAccessoriesPremium: 'Driving accessories',
};

export async function runIciciMotorPremium(deps: {
  api: IciciApiClient;
  vehicle: Vehicle;
  run: IciciApiMotorRun;
}): Promise<QuoteRunResult> {
  const plan = planIciciMotorPremium(deps.vehicle, deps.run);
  if (!plan.ok) {
    return {
      outcome: 'refused',
      step: null,
      message: 'This vehicle cannot be quoted by ICICI Lombard’s API yet.',
      problems: plan.problems,
    };
  }
  const answer = await deps.api.post(PATH[plan.vehicle], plan.body);
  const final = num(answer.FinalPremium);
  if (answer.Success === false || final === null || final <= 0) {
    const said =
      (typeof answer.ErrorMessage === 'string' && answer.ErrorMessage) ||
      (typeof answer.errorMessage === 'string' && answer.errorMessage) ||
      'no premium in its answer';
    return {
      outcome: 'failed',
      step: 'ICICI Lombard premium',
      message: `ICICI Lombard did not quote this vehicle: ${said}`,
      problems: [],
    };
  }
  const idv = num(answer.IDV);
  const min = num(answer.MinIDV);
  const max = num(answer.MaxIDV);
  const lines: [string, number | null][] = [
    ['Own damage premium', num(answer.OdPremium)],
    ['Third-party premium', num(answer.BaseTPPremium)],
    ['No-claim bonus', num(answer.NcbAmount)],
    ['Premium before GST', num(answer.Premium)],
    ['GST', num(answer.GST)],
  ];
  const od = (answer.MotorPremium as Record<string, unknown> | undefined)?.MotorOwnDamage as
    Record<string, unknown> | undefined;
  for (const [key, name] of Object.entries(ADDON_PREMIUMS)) {
    const value = num(od?.[key]);
    if (value && value > 0) lines.push([`Add-on: ${name}`, value]);
  }
  const vehicleName = VEHICLE_NAME[plan.vehicle];
  const cover = COVER_NAME[deps.run.cover];
  const label = `ICICI Lombard ${vehicleName}, ${cover}${idv ? `, IDV ${rupees(idv)}` : ''}`;
  const ncb = num(answer.NcbPercentage);
  return {
    outcome: 'ready',
    step: null,
    message: `ICICI Lombard (${deps.api.mode === 'uat' ? 'UAT' : 'production'}) quoted ${rupees(final)} including GST for this ${vehicleName}, ${cover}${idv ? ` at IDV ${rupees(idv)}` : ''}${min && max ? ` (ICICI allows ${rupees(min)} to ${rupees(max)})` : ''}${ncb ? `, ${ncb}% NCB` : ''}.${answer.IsInspectionRequire === true ? ' ICICI says the vehicle needs an inspection.' : ''}`,
    problems: [],
    premium: { label, amount: amount(final) },
    amountLabel: 'Premium (including GST)',
    breakdown: [
      ...(idv ? [{ label: 'IDV', value: rupees(idv) }] : []),
      ...(min && max ? [{ label: 'IDV range', value: `${rupees(min)} – ${rupees(max)}` }] : []),
      ...lines
        .filter((l): l is [string, number] => l[1] !== null && l[1] !== 0)
        .map(([l, v]) => ({ label: l, value: rupees(v) })),
      ...(deps.api.mode === 'uat'
        ? [{ label: 'Environment', value: 'ICICI UAT (test) — not a live premium' }]
        : []),
    ],
  };
}
