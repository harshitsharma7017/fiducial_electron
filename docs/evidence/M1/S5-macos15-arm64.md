# S5 — OS-backed secret storage (Electron safeStorage / macOS Keychain)

| | |
|---|---|
| Objective | Store and retrieve a random test secret through OS-backed storage; no plaintext in files or logs; behaviour when storage is unavailable; implications of identity, account, backup and key-store changes where testable (DM-02) |
| Date | 26 Oct 2026. First runs: development 13:57 UTC, packaged 13:58 UTC. Q-M1-01 vault runs 14:41 UTC. **Final runs after the internal review fixes: packaged 14:59 UTC, development 15:00 UTC (packaged cross-identity checks 15:01 UTC)** |
| Environment | Apple M4 (arm64), macOS 15.7.2, login keychain; Electron 45.0.0 |
| API | **Async** `safeStorage` (`isAsyncEncryptionAvailable`, `encryptStringAsync`, `decryptStringAsync`), behind the fail-closed `SecretStore` wrapper (`src/shared/secret-store.ts`) |
| Code | `src/main/spikes/s5-secure-storage.ts`, `src/shared/secret-store.ts`, `src/shared/tamper.ts`, `test/secret-store.test.ts`, `test/tamper.test.ts` |
| Status | **All S5 checks pass on macOS 15 arm64 only. Q-M1-01 is technically tested and awaiting independent security review (not approved).** Application secrets go through the authenticated vault, which rejected every tampering attempt ([Q-M1-01](Q-M1-01-secret-vault.md), [checklist](Q-M1-01-review-checklist.md)). Raw `safeStorage` still lacks integrity protection; that is kept as a recorded finding. *Before Q-M1-01 this spike was PARTIAL* |

## Commands

```sh
node scripts/run-spike.mjs --spike=s5 --phase=write && node scripts/run-spike.mjs --spike=s5 --phase=read
node scripts/run-spike.mjs --packaged --spike=s5 --phase=write && node scripts/run-spike.mjs --packaged --spike=s5 --phase=read
node scripts/run-spike.mjs --packaged --spike=s5 --phase=decrypt-foreign --foreign="$PWD/out/runs/dev/user-data/keys/s5-secret.enc"
security find-generic-password -s "fqf-spike-m1 Safe Storage"   # attributes only; the secret is never printed
```

## Expected vs actual

| Check | Expected | Actual (development and packaged) |
|---|---|---|
| `isAsyncEncryptionAvailable()` after `ready` | true | true |
| Availability **before** `ready` (sync and async probes) | (observation) | **`false` / `false`**: storage is genuinely unavailable early in startup |
| Ciphertext contains the secret | no | no (51 bytes, prefix `v10`) |
| Same-process round trip | equal | equal (`shouldReEncrypt: false`) |
| Ciphertext from the deprecated sync `encryptString()` decrypts with `decryptStringAsync()` (Electron 46 migration path) | yes | yes |
| Secret present in any file under userData, the output folder or the captured logs (write and read phases) | none | none |
| New process decrypts the stored secret (fingerprint match) | match | match |
| Single-bit-flipped ciphertext decrypts to the **original** secret | never (0/48) | **0/48** ✔ |
| **Every** single-bit-flipped raw ciphertext is **rejected** by `safeStorage` | 48/48 rejected | **✘ 21/48 rejected in both builds; the other 27 decrypted to corrupted values.** Now a *recorded fact* (`rawSafeStorageTamper`), not an acceptance check; integrity is enforced by the vault below |
| A different app identity (packaged app, own Keychain item) decrypts the development app's ciphertext | refused | refused (`SECRET_DECRYPT_FAILED`) |
| Keychain item actually created | login keychain entry | `svce = "fqf-spike-m1 Safe Storage"`, `acct = "fqf-spike-m1 Key"`; the packaged app has its own `fqf-spike-m1-packaged …` item |

## Q-M1-01 vault results (real `safeStorage`, development and packaged; final runs after the internal review fixes)

