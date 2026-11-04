// Quote runs behind the IPC channel. Off unless the automation features are switched on. United
// India: health and motor calculators, the health, Overseas Travel and Overseas Mediclaim
// e-proposals. New India: motor (the vehicle details of the Private Car and Two Wheeler forms;
// run-nia-motor.ts) and the health quote forms of twelve policies (run-nia-health.ts). Other
// insurers and products are refused with a reason. Motor quotes are for a saved vehicle, travel
// e-proposals for a travel client, the others for a saved client.
import type { ClientService } from '../clients/service';
import type { PortalPage } from '../insurers/portal-host';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import type { QuoteRunRequest } from '../../shared/ipc/contract';
import {
  runUiicHealthProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
  runUiicOmpProposal,
  runUiicTravelProposal,
  type QuoteRunResult,
} from './run-uiic-health';
import type { UiicProposalForm } from './uiic-health-proposal';
import { runNiaHealthQuote } from './run-nia-health';
import { runNiaMotorQuote } from './run-nia-motor';

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
    'get' | 'aadhaarFor' | 'getVehicle' | 'getTraveller' | 'passportFor'
  >;
  /** The insurer's open pages: its portal first, then its pop-ups. */
  windowsOf: (insurerId: string) => PortalPage[];
  logger: Logger;
  now?: () => Date;
}): QuoteService {
  let running = false;
  return {
    run: async (request) => {
      if (!deps.enabled) throw new AppException('UNSUPPORTED_FLOW');
      const { insurerId } = request;
      const newIndiaMotor = insurerId === 'new-india' && request.product === 'motor';
      const newIndiaHealth = request.product === 'nia-health';
      if (
        newIndiaHealth ? insurerId !== 'new-india' : insurerId !== 'united-india' && !newIndiaMotor
      ) {
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
      // Read before the run starts: an unknown client, travel client or vehicle is refused at once.
      const subject =
        request.product === 'motor'
          ? {
              kind: 'vehicle' as const,
              vehicle: (await deps.clients.getVehicle(request.vehicleId)).saved.vehicle,
            }
          : request.product === 'travel-proposal' || request.product === 'omp-proposal'
            ? {
                kind: 'traveller' as const,
                record: await deps.clients.getTraveller(request.travellerId),
              }
            : { kind: 'client' as const, record: await deps.clients.get(request.clientId) };
      running = true;
      try {
        const today = (deps.now ?? (() => new Date()))();
        const windows = () => deps.windowsOf(insurerId);
        let result: QuoteRunResult;
        if (subject.kind === 'vehicle') {
          result = newIndiaMotor
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
            request.product === 'omp-proposal'
              ? await runUiicOmpProposal({ ...travel, trip: request.trip })
              : request.product === 'travel-proposal'
                ? await runUiicTravelProposal({ ...travel, trip: request.trip })
                : (() => {
                    throw new AppException('VALIDATION_FAILED');
                  })();
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
          request.product !== 'travel-proposal' &&
          request.product !== 'omp-proposal'
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
      }
    },
  };
}
