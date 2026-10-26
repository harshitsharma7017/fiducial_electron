# Q-M1-01 — Authenticated encryption for application secrets (security review package)

| | |
|---|---|
| Question | Should application secrets use `safeStorage` only to wrap random data keys, with authenticated encryption (AES-256-GCM) for the secrets themselves? |
| Trigger | M1 S5: raw `safeStorage` rejected only 21 of 48 single-bit tamperings on macOS; 27 decrypted to corrupted values |
| **Status** | **Technically tested on macOS 15 arm64 (development and packaged builds). Awaiting independent security review. Not approved.** DM-02 is likewise not approved. Windows is untested |
| Code | `spikes/m1/src/shared/vault/` (`envelope.ts`, `keyring.ts`, `vault.ts`, `errors.ts`, `atomic-write.ts`), `src/shared/secret-store.ts`, `src/main/spikes/s5-vault.ts`, `test/vault.test.ts` |
| Evidence date | 26 Oct 2026, final runs 14:57–15:01 UTC, after the internal review fixes in §8 |
| Reviewer checklist | [Q-M1-01-review-checklist.md](Q-M1-01-review-checklist.md) |

## 1. Threat model

**Assets:** insurer-portal credentials and other application secrets (P1-02); the data keys protecting them; the integrity of stored values.

| Actor / event | In scope? | Expected outcome |
|---|---|---|
| Copy of the user's data folder: backup, cloud sync, disk image, another OS account, lost unencrypted disk | **Yes** | Secrets stay confidential: data keys are wrapped by the OS key store |
| Corruption or tampering of vault files (bit rot, partial writes, editing by someone with file access) | **Yes** | Detected and refused. Plaintext is never corrupted silently, and files are never "repaired" or overwritten automatically |
| Crash or power loss during a write | **Yes** | Old or new file, never a torn one (see the durability limits in §7) |
| Two app instances, or two vault instances, on the same folder | **Partly** | Lost updates detected (`KEYRING_CONFLICT`). A small cross-process race window remains; the product must enforce a single instance |
| Malware or another process running **as the same OS user** | **No** (not defendable at this layer) | It can obtain secrets: on macOS subject to the Keychain ACL prompt, on Windows DPAPI does not bind to the app. See §7 |
| Attacker with admin/root, kernel or physical memory access | **No** | Out of scope |
| Rollback of the whole vault to an older valid state | **No** (not detected) | Older, authentic values return. See §7 |
| Insurer portal or network attacks | **No** (other controls) | — |

## 2. Security boundaries

1. **OS user account and OS key store.** These are the root of trust. Electron async `safeStorage` uses the login Keychain item `<app> Safe Storage` on macOS (observed) and DPAPI on Windows (untested).
2. **Main process only.** The vault runs in the Electron main process. **Secrets must never cross IPC to a renderer** (not yet enforced by product code; it is checklist item C-9).
3. **Vault folder** (`userData/secrets/`, mode 0700; files 0600). It holds only wrapped keys, key-check values, metadata and ciphertext.
4. **What `safeStorage` is *not* trusted for:** integrity. Every unwrapped key is verified independently (§3).

## 3. Design

### Key hierarchy

| Layer | What | Integrity |
|---|---|---|
| OS key (KEK) | Electron async `safeStorage` | **Not relied on** (measured as unauthenticated on macOS) |
| Data key (DEK) | 32 bytes from `crypto.randomBytes`, wrapped with `encryptStringAsync`, stored in `keyring.json` | Key-check value = HKDF-SHA256(DEK, info `fqf-vault:v1:key-check:<keyId>`), 16 bytes. On unwrap the result must be canonical base64 of 32 bytes and its check value must match (`timingSafeEqual`). Otherwise `KEY_CHECK_FAILED` |
| Encryption key | HKDF-SHA256(DEK, info `fqf-vault:v1:aes-256-gcm`), zero-filled after each use | Separate derivation from the check value |
| Secret | AES-256-GCM (Node `crypto`: OpenSSL / BoringSSL), 96-bit nonce, 128-bit tag | GCM tag over ciphertext and AAD |

