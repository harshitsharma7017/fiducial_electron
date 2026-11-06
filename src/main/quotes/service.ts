// Quote runs behind the IPC channel. Off unless the automation features are switched on. United
// India: health and motor calculators, the health, Overseas Travel and Overseas Mediclaim
// e-proposals. New India: motor (the vehicle details of the Private Car and Two Wheeler forms;
// run-nia-motor.ts), the health quote forms of twelve policies (run-nia-health.ts) and three
// overseas travel quote forms (run-nia-travel.ts) and four rural quote forms for a rural client
// (run-nia-rural.ts), the Marine Specific Voyage form for a marine client (run-nia-marine.ts),
// three Personal Accident forms for a health client's proposer (run-nia-pa.ts), and nine fire
// forms for a property client (run-nia-fire.ts). Niva Bupa: the premium calculator for
// ReAssure 2.0, ReAssure 3.0 and Health Recharge, for a health client (run-niva-health.ts). HDFC
// ERGO: PIE's motor forms for a saved vehicle, its MST, Energy, Optima Secure and Optima Restore
// forms for a health client and its Retail Travel form for a travel client (run-hdfc.ts).
// Other
// insurers and products are refused with a reason. Motor quotes are for a saved vehicle, travel
// e-proposals for a travel client, the others for a saved client.
import type { ClientService } from '../clients/service';
import type { PortalPage } from '../insurers/portal-host';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import type { QuoteRunRequest } from '../../shared/ipc/contract';
import { findPortal, mayFillLogin } from '../../shared/insurers/portals';
import {
  runUiicHealthProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
  runUiicOmpProposal,
  runUiicTravelProposal,
  exec,
  followWork,
  type QuoteRunResult,
} from './run-uiic-health';
import type { UiicProposalForm } from './uiic-health-proposal';
import { runNiaHealthQuote } from './run-nia-health';
import { runNiaMotorQuote } from './run-nia-motor';
import { runNiaMarineQuote } from './run-nia-marine';
import { runNiaPaQuote } from './run-nia-pa';
import { runNiaFireQuote } from './run-nia-fire';
import { runNiaRuralQuote } from './run-nia-rural';
import { runNiaTravelQuote } from './run-nia-travel';
import { runNivaHealthQuote } from './run-niva-health';
import {
  runHdfcMotorQuote,
  runHdfcMstQuote,
  runHdfcRetailQuote,
  runHdfcTravelQuote,
} from './run-hdfc';

/** The e-proposal each product fills. */
const PROPOSAL_FORM = {
  'fm-proposal': 'family-medicare',
  'ihp-proposal': 'individual-health',
  'as-proposal': 'arogya-sanjeevani',
  'stu-proposal': 'super-top-up',
  'yhp-proposal': 'yuvaan',
} as const satisfies Record<string, UiicProposalForm>;

export interface QuoteService {
  run(request: QuoteRunRequest): Promise<QuoteRunResult>;
}

