// Bundled by run.mjs with the same toolchain as the app, so the harness runs exactly the
// serialised agent the portal windows inject, and the same keyboard fill (canvas portals).
import { keyboardFill } from '../../src/main/insurers/keyboard-fill';
import { keyboardTargetFor } from '../../src/main/insurers/keyboard-target';
import { createFormRecorder } from '../../src/main/insurers/form-recorder';
import { insurerLoginAgent } from '../../src/main/insurers/login-agent';
import { createLogger } from '../../src/main/logging/logger';
import { createQuotePdfs } from '../../src/main/quotes/quote-pdf';
import { createPdfRenderer } from '../../src/main/quotes/render-pdf';
import { healthFacts, quoteDocumentHtml } from '../../src/main/quotes/quote-document';
import { createPortalHost } from '../../src/main/insurers/portal-host';
import {
  beginRun,
  endRun,
  exec,
  QuoteRunStopped,
  runUiicHealthProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
  runUiicOmpProposal,
  runUiicTravelProposal,
  stopRun,
} from '../../src/main/quotes/run-uiic-health';
import {
  installNavigationPolicy,
  setSessionPolicy,
} from '../../src/main/security/navigation-policy';

export const AGENT_SOURCE = insurerLoginAgent.toString();
export {
  createPdfRenderer,
  healthFacts,
  quoteDocumentHtml,
  createQuotePdfs,
  beginRun,
  endRun,
  exec,
  QuoteRunStopped,
  stopRun,
  createFormRecorder,
  createLogger,
  createPortalHost,
  installNavigationPolicy,
  keyboardFill,
  keyboardTargetFor,
  runUiicHealthProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
  runUiicOmpProposal,
  runUiicTravelProposal,
  setSessionPolicy,
};
