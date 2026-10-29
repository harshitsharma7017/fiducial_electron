// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The demo's bridge, present only when the preload saw the demo flag.
import type { PortalDemoApi } from '../shared/contract';

declare global {
  interface Window {
    fqfPortalDemo?: PortalDemoApi;
  }
}

export {};
