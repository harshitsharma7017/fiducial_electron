# Fiducial Quote Fetcher

Desktop application for insurance advisors (Windows and macOS). Requirements are in the PDF pack (`00`–`19`); planning and status are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) and [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

**Current milestone: M3 — contracts and quote comparison (not accepted: contracts draft, rules provisional).** The app is still an empty, secured shell. `src/shared/` holds the domain contracts, money utilities, validators and the comparison engine, committed locally as `4f42849` and not wired to IPC or any production screen; see [docs/evidence/M3/](docs/evidence/M3/README.md). An **uncommitted, development-only** Quote Comparison demo (`src/renderer/src/dev/`, opened from the home screen in `npm run dev` only) runs the engine on synthetic data; it is excluded from production builds. Storage, history, the UI, insurer integration and the PDF report arrive in M4–M7. `spikes/m1/` holds the M1 feasibility spike: experimental code with its own toolchain, not part of this app.

## Stack

Electron 45 (provisional, DM-01) · TypeScript (strict) · React 19 · Zod · electron-vite · electron-builder · Vitest · ESLint · Prettier · secretlint. All versions are pinned exactly in `package.json` and `package-lock.json`.

## Setup

```sh
npm ci --ignore-scripts   # dependencies; install scripts are not needed
npx install-electron      # downloads Electron 45.0.0, verified against bundled checksums
npm run prepare           # optional: enables the Husky pre-commit hook (sets git core.hooksPath)
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development app with hot reload (loopback dev server; development-only CSP) |
| `npm run build` | Compiles main, preload and renderer into `out/` |
| `npm run build:mac` / `build:win` | Unsigned installers in `release/`, then the packaged-content and fuse check |
| `npm test` | Unit tests (Vitest) |
| `npm run test:smoke` | Builds, launches the app with `--smoke-test` (in-app security checks) and verifies the launch guard |
| `node scripts/smoke.mjs --packaged` | The same against the packaged app in `release/` |
| `npm run typecheck` / `npm run lint` | TypeScript (node and web configs); ESLint and Prettier |
| `npm run secrets:scan` | secretlint over the repository |

Electron is always started through `scripts/run-clean-env.mjs` or `scripts/smoke.mjs`, which remove `ELECTRON_RUN_AS_NODE` and `NODE_OPTIONS`. Some IDEs export `ELECTRON_RUN_AS_NODE=1`, which would otherwise make Electron run as plain Node (M1 finding, AR-19).

## Security baseline (M2)

- Renderer: `contextIsolation`, `sandbox`, no Node integration. It loads from `app://fqf` with a strict Content-Security-Policy header.
- Preload: exposes a fixed, typed `window.fqf` API (`src/shared/ipc/api.ts`), never raw `ipcRenderer`.
- IPC: every request goes through `src/main/ipc/dispatcher.ts`, in this order: known channel, trusted sender (the app window's top frame on the app origin), strict Zod request schema, handler, strict response schema. Errors use the `AppResult` envelope with a correlation ID and never include request values or exception text.
- Default deny: navigation, redirects, popups, `<webview>`, permissions and downloads.
- Logging: allowlisted events and fields only (`src/main/logging/logger.ts`).
- Packaged builds:
  - launch guard refuses debugging switches;
  - Electron fuses disable RunAsNode, NODE_OPTIONS and inspector arguments, and enable cookie encryption, asar integrity and app-from-asar only;
  - `scripts/check-package.mjs` verifies the fuses and the asar contents.

Nothing in M2 stores customer data or secrets. The secret vault design (Q-M1-01 / DM-02) is **not approved**; it is not used by this app yet.

## Platform status

Verified on macOS 15 (Apple Silicon) only. Windows packages build from macOS but have **not** been run on Windows. CI (`.github/workflows/ci.yml`, macOS and Windows) has run once, on the M2 commit: macOS passed and Windows failed at lint (AR-25). The M3 commit has not been pushed, so CI has never run on it. Builds are unsigned (S6 is blocked on signing identities).
