// Quote runs behind the IPC channel. Off unless the automation features are switched on. Only the
// United India health calculator is automated so far; other insurers are refused with a reason.
import type { BrowserWindow } from 'electron';
import type { ClientService } from '../clients/service';
import { AppException } from '../ipc/dispatcher';
import type { Logger } from '../logging/logger';
import { runUiicHealthQuote, type QuoteRunResult } from './run-uiic-health';

export interface QuoteService {
  run(request: {
    clientId: string;
    insurerId: string;
    goodHealthConfirmed: boolean;
  }): Promise<QuoteRunResult>;
}

export function createQuoteService(deps: {
  enabled: boolean;
  clients: Pick<ClientService, 'get'>;
  windowsOf: (insurerId: string) => BrowserWindow[];
  logger: Logger;
  now?: () => Date;
}): QuoteService {
  let running = false;
  return {
    run: async ({ clientId, insurerId, goodHealthConfirmed }) => {
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
        const result = await runUiicHealthQuote({
          windows: () => deps.windowsOf(insurerId),
          client: record.client,
          goodHealth: goodHealthConfirmed,
          today: (deps.now ?? (() => new Date()))(),
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
