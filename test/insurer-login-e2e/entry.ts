// Bundled by run.mjs with the same toolchain as the app, so the harness runs exactly the
// serialised agent the portal windows inject, and the same keyboard fill (canvas portals).
import { keyboardFill } from '../../src/main/insurers/keyboard-fill';
import { keyboardTargetFor } from '../../src/main/insurers/keyboard-target';
import { insurerLoginAgent } from '../../src/main/insurers/login-agent';

export const AGENT_SOURCE = insurerLoginAgent.toString();
export { keyboardFill, keyboardTargetFor };
