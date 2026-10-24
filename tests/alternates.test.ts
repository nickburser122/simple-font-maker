import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'opentype.js';
import { buildAlternateGsub } from '../src/font/alternates';
import { buildFont, type BuildGlyph, type BuildSettings, type GlyphImage } from '../src/font/build';
import { DEFAULT_TRACE } from '../src/trace/params';
import { captures, type Capture } from '../src/store/captures.svelte';
import { alternateCount, altFor, chosenFor, collectGlyphs } from '../src/store/glyphs';
import { resetSettings, settings } from '../src/store/settings.svelte';
import { parseProjectFile } from '../src/store/project-file';
import { DEFAULT_SETTINGS } from '../src/store/defaults';
import type { CellResult } from '../src/vision/cells';

vi.mock('../src/worker/client', () => ({
  load: vi.fn(),
  extract: vi.fn(),
  release: vi.fn(),
  build: vi.fn(),
}));

const settingsB: BuildSettings = { family: 'Alt Hand', designer: '', lsb: 40, rsb: 40, space: 300, trace: DEFAULT_TRACE };

function img(x1: number, empty = false): GlyphImage {
  const w = 80;
  const h = 60;
  const bitmap = new Uint8Array(w * h);
  if (!empty) for (let y = 10; y < 50; y++) for (let x = 8; x < x1; x++) bitmap[y * w + x] = 1;
  return { w, h, baseline: 45, bitmap };
}

describe('buildAlternateGsub', () => {
  it('returns null when there are no pairs', () => {
    expect(buildAlternateGsub([])).toBeNull();
  });

  it('builds a calt feature with a substitution and a chaining lookup', () => {
    const g = buildAlternateGsub([
      { base: 6, alt: 7 },
      { base: 2, alt: 3 },
    ])!;
    expect(g.features.map((f) => f.tag)).toEqual(['calt']);
    expect(g.features[0].feature.lookupListIndexes).toEqual([1]);
    expect(g.lookups.map((l) => l.lookupType)).toEqual([1, 6]);
    const single = g.lookups[0];
    const chain = g.lookups[1];
    if (single.lookupType !== 1 || chain.lookupType !== 6) throw new Error('unexpected lookups');
    expect(single.subtables[0].coverage.glyphs).toEqual([2, 6]);
    expect(single.subtables[0].substitute).toEqual([3, 7]);
    expect(chain.subtables[0].backtrackCoverage[0].glyphs).toEqual([2, 6]);
    expect(chain.subtables[0].inputCoverage[0].glyphs).toEqual([2, 6]);
    expect(chain.subtables[0].lookupRecords).toEqual([{ sequenceIndex: 0, lookupListIndex: 0 }]);
  });

  it('keeps coverage lists independent so writers cannot alias them', () => {
    const g = buildAlternateGsub([{ base: 2, alt: 3 }])!;
    const [, chain] = g.lookups;
    if (chain.lookupType !== 6) throw new Error('unexpected lookup');
    expect(chain.subtables[0].backtrackCoverage[0]).not.toBe(chain.subtables[0].inputCoverage[0]);
  });

  it('rejects duplicate base glyphs', () => {
    expect(() =>
      buildAlternateGsub([
        { base: 2, alt: 3 },
        { base: 2, alt: 4 },
      ]),
    ).toThrow();
  });
});

describe('buildFont with alternates', () => {
  it('adds alternate glyphs without unicode and a GSUB table', async () => {
    const gl: BuildGlyph[] = [
      { unicode: 97, ...img(30), alt: img(60) },
      { unicode: 98, ...img(30), alt: img(50) },
      { unicode: 99, ...img(30) },
    ];
    const { buffer, outlines } = await buildFont(gl, settingsB);
    const f = parse(buffer);
    expect(f.numGlyphs).toBe(7);
    const names = Array.from({ length: f.numGlyphs }, (_, i) => f.glyphs.get(i).name);
    expect(names).toEqual(['.notdef', 'space', 'uni0061', 'uni0061.alt', 'uni0062', 'uni0062.alt', 'uni0063']);
    expect(f.glyphs.get(3).unicode).toBeUndefined();
    expect(f.glyphs.get(3).advanceWidth).toBeGreaterThan(f.glyphs.get(2).advanceWidth);
    expect(Object.keys(outlines).map(Number).sort()).toEqual([97, 98, 99]);
    const gsub = f.tables.gsub as { features: { tag: string }[]; lookups: { lookupType: number }[] };
    expect(gsub.features.map((x) => x.tag)).toEqual(['calt']);
    expect(gsub.lookups.map((x) => x.lookupType)).toEqual([1, 6]);
  });

  it('writes no GSUB table when no glyph has an alternate', async () => {
    const { buffer } = await buildFont([{ unicode: 97, ...img(30) }], settingsB);
    const f = parse(buffer);
    expect(f.tables.gsub).toBeUndefined();
    expect(f.numGlyphs).toBe(3);
  });

  it('skips an empty alternate and keeps the base glyph', async () => {
    const { buffer } = await buildFont([{ unicode: 97, ...img(30), alt: img(60, true) }], settingsB);
    const f = parse(buffer);
    expect(f.numGlyphs).toBe(3);
    expect(f.tables.gsub).toBeUndefined();
  });

  it('applies the per-glyph spacing and scale to the alternate too', async () => {
    const plain = await buildFont([{ unicode: 97, ...img(60) }], settingsB);
    const withAlt = await buildFont([{ unicode: 97, ...img(30), alt: img(60), lsb: 40, rsb: 40 }], settingsB);
    const a = parse(plain.buffer).glyphs.get(2).advanceWidth;
    const b = parse(withAlt.buffer).glyphs.get(3).advanceWidth;
    expect(b).toBe(a);
  });

  it('is byte-identical for glyphs without alternates', async () => {
    const a = await buildFont([{ unicode: 97, ...img(30) }], settingsB);
    const b = await buildFont([{ unicode: 97, ...img(30), alt: undefined }], settingsB);
    expect(new Uint8Array(a.buffer)).toEqual(new Uint8Array(b.buffer));
  });
});

