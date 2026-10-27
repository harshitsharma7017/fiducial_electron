# M2 Evidence — scaffold and security baseline

| | |
|---|---|
| Milestone | M2 (IMPLEMENTATION_PLAN §4 M2; status in §15) |
| Date | 27 October 2026 (final verification about 04:55–05:00 UTC) |
| Branch | `m2/scaffold-security-baseline`, created from `e8a68b0`; **uncommitted working tree** |
| Toolchain | electron-vite 6.0.0, electron-builder 26.17.0, React 19.3.0 (DM-07, decided by the project lead on 27 Oct 2026); Electron 45.0.0; TypeScript 6.0.3; Zod 4.6.7; Vitest 5.0.3; ESLint 10.12.0; Prettier 3.9.9; secretlint 13.0.7 |
| Platform tested | **macOS 15.7.2, Apple M4 (arm64) only** |
| Not tested | Windows 10/11 (runtime), Intel Mac, macOS 13, CI (no remote) |

## Results

| Check | Command | Result | Raw |
|---|---|---|---|
| Dependency audit | `npm audit` | 0 vulnerabilities | `raw/audit.txt` |
| Type-check (node and web) | `npm run typecheck` | exit 0 | `raw/typecheck.txt` |
| Lint (ESLint `--max-warnings=0`, Prettier `--check`) | `npm run lint` | exit 0 | `raw/lint.txt` |
| Unit tests | `npm test` | **75/75 in 9 files** | `raw/unit-tests.txt` |
| Build + in-app smoke + launch guard (development binary) | `npm run test:smoke` | **13/13 checks; guard 3/3 refused (exit 78)** | `raw/smoke-dev.txt` |
| macOS packages (arm64 and x64 DMG, unsigned) + content/fuse check | `npm run build:mac` | exit 0; both apps: 757 asar entries, **0 unexpected, 0 fuse problems** | `raw/build-mac.txt` |
| Windows package (NSIS x64, unsigned, **cross-built on macOS**) + content/fuse check | `npm run build:win` | exit 0; 757 entries, 0 unexpected, 0 fuse problems. **Never installed or run** | `raw/build-win.txt` |
| Packaged arm64 app: in-app smoke + launch guard | `node scripts/smoke.mjs --packaged` | **13/13 checks; guard 3/3 refused** | `raw/smoke-packaged-arm64.txt` |
| Development launch | `npm run dev` | Started; renderer → bridge → IPC round trip succeeded; no CSP violations; no leftover processes | `raw/dev-launch.json` |
| Secret scan | `npm run secrets:scan` | 168 files, 0 findings. Detection proven separately on a planted npm token (flagged, masked, exit 1); a synthetic RSA key block was **not** flagged | `raw/secrets-scan.txt` |

### In-app smoke checks (`--smoke-test`, same 13 in dev and packaged)

| Check | Requirement |
|---|---|
| `ipc.round-trip`: page → preload → `ipcMain` → dispatcher (trusted sender) → handler | SEC-03, SEC-04 |
| `bridge.shape`: `window.fqf` exposes exactly `{ app: [getInfo] }` | SEC-03 |
| `renderer.no-node`: `require`, `process`, `module`, `ipcRenderer`, `electron` all `undefined` | SEC-01, SEC-02 |
| `renderer.sandboxed` (OS process metrics) | SEC-01 |
| `csp.inline-script-blocked`: an injected inline script does not run | SEC-06 |
| `tc23.popup-blocked`, `tc23.https-navigation-blocked`, `tc23.file-navigation-blocked` | SEC-05, TC-23 |
| `protocol.csp-header`: `app://` responses carry the production CSP | SEC-06 |
| `protocol.encoded-traversal`, `protocol.encoded-dot-segments`, `protocol.main-bundle-unreachable`, `protocol.other-host`: 404 | `app://` confinement |

### Unit test coverage (75 tests)

- **`ipc-dispatcher` (TC-22):**
  - untrusted senders: other window, subframe, foreign origin, look-alike origin, no URL;
  - 7 invalid payload classes, including unexpected fields and `__proto__`;
  - unknown channel;
  - handler exceptions never leak;
  - response-schema enforcement;
  - correlation IDs;
  - no values or key names in validation details.
- **`logger` (LOG-01):** forbidden field names, free text in allowed fields, unknown events, sink failure.
- **`navigation-policy`, `app-protocol`, `csp`, `launch-guard`, `web-preferences`:** policy decisions and confinement.
- **`contract`:** contract, bridge and preload consistency.
- **`lint-rules`:** the real ESLint config rejects sync `safeStorage` and Node/Electron imports in the renderer.

## Limitations and open items

- **Windows:** packages build and pass the content/fuse check, but the app has not been installed or run on Windows. SEC-01 to SEC-06 and LOG-01 are therefore verified on macOS only.
- **CI:** `.github/workflows/ci.yml` (macOS and Windows, SHA-pinned actions) has never run; the repository has no remote.
- **Husky pre-commit hook:** configured but not activated (`npm run prepare` sets `core.hooksPath`; left to the developer).
- **Debug-port probing:** the TCP port probe from M1 was not repeated. M2 verifies the fuses statically and the guard's refusal (exit 78).
- **Not covered by automated tests:** the single-instance lock, and the x64 macOS app at runtime.
- **Signing:** builds are unsigned (S6 blocked).
- **No customer data, secrets or vault in M2:** Q-M1-01 and DM-02 remain unapproved.
