# M1 Feasibility Evidence — index

| | |
|---|---|
| Milestone | M1 feasibility spikes ([IMPLEMENTATION_PLAN.md](../../../IMPLEMENTATION_PLAN.md) §9) |
| Date | 26 October 2026. Final evidence runs 14:57–15:01 UTC (20:27–20:31 IST), after the Q-M1-01 internal review fixes; earlier runs from 13:44 UTC were superseded. Per-run timestamps are in each `raw/*.json` (`startedAt`) |
| Branch | `spike/m1-feasibility`, created from `main` at `d853dbb`. Results are from the uncommitted working tree under review |
| Spike code | [`spikes/m1/`](../../../spikes/m1/). Throwaway experiment code, never to be merged into product `src/` |
| Run by | Claude Code (automated), on behalf of the project lead. No human tester was involved, and no visual check was made except the S4 render images |
| Data | Fictional mock data and random test secrets only. No real customer data, credentials, insurer portals or signing material |

## Test environment (the only platform tested)

| Item | Value |
|---|---|
| Hardware | Apple M4, arm64 (`process.arch`; not under Rosetta: `app.runningUnderARM64Translation = false`) |
| OS | macOS 15.7.2 (build 24G325), Darwin 24.6.0 |
| Electron | 45.0.0 (Chromium 156.0.8078.48, Node 24.22.0) |
| Host Node (tests and scripts) | 24.11.1, npm 11.6.2 |
| Xcode | Installed (`notarytool` and `stapler` present). **0 valid code-signing identities** |
| Shell environment | The IDE exports `ELECTRON_RUN_AS_NODE=1`. All launches remove it (see `spikes/m1/scripts/lib/launch.mjs`) |

**Nothing here says anything about Windows, Intel Macs or macOS 13.** Those platforms (M-13, M-X, W-10, W-11 in plan §9) have **not been tested**.

## Results summary

| Spike | Status (this Mac only) | Key result | Detail |
|---|---|---|---|
| S1 Electron and OS | **PASS** (macOS 15 arm64, dev and packaged) | Launches, renders a locked-down window, validated IPC, clean shutdown with no leftover processes | [S1](S1-macos15-arm64.md) |
| S2 Session isolation and debug port | **PASS** (macOS 15 arm64, dev and packaged) | Partitions fully isolated. Debug ports are closed **only with fuses**; the launch guard alone does not stop `--inspect`, `--inspect-brk` or `NODE_OPTIONS` | [S2](S2-macos15-arm64.md) |
| S3 Encrypted SQLite | **PASS** (macOS 15 arm64, dev and packaged) | SQLCipher v4 encryption verified on disk; native module works in the packaged, asar-integrity-checked app | [S3](S3-macos15-arm64.md) |
| S4 PDF ₹ rendering | **PASS** (macOS 15 arm64, dev and packaged) | ₹ extracted as U+20B9 from embedded Noto Sans. Regression test catches ■, ?, � and system-font fallback | [S4](S4-macos15-arm64.md) |
| S5 OS-backed secret storage | **PASS** (macOS 15 arm64, dev and packaged) after **Q-M1-01**, which is **technically tested and awaiting independent security review** | Keychain-backed storage works with no plaintext. Raw `safeStorage` is not integrity-protected (27/48 bit-flips decrypted to corrupted values), so application secrets now use an authenticated vault (AES-256-GCM, data keys wrapped by `safeStorage` and verified by a key check). **Every tampering attempt is rejected**, including 48/48 wrapped-key flips on real `safeStorage`. *Was PARTIAL before Q-M1-01* | [S5](S5-macos15-arm64.md), [Q-M1-01](Q-M1-01-secret-vault.md) |
| S6 Signing and notarisation | **BLOCKED** | No signing identities. The ad-hoc packaged app is `rejected` by Gatekeeper assessment | [S6](S6-signing-blocked.md) |

**M1 exit criteria are not yet met.** Plan §9 requires S1, S3, S4 and S5 on at least macOS arm64 **and one Windows x64 platform**. Windows has not been tested.

## New findings that affect the design

These come from actual runs, unless marked *documentary*.

