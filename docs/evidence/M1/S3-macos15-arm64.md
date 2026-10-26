# S3 — Encrypted SQLite and native-module packaging

| | |
|---|---|
| Objective | An encrypted SQLite database can be created, written, read, closed and reopened; encryption is actually enabled; the key is neither hard-coded nor stored in plaintext; the native module works in a packaged app (DM-02 option B, E-03) |
| Date | 26 Oct 2026 (development 13:57 UTC; packaged 13:58 UTC) |
| Environment | Apple M4 (arm64), macOS 15.7.2; Electron 45.0.0; host Node 24.11.1 for the unit tests |
| Library | `better-sqlite3-multiple-ciphers` 13.0.3 (SQLite3MultipleCiphers). Configured with `cipher='sqlcipher'` and `legacy=4` (SQLCipher v4 format); key passed as a 32-byte random `Buffer` via `db.key()`, so it never appears in SQL text |
| Key handling | Random 256-bit key from `crypto.randomBytes`, wrapped with **async** `safeStorage.encryptStringAsync`, stored in `userData/keys/db.key.enc` (mode 0600). The database is in a separate `userData/data/` directory |
| Code | `src/shared/sqlite-core.ts`, `src/main/spikes/s3-sqlite.ts`, `src/shared/tamper.ts`, `test/sqlite-encryption.test.ts` |
| Status | **PASS on this platform only** (create 10/10 and reopen 7/7 in both builds; 4/4 Node unit tests) |

## Commands

```sh
node scripts/run-spike.mjs --spike=s3 --phase=create && node scripts/run-spike.mjs --spike=s3 --phase=reopen
node scripts/run-spike.mjs --packaged --spike=s3 --phase=create && node scripts/run-spike.mjs --packaged --spike=s3 --phase=reopen
npm test   # includes test/sqlite-encryption.test.ts under plain Node
```

"Reopen" runs in a **new process**, so persistence and key unwrapping survive an app restart.

## Expected vs actual

| Check | Expected | Actual (development and packaged) |
|---|---|---|
| `PRAGMA cipher` | `sqlcipher` | `sqlcipher` |
| Write and read a row (random marker string) | marker returned | returned |
| Foreign keys enforced | yes | yes |
| File starts with the plaintext header `SQLite format 3\0` | no | no |
| Marker string readable in database bytes (open and after close) | no | no |
| Marker string readable in the `-wal` file (WAL mode) | no | no |
| Raw key (bytes, hex or base64) present in any file under userData or the output folder | none | none |
| Wrapped key outside the database directory | yes | `keys/db.key.enc` vs `data/spike.db` |
| New process unwraps the key and reads the row; `PRAGMA integrity_check` | marker, `ok` | marker, `ok` |
| Random wrong key / no key | `SQLITE_NOTADB` | `SQLITE_NOTADB` / `SQLITE_NOTADB` |
| **Every** single-bit-flipped wrapped key (48 positions) opens the database | 0 | **0** (see note) |
| Positive control: an unencrypted database with the same content shows header and marker | both visible | both visible |
| Native module loaded | one `.node` | `prebuilds/darwin-arm64.node` |

**Note on the tamper result.** `safeStorage` itself rejected only 20 of the 48 bit-flipped wrapped keys in both builds; the other 28 "decrypted" to corrupted values. None of those values opened the database, because SQLCipher authenticates its pages, so the database stays **fail-closed**. See S5 for what this means for other secrets.

## Packaged app

- `asar: { unpack: '**/*.node' }`. The prebuilt binaries live in `Contents/Resources/app.asar.unpacked/...`. Electron resolved the `require` of `app.asar/.../darwin-arm64.node` to the unpacked copy, with `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` enabled.
- No rebuild was needed. The package ships N-API prebuilds, which are ABI-stable across Node and Electron.
- The packaged `app.asar` contains only the production packages `better-sqlite3-multiple-ciphers`, `node-addon-api` and `zod`, plus `dist/` and `resources/` (`raw/packaged/asar-contents-summary.txt`).

## Limitations and fallback

- **Platform-specific**: macOS arm64 only. The `darwin-x64` and `win32-x64` prebuilds are shipped but **untested**.
- Universal macOS builds were not tried.
- The macOS app is ad-hoc signed. Developer ID signing of the unpacked `.node` file is part of S6 (blocked).
- All eight platforms' prebuilds are packaged; a product build should ship only the target's.
- Opening with a wrong key takes about 100 ms (SQLCipher v4 key derivation). This is fine for normal use, but recovery tooling should not brute-force.
- **Fallbacks:** if the ciphers variant fails on a target, re-open DM-02 (option A uses plain `better-sqlite3` with full-disk encryption as a prerequisite). If a prebuild is missing, build from source with `@electron/rebuild`.
