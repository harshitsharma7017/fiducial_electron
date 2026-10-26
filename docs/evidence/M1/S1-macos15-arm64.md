# S1 — Electron launch on macOS 15 (Apple Silicon)

| | |
|---|---|
| Objective | Electron 45.x launches, renders a locked-down window, exchanges a validated IPC call and shuts down cleanly (DM-01) |
| Date | 26 Oct 2026 (development 13:55 UTC; packaged 13:58 UTC) |
| Environment | Apple M4 (arm64), macOS 15.7.2 (24G325); Electron 45.0.0 / Chromium 156.0.8078.48 / Node 24.22.0 |
| Builds | Development (`node_modules/electron` binary, ad-hoc signed by the Electron download) and packaged (`@electron/packager` 20.3.0, ad-hoc, fuses applied) |
| Code | `spikes/m1/src/main/spikes/s1-electron.ts`, `src/preload/index.ts`, `static/renderer/` |
| Status | **PASS on this platform only** |

## Commands

```sh
node scripts/run-spike.mjs --spike=s1              # development
node scripts/run-spike.mjs --packaged --spike=s1   # packaged
```

## Expected vs actual (both builds: 13/13 checks passed)

| Check | Expected | Actual |
|---|---|---|
| Window reaches `ready-to-show` | yes | yes (0.21 s dev, 0.27 s packaged after process start) |
| Valid renderer payload accepted by main process | accepted | accepted |
| Payload with an extra field rejected by the strict Zod schema | `VALIDATION_FAILED` | `VALIDATION_FAILED` |
| `typeof require` / `process` / `module` in the renderer | `undefined` | `undefined` (all three) |
| Preload bridge `window.fqfSpike` present | yes | yes |
| Page can see the preload world's marker global (context isolation) | no | no |
| Renderer process sandboxed (OS process metrics) | `sandboxed: true` | `true` |
| Content-Security-Policy meta present | yes | yes |
| Electron security warnings in the renderer console | 0 | 0 |
| Electron line | 45.x | 45.0.0 |
| Window closes; process exits with 0; leftover processes | closed, 0, 0 | closed, 0, 0 |

Other facts: four processes (Browser, GPU, Utility, Tab), about 316 MB total working set. The whole packaged run took about 2.9 s, against 0.9 s for development; the first launch of a newly built binary includes macOS code assessment.

## Observations (not failures)

- In very short runs (S5, about 0.3 s), a helper process sometimes logged `bootstrap_look_up ... MachPortRendezvousServer: Permission denied` and `No rendezvous client, terminating process (parent died?)`. It appeared in both development and packaged builds. Exit codes were 0 and no processes were left behind. It looks like a shutdown race in which a helper starts as the main process quits. **Re-check outside the IDE environment** before treating it as harmless.
- A camera-related AppKit warning (`NSCameraUseContinuityCameraDeviceType`) appeared when S2 tested `getUserMedia`. This is expected for an app without camera usage keys.

## Limitations and fallback

- **Platform-specific.** This proves nothing for Windows 10/11 x64, Intel Macs or macOS 13 Ventura, the proposed floor (DM-01). Those runs are still required (Q-D07).
- Effective webPreferences are measured from behaviour (renderer view, OS metrics), because Electron 45's typings expose no getter for them.
- Electron 45.0.0 was 5 days old at test time (AR-12). Fallback: 44.9.x, which has the same macOS 13 floor.