### Envelope v1

`"FQSE"` · version 1 · algorithm 1 · key-id length · key id · nonce(12) · ciphertext · tag(16).

- **AAD** = header (magic through nonce) ‖ `0x00` ‖ `fqf-secret:v1:<name>`. The header is self-delimiting and names cannot contain NUL.
- **Strict parse first:** magic, version, algorithm, key-id length and charset, minimum and maximum lengths (16 KiB plaintext).
- **Tag length pinned** (`authTagLength: 16`).
- **Plaintext released only after `final()` verifies the tag.** Unverified and intermediate buffers are zero-filled. Strict UTF-8 decoding.
- **Input validation:** values containing lone UTF-16 surrogates are rejected (`INVALID_VALUE`) rather than silently converted to U+FFFD.

### Nonces and rotation

- Every encryption uses a fresh 96-bit nonce from the CSPRNG.
- Each key's encryption counter is incremented and committed **before** the key is used, and the key rotates automatically at **2^20**. The collision bound per key is about 2^40 / 2^97 = 2^-57, well inside NIST SP 800-38D's limit of 2^32 random-nonce invocations.
- **Rotation cannot cause nonce reuse:** each key is new and random, and nonces are random rather than counter-based, so a counter rollback (for example a restored backup) does not repeat nonces.
- **Rotation cannot silently lose secrets:**
  - Retired keys keep decrypting.
  - Re-encryption touches only readable secrets.
  - Pruning removes only retired keys that no parseable envelope references, and removes nothing if any envelope fails to parse.
  - The keyring holds at most 16 keys; a further rotation is refused (`KEYRING_FULL`) instead of writing a keyring that would no longer load.

### Key lifecycle

| Event | Behaviour |
|---|---|
| First use | Keyring created by **exclusive create** (hard link, which fails if the file exists), and only when no envelopes exist |
| Normal write | Counter committed, then the envelope written atomically |
| Usage cap reached | Automatic rotation inside `put()` |
| Planned rotation / suspected compromise | `rotateKey()` → `reencryptAll()` → `pruneRetiredKeys()` (insurer credentials must also be changed at the insurer) |
| OS asks for a re-wrap (`shouldReEncrypt`) | Verified DEK re-wrapped **in memory only**; saved with the next explicit write. Reads never write |
| OS key store lost | Secrets unrecoverable (no escrow). User recovery: explicit quarantine, then re-enter credentials |

## 4. Failure handling and storage invariants

| Invariant | How it is enforced | Tested by |
|---|---|---|
| Reads never write (`open` of an existing vault, `get`, `list`) | No write calls on those paths; re-wraps deferred | Unit: R3 (randomised wrapper, snapshot), byte-identical files after failed reads; Electron: `wrapped-key-tamper-no-writes`, `real-store-untouched` |
| Keyring changes are all-or-nothing | Every change is staged on a copy, schema-validated, conflict-checked, written atomically, and only then made live | Unit: R7 (failed rotation leaves the live vault unchanged) |
| Another writer's keyring is never overwritten | On-disk text must equal the last text this instance read or wrote, otherwise `KEYRING_CONFLICT` | Unit: R1 |
| Initialisation never overwrites | `atomicCreate` (link → `EEXIST` → `KEYRING_CONFLICT`); `KEYRING_MISSING` if envelopes exist | Unit: R2, keyring-missing test |
| Unreadable secrets need explicit overwrite | `SECRET_UNREADABLE_EXISTS` unless `overwriteUnreadable: true` | Unit and Electron |
| Reset is explicit and recoverable | Confirmation token; files **moved** into a new unique `quarantine/<timestamp>-<random>/` folder (creation fails rather than reusing one); a restored copy opens and reads | Unit: reset test, R6 |
| Durable writes | Temporary file + `fsync` + rename (or link) + directory `fsync` (POSIX) | Code review only (crash testing not done) |
| Operations on one instance do not interleave | `put`, `rotateKey`, `reencryptAll` and `pruneRetiredKeys` run through a per-instance queue | Code review; R1 covers cross-instance |
| No logging | No `console` or logger calls; fixed error messages | Unit: every test asserts that no `console` method was called |

