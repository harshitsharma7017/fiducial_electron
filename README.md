# Fiducial Quote Fetcher

Desktop application for insurance advisors (Windows and macOS). Requirements are in the PDF pack (`00`–`19`); planning and status are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) and [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

**Status (3 November 2026):** insurer portal automation behind a switch, off by default:
- sign-in autofill for password-based insurer portals, with 12-hour sessions that survive restarts;
- saved clients and, separately, saved vehicles, in an encrypted database;
- United India: health and motor premium calculators; the Family Medicare, Individual Health,
  Arogya Sanjeevani, Super Top-up and Yuvaan Health e-proposals; and the Overseas Travel and Overseas Mediclaim
  (B&H, SCHENGEN, Studies) e-proposals, with their premiums (all filled, never saved or
  submitted).

Tested against local copies of the insurer pages; live runs are done by the advisor. Details:
[docs/INSURER_PORTALS.md](docs/INSURER_PORTALS.md) and [docs/CLIENTS.md](docs/CLIENTS.md).
`src/shared/` holds the domain contracts and the comparison engine (M3). `spikes/m1/` holds the M1
feasibility spike: experimental code with its own toolchain, not part of this app.

## Stack

Electron 45 (provisional, DM-01) · TypeScript (strict) · React 19 · Zod · electron-vite · electron-builder · Vitest · ESLint · Prettier · secretlint. All versions are pinned exactly in `package.json` and `package-lock.json`.

## Getting started (new developer)

**You need:**
- **Access to this repository.** It is private: the owner adds you as a collaborator on GitHub
  (Settings → Collaborators), and you accept the invitation.
- **Git**, and **Node.js 22.12 or later** with **npm 11** (`node --version`, `npm --version`).
- **macOS or Windows.** Only macOS (Apple Silicon) has been verified so far.

**Steps:**

```sh
git clone https://github.com/harshitsharma7017/fiducial_electron.git
cd fiducial_electron
npm ci --ignore-scripts   # dependencies, exactly as locked; install scripts are not needed
npx install-electron      # downloads Electron 45.0.0, verified against bundled checksums
npm run prepare           # enables the pre-commit hook (secret scan, lint, formatting)
npm test                  # optional: the unit tests should all pass
npm run dev:prod          # starts the app with the insurer and client features switched on
```

`npm run dev` starts the same app with those features off.

**What a new copy does not have:** everything the app saves stays on the computer that saved it,
under the app's data folder, and never goes to GitHub:
- insurer sign-in details and Aadhaar numbers, in the encrypted vault;
- saved clients and vehicles, in the encrypted database;
- insurer sessions and form recordings.

Each developer saves their own insurer sign-ins and test clients. Use made-up client data only. On
macOS, the first save may ask for permission to use the Keychain: choose **Always Allow**.

**Committing:** work goes on `main`, the default branch. The pre-commit hook rejects a commit when a
staged file has a secret, a lint error or unformatted code: run `npm run format` and
`npm run lint`, then commit again.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development app with hot reload (loopback dev server; development-only CSP) |
| `npm run dev:prod` | The same, with the insurer portal and client features switched on (`FQF_INSURER_PORTALS=1`) |
| `npm run build` | Compiles main, preload and renderer into `out/` |
| `npm run build:mac` / `build:win` | Unsigned installers in `release/`, then the packaged-content and fuse check |
| `npm test` | Unit tests (Vitest) |
| `npm run test:smoke` | Builds, launches the app with `--smoke-test` (in-app security checks) and verifies the launch guard |
| `npm run test:nia` (`-- health`, `-- travel`, `-- rural`, `-- marine`, `-- pa`, `-- fire`, `-- niva`) | New India motor (health, travel, rural, marine, personal accident, fire) quote automation, and Niva Bupa's premium calculator, against local copies of their forms (no insurer contacted) |
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

In M2 nothing stored customer data or secrets. Since then, behind the `FQF_INSURER_PORTALS=1` switch, insurer sign-ins and Aadhaar numbers are kept in the secret vault (`src/main/secrets/vault/`) and clients in an encrypted database. The vault design (Q-M1-01 / DM-02) is still awaiting approval.

## Platform status

Verified on macOS 15 (Apple Silicon) only. Windows packages build from macOS but have **not** been run on Windows. CI (`.github/workflows/ci.yml`, macOS and Windows) has run once, on the M2 commit: macOS passed and Windows failed at lint (AR-25). The M3 commit has not been pushed, so CI has never run on it. Builds are unsigned (S6 is blocked on signing identities).
