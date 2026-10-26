# S6 — Code signing and notarisation

| | |
|---|---|
| Objective | Signed Windows and macOS artefacts install and launch cleanly on clean machines (FR-19, REL-04, REL-05) |
| Date | 26 Oct 2026 |
| Environment checked | Apple M4, macOS 15.7.2. Xcode installed at `/Applications/Xcode.app` (`notarytool`, `stapler` and `codesign` present) |
| Status | **BLOCKED.** No signing identities are available. **Nothing was signed or notarised, and nothing in this document claims that signing works** |

## What was checked

| Command | Result |
|---|---|
| `security find-identity -v -p codesigning` | `0 valid identities found` |
| `codesign -dv --verbose=2 <packaged app>` | `Signature=adhoc`, `TeamIdentifier=not set` (`raw/packaged/codesign.txt`) |
| `codesign --verify --deep --strict <packaged app>` | Passes (ad-hoc signature is internally consistent) |
| `spctl -a -vvv -t exec <packaged app>` | **`rejected`**: Gatekeeper would not open this build for a user who downloaded it |

## Prerequisites (owners: Q-D04, Q-D05)

**macOS**
- An Apple Developer Program membership, preferably an organisation account so the publisher name is the firm (this requires a D-U-N-S number).
- A Developer ID Application certificate.
- Notarisation credentials: an App Store Connect API key or an app-specific password, held in approved secure storage and never committed.
- A clean Mac at the proposed floor (macOS 13), plus an Intel Mac.

**Windows**
- An OV or EV code-signing certificate on a hardware token or cloud HSM (CA/B Forum rules require hardware-protected keys), or a cloud signing service if the organisation is eligible.
- `signtool` on a Windows build machine.
- Clean Windows 10 22H2 and 11 x64 machines.

**Both**
- A named owner for each identity and its renewal (Q-D04, Q-D05).
- A written decision on whether UAT may use unsigned builds (AR-14).

## Planned verification (to run once identities exist)

**macOS**
1. Sign with hardened runtime and minimal entitlements, including the unpacked `*.node` native module.
2. Run `codesign --verify --deep --strict` and `codesign -dv` (Team ID present).
3. Submit with `xcrun notarytool submit … --wait`, then `xcrun stapler staple`.
4. Run `spctl -a -vvv -t exec` (expect "accepted", source "Notarized Developer ID").
5. Copy the app to a clean Mac via a quarantining download and confirm the first launch has no override.
6. Re-run S1, S3 and S5 on the signed build. S5 also covers Keychain behaviour when moving from ad-hoc to Developer ID and between two builds with the same identity (supervised, because a prompt may appear).

**Windows**
1. Sign the app executable and the NSIS installer.
2. Run `signtool verify /pa /v`.
3. Install on clean Windows 10 and 11 and **record** the SmartScreen outcome without assuming it.
4. Re-run S1, S3, S4 and S5.

**Fuses**
- Confirm `npx @electron/fuses read` after signing (fuses must be flipped *before* the final signature).
- Confirm asar integrity is still validated.

## Fallback

Until identities exist, only unsigned or ad-hoc builds can be produced:

- **macOS:** they fail Gatekeeper assessment, as observed above.
- **Windows:** expect an "unknown publisher" warning.

If UAT must start before signing, it needs written client acceptance and documented install steps. A production release waits for signing.
