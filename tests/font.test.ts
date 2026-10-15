import { describe, expect, it } from 'vitest';
import { parse, type PathCommand } from 'opentype.js';
import { buildFont, type BuildGlyph, type BuildSettings } from '../src/font/build';
import {
  CAP_HEIGHT,
  X_HEIGHT,
  bounds,
  mapContours,
  normalizeWinding,
  reverseContour,
  signedArea,
  unitsPerPixel,
} from '../src/font/metrics';
import { DEFAULT_TRACE } from '../src/trace/params';
import { parsePath, type Contour } from '../src/trace/path-parse';
import { GUIDES } from '../src/template/layout';
import type { Pt } from '../src/vision/types';

const settings: BuildSettings = {
  family: 'Test Hand',
  designer: 'tester',
  lsb: 40,
  rsb: 40,
  space: 300,
  trace: DEFAULT_TRACE,
};

function box(x0: number, y0: number, x1: number, y1: number): Contour {
  const p = (x: number, y: number): Pt => [x, y];
  return {
    start: p(x0, y0),
    segs: [
      { t: 'L', p: p(x1, y0) },
      { t: 'L', p: p(x1, y1) },
      { t: 'L', p: p(x0, y1) },
      { t: 'L', p: p(x0, y0) },
    ],
  };
}

function bitmap(w: number, h: number, on: (x: number, y: number) => boolean): Uint8Array {
  const b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) b[y * w + x] = 1;
  return b;
}

function contoursOf(cmds: PathCommand[]): Contour[] {
  const out: Contour[] = [];
  let c: Contour | null = null;
  let cur: Pt = [0, 0];
  for (const m of cmds) {
    if (m.type === 'M') {
      cur = [m.x!, m.y!];
      c = { start: cur, segs: [] };
    } else if (m.type === 'L') {
      cur = [m.x!, m.y!];
      c?.segs.push({ t: 'L', p: cur });
    } else if (m.type === 'C') {
      cur = [m.x!, m.y!];
      c?.segs.push({ t: 'C', c1: [m.x1!, m.y1!], c2: [m.x2!, m.y2!], p: cur });
    } else if (m.type === 'Z' && c) {
      out.push(c);
      c = null;
    }
  }
  return out;
}

describe('path parsing', () => {
  it('reads relative lines with implicit repeats', () => {
    const [c] = parsePath('M100 350 l0 -30 100 0 100 0 0 30 0 30 -100 0 -100 0 0 -30z');
    expect(c.start).toEqual([100, 350]);
    expect(c.segs[0]).toEqual({ t: 'L', p: [100, 320] });
    expect(c.segs[2]).toEqual({ t: 'L', p: [300, 320] });
    expect(c.segs[c.segs.length - 1].p).toEqual([100, 350]);
  });

  it('reads relative curves and later subpaths', () => {
    const cs = parsePath('M10 10 c1 2 3 4 5 6 5 6 7 8 9 10z m20 0 l5 0 0 5z');
    expect(cs).toHaveLength(2);
    expect(cs[0].segs[0]).toEqual({ t: 'C', c1: [11, 12], c2: [13, 14], p: [15, 16] });
    expect(cs[0].segs[1]).toEqual({ t: 'C', c1: [20, 22], c2: [22, 24], p: [24, 26] });
    expect(cs[1].start).toEqual([30, 10]);
  });
});

describe('metrics', () => {
  const upp = unitsPerPixel(10);

  it('puts the cap line at 700 units and the descender line at -200', () => {
    const px = (g: number) => g * 26 * 10;
    expect((px(GUIDES.baseline) - px(GUIDES.cap)) * upp).toBeCloseTo(CAP_HEIGHT, 6);
    expect((px(GUIDES.baseline) - px(GUIDES.descender)) * upp).toBeCloseTo(-200, 0);
    expect(X_HEIGHT).toBeGreaterThan(400);
    expect(X_HEIGHT).toBeLessThan(CAP_HEIGHT);
  });

  it('flips y so ink above the baseline is positive and below is negative', () => {
    const m = mapContours([box(10, 50, 60, 100), box(10, 150, 60, 200)], {
      baseline: 120,
      unitsPerPx: 1,
      lsb: 40,
      rsb: 40,
    });
    const b = bounds(m.contours);
    expect(b.y1).toBe(70);
    expect(b.y0).toBe(-80);
  });

  it('starts at the left side bearing and adds the right bearing to the advance', () => {
    const m = mapContours([box(33, 10, 83, 60)], { baseline: 60, unitsPerPx: 2, lsb: 40, rsb: 25 });
    expect(m.bounds.x0).toBe(40);
    expect(m.advance).toBe(40 + 100 + 25);
  });

  it('applies vertical nudge and scale', () => {
    const m = mapContours([box(0, 0, 10, 10)], { baseline: 10, unitsPerPx: 1, lsb: 0, rsb: 0, dy: 30, scale: 2 });
    expect(m.bounds.y0).toBe(30);
    expect(m.bounds.y1).toBe(50);
  });
});

