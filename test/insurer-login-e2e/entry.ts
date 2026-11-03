// Bundled by run.mjs with the same toolchain as the app, so the harness runs exactly the
// serialised agent the portal windows inject, and the same keyboard fill (canvas portals).
import { keyboardFill } from '../../src/main/insurers/keyboard-fill';
import { keyboardTargetFor } from '../../src/main/insurers/keyboard-target';
import { createFormRecorder } from '../../src/main/insurers/form-recorder';
import { insurerLoginAgent } from '../../src/main/insurers/login-agent';
import { createLogger } from '../../src/main/logging/logger';
import { createPortalHost } from '../../src/main/insurers/portal-host';
import {
  runUiicHealthProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
} from '../../src/main/quotes/run-uiic-health';
import {
  installNavigationPolicy,
  setSessionPolicy,
} from '../../src/main/security/navigation-policy';

export const AGENT_SOURCE = insurerLoginAgent.toString();
export {
  createFormRecorder,
  createLogger,
  createPortalHost,
  installNavigationPolicy,
  keyboardFill,
  keyboardTargetFor,
  runUiicHealthProposal,
  runUiicHealthQuote,
  runUiicMotorQuote,
  setSessionPolicy,
};
