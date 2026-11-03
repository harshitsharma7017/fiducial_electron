// Quote runs behind the IPC channel. Off unless the automation features are switched on. United
// India only so far (health and motor calculators, the Family Medicare e-proposal); other insurers
// are refused with a reason.
import type { BrowserWindow } from 'electron';
import type { ClientService } from '../clients/service';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import {
  runUiicFamilyMedicareProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
  type QuoteRunResult,
} from './run-uiic-health';

export interface QuoteService {
  run(request: {
    clientId: string;
    insurerId: string;
    product: 'health' | 'motor' | 'fm-proposal';
    goodHealthConfirmed: boolean;
  }): Promise<QuoteRunResult>;
}

export function createQuoteService(deps: {
  enabled: boolean;
  clients: Pick<ClientService, 'get' | 'aadhaarFor'>;
  windowsOf: (insurerId: string) => BrowserWindow[];
  logger: Logger;
  now?: () => Date;
}): QuoteService {
  let running = false;
  return {
    run: async ({ clientId, insurerId, product, goodHealthConfirmed }) => {
      if (!deps.enabled) throw new AppException('UNSUPPORTED_FLOW');
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
      const record = await deps.clients.get(clientId);
      running = true;
      try {
        const today = (deps.now ?? (() => new Date()))();
        const windows = () => deps.windowsOf(insurerId);
        const result =
          product === 'motor'
            ? await runUiicMotorQuote({ windows, client: record.client, today })
            : product === 'fm-proposal'
              ? await runUiicFamilyMedicareProposal({
                  windows,
                  client: record.client,
                  aadhaar: await deps.clients.aadhaarFor(clientId),
                })
              : await runUiicHealthQuote({
                  windows,
                  client: record.client,
                  goodHealth: goodHealthConfirmed,
                  today,
                });
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
