# S4 — PDF generation and ₹ rendering

| | |
|---|---|
| Objective | A generated PDF contains a correctly rendered, extractable ₹ (U+20B9) with representative amounts and punctuation, using a properly licensed bundled font; an automated regression test fails if ₹ is replaced (DM-08, FR-13, TC-17) |
| Date | 26 Oct 2026 (development 13:55 UTC; packaged 13:58 UTC; the `npm test` regression run is repeated at the end of M1) |
| Environment | Apple M4 (arm64), macOS 15.7.2; Electron 45.0.0 `webContents.printToPDF`; pdf.js (`pdfjs-dist` 6.4.299) for extraction in tests |
| Code | `src/main/spikes/s4-pdf.ts`, `src/shared/s4-content.ts`, `src/shared/rupee-check.ts`, `src/shared/ttf.ts`, `scripts/lib/pdf-inspect.mjs`, `test/rupee-pdf.test.ts`, `test/rupee-check.test.ts`, `test/font.test.ts` |
| Status | **PASS on this platform only** |

## Font and licence (verified against the actual files)

| File | Source | SHA-256 | Licence evidence |
|---|---|---|---|
| `NotoSans-Regular.ttf` | `notofonts/notofonts.github.io`, `fonts/NotoSans/hinted/ttf/` | `478c558e…f3823` | Git blob SHA matched the GitHub API (`f27f4ff5…`). Font `name` table ID 13 states the SIL Open Font License 1.1, ID 14 gives the OFL URL (asserted in `test/font.test.ts`) |
| `NotoSans-Bold.ttf` | same | `1df075a3…7a913` | Blob SHA matched (`aae7546d…`); same name-table checks |
| `OFL.txt` | `fonts/LICENSE` in the same repository | `f2095b08…51bd8` | "SIL OPEN FONT LICENSE Version 1.1", copyright The Noto Project Authors |

Both fonts map U+20B9 to a real glyph (own `cmap` parser, `test/font.test.ts`). The OFL permits bundling and embedding, but the licence text must be shipped alongside the fonts. **Legal confirmation that the OFL is acceptable is the business's call** (Q-D09).

## Method

1. Render three variants of the same fictional report with `printToPDF`. Each uses a hidden window with JavaScript disabled, a non-persistent session, and a request filter blocking everything except `file:`.
   - `bundled-font`: Noto Sans through `@font-face`, no fallback family.
   - `control-substituted-glyph`: same, with ₹ replaced by ■, simulating the defect seen in the doc pack.
   - `control-system-font`: no bundled font (Helvetica stack).
2. Extract text runs and embedded font names with pdf.js. pdf.js 6 needs `fontExtraProperties: true` to expose font names.
3. Check:
   - every expected string (8 premiums such as `₹1,23,456.00`, `₹12,34,56,789.99`, `₹0.50`, plus a punctuation line with — " ( ) ; @ % / & ’ !) is present;
   - no ■, □, � or NUL appears, and no `?` directly precedes a digit;
   - **every ₹ run is drawn with an embedded font named `*NotoSans*`**.

## Commands

```sh
node scripts/run-spike.mjs --spike=s4 && node scripts/inspect-pdfs.mjs --run=dev
node scripts/run-spike.mjs --packaged --spike=s4 && node scripts/inspect-pdfs.mjs --run=packaged
npm test        # test/rupee-pdf.test.ts launches Electron, generates the PDFs and runs the checks
qlmanage -t -s 1400 -o . bundled-font.pdf control-substituted-glyph.pdf   # visual check
```

## Expected vs actual (identical in development and packaged builds)

| Variant | Text problems | Font problems | Expected |
|---|---|---|---|
| `bundled-font` | **none** | **none** (₹ runs in `BAAAAA+NotoSans-Regular`, embedded) | pass |
| `control-substituted-glyph` | 11 (no U+20B9, U+25A0 present, expected strings missing) | no ₹ run | detected ✔ |
| `control-system-font` | none (macOS Helvetica has ₹) | **₹ drawn with `CAAAAA+Helvetica`** | detected ✔ |

- `printToPDF` time: 77–83 ms for a one-page report (target under 5 s, `01 §11`); PDF size about 38 KB.
- No network requests were attempted.
- Text is selectable (it was extracted as text).
- **Visual inspection:** `raw/dev/s4-bundled-font-render.png` shows ₹ rendered correctly in Noto Sans with all punctuation intact. `raw/dev/s4-control-substituted-glyph-render.png` shows the ■ defect.

## Regression test

`test/rupee-pdf.test.ts` (4 tests) plus the unit tests in `test/rupee-check.test.ts`, which cover ■, □, �, `?`, a missing symbol, the "Rs." substitution, whitespace tolerance, and fallback or non-embedded fonts. **The system-font control shows the font assertion is essential:** a text-only check would pass on a Mac even if the bundled font failed to load.

## Findings

- **The `printToPDF` footer does not use page fonts.** The page-number footer was embedded as Times-Roman. Branded text and any ₹ must stay in the page body, not in `headerTemplate`/`footerTemplate`.
- Only one-page output and one layout were tested. The 1/2/4/8-insurer layouts, pagination and long-name wrapping are M7 work (TC-15, TC-16).

## Limitations and fallback

- **Platform-specific**: macOS arm64 only. **Windows rendering of ₹ (TC-17) is untested**, and that is where system-font fallback differs most.
- Fallback if Noto Sans is rejected: another OFL font with U+20B9 (e.g. Noto Sans Devanagari). The client brand font may be used only if its licence permits embedding (DM-08).
