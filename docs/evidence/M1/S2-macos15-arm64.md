# S2 — Insurer session isolation and debug-port exposure

| | |
|---|---|
| Objective | (a) Separate insurer partitions cannot read each other's cookies or storage. (b) Default-deny policy for navigation, popups and permissions. (c) In-process CDP driver works without a TCP port. (d) No debug port is exposed, and production rejects unsafe launch options (DM-03, DM-04, AR-16) |
| Date | 26 Oct 2026 (development 13:55 UTC, packaged 13:58 UTC, port checks about 13:59–14:00 UTC) |
| Environment | Apple M4 (arm64), macOS 15.7.2; Electron 45.0.0 |
| Target | **Local mock portal only**: two `node:http` listeners on `127.0.0.1` (allowlisted "portal" origin and a forbidden "other" origin). No real insurer was contacted |
| Code | `src/main/spikes/s2-sessions.ts`, `mock-portal.ts`, `navigation-policy.ts`, `cdp-driver.ts`, `src/shared/launch-guard.ts`, `scripts/debug-port-check.mjs`, `scripts/inspect-cookies.mjs` |
| Status | **PASS on this platform only** (14/14 checks in each build; all debug-port expectations met by the packaged build) |

## Commands

```sh
node scripts/run-spike.mjs --spike=s2 && node scripts/inspect-cookies.mjs --run=dev
node scripts/run-spike.mjs --packaged --spike=s2 && node scripts/inspect-cookies.mjs --run=packaged
node scripts/debug-port-check.mjs              # development binary, no fuses
node scripts/debug-port-check.mjs --packaged   # packaged binary, fuses applied
```

## (a)–(c) Isolation, policy and driver (14/14 checks in both builds)

| Check | Expected | Actual |
|---|---|---|
| Positive control: partition A sees its own HttpOnly cookie, JS cookie, localStorage and sessionStorage | yes | yes |
| Partition B cookie store contains A's cookies | 0 | 0 |
| B's `document.cookie`, `localStorage` and `sessionStorage` show A's values | none | none (`null`) |
| B's HTTP requests (as seen by the server) carried A's cookies, including HttpOnly | no | no |
| `require` / `process` / `module` / preload bridge inside the insurer view | all `undefined` | all `undefined` |
| Notification, geolocation and camera requests | denied | `denied`, `error-code-1` (PERMISSION_DENIED), `NotAllowedError`; permissions query `denied` |
| `window.open` | returns `null`, no new window | `null`, 0 new windows |
| Navigation to the other origin; server redirect to the other origin | blocked | blocked (page stays on the portal origin); the other origin received **no** request |
| CDP driver (`webContents.debugger`): type, click, read | `MOCK premium for self aged 35: INR 8500` | as expected; a real CDP mouse click works on a hidden window |

## Cookies at rest (names and lengths only; values were never read)

| Build | `fqf_mock_http` / `fqf_mock_js` in `Partitions/insurer-mock-a/Cookies` |
|---|---|
| Development (no fuses) | `value` length 14, `encrypted_value` length 0 → **stored in plaintext** |
| Packaged (`EnableCookieEncryption` on) | `value` length 0, `encrypted_value` length 51 with prefix `v10` → **stored encrypted** |

The partition B store is empty in both builds.

## (d) Debug-port and launch-option checks

Each case was launched from outside the process. TCP connections to the watched port were attempted every ~30 ms, and `lsof` sampled the process tree.

| Case | Development binary (no fuses) | Packaged binary (fuses on) |
|---|---|---|
| Baseline launch | exit 0, **no listening ports** | exit 0, **no listening ports** |
| `--remote-debugging-port=9222` | guard exit 78; 9222 never accepted | guard exit 78; 9222 never accepted |
| `--remote-debugging-pipe` | guard exit 78 | guard exit 78 |
| `--inspect=9229` | guard exit 78, **but 9229 accepted connections at ~164 ms** (before the guard ran) | guard exit 78; 9229 never accepted |
| `--inspect-brk=9229` | **9229 open and the app hung**; the guard never ran; killed after 30 s | guard exit 78; 9229 never accepted |
| `NODE_OPTIONS=--inspect=9230` | guard exit 78, **but 9230 accepted at ~163 ms** | ignored (fuse); app ran normally (exit 0); 9230 never accepted |
| `ELECTRON_RUN_AS_NODE=1 … -e "process.exit(42)"` | **exit 42: the binary ran as Node** | exit 64: the binary ran the app (RunAsNode disabled), which rejected the arguments |
| Positive control: guard-less app with `--remote-debugging-port=9222` | **9222 accepted at ~162 ms** (proves the probe works) | n/a |

Fuse state read back from the packaged app (`npx @electron/fuses read`):

- Disabled: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`.
- Enabled: `EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar`.
- Left at default and **not evaluated**: `GrantFileProtocolExtraPrivileges` (enabled).

## Conclusions

1. Per-partition isolation and the default-deny policy behave as designed (ARCHITECTURE_REVIEW §7.4).
2. **The JS launch guard is necessary but not sufficient.** Node's inspector starts before app code, so only the fuses prevent `--inspect`, `--inspect-brk` and `NODE_OPTIONS` exposure. **Fuses are mandatory in every shipped build.**
3. **AR-16:** for `--remote-debugging-port`, the guard (which runs at the start of the main script) won the race on this Mac: no port was observed, against ~162 ms to open without a guard. This is timing-dependent and has only been measured here. Treat it as *mitigated on macOS arm64, unverified elsewhere*, and re-measure on Windows and on a slow machine.
4. **Cookie encryption requires the fuse.** Without it, authenticated insurer cookies would be stored in plaintext.

## Limitations and fallback

- Mock portal only. Real portals may use popups, cross-origin SSO redirects or downloads that the allowlist will need to permit per adapter (Track B).
- Hidden `BrowserWindow`s were used rather than `WebContentsView`, because partition isolation does not depend on the view type. The view type for R2 is still E-04.
- Polling granularity (~30 ms) means a port open for less than ~30 ms could be missed. The positive control shows normal opens are observed.
- **Platform-specific**: macOS 15 arm64 only.
