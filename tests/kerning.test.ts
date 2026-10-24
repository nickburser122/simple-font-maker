import { describe, expect, it } from 'vitest';
import { parse } from 'opentype.js';
import { buildFont, type BuildGlyph, type BuildSettings } from '../src/font/build';
import { makeKernGpos } from '../src/font/gpos';
import { BANDS, MAX_LOOSEN, MAX_TIGHTEN, computeKerning, pairGap, profileOf, type Profile } from '../src/font/kerning';
import { readSfnt } from '../src/font/sfnt';
import type { Contour } from '../src/trace/path-parse';
import { DEFAULT_TRACE } from '../src/trace/params';

function rect(x0: number, y0: number, x1: number, y1: number): Contour {
  return {
    start: [x0, y0],
    segs: [
      { t: 'L', p: [x1, y0] },
      { t: 'L', p: [x1, y1] },
      { t: 'L', p: [x0, y1] },
      { t: 'L', p: [x0, y0] },
    ],
  };
}

describe('profileOf', () => {
  it('records left and right extents per band and leaves empty bands open', () => {
    const p = profileOf([rect(50, 0, 150, 400)], 200);
    const mid = Math.floor((200 + 300) / 20);
    expect(p.left[mid]).toBe(50);
    expect(p.right[mid]).toBe(150);
    expect(p.left[0]).toBe(Infinity);
    expect(p.right[BANDS - 1]).toBe(-Infinity);
  });

  it('follows curves instead of just their end points', () => {
    const c: Contour = {
      start: [0, 0],
      segs: [
        { t: 'C', c1: [0, 400], c2: [300, 400], p: [300, 0] },
        { t: 'L', p: [0, 0] },
      ],
    };
    const p = profileOf([c], 300);
    const mid = Math.floor((150 + 300) / 20);
    expect(p.right[mid]).toBeGreaterThan(150);
    expect(p.left[mid]).toBeLessThan(150);
    expect(p.right[mid]).toBeLessThan(300);
  });
});

describe('pairGap', () => {
  it('measures the nearest facing edges within the vertical tolerance', () => {
    const a = profileOf([rect(0, 0, 100, 500)], 140);
    const b = profileOf([rect(40, 0, 140, 500)], 180);
    expect(pairGap(a, b)).toBe(140 + 40 - 100);
  });

  it('ignores glyphs that never share a height', () => {
    const low = profileOf([rect(0, -250, 100, -200)], 140);
    const high = profileOf([rect(40, 900, 140, 1000)], 180);
    expect(pairGap(low, high)).toBeNull();
  });

  it('sees an overhang above a lower neighbour', () => {
    const bar = profileOf([rect(0, 600, 300, 680), rect(130, 0, 170, 600)], 340);
    const low = profileOf([rect(40, 0, 200, 500)], 240);
    expect(pairGap(bar, low)!).toBeLessThan(340 + 40 - 130);
  });
});

function glyph(contours: Contour[], advance: number): { profile: Profile } {
  return { profile: profileOf(contours, advance) };
}

describe('computeKerning', () => {
  const stem = () => glyph([rect(40, 0, 100, 700)], 140);
  const wide = () => glyph([rect(40, 0, 100, 700), rect(100, 560, 330, 700)], 400);

  it('returns an all-zero matrix when strength is zero or there is one glyph', () => {
    expect(computeKerning([stem(), stem()], 0).values.every((v) => v === 0)).toBe(true);
    expect(computeKerning([stem()], 1).values).toHaveLength(1);
    expect(computeKerning([stem()], 1).values[0]).toBe(0);
  });

  it('leaves evenly spaced stems alone', () => {
    const m = computeKerning([stem(), stem(), stem()], 1);
    expect(m.values.every((v) => v === 0)).toBe(true);
  });

  it('tightens a pair that sits looser than the typical gap and scales with strength', () => {
    const glyphs = [stem(), stem(), stem(), stem(), wide()];
    const full = computeKerning(glyphs, 1);
    const half = computeKerning(glyphs, 0.5);
    const last = 4;
    const v1 = full.values[last * 5 + 0];
    const v2 = half.values[last * 5 + 0];
    expect(v1).toBeLessThan(0);
    expect(v2).toBeLessThan(0);
    expect(Math.abs(v2)).toBeLessThan(Math.abs(v1));
    expect(Math.abs(Math.abs(v2) - Math.abs(v1) / 2)).toBeLessThanOrEqual(1);
  });

  it('keeps values inside the safety limits', () => {
    const far = glyph([rect(40, 0, 100, 700)], 2000);
    const m = computeKerning([far, stem(), stem(), stem()], 1);
    for (const v of m.values) {
      expect(v).toBeGreaterThanOrEqual(-MAX_TIGHTEN);
      expect(v).toBeLessThanOrEqual(MAX_LOOSEN);
    }
    expect(Math.min(...m.values)).toBe(-MAX_TIGHTEN);
  });

  it('drops adjustments smaller than the minimum', () => {
    const near = glyph([rect(40, 0, 100, 700)], 146);
    const m = computeKerning([stem(), near, stem(), stem()], 1);
    expect(m.values.every((v) => v === 0 || Math.abs(v) >= 8)).toBe(true);
  });
});

