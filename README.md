# Handwriting Font Maker

Turn your handwriting into an installable font. Everything runs in the browser tab: photos are never uploaded.

1. **Print** a template sheet (basic, extended or Latin character set; A4 or Letter).
2. **Capture** each filled-in sheet with a photo or scan. Corners are found from the printed markers and the page number from a small printed code.
3. **Refine** the traced glyphs: threshold, smoothness, spacing, per-glyph nudge, scale, bearings and source.
4. **Export** a `.otf` or `.woff`, and save the project as a `.fontproject` file to continue later.

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

Photograph a page twice (or fill two sheets) and enable **alternate shapes** on the refine step. The second sample of each letter is exported as an alternate glyph, and a `calt` feature swaps every second alternating letter within a word, so repeated letters do not look stamped. The feature resets at spaces and at letters that have no alternate. Applications that do not apply contextual alternates simply show the first shape.

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

`npm test` runs the unit tests (vitest). `npm run test:e2e` builds the app and drives it in Chromium with Playwright: it generates a filled-in sheet from the app's own template, uploads it and downloads the fonts. Install a browser first with `npx playwright install chromium`, or point `PLAYWRIGHT_BROWSERS_PATH` at an existing install.

## Layout

| path | what lives there |
| --- | --- |
| `src/template` | sheet geometry, SVG rendering, page code |
| `src/vision` | marker detection, warping, cell extraction, page code reading |
| `src/trace` | potrace wrapper, trace cache |
| `src/font` | outline mapping, OpenType build, alternates (GSUB), WOFF writer |
| `src/store` | app state, persistence, project files |
| `src/worker` | image and font work off the main thread |
| `src/app` | Svelte components |
| `tests`, `e2e` | unit and end-to-end tests |