1. **Synchronous `safeStorage` is deprecated in Electron 45 and scheduled for removal in Electron 46** (*documentary*: Electron 45 `breaking-changes.md`; *observed*: runtime deprecation warnings). The spike uses the async API. Ciphertext from the old sync `encryptString()` decrypted correctly with `decryptStringAsync()` (S5).
2. **`safeStorage` ciphertext is not integrity-protected** on this Mac (S5, S3). Flipping bits usually produces a silently corrupted value rather than an error. The encrypted database stays fail-closed because SQLCipher rejects any wrong key. **Addressed for application secrets by Q-M1-01** (authenticated vault, [design and evidence](Q-M1-01-secret-vault.md)); the security review is pending.
3. **Cookies are stored in plaintext without the `EnableCookieEncryption` fuse** (S2, development run); with the fuse they are stored only as `v10` ciphertext. The fuse is mandatory if DM-03 (persistent sessions) is adopted.
4. **The JavaScript launch guard cannot stop Node's inspector**: `--inspect`, `NODE_OPTIONS=--inspect` and `--inspect-brk` open a port before (or instead of) any app code running (S2, development run). Only the `EnableNodeCliInspectArguments` and `EnableNodeOptionsEnvironmentVariable` fuses closed them. `--remote-debugging-port` was stopped by the guard on this Mac, but the margin is a race (AR-16).
5. **`ELECTRON_RUN_AS_NODE` is a real, present risk**: the development IDE sets it, and an unfused Electron binary then runs arbitrary `-e` code as Node (exit 42 in S2). The `RunAsNode` fuse disabled this in the packaged build.
6. **`printToPDF` footer and header templates do not use the page's fonts** (S4): the page-number footer was drawn in Times-Roman. Branded or ₹-bearing content must stay in the page body.
7. **Packaging hygiene** (S3): packager pruning removes devDependency *modules* but not non-module folders (`.bin`, Vite caches). The spike's filter now drops them, but 17 empty scope directories remain. All eight platforms' SQLite prebuilds are shipped, which a product build should trim.
8. **Supply chain**: the initial pins `zod@4.6.5` and `vite@8.3.2` (copied from the team's other repos) had published advisories (GHSA-mrhx-c7xc-m3w5 for zod; six Vite and launch-editor advisories). The spike uses `zod@4.6.7` and `vite@8.3.4`; `npm audit` reports 0 vulnerabilities. The sibling repos were **not** modified; see the report.

## Reproducing

```sh
cd spikes/m1
npm ci --ignore-scripts      # no dependency has install scripts
npx install-electron         # Electron 45.0.0, verified against the package's bundled checksums
npm run typecheck && npm run lint && npm test

# Development binary
node scripts/run-spike.mjs --spike=s1
node scripts/run-spike.mjs --spike=s3 --phase=create && node scripts/run-spike.mjs --spike=s3 --phase=reopen
node scripts/run-spike.mjs --spike=s5 --phase=write  && node scripts/run-spike.mjs --spike=s5 --phase=read   # includes the Q-M1-01 vault
node scripts/run-spike.mjs --spike=s4 && node scripts/inspect-pdfs.mjs --run=dev
node scripts/run-spike.mjs --spike=s2 && node scripts/inspect-cookies.mjs --run=dev
node scripts/debug-port-check.mjs

# Packaged, fused, ad-hoc-signed binary (macOS arm64)
env -u ELECTRON_RUN_AS_NODE npm run package
node scripts/run-spike.mjs --packaged --spike=s1          # ...and every phase above, plus:
node scripts/run-spike.mjs --packaged --spike=s5 --phase=decrypt-foreign --foreign="$PWD/out/runs/dev/user-data/keys/s5-secret.enc"
node scripts/run-spike.mjs --packaged --spike=s5 --phase=vault-foreign --foreign="$PWD/out/runs/dev/user-data/secrets"
node scripts/debug-port-check.mjs --packaged
```

Results land in `spikes/m1/out/runs/{dev,packaged}/` (git-ignored). Sanitised copies are in [`raw/`](raw/).

**Run order:** S3 `create` resets `user-data/keys/`, which also holds S5's raw-`safeStorage` test file. Run S3 before S5; otherwise the packaged S5 `decrypt-foreign` phase fails with "file not found" (harness limitation, not a product issue).

## Side effects outside the repository (left in place, not deleted)

| Item | Created by | Cleanup when no longer needed |
|---|---|---|
| Login Keychain item `fqf-spike-m1 Safe Storage` (account `fqf-spike-m1 Key`) | Development runs (S3, S5, S2) | `security delete-generic-password -s "fqf-spike-m1 Safe Storage"` |
| Login Keychain item `fqf-spike-m1-packaged Safe Storage` | Packaged runs. Earlier copies were deleted before each repackage, to avoid an unattended Keychain prompt; the deletion during the Q-M1-01 review was **confirmed by the project lead** and targeted only this service and account. The current copy is from the final build | `security delete-generic-password -s "fqf-spike-m1-packaged Safe Storage"` |
| `~/Library/Preferences/local.fqf.spike.m1.plist` | macOS, for the packaged app's bundle ID | Delete the file |
| `~/Library/Application Support/fqf-spike-port-control/` | Positive-control fixture in the debug-port check | Delete the folder |
| `~/Library/Caches/electron/` (about 213 MB) | `install-electron` and packager downloads (standard Electron cache) | Optional |

## Sanitisation

Evidence contains no secrets, keys, cookie values, credentials or personal data. Secrets are represented only by a 16-hex-character SHA-256 prefix of a random test value. Cookie evidence lists names and lengths only. Home-directory paths are written as `~`. A scan of `docs/evidence/` for the local user name and for absolute home-directory paths found nothing.
