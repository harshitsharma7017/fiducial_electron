# Q-M1-01 secret vault — security review checklist

For the independent security reviewer. Background, threat model and evidence: [Q-M1-01-secret-vault.md](Q-M1-01-secret-vault.md). Code: `spikes/m1/src/shared/vault/`.

**Status at handover:** technically tested on macOS 15 arm64 only. **Not approved.** No limitation has been accepted.

## A. Cryptography (code review)

- [ ] C-1 AES-256-GCM via Node `crypto`; `authTagLength: 16` pinned on encrypt and decrypt (`envelope.ts`)
- [ ] C-2 Plaintext is returned only after `decipher.final()` succeeds; partial output is zeroed on failure (`openEnvelope`)
- [ ] C-3 AAD = full header (magic through nonce) ‖ `0x00` ‖ `fqf-secret:v1:<name>`; the header is parsed strictly before use
- [ ] C-4 Fresh 96-bit CSPRNG nonce per encryption; counter committed before use; rotation at 2^20 (`vault.ts` `putUnlocked`)
- [ ] C-5 HKDF-SHA256 domain separation: encryption key and key-check value use different `info` strings; the check value is bound to the key id
- [ ] C-6 Unwrapped keys must be canonical base64 of 32 bytes and match the check value via `timingSafeEqual` (`keyring.ts`)
- [ ] C-7 Error messages are fixed strings; no logging anywhere in `vault/`

## B. Storage invariants (code review and tests)

- [ ] S-1 Reads (`open` of an existing vault, `get`, `list`) never write; OS re-wraps are deferred (test R3)
- [ ] S-2 Keyring changes are staged, schema-validated, conflict-checked and atomic; the live state changes only after success (R1, R7)
- [ ] S-3 Initialisation uses an exclusive create and is refused while envelopes exist (R2, `KEYRING_MISSING` test)
- [ ] S-4 Unreadable secrets need `overwriteUnreadable: true` to be replaced
- [ ] S-5 Reset requires the confirmation token, moves files into a unique quarantine folder, and a restored quarantine opens (R6)
- [ ] S-6 Atomic writes: temporary file + `fsync` + rename/link + directory `fsync`; file mode 0600, folder 0700
- [ ] S-7 Key cap of 16 enforced (`KEYRING_FULL`) (R4)

## C. Integration rules for the product (not yet implemented; confirm as requirements)

- [ ] C-8 One vault instance per folder: the Electron single-instance lock is mandatory (L6)
- [ ] C-9 Vault in the main process only; **secrets never sent over IPC to any renderer**
- [ ] C-10 The UI requires explicit user action before `quarantineAndReset`; quarantines are covered by retention, data deletion and uninstall
- [ ] C-11 Never log or persist fingerprints, lengths or prefixes of real secrets
- [ ] C-12 Use the async `safeStorage` API only (sync API removed in Electron 46)

## D. Evidence to verify

- [ ] E-1 `npm test` in `spikes/m1`: 84 tests in 11 files pass (32 in `test/vault.test.ts`)
- [ ] E-2 Tamper tests call the real `SecretVault`; only the OS layer is faked, as an unauthenticated, random-IV wrapper
- [ ] E-3 Electron evidence (`docs/evidence/M1/raw/{dev,packaged}/s5-read.json`): envelope 170/170, truncations 85/85, wrapped key 48/48 rejected; 0 files changed; real store byte-identical
- [ ] E-4 Raw `safeStorage` (`rawSafeStorageTamper`): 21/48 rejected. This confirms the OS layer is not relied on for integrity
- [ ] E-5 The packaged app was built from the reviewed source (fuses verified: `raw/packaged/fuses.txt`)

## E. Decisions required (record outcome, name and date)

| # | Decision | Proposed | Outcome |
|---|---|---|---|
| 1 | Approve the design for the product (Q-M1-01 / DM-02) | — | |
| 2 | L1 rollback not detected | Accept for v1 | |
| 3 | L2 keyring metadata not authenticated | Add HMAC in M4 | |
| 4 | L3 same-user access (weaker on Windows) | Accept, document | |
| 5 | L5 no escrow | No escrow | |
| 6 | L6 single-instance lock as a release gate | Yes | |
| 7 | 2^20 per-key cap; event-only rotation | Yes | |
| 8 | SQLCipher key under the vault | Decide in M4 | |
| 9 | Quarantine retention (with PO, Q-B06) | Retention-period deletion | |
| 10 | Windows evidence required before approval | S5 + vault on Windows 10/11 x64 | |

## F. Not covered by current evidence

Windows (DPAPI, NTFS hard links, FAT/exFAT behaviour), Intel Mac, macOS 13, locked keychain, signing-identity change, a second OS user, crash and power-loss testing, fuzzing, and an independent code review.
