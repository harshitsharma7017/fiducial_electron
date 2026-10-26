// In-process CDP driver (DM-04): talks to a page through webContents.debugger, so no
// remote-debugging TCP port is ever opened.
import type { WebContents } from 'electron';
import { withTimeout } from './util';

interface EvaluateResponse {
  result: { value?: unknown };
  exceptionDetails?: unknown;
}

export class CdpDriver {
  constructor(private readonly contents: WebContents) {
    contents.debugger.attach('1.3');
  }

  send<T>(method: string, params?: object, timeoutMs = 5000): Promise<T> {
    return withTimeout(
      this.contents.debugger.sendCommand(method, params) as Promise<T>,
      timeoutMs,
      method,
    );
  }

  async evaluate(expression: string, awaitPromise = false, timeoutMs = 5000): Promise<unknown> {
    const response = await this.send<EvaluateResponse>(
      'Runtime.evaluate',
      { expression, awaitPromise, returnByValue: true },
      timeoutMs,
    );
    // Exception details may contain page data, so only the fact of failure is reported.
    if (response.exceptionDetails) throw new Error('page script threw');
    return response.result.value;
  }

  detach(): void {
    if (this.contents.debugger.isAttached()) this.contents.debugger.detach();
  }
}
