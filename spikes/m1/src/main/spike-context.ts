// What each spike runner receives and returns.
import type { SpikeArgs } from '../shared/args';
import type { Check } from '../shared/result';

export interface SpikeContext {
  args: SpikeArgs;
  /** Absolute output directory for results and generated artefacts. */
  outDir: string;
  /** app.getAppPath(): the project folder in development, app.asar when packaged. */
  appRoot: string;
  /** Deprecated sync safeStorage.isEncryptionAvailable() as observed before the app was ready. */
  preReadySafeStorage: string;
  /** safeStorage.isAsyncEncryptionAvailable() started before the app was ready. */
  preReadyAsyncSafeStorage: Promise<string>;
}

export interface SpikeOutcome {
  checks: Check[];
  facts: Record<string, unknown>;
}