function cellFor(unicode: number, x1: number, missing = false): CellResult {
  const i = img(x1);
  return {
    char: String.fromCodePoint(unicode),
    unicode,
    page: 1,
    row: 0,
    col: 0,
    w: i.w,
    h: i.h,
    originX: 0,
    originY: 0,
    bitmap: i.bitmap,
    ink: 100,
    missing,
    guides: { cap: 10, x: 20, baseline: 45, descender: 55 },
  };
}

function capture(id: number, page: number, cells: CellResult[]): Capture {
  return {
    id,
    uid: `u${id}`,
    restored: false,
    name: `p${id}`,
    url: '',
    page,
    corners: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    detected: true,
    autoPage: false,
    status: 'ready',
    cells,
    lowInk: false,
    error: '',
  };
}

describe('collecting alternates from captures', () => {
  beforeEach(() => {
    captures.items.splice(0);
    resetSettings();
  });

  it('adds no alternate while the setting is off', () => {
    captures.items.push(capture(1, 1, [cellFor(97, 30)]), capture(2, 2, [cellFor(97, 60)]));
    expect(alternateCount()).toBe(1);
    expect(collectGlyphs()[0].alt).toBeUndefined();
  });

  it('uses the other capture as the alternate when enabled', () => {
    captures.items.push(capture(1, 1, [cellFor(97, 30)]), capture(2, 2, [cellFor(97, 60)]));
    settings.alternates = true;
    const g = collectGlyphs()[0];
    expect(chosenFor(97)?.id).toBe('u1');
    expect(altFor(97)?.id).toBe('u2');
    expect(g.bitmap).toBe(captures.items[0].cells[0].bitmap);
    expect(g.alt?.bitmap).toBe(captures.items[1].cells[0].bitmap);
  });

  it('swaps primary and alternate when a different source is chosen', () => {
    captures.items.push(capture(1, 1, [cellFor(97, 30)]), capture(2, 2, [cellFor(97, 60)]));
    settings.alternates = true;
    settings.glyphs[97] = { dy: 0, scale: 1, lsb: null, rsb: null, missing: false, source: 'u2' };
    const g = collectGlyphs()[0];
    expect(g.bitmap).toBe(captures.items[1].cells[0].bitmap);
    expect(g.alt?.bitmap).toBe(captures.items[0].cells[0].bitmap);
  });

  it('ignores missing cells and glyphs marked missing', () => {
    captures.items.push(capture(1, 1, [cellFor(97, 30), cellFor(98, 30)]), capture(2, 2, [cellFor(97, 60, true), cellFor(98, 60)]));
    settings.alternates = true;
    settings.glyphs[98] = { dy: 0, scale: 1, lsb: null, rsb: null, missing: true, source: null };
    expect(alternateCount()).toBe(0);
    const out = collectGlyphs();
    expect(out.map((g) => g.unicode)).toEqual([97]);
    expect(out[0].alt).toBeUndefined();
  });

  it('counts only glyphs with a second distinct capture', () => {
    captures.items.push(capture(1, 1, [cellFor(97, 30), cellFor(98, 30)]), capture(2, 2, [cellFor(97, 60)]));
    expect(alternateCount()).toBe(1);
  });
});

describe('alternates setting in project files', () => {
  function file(alternates: unknown): string {
    return JSON.stringify({
      version: 1,
      app: 'handwriting-font-maker',
      setId: 'basic',
      paper: 'a4',
      family: 'x',
      designer: '',
      settings: { ...structuredClone(DEFAULT_SETTINGS), alternates },
      captures: [],
    });
  }

  it('reads a boolean and defaults to off otherwise', () => {
    expect(parseProjectFile(file(true)).settings.alternates).toBe(true);
    expect(parseProjectFile(file(false)).settings.alternates).toBe(false);
    expect(parseProjectFile(file('yes')).settings.alternates).toBe(false);
    const old = JSON.parse(file(true));
    delete old.settings.alternates;
    expect(parseProjectFile(JSON.stringify(old)).settings.alternates).toBe(false);
  });
});