Error codes: `SECRET_STORE_UNAVAILABLE`, `KEYRING_MISSING`, `KEYRING_MALFORMED`, `KEYRING_CONFLICT`, `KEYRING_FULL`, `KEY_NOT_FOUND`, `KEY_UNWRAP_FAILED`, `KEY_CHECK_FAILED`, `ENVELOPE_MALFORMED`, `ENVELOPE_UNSUPPORTED_VERSION`, `ENVELOPE_UNSUPPORTED_ALGORITHM`, `SECRET_AUTH_FAILED`, `SECRET_NOT_FOUND`, `SECRET_UNREADABLE_EXISTS`, `INVALID_NAME`, `INVALID_VALUE`, `RESET_NOT_CONFIRMED`, `STORAGE_ERROR`.

**Recovering from quarantine:** close the app, move the contents of `quarantine/<folder>/` back into `secrets/` (after moving the current files aside), and reopen. This succeeds only if the original OS key is available again (for example, the keychain was unlocked or restored).

## 5. Platform-specific behaviour and results

| | macOS 15.7.2 arm64 (**tested**) | Windows 10/11 x64 (**not tested**) |
|---|---|---|
| OS facility | Login Keychain `<app> Safe Storage` / `<app> Key` (observed) | DPAPI, per user |
| Raw `safeStorage` integrity | **21/48 tamperings rejected** (measured) | Unknown. The design does not depend on it |
| App binding | Keychain ACL tied to the code signature; other apps or identities get a prompt or are denied | **None**: any process running as the user can call DPAPI. A weaker same-user boundary than macOS |
| Loses access when | Keychain reset, a different user or machine, a signing-identity change if access is denied | Profile loss, a different user or machine, an admin **reset** of the user's password |
| Unavailable when | Before `app` `ready` (observed: `false`), locked keychain (untested) | Before `ready`; roaming or locked-down profiles (to verify) |
| `atomicCreate` (hard link) | Works on APFS (tested) | Expected to work on NTFS; **fails on FAT/exFAT and some network shares**, giving `STORAGE_ERROR` (fail closed). To verify |
| Directory `fsync` | Done, but macOS `fsync` is not a full device flush (`F_FULLFSYNC` is not available in Node) | Skipped (not supported). NTFS metadata journaling relied on |

## 6. Test evidence (final runs)

**Automated suite:** 84 tests in 11 files pass (`npm test`), including 32 vault tests in `test/vault.test.ts`:

- 25 original tests;
- 7 regression tests (R1–R7) for the defects found in internal review. **R1, R2 and R4–R7 failed against the pre-fix code** and pass now. **R3 passed against the pre-fix code**: its deterministic fake wrapper hid the write. The defect was found by code review; the test was then strengthened (random-IV wrapper, plus a check that the deferred re-wrap is saved later) but was **not re-run against the pre-fix code**.

**Scope of the tests:**
- **Unit tests** drive the real `SecretVault`, envelope and keyring code. Only the OS key store is faked, and deliberately as an **unauthenticated, randomised-IV** wrapper that mimics the measured macOS behaviour.
- **Electron runs** use real macOS `safeStorage` in development and packaged builds.

| Electron check (real `safeStorage`) | Development | Packaged (fused, ad-hoc signed) |
|---|---|---|
| Three random secrets stored; no plaintext in userData, results or logs | pass | pass |
| New process reads all three (fingerprints match) | pass | pass |
| Envelope single-byte changes (85 bytes × 2 masks) | **170/170 rejected** | **170/170 rejected** |
| Truncations (every length) | **85/85 rejected** | **85/85 rejected** |
| Extended / version 2 / moved / legacy raw blob | `SECRET_AUTH_FAILED` / `ENVELOPE_UNSUPPORTED_VERSION` / `SECRET_AUTH_FAILED` / `ENVELOPE_MALFORMED` | same |
| **Wrapped data key, each of 48 bytes flipped** | **48/48 rejected** (20 `KEY_UNWRAP_FAILED`, **28 `KEY_CHECK_FAILED`**) | **48/48** (same split) |
| Files changed during those trials; real vault after all tests | 0; byte-identical and readable | same |
| Malformed / missing keyring; missing key | `KEYRING_MALFORMED` / `KEYRING_MISSING` / `KEY_NOT_FOUND` | same |
| `put()` over an unreadable secret | refused, file unchanged | same |
| Rotate → re-encrypt → prune → reopen → read | pass | pass |
| Different app identity opens a copy of the development vault | — | `KEY_UNWRAP_FAILED`, no file changed |
| *Raw `safeStorage` tamper (recorded fact, not a vault check)* | *21/48 rejected, 27 corrupted values* | *same* |