export function createQuoteService(deps: {
  enabled: boolean;
  clients: Pick<
    ClientService,
    | 'get'
    | 'aadhaarFor'
    | 'getVehicle'
    | 'getTraveller'
    | 'passportFor'
    | 'getRural'
    | 'getMarine'
    | 'getProperty'
  >;
  /** The insurer's open pages: its portal first, then its pop-ups. */
  windowsOf: (insurerId: string) => PortalPage[];
  logger: Logger;
  now?: () => Date;
}): QuoteService {
  let running = false;
  /**
   * While a run works, the tab it fills is brought to the front (once per change of tab), so the
   * advisor watches the insurer's form, including a pop-up such as United India's calculator.
   */
  /**
   * Whether the insurer's portal can be worked in: its tab is open and past the sign-in page.
   * The sign-in page is told by its address and, for portals with a sign-in form, by the password
   * box on screen (a portal may keep the sign-in address after signing in). Nothing is filled or
   * pressed. Returns the refusal to show, or null when the portal is ready.
   */
  const portalNotReady = async (insurerId: string): Promise<QuoteRunResult | null> => {
    const portal = findPortal(insurerId);
    const name = portal?.displayName ?? 'the insurer';
    const page = deps.windowsOf(insurerId).find((p) => !p.isDestroyed());
    if (!page) {
      return {
        outcome: 'refused',
        step: null,
        message: `Please log in to ${name}'s portal and keep it open: open it from the Insurers screen, sign in, and leave its tab open. Then press again.`,
        problems: [],
      };
    }
    if (!portal || !mayFillLogin(portal, page.webContents.getURL())) return null;
    const onSignIn = portal.form
      ? (
          await exec(page.webContents, {
            op: 'waitFor',
            selector: portal.form.password,
            timeoutMs: 1500,
          })
        ).ok
      : true;
    return onSignIn
      ? {
          outcome: 'refused',
          step: null,
          message: `Please log in to ${name}'s portal and keep it open: its tab is on the sign-in page. Sign in, leave the tab open, then press again.`,
          problems: [],
        }
      : null;
  };
  const follow = (insurerId: string): void => {
    let shown: unknown = null;
    followWork((wc) => {
      if (wc === shown) return;
      const page = deps.windowsOf(insurerId).find((p) => !p.isDestroyed() && p.webContents === wc);
      if (!page) return;
      shown = wc;
      page.focus();
    });
  };
  return {
    run: async (request) => {
      if (!deps.enabled) throw new AppException('UNSUPPORTED_FLOW');
      const { insurerId } = request;
      const newIndiaMotor = insurerId === 'new-india' && request.product === 'motor';
      const newIndiaOnly =
        request.product === 'nia-health' ||
        request.product === 'nia-travel' ||
        request.product === 'nia-rural' ||
        request.product === 'nia-marine' ||
        request.product === 'nia-pa' ||
        request.product === 'nia-fire';
      const wrongInsurer =
        request.product === 'hdfc-motor' ||
        request.product === 'hdfc-mst' ||
        request.product === 'hdfc-retail' ||
        request.product === 'hdfc-travel'
          ? insurerId !== 'hdfc-ergo'
          : request.product === 'niva-health'
            ? insurerId !== 'niva-bupa'
            : newIndiaOnly
              ? insurerId !== 'new-india'
              : insurerId !== 'united-india' && !newIndiaMotor;
      if (wrongInsurer) {
        return {
          outcome: 'refused',
          step: null,
          message: 'Quote automation is not built for this insurer yet.',
          problems: [],
        };
      }
      if (running) {
        return {
          outcome: 'refused',
          step: null,
          message: 'A quote is already being filled.',
          problems: [],
        };
      }
      const notReady = await portalNotReady(insurerId);
      if (notReady) return notReady;
      // Read before the run starts: an unknown client, travel client, rural client or vehicle is
      // refused at once.
      if (
        request.product === 'nia-rural' ||
        request.product === 'nia-marine' ||
        request.product === 'nia-fire'
      ) {
        const today = (deps.now ?? (() => new Date()))();
        const windows = () => deps.windowsOf(insurerId);
        const start =
          request.product === 'nia-rural'
            ? {
                kind: 'rural' as const,
                rural: (await deps.clients.getRural(request.ruralId)).rural,
                run: request.run,
              }
            : request.product === 'nia-fire'
              ? {
                  kind: 'fire' as const,
                  client: (await deps.clients.getProperty(request.propertyId)).property,
                  run: request.run,
                }
              : {
                  kind: 'marine' as const,
                  holder: (await deps.clients.getMarine(request.marineId)).marine,
                  shipment: request.shipment,
                };
        running = true;
        follow(insurerId);
        try {
          const result =
            start.kind === 'rural'
              ? await runNiaRuralQuote({ windows, rural: start.rural, run: start.run, today })
              : start.kind === 'fire'
                ? await runNiaFireQuote({ windows, client: start.client, run: start.run, today })
                : await runNiaMarineQuote({
                    windows,
                    holder: start.holder,
                    shipment: start.shipment,
                    today,
                  });
          deps.logger.log(result.outcome === 'failed' ? 'warn' : 'info', 'quote.run', {
            insurer: insurerId,
            quoteOutcome: result.outcome,
          });
          return result;
        } finally {
          running = false;
          followWork(null);
        }
      }
      const subject =
        request.product === 'motor' || request.product === 'hdfc-motor'
          ? {
              kind: 'vehicle' as const,
              vehicle: (await deps.clients.getVehicle(request.vehicleId)).saved.vehicle,
            }
          : request.product === 'travel-proposal' ||
              request.product === 'omp-proposal' ||
              request.product === 'nia-travel' ||
              request.product === 'hdfc-travel'
            ? {
                kind: 'traveller' as const,
                record: await deps.clients.getTraveller(request.travellerId),
              }
            : { kind: 'client' as const, record: await deps.clients.get(request.clientId) };
      running = true;
      follow(insurerId);
      try {
        const today = (deps.now ?? (() => new Date()))();
        const windows = () => deps.windowsOf(insurerId);
        let result: QuoteRunResult;
        if (subject.kind === 'vehicle') {
          result =
            request.product === 'hdfc-motor'
              ? await runHdfcMotorQuote({ windows, vehicle: subject.vehicle, run: request.run })
              : newIndiaMotor
                ? await runNiaMotorQuote({ windows, vehicle: subject.vehicle, today })
                : await runUiicMotorQuote({ windows, vehicle: subject.vehicle, today });
        } else if (subject.kind === 'traveller') {
          const travel = {
            windows,
            traveller: subject.record.traveller,
            aadhaar: await deps.clients.aadhaarFor(subject.record.id),
            passportNumber: await deps.clients.passportFor(subject.record.id),
            today,
          };
          result =
            request.product === 'hdfc-travel'
              ? await runHdfcTravelQuote({
                  windows,
                  traveller: subject.record.traveller,
                  run: request.run,
                  today,
                })
              : request.product === 'nia-travel'
                ? await runNiaTravelQuote({
                    windows,
                    traveller: subject.record.traveller,
                    trip: request.trip,
                    passportNumber: travel.passportNumber,
                    noPreExisting: request.noPreExistingConfirmed,
                    today,
                  })
                : request.product === 'omp-proposal'
                  ? await runUiicOmpProposal({ ...travel, trip: request.trip })
                  : request.product === 'travel-proposal'
                    ? await runUiicTravelProposal({ ...travel, trip: request.trip })
                    : (() => {
                        throw new AppException('VALIDATION_FAILED');
                      })();
        } else if (request.product === 'nia-pa') {
          result = await runNiaPaQuote({
            windows,
            client: subject.record.client,
            run: request.run,
            noClaims: request.noClaimsConfirmed,
            noDisabilities: request.noDisabilitiesConfirmed,
          });
        } else if (request.product === 'hdfc-retail') {
          result = await runHdfcRetailQuote({
            windows,
            client: subject.record.client,
            run: request.run,
            today,
          });
        } else if (request.product === 'hdfc-mst') {
          result = await runHdfcMstQuote({
            windows,
            client: subject.record.client,
            run: request.run,
          });
        } else if (request.product === 'niva-health') {
          result = await runNivaHealthQuote({
            windows,
            client: subject.record.client,
            run: request.run,
            today,
          });
        } else if (request.product === 'nia-health') {
          result = await runNiaHealthQuote({
            windows,
            client: subject.record.client,
            policy: request.policy,
            goodHealth: request.goodHealthConfirmed,
            today,
          });
        } else if (
          request.product !== 'health' &&
          request.product !== 'motor' &&
          request.product !== 'hdfc-motor' &&
          request.product !== 'travel-proposal' &&
          request.product !== 'omp-proposal' &&
          request.product !== 'nia-travel' &&
          request.product !== 'hdfc-travel'
        ) {
          result = await runUiicHealthProposal({
            windows,
            form: PROPOSAL_FORM[request.product],
            client: subject.record.client,
            aadhaar: await deps.clients.aadhaarFor(subject.record.id),
          });
        } else {
          result = await runUiicHealthQuote({
            windows,
            client: subject.record.client,
            goodHealth: request.product === 'health' && request.goodHealthConfirmed,
            today,
          });
        }
        deps.logger.log(result.outcome === 'failed' ? 'warn' : 'info', 'quote.run', {
          insurer: insurerId,
          quoteOutcome: result.outcome,
        });
        return result;
      } finally {
        running = false;
        followWork(null);
      }
    },
  };
}