| Check | Result (both builds) |
|---|---|
| Three random secrets stored; read back in a new process; no plaintext in files, results or logs | pass |
| 170 single-byte envelope changes; 85 truncations; extended, version 2, moved and legacy-raw envelopes | **all rejected** |
| Wrapped data key flipped at each of 48 bytes through real `safeStorage` | **48/48 rejected**: 20 refused by `safeStorage`, **28 caught by the key-check value** (the cases raw `safeStorage` would have returned as garbage) |
| Files changed during failure tests; real vault after all tests | 0 changed; real vault byte-identical and readable |
| `put()` over an unreadable secret | refused (`SECRET_UNREADABLE_EXISTS`), file unchanged |
| Malformed or missing keyring; missing key | `KEYRING_MALFORMED` / `KEYRING_MISSING` / `KEY_NOT_FOUND` |
| Rotate, re-encrypt, prune, reopen | pass |
| Packaged identity opens a copy of the development vault | `KEY_UNWRAP_FAILED`, no file changed |

Full design, lifecycle, platform notes and limitations: [Q-M1-01-secret-vault.md](Q-M1-01-secret-vault.md).

## Findings

1. **Sync API removal.** The sync `safeStorage` methods are deprecated in Electron 45 and are documented for removal in Electron 46 (Electron 45 `breaking-changes.md`; runtime deprecation warnings observed). The product must use the async API from the start; this spike already does.
2. **No integrity protection.** `safeStorage` ciphertext (`v10`) on this Mac is **not integrity-protected**: most bit-flips produce silently corrupted plaintext rather than an error. This is consistent with an unauthenticated encryption mode. Chromium's source was **not** inspected, so the mechanism is inferred, not confirmed. Consequences:
   - The **database key** stays fail-closed, because SQLCipher rejects any wrong key (S3: 0/48 corrupted keys opened the database).
   - Any **other secret** stored with `safeStorage` alone (for example saved insurer credentials, P1-02) could be silently corrupted. **Resolved in the spike by Q-M1-01:** `safeStorage` now only wraps random data keys, which are verified by a key-check value, and secrets use AES-256-GCM. Tested above; the security review (DM-02) is still pending.
3. **Availability timing.** Storage reports unavailable before `app` is ready. Code must not read secrets before `ready` and must treat "unavailable" as fail-closed, never as "no secret stored".

## Scenarios: tested, simulated, not tested

| Scenario | Status | Result / expectation |
|---|---|---|
| Restart (new process) | **Tested** | Secret recovered |
| Secure storage unavailable | **Partly tested**: real pre-ready state observed; post-ready unavailability simulated in unit tests | `SecretStore` returns `SECRET_STORE_UNAVAILABLE` and never encrypts or writes plaintext (`test/secret-store.test.ts`) |
| Different app identity / different OS key (stands in for restoring data onto another machine or profile) | **Simulated** (packaged app vs development app) | Decryption refused. **Data copied or restored without the original Keychain item is unrecoverable** (AR-13) |
| Signing-identity change for the **same** app (same Keychain item, new code signature) | **Not tested**. Requires an interactive Keychain prompt; deliberately avoided in an unattended run | Expected: macOS asks the user to allow access; denial means decryption fails. Needs a supervised test and real signing identities (S6) |
| Different macOS user account | **Not tested** (no second account) | Expected: no access (per-user login keychain). Verify in a supervised test |
| Locked or reset login keychain; OS reinstall | **Not tested** (would disrupt the user's session) | Expected: unavailable or lost key, leading to fail-closed or loss of local history. Supervised test needed |
| Time Machine / backup restore to the same user | **Not tested** | Depends on whether the login keychain is restored with the data. Document in the install guide |

## Limitations and fallback

- **Platform-specific**: macOS Keychain only. **Windows DPAPI behaviour is untested** (including after a password change).
- The S6 signing work will also need to recheck Keychain access under a Developer ID identity.
- No fallback to plaintext exists by design. If secure storage is unreliable on a target, saved credentials (P1-02) stay disabled and the database cannot open, which needs a clear support message (Q-B09).