**OS-level vs vault-level:** the raw result shows that the OS layer does **not** provide integrity. The 28 `KEY_CHECK_FAILED` results are exactly the OS-level silent corruptions, now caught by the vault. Corruption tests demonstrate fail-closed handling of *accidental and unauthorised modification*. **They do not prove the design secure against every attack** (see §1 and §7).

## 7. Known limitations and risk status

**No risk below has been accepted.** "Proposed" means the technical recommendation submitted for the reviewer's decision.

| # | Limitation | Assessment | Status |
|---|---|---|---|
| L1 | **Rollback** to an older valid vault (backup restore or deliberate replacement) is not detected | Brings back older authentic values (for example a superseded password, causing a failed login, not disclosure). A durable anchor would need a monotonic counter stored outside the file system, such as a native Keychain/DPAPI item that `safeStorage` cannot provide | **Unresolved.** Proposed: accept for v1 (local single-user threat model) |
| L2 | **Keyring metadata** (counters, statuses, `activeKeyId`, `createdAt`) is not authenticated | Editing it can block access (denial of service) or lower counters. It cannot produce a usable key, and nonces stay random. Could be closed with an HMAC over the keyring under a key derived from the active DEK | **Unresolved.** Proposed: add the keyring HMAC in M4, or accept |
| L3 | **Same-OS-user access** | Inherent. Weaker on Windows (DPAPI has no app binding) than macOS (Keychain ACL) | **Unresolved, inherent.** Proposed: accept and document; require OS account security in the install guide |
| L4 | **Memory wiping** is best effort | Buffers are zeroed, but JS strings (the base64 key from `safeStorage`, secret values returned to callers) and GC copies cannot be wiped | **Unresolved, inherent to JS/Electron.** Proposed: accept; keep secrets in the main process only |
| L5 | **Loss of the OS key store** means the secrets are lost | No escrow by design. Quarantine preserves files for later recovery if the key returns | **Unresolved.** Decision needed: no escrow (proposed) or a recovery key |
| L6 | **Concurrent writers** across processes | The conflict check narrows but cannot close the window between check and rename | **Unresolved.** Proposed: mandatory Electron single-instance lock (M2) |
| L7 | **Durability on power loss** | Directory `fsync` added; macOS lacks `F_FULLFSYNC` from Node; crash tests not performed | **Unresolved.** Proposed: accept; atomic rename still prevents torn files |
| L8 | **Leftover temporary files** after a crash (`.<name>.<random>.tmp`) | Contain ciphertext or keyring only; ignored by the vault; never cleaned up | **Unresolved.** Proposed: clean up on open in M4 |
| L9 | **Quarantine retention** | Quarantined files hold wrapped keys and ciphertext (as protected as the live vault) but accumulate indefinitely. They must be covered by retention, "delete my data" and uninstall | **Unresolved** (Q-B06 retention period; PO and security reviewer) |
| L10 | **Evidence fingerprints** | Spike evidence records 64-bit SHA-256 prefixes of *random* test secrets. For real, low-entropy passwords such fingerprints would enable guessing | Product must never log fingerprints of real secrets (checklist C-11) |
| L11 | **Not independently reviewed or crash/fuzz tested** | Standard primitives, custom composition | **Open:** this review |

### Specific questions assessed

