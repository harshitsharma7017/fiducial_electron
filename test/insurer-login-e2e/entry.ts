// Bundled by run.mjs with the same toolchain as the app, so the harness runs exactly the
// serialised agent the portal windows inject.
import { insurerLoginAgent } from '../../src/main/insurers/login-agent';

export const AGENT_SOURCE = insurerLoginAgent.toString();
