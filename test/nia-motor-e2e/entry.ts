// Bundled by run.mjs with the same toolchain as the app, so the harness runs exactly the
// serialised page agent the app injects into New India's page.
import { createLogger } from '../../src/main/logging/logger';
import { runNiaHealthQuote } from '../../src/main/quotes/run-nia-health';
import { runNiaMarineQuote } from '../../src/main/quotes/run-nia-marine';
import { runNiaMotorQuote } from '../../src/main/quotes/run-nia-motor';
import { runNiaRuralQuote } from '../../src/main/quotes/run-nia-rural';
import { runNiaTravelQuote } from '../../src/main/quotes/run-nia-travel';
import {
  installNavigationPolicy,
  setSessionPolicy,
} from '../../src/main/security/navigation-policy';

export {
  createLogger,
  installNavigationPolicy,
  runNiaHealthQuote,
  runNiaMarineQuote,
  runNiaMotorQuote,
  runNiaRuralQuote,
  runNiaTravelQuote,
  setSessionPolicy,
};
