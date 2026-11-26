// Bundled by run.mjs with the same toolchain as the app, so the harness runs exactly the
// serialised page agent the app injects into New India's page.
import { formRecorderAgent } from '../../src/main/insurers/form-recorder-agent';
import { keepAliveAgent } from '../../src/main/insurers/session-alive';
import { createLogger } from '../../src/main/logging/logger';
import { createPortalHost } from '../../src/main/insurers/portal-host';
import { runIciciMotorQuote } from '../../src/main/quotes/run-icici-motor';
import { runNiaFireQuote } from '../../src/main/quotes/run-nia-fire';
import { runNiaHealthQuote } from '../../src/main/quotes/run-nia-health';
import { runNiaMarineQuote } from '../../src/main/quotes/run-nia-marine';
import { runNiaMotorQuote } from '../../src/main/quotes/run-nia-motor';
import { runNiaPaQuote } from '../../src/main/quotes/run-nia-pa';
import { runNiaRuralQuote } from '../../src/main/quotes/run-nia-rural';
import { runNiaTravelQuote } from '../../src/main/quotes/run-nia-travel';
import { runNivaHealthQuote } from '../../src/main/quotes/run-niva-health';
import { runBajajPaQuote } from '../../src/main/quotes/run-bajaj-pa';
import {
  runIciciElevateQuote,
  runIciciIntlTravelQuote,
  runIciciStudentTravelQuote,
} from '../../src/main/quotes/run-icici-nysa';
import { exec } from '../../src/main/quotes/run-uiic-health';
import {
  runHdfcMotorQuote,
  runHdfcMstQuote,
  runHdfcRetailQuote,
  runHdfcTravelQuote,
} from '../../src/main/quotes/run-hdfc';
import {
  installNavigationPolicy,
  setSessionPolicy,
} from '../../src/main/security/navigation-policy';

export {
  createLogger,
  createPortalHost,
  exec,
  formRecorderAgent,
  installNavigationPolicy,
  keepAliveAgent,
  runBajajPaQuote,
  runHdfcMotorQuote,
  runHdfcMstQuote,
  runHdfcRetailQuote,
  runHdfcTravelQuote,
  runIciciElevateQuote,
  runIciciIntlTravelQuote,
  runIciciMotorQuote,
  runIciciStudentTravelQuote,
  runNiaFireQuote,
  runNiaHealthQuote,
  runNiaMarineQuote,
  runNiaMotorQuote,
  runNiaPaQuote,
  runNiaRuralQuote,
  runNiaTravelQuote,
  runNivaHealthQuote,
  setSessionPolicy,
};
