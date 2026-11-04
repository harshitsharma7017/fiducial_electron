// Bundled by run.mjs with the same toolchain as the app, so the harness runs exactly the
// serialised page agent the app injects into New India's page.
import { createLogger } from '../../src/main/logging/logger';
import { runNiaMotorQuote } from '../../src/main/quotes/run-nia-motor';
import {
  installNavigationPolicy,
  setSessionPolicy,
} from '../../src/main/security/navigation-policy';

export { createLogger, installNavigationPolicy, runNiaMotorQuote, setSessionPolicy };