describe('winding', () => {
  it('reverses a contour and flips its signed area', () => {
    const c = box(0, 0, 10, 20);
    expect(signedArea(reverseContour(c))).toBeCloseTo(-signedArea(c), 9);
    expect(reverseContour(reverseContour(c))).toEqual(c);
  });

  it('makes the largest contour counter-clockwise', () => {
    const outerCw = reverseContour(box(0, 0, 100, 100));
    const hole = box(30, 30, 70, 70);
    const out = normalizeWinding([outerCw, hole]);
    expect(signedArea(out[0])).toBeGreaterThan(0);
    expect(signedArea(out[1])).toBeLessThan(0);
  });
});

describe('font build', () => {
  const ring: BuildGlyph = {
    unicode: 0x6f,
    w: 120,
    h: 240,
    baseline: 170,
    bitmap: bitmap(120, 240, (x, y) => {
      const d = Math.hypot(x - 60, y - 100);
      return d < 50 && d > 22;
    }),
  };
  const descender: BuildGlyph = {
    unicode: 0x70,
    w: 120,
    h: 240,
    baseline: 170,
    bitmap: bitmap(120, 240, (x, y) => x >= 40 && x < 80 && y >= 60 && y < 220),
  };
  const blank: BuildGlyph = { unicode: 0x78, w: 120, h: 240, baseline: 170, bitmap: new Uint8Array(120 * 240) };

  it('writes a valid otf with names, notdef first, space, and only traced glyphs', async () => {
    const font = parse((await buildFont([descender, ring, blank], settings)).buffer);
    expect(font.names.windows.fontFamily.en).toBe('Test Hand');
    expect(font.names.windows.fontSubfamily.en).toBe('Regular');
    expect(font.names.windows.version.en).toBe('Version 1.000');
    expect(font.names.windows.designer.en).toBe('tester');
    expect(font.glyphs.get(0).name).toBe('.notdef');
    expect(font.numGlyphs).toBe(4);
    expect(font.charToGlyph(' ').advanceWidth).toBe(300);
    expect(font.charToGlyph('x').unicode).toBeUndefined();
  }, 30000);

  it('keeps the baseline, descenders and side bearings', async () => {
    const font = parse((await buildFont([ring, descender], settings)).buffer);
    const o = font.charToGlyph('o').getBoundingBox();
    expect(o.y2).toBeGreaterThan(580);
    expect(o.y2).toBeLessThan(660);
    expect(o.y1).toBeGreaterThan(90);
    expect(o.x1).toBeGreaterThanOrEqual(38);
    expect(o.x1).toBeLessThanOrEqual(42);
    const p = font.charToGlyph('p');
    expect(p.getBoundingBox().y1).toBeLessThan(-200);
    expect(Math.abs(p.advanceWidth - (80 + 40 * upp()))).toBeLessThan(2);
  }, 30000);

  it('renders the counter of o as a hole with opposite winding', async () => {
    const font = parse((await buildFont([ring], settings)).buffer);
    const cs = contoursOf(font.charToGlyph('o').path.commands);
    expect(cs).toHaveLength(2);
    const [a, b] = cs.map(signedArea);
    expect(Math.sign(a)).toBe(-Math.sign(b));
    expect(Math.max(a, b)).toBeGreaterThan(0);
    expect(Math.abs(a)).toBeGreaterThan(Math.abs(b));
  }, 30000);

  it('applies per-glyph nudge, scale and bearings and reports outlines', async () => {
    const base = await buildFont([ring], settings);
    const adj = await buildFont([{ ...ring, dy: 50, scale: 2, lsb: 100, rsb: 10 }], settings);
    const a = parse(base.buffer).charToGlyph('o');
    const b = parse(adj.buffer).charToGlyph('o');
    const ba = a.getBoundingBox();
    const bb = b.getBoundingBox();
    expect(bb.x1).toBeGreaterThanOrEqual(98);
    expect(bb.x1).toBeLessThanOrEqual(102);
    expect(bb.y1).toBeCloseTo(ba.y1 * 2 + 50, -1);
    expect(b.advanceWidth).toBeCloseTo(100 + (ba.x2 - ba.x1) * 2 + 10, -1);
    expect(base.outlines[0x6f].d.startsWith('M')).toBe(true);
    expect(base.outlines[0x6f].advance).toBe(a.advanceWidth);
  }, 30000);

  function upp(): number {
    return unitsPerPixel(10);
  }
});
