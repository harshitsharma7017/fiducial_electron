// Quote runs behind the IPC channel. Off unless the automation features are switched on. United
// India only so far (health and motor calculators, the health e-proposals); other insurers
// are refused with a reason. Motor quotes are for a saved vehicle, the others for a saved client.
import type { ClientService } from '../clients/service';
import type { PortalPage } from '../insurers/portal-host';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import type { QuoteRunRequest } from '../../shared/ipc/contract';
import {
  runUiicHealthProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
  type QuoteRunResult,
} from './run-uiic-health';
import type { UiicProposalForm } from './uiic-health-proposal';

/** The e-proposal each product fills. */
const PROPOSAL_FORM = {
  'fm-proposal': 'family-medicare',
  'ihp-proposal': 'individual-health',
  'as-proposal': 'arogya-sanjeevani',
  'stu-proposal': 'super-top-up',
} as const satisfies Record<string, UiicProposalForm>;

export interface QuoteService {
  run(request: QuoteRunRequest): Promise<QuoteRunResult>;
}

export function createQuoteService(deps: {
  enabled: boolean;
  clients: Pick<ClientService, 'get' | 'aadhaarFor' | 'getVehicle'>;
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
      if (insurerId !== 'united-india') {
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
      // Read before the run starts: an unknown client or vehicle is refused at once.
      const subject =
        request.product === 'motor'
          ? {
              kind: 'vehicle' as const,
              vehicle: (await deps.clients.getVehicle(request.vehicleId)).saved.vehicle,
            }
          : { kind: 'client' as const, record: await deps.clients.get(request.clientId) };
      running = true;
      try {
        const today = (deps.now ?? (() => new Date()))();
        const windows = () => deps.windowsOf(insurerId);
        let result: QuoteRunResult;
        if (subject.kind === 'vehicle') {
          result = await runUiicMotorQuote({ windows, vehicle: subject.vehicle, today });
        } else if (request.product !== 'health' && request.product !== 'motor') {
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
