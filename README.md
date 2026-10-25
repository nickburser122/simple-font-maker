# Handwriting Font Maker

Turn your handwriting into an installable font. Everything runs in the browser tab: photos are never uploaded.

1. **Print** a template sheet (basic, extended or Latin character set; A4 or Letter).
2. **Capture** each filled-in sheet with a photo or scan. Corners are found from the printed markers and the page number from a small printed code.
3. **Refine** the traced glyphs: threshold, smoothness, spacing, per-glyph nudge, scale, bearings and source.
4. **Export** `.otf`, `.ttf`, `.woff` or `.woff2`, and save the project as a `.fontproject` file to continue later.

## Character sets

| set | glyphs | pages (A4 / Letter) |
| --- | --- | --- |
| basic | 72 | 1 / 1 |
| extended | 92 | 2 / 2 |
| latin | 159 | 2 / 3 |

`latin` is `extended` plus accented letters (À to ÿ, ß, œ, Œ) and ¿ ¡ « » – — …. The first 92 positions are identical to `extended`, so sheets printed for either set line up.

## Page detection

Each template page carries a six-module code near the top-right marker: a guard module, four bits for the page number and a parity bit. When a photo is added, the code is read from the straightened page and the capture is assigned to that page. Sheets printed before the code existed, or photos where it cannot be read, fall back to the first free page. Changing the page or moving the corners by hand turns detection off for that capture.

## Alternate shapes

Photograph a page more than once (or fill several sheets) and enable **alternate shapes** on the refine step. Up to three extra samples of each letter are exported as alternate glyphs (`.alt`, `.alt2`, `.alt3`), and a `calt` feature cycles through them within a word, so repeated letters do not look stamped. The cycle restarts at spaces and at letters that have no alternate. In the glyph panel you can choose which samples a letter uses. Applications that do not apply contextual alternates simply show the first shape.

## Kerning

The kerning slider (default 50% for new projects, 0% for projects saved before it existed) measures how close neighbouring outlines get, in 20-unit bands, and tightens pairs that sit looser than the font's typical gap. It is written as a class-based GPOS `kern` table, so alternates share their base letter's kerning.

## Export formats

| format | notes |
| --- | --- |
| `.otf` | CFF outlines, the reference output |
| `.ttf` | cubic outlines converted to quadratics (0.8 unit tolerance), correct winding, `glyf`/`loca`/`gasp` |
| `.woff` | zlib-compressed container |
| `.woff2` | Brotli-compressed container (the encoder loads only when you ask for it) |

All formats carry the same kerning and alternates. Version, copyright and license are editable on the export step. Vertical metrics are identical across platforms (typographic ascender/descender with `USE_TYPO_METRICS`), and the Windows clipping metrics always cover the real glyph extremes.

## Photos

Automatic thresholding flattens uneven lighting by dividing each cell by a per-block paper brightness estimate, then places the threshold midway between paper and ink using only pixels inside the writing grid. This copes with cast shadows, pencil, blur and sensor noise (see `tests/robustness.test.ts`). Glare that washes out the paper cannot be recovered; those cells are flagged as missing so you can re-shoot. A manual threshold is applied to the raw photo exactly as set, and **adaptive** remains available.

## Themes

The footer switch offers system, light and dark. The choice is stored in `localStorage`, applied before first paint by `public/theme-init.js`, follows OS changes while on system, and syncs across tabs. Scans and template sheets stay paper-white in both themes.

## Development

```
npm install
npm run dev
npm run check
npm test
npm run build
npm run test:e2e
```

`npm test` runs the unit tests (vitest). `npm run test:e2e` builds the app and drives it in Chromium with Playwright: it generates a filled-in sheet from the app's own template, uploads it, downloads every font format, and checks phone layout, touch targets, keyboard use and WCAG 2.2 AA (axe-core) in both themes. Install a browser first with `npx playwright install chromium`, or point `PLAYWRIGHT_BROWSERS_PATH` at an existing install.

## Layout

| path | what lives there |
| --- | --- |
| `src/template` | sheet geometry, SVG rendering, page code |
| `src/vision` | marker detection, warping, cell extraction, page code reading |
| `src/trace` | potrace wrapper, trace cache |
| `src/font` | outline mapping, OpenType build, alternates (GSUB), kerning (GPOS), TrueType, WOFF and WOFF2 writers |
| `src/store` | app state, persistence, project files |
| `src/worker` | image and font work off the main thread |
| `src/app` | Svelte components |
| `tests`, `e2e` | unit and end-to-end tests |