describe('makeKernGpos', () => {
  it('returns null when nothing needs kerning', () => {
    expect(makeKernGpos({ size: 2, values: new Int16Array(4) }, [{ glyphs: [2] }, { glyphs: [3] }])).toBeNull();
  });

  it('rejects a class list that does not match the matrix', () => {
    expect(() => makeKernGpos({ size: 2, values: new Int16Array(4) }, [{ glyphs: [2] }])).toThrow();
  });

  it('writes a header with the expected table offsets', () => {
    const v = new Int16Array([0, -50, 0, 0]);
    const t = makeKernGpos({ size: 2, values: v }, [{ glyphs: [2] }, { glyphs: [3] }])!;
    const dv = new DataView(t.buffer);
    expect(dv.getUint32(0)).toBe(0x00010000);
    expect(dv.getUint16(4)).toBe(10);
    const tag = (o: number) => String.fromCharCode(...Array.from(t.subarray(o, o + 4)));
    expect(tag(10 + 2)).toBe('DFLT');
    expect(tag(dv.getUint16(6) + 2)).toBe('kern');
  });
});

describe('kerning in built fonts', () => {
  const settings: BuildSettings = { family: 'Kern', designer: '', lsb: 40, rsb: 40, space: 300, trace: DEFAULT_TRACE };
  const W = 120;
  const H = 140;
  const BASE = 110;

  function shape(fn: (x: number, y: number) => boolean): Uint8Array {
    const b = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fn(x, y)) b[y * W + x] = 1;
    return b;
  }

  function glyphs(): BuildGlyph[] {
    const t = shape((x, y) => (y >= 20 && y < 34 && x >= 10 && x < 100) || (x >= 48 && x < 62 && y >= 20 && y < BASE));
    const o = shape((x, y) => {
      const dx = (x - 55) / 36;
      const dy = (y - 80) / 30;
      const r = dx * dx + dy * dy;
      return r <= 1 && r >= 0.45;
    });
    const l = shape((x, y) => x >= 50 && x < 64 && y >= 14 && y < BASE);
    return [84, 111, 108].map((u, i) => ({ unicode: u, w: W, h: H, baseline: BASE, bitmap: [t, o, l][i] }));
  }

  it('writes no GPOS table when kerning is off', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    expect(readSfnt(buffer).tables.has('GPOS')).toBe(false);
    const off = await buildFont(glyphs(), { ...settings, kerning: 0 });
    expect(readSfnt(off.buffer).tables.has('GPOS')).toBe(false);
  });

  it('is byte-identical to the unkerned font apart from the added table', async () => {
    const plain = readSfnt((await buildFont(glyphs(), settings)).buffer);
    const kerned = readSfnt((await buildFont(glyphs(), { ...settings, kerning: 1 })).buffer);
    expect(kerned.tables.has('GPOS')).toBe(true);
    for (const [tag, data] of plain.tables) {
      if (tag === 'head') continue;
      expect(Array.from(kerned.tables.get(tag)!), tag).toEqual(Array.from(data));
    }
  });

  it('tightens T-o and leaves o-l and l-l alone', async () => {
    const { buffer } = await buildFont(glyphs(), { ...settings, kerning: 1 });
    const f = parse(buffer);
    const g = (c: string) => f.charToGlyph(c);
    expect(f.getKerningValue(g('T'), g('o'))).toBeLessThan(0);
    expect(f.getKerningValue(g('l'), g('l'))).toBe(0);
    expect(f.getKerningValue(g('o'), g('l'))).toBe(0);
  });

  it('applies the same kerning to alternate variants', async () => {
    const gl = glyphs();
    gl[0] = { ...gl[0], alts: [{ w: W, h: H, baseline: BASE, bitmap: gl[0].bitmap }] };
    const { buffer } = await buildFont(gl, { ...settings, kerning: 1 });
    const f = parse(buffer);
    const names = Array.from({ length: f.numGlyphs }, (_, i) => f.glyphs.get(i).name);
    const alt = f.glyphs.get(names.indexOf('uni0054.alt'));
    expect(f.getKerningValue(alt, f.charToGlyph('o'))).toBeLessThan(0);
  });
});