| Question | Technical assessment | Recommendation (for decision) |
|---|---|---|
| Should the SQLCipher database key use the vault? | Today it is fail-closed via SQLCipher page authentication but reports corruption as `SQLITE_NOTADB`. Moving it under the vault gives one key lifecycle and clearer errors, but couples database availability to the vault | Keep it separate for M1 (as required); **decide in M4**. Leaning: move it under the vault for diagnostics |
| Is 2^20 encryptions per key appropriate? | Gives about 2^-57 collision probability. The app writes a handful of secrets per year, so it is a safety rail that is never reached in practice. Any value up to about 2^28 keeps risk below 2^-41 | Keep 2^20 (conservative, no cost) |
| Is time-based rotation necessary? | Not cryptographically required at these volumes. A DEK is only exposed if the OS user is compromised, and then all secrets are exposed anyway | Rotate on events only (cap, OS key change, suspected compromise); no schedule for v1 |
| Quarantine retention and cleanup | Needed for privacy and disk hygiene | Delete quarantines after the approved retention period or on explicit user request; include them in the data-deletion and uninstall flows |

## 8. Internal review findings (26 Oct 2026) and fixes

A code review of the first implementation found the following. Each finding has a regression test. R1, R2 and R4–R7 were reproduced as failing tests before the fix; R3 was found by code review (its first test version could not detect it).

| # | Finding | Severity | Fix |
|---|---|---|---|
| R1 | Two vault instances on one folder could overwrite each other's keyring; **a rotated key could be lost, stranding secrets** | **High** (silent data loss) | Staged, conflict-checked commits (`KEYRING_CONFLICT`) |
| R2 | Keyring creation used a replacing rename; a concurrent initialiser's keyring could be overwritten | High | Exclusive create via hard link (`KEYRING_CONFLICT`) |
| R3 | `get()` could write the keyring when the OS requested a re-wrap, contradicting "reads never write". **The original test missed it** because the fake wrapper was deterministic | Medium | Re-wraps deferred to the next explicit write; fake wrapper now uses random IVs so such writes are visible (strengthened test not re-run against the pre-fix code) |
| R4 | Rotation did not enforce the 16-key schema limit; a 17th key bricked the vault on the next open | Medium | `KEYRING_FULL`; every candidate keyring is schema-validated before writing |
| R5 | Lone UTF-16 surrogates were silently stored as U+FFFD | Low | `INVALID_VALUE` |
| R6 | Two resets in the same millisecond shared a quarantine folder; `rename` could overwrite earlier quarantined files | Low | Unique folder with a random suffix; non-recursive creation |
| R7 | A failed rotation left the in-memory keyring changed | Low | Staged commit; live state replaced only after a successful write |
| H1 | No directory `fsync` after rename | Hardening | Added (POSIX) |
| H2 | Derived AES keys and plaintext buffers were not zeroed | Hardening | Zeroed after use |
| H3 | Concurrent async operations on one instance could interleave (double rotation) | Hardening | Per-instance operation queue |
| T1 | Spike harness: S3 `create` resets `userData/keys/`, which also holds S5's raw-`safeStorage` file, so running S3 after S5 breaks S5 `decrypt-foreign` | Harness only | Documented run order (S3 before S5); not a vault issue |

## 9. Migration

- **Product:** none. There is no product data, and envelope v1 is the first format.
- **Spike:** old raw-`safeStorage` blobs are rejected as `ENVELOPE_MALFORMED`.
- **Future formats:** a new version byte, with an explicit migration (decrypt with the old reader, verify, re-encrypt, write atomically).
- Only the async `safeStorage` API is used (Electron 46 ready).

## 10. Questions requiring the reviewer's decision

1. Approve, change or reject the design for the product (Q-M1-01, DM-02).
2. L1 rollback: accept for v1, or require an anti-rollback anchor?
3. L2 keyring metadata: add an HMAC in M4, or accept?
4. L3 same-user access, especially weaker on Windows: accept with documentation?
5. L5 recovery: no escrow, or a recovery key?
6. L6: make the single-instance lock a release requirement?
7. Per-key cap (2^20) and event-only rotation: confirm?
8. Should the SQLCipher key move under the vault (M4)?
9. Quarantine retention period and deletion rules (with the PO, Q-B06)?
10. What evidence is required on Windows before approval?
