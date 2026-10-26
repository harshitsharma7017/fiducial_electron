# M1 feasibility spike — Fiducial Quote Fetcher

**Throwaway experiment code. Not the product application.** It contains no product screens, insurer integrations or customer workflows, and must never be merged into the product's `src/`. Results and evidence: [`docs/evidence/M1/`](../../docs/evidence/M1/README.md).

## What it does

One minimal Electron 45 app with five experiments, selected with `--spike=`:

| Spike | Runner                                                | Checks                                                                                                                          |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| S1    | `src/main/spikes/s1-electron.ts`                      | Launch, locked-down window, validated IPC, clean shutdown                                                                       |
| S2    | `src/main/spikes/s2-sessions.ts`                      | Per-insurer partition isolation against a **local mock portal**; navigation, popup and permission policy; in-process CDP driver |
| S3    | `src/main/spikes/s3-sqlite.ts`                        | Encrypted SQLite with a `safeStorage`-wrapped key; packaged native module                                                       |
| S4    | `src/main/spikes/s4-pdf.ts`                           | `printToPDF` with a bundled font and ₹ checks                                                                                   |
| S5    | `src/main/spikes/s5-secure-storage.ts`, `s5-vault.ts` | OS-backed secret storage (async `safeStorage`) and the Q-M1-01 authenticated vault (`src/shared/vault/`)                        |

`src/shared/launch-guard.ts` refuses debugging switches at startup. `scripts/package.mjs` packages for macOS and applies the DM-04 fuses. `scripts/debug-port-check.mjs` probes for exposed debug ports from outside the process.

## Dependency choices (spike only, not architecture decisions)

TypeScript, Zod, Vitest, ESLint and Prettier are the tools directed in the M0 decision register (DM-07). Everything else was added only because an experiment needed it, and **remains undecided for the product**.

| Package                                                                                                                | Version                                                                           | Why it is here                                                                                                                       | Product status                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| electron                                                                                                               | 45.0.0                                                                            | DM-01 provisional direction                                                                                                          | Provisional (DM-01)                                                   |
| typescript, zod, vitest, eslint, @eslint/js, typescript-eslint, eslint-config-prettier, globals, prettier, @types/node | 6.0.3, **4.6.7**, 5.0.3, 10.12.0, 10.0.1, 8.71.0, 10.1.8, 17.13.0, 3.9.9, 24.19.1 | Directed toolchain; versions match the team's other repositories, except zod, which was raised from 4.6.5 to fix GHSA-mrhx-c7xc-m3w5 | Provisional (DM-07)                                                   |
| vite                                                                                                                   | **8.3.4**                                                                         | Vitest peer dependency. 8.3.2 (the team's version) has published advisories; 8.3.4 is fixed and more than 14 days old                | Follows Vitest                                                        |
| better-sqlite3-multiple-ciphers                                                                                        | 13.0.3                                                                            | S3 needs an encrypted SQLite driver with Electron-compatible prebuilds                                                               | **Undecided** (DM-02, E-03)                                           |
| @electron/packager                                                                                                     | 20.3.0                                                                            | Smallest way to test a _packaged_ app; no installers                                                                                 | **Undecided**: electron-builder is still the plan's candidate (DM-07) |
| @electron/fuses                                                                                                        | 2.1.3                                                                             | Applies and reads the DM-04 fuses                                                                                                    | Likely needed by any packager                                         |
| pdfjs-dist                                                                                                             | 6.4.299                                                                           | Test-only PDF text and font extraction                                                                                               | Test tooling only                                                     |

Deliberately **not** used: React, electron-vite, electron-builder, any PDF library (Electron's built-in `printToPDF` is used), and Playwright.

All versions are pinned exactly (`.npmrc` sets `save-exact`), `package-lock.json` is kept with the spike for reproducible installs, and no dependency has install scripts.

## Running

The IDE used for this project exports `ELECTRON_RUN_AS_NODE=1`, so always launch through the scripts; they remove it.

```sh
npm ci --ignore-scripts && npx install-electron
npm run typecheck && npm run lint && npm test
node scripts/run-spike.mjs --spike=s1            # add --phase=... for s3 (create|reopen) and s5 (write|read)
env -u ELECTRON_RUN_AS_NODE npm run package      # macOS only, ad-hoc signed
node scripts/run-spike.mjs --packaged --spike=s1
node scripts/debug-port-check.mjs [--packaged]
```

Output goes to `out/` (git-ignored). Run S3 before S5: S3 `create` resets `user-data/keys/`, which also holds S5's raw `safeStorage` test file. Runs create Keychain items named `fqf-spike-m1 Safe Storage` and `fqf-spike-m1-packaged Safe Storage`; see the evidence README for cleanup.
