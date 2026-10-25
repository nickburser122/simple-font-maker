import { describe, expect, it } from 'vitest';
import { parse } from 'opentype.js';
import { buildFont, type BuildGlyph, type BuildSettings } from '../src/font/build';
import { exactXMin } from '../src/font/hmtx';
import { readSfnt } from '../src/font/sfnt';
import { cubicToQuads, contourToPoints, encodeGlyph, orientContours, toTrueType, type TtPoint } from '../src/font/truetype';
import { DEFAULT_TRACE } from '../src/trace/params';
import type { Contour } from '../src/trace/path-parse';
import type { Pt } from '../src/vision/types';

const base: BuildSettings = { family: 'TT Hand', designer: '', lsb: 40, rsb: 40, space: 300, trace: DEFAULT_TRACE };

function rect(x0: number, y0: number, x1: number, y1: number, ccw = true): Contour {
  const pts: Pt[] = ccw
    ? [
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ]
    : [
        [x0, y1],
        [x1, y1],
        [x1, y0],
      ];
  return { start: [x0, y0], segs: pts.map((p) => ({ t: 'L' as const, p })) };
}

function bez(p: number[], t: number): number {
  const u = 1 - t;
  return u * u * u * p[0] + 3 * u * u * t * p[1] + 3 * u * t * t * p[2] + t * t * t * p[3];
}

describe('cubicToQuads', () => {
  const p0: Pt = [0, 0];
  const c1: Pt = [0, 300];
  const c2: Pt = [400, 300];
  const p3: Pt = [400, 0];

  it('stays within tolerance of the cubic', () => {
    const quads = cubicToQuads(p0, c1, c2, p3, 0.8);
    expect(quads.length).toBeGreaterThanOrEqual(1);
    expect(quads.length).toBeLessThanOrEqual(10);
    let start: Pt = p0;
    let worst = 0;
    quads.forEach((q, k) => {
      for (let i = 1; i < 20; i++) {
        const t = i / 20;
        const u = 1 - t;
        const x = u * u * start[0] + 2 * u * t * q.ctrl[0] + t * t * q.end[0];
        const y = u * u * start[1] + 2 * u * t * q.ctrl[1] + t * t * q.end[1];
        let best = Infinity;
        for (let j = 0; j <= 400; j++) {
          const s = j / 400;
          best = Math.min(best, Math.hypot(bez([p0[0], c1[0], c2[0], p3[0]], s) - x, bez([p0[1], c1[1], c2[1], p3[1]], s) - y));
        }
        worst = Math.max(worst, best);
      }
      start = q.end;
      expect(k).toBeLessThan(10);
    });
    expect(worst).toBeLessThan(1.2);
    expect(start[0]).toBeCloseTo(400, 6);
    expect(start[1]).toBeCloseTo(0, 6);
  });

  it('uses a single quadratic for a curve that already is one', () => {
    const q: Pt = [100, 200];
    const a: Pt = [0, 0];
    const b: Pt = [200, 0];
    const c1q: Pt = [a[0] + (2 / 3) * (q[0] - a[0]), a[1] + (2 / 3) * (q[1] - a[1])];
    const c2q: Pt = [b[0] + (2 / 3) * (q[0] - b[0]), b[1] + (2 / 3) * (q[1] - b[1])];
    const out = cubicToQuads(a, c1q, c2q, b);
    expect(out).toHaveLength(1);
    expect(out[0].ctrl[0]).toBeCloseTo(100, 6);
    expect(out[0].ctrl[1]).toBeCloseTo(200, 6);
  });

  it('splits more for tighter tolerances', () => {
    expect(cubicToQuads(p0, c1, c2, p3, 0.05).length).toBeGreaterThan(cubicToQuads(p0, c1, c2, p3, 3).length);
  });
});

describe('contourToPoints', () => {
  it('drops the duplicated closing point and rounds to integers', () => {
    const pts = contourToPoints({
      start: [0.4, 0.4],
      segs: [
        { t: 'L', p: [100.6, 0.4] },
        { t: 'L', p: [100.6, 50.2] },
        { t: 'L', p: [0.4, 0.4] },
      ],
    });
    expect(pts).toEqual([
      { x: 0, y: 0, on: true },
      { x: 101, y: 0, on: true },
      { x: 101, y: 50, on: true },
    ]);
  });

  it('keeps curve control points off-curve and end points on-curve', () => {
    const pts = contourToPoints({
      start: [0, 0],
      segs: [
        { t: 'C', c1: [0, 100], c2: [100, 100], p: [100, 0] },
        { t: 'L', p: [0, 0] },
      ],
    });
    expect(pts[0].on).toBe(true);
    expect(pts.some((p) => !p.on)).toBe(true);
    for (let i = 1; i < pts.length; i++) if (!pts[i].on) expect(pts[i + 1]?.on).toBe(true);
    expect(pts.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
  });

  it('removes consecutive duplicates', () => {
    const pts = contourToPoints({
      start: [0, 0],
      segs: [
        { t: 'L', p: [10, 0] },
        { t: 'L', p: [10.2, 0.1] },
        { t: 'L', p: [10, 10] },
      ],
    });
    expect(pts.filter((p) => p.x === 10 && p.y === 0)).toHaveLength(1);
  });
});

function signed(pts: TtPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

describe('orientContours', () => {
  it('makes outer contours clockwise and holes counter-clockwise', () => {
    const outer = contourToPoints(rect(0, 0, 400, 400, true));
    const hole = contourToPoints(rect(100, 100, 300, 300, false));
    const [o, h] = orientContours([outer, hole]);
    expect(signed(o)).toBeLessThan(0);
    expect(signed(h)).toBeGreaterThan(0);
  });

  it('fixes contours drawn the wrong way round', () => {
    const outer = contourToPoints(rect(0, 0, 400, 400, false));
    const hole = contourToPoints(rect(100, 100, 300, 300, true));
    const [o, h] = orientContours([outer, hole]);
    expect(signed(o)).toBeLessThan(0);
    expect(signed(h)).toBeGreaterThan(0);
  });

  it('treats separate shapes and islands inside holes as outer', () => {
    const shapes = [rect(0, 0, 500, 500), rect(100, 100, 400, 400, false), rect(200, 200, 300, 300), rect(600, 0, 700, 100)].map((c) =>
      contourToPoints(c),
    );
    const [a, b, c, d] = orientContours(shapes);
    expect(signed(a)).toBeLessThan(0);
    expect(signed(b)).toBeGreaterThan(0);
    expect(signed(c)).toBeLessThan(0);
    expect(signed(d)).toBeLessThan(0);
  });

  it('keeps the same points, only reversed when needed', () => {
    const p = contourToPoints(rect(0, 0, 100, 100, false));
    const [q] = orientContours([p]);
    expect([...q].sort((a, b) => a.x - b.x || a.y - b.y)).toEqual([...p].sort((a, b) => a.x - b.x || a.y - b.y));
  });
});

describe('encodeGlyph', () => {
  it('returns no data for an empty glyph', () => {
    expect(encodeGlyph([]).data.length).toBe(0);
    expect(encodeGlyph([]).bounds).toBeNull();
  });

  it('writes a well-formed simple glyph padded to four bytes', () => {
    const g = encodeGlyph([rect(10, 20, 110, 220)]);
    const v = new DataView(g.data.buffer, g.data.byteOffset, g.data.byteLength);
    expect(g.data.length % 4).toBe(0);
    expect(v.getInt16(0)).toBe(1);
    expect([v.getInt16(2), v.getInt16(4), v.getInt16(6), v.getInt16(8)]).toEqual([10, 20, 110, 220]);
    expect(v.getUint16(10)).toBe(3);
    expect(v.getUint16(12)).toBe(0);
    expect(g.points).toBe(4);
    expect(g.contours).toBe(1);
  });

  it('ignores degenerate contours', () => {
    const g = encodeGlyph([{ start: [0, 0], segs: [{ t: 'L', p: [5, 5] }] }]);
    expect(g.contours).toBe(0);
  });
});

function glyphs(): BuildGlyph[] {
  const W = 120;
  const H = 140;
  const make = (fn: (x: number, y: number) => boolean) => {
    const b = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fn(x, y)) b[y * W + x] = 1;
    return b;
  };
  const ring = make((x, y) => {
    const dx = (x - 55) / 36;
    const dy = (y - 80) / 30;
    const r = dx * dx + dy * dy;
    return r <= 1 && r >= 0.45;
  });
  const bar = make((x, y) => x >= 40 && x < 80 && y >= 20 && y < 110);
  return [
    { unicode: 111, w: W, h: H, baseline: 110, bitmap: ring, alts: [{ w: W, h: H, baseline: 110, bitmap: bar }] },
    { unicode: 108, w: W, h: H, baseline: 110, bitmap: bar },
  ];
}

describe('TrueType export', () => {
  it('produces a TrueType-flavoured font with the same glyphs, widths and cmap', async () => {
    const otf = await buildFont(glyphs(), { ...base, kerning: 1 });
    const ttf = await buildFont(glyphs(), { ...base, kerning: 1, format: 'ttf' });
    const a = parse(otf.buffer);
    const b = parse(ttf.buffer);
    expect(a.outlinesFormat).toBe('cff');
    expect(b.outlinesFormat).toBe('truetype');
    expect(b.numGlyphs).toBe(a.numGlyphs);
    for (let i = 0; i < a.numGlyphs; i++) expect(b.glyphs.get(i).advanceWidth).toBe(a.glyphs.get(i).advanceWidth);
    for (const ch of 'ol') expect(b.charToGlyph(ch).index).toBe(a.charToGlyph(ch).index);
  });

  it('has the right tables and a valid structure', async () => {
    const { buffer } = await buildFont(glyphs(), { ...base, format: 'ttf' });
    const f = readSfnt(buffer);
    expect(f.version).toBe(0x00010000);
    for (const t of ['glyf', 'loca', 'head', 'maxp', 'gasp', 'hmtx', 'cmap']) expect(f.tables.has(t), t).toBe(true);
    expect(f.tables.has('CFF ')).toBe(false);
    const maxp = new DataView(f.tables.get('maxp')!.buffer, f.tables.get('maxp')!.byteOffset);
    expect(maxp.getUint32(0)).toBe(0x00010000);
    expect(f.tables.get('maxp')!.length).toBe(32);
    const numGlyphs = maxp.getUint16(4);
    const loca = f.tables.get('loca')!;
    expect(loca.length).toBe((numGlyphs + 1) * 2);
    const lv = new DataView(loca.buffer, loca.byteOffset);
    let prev = 0;
    for (let i = 0; i <= numGlyphs; i++) {
      const o = lv.getUint16(i * 2);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
    expect(prev * 2).toBe(f.tables.get('glyf')!.length);
  });

  it('stores left side bearings equal to each glyph xMin so outlines are not shifted', async () => {
    const { buffer } = await buildFont(glyphs(), { ...base, format: 'ttf' });
    const f = readSfnt(buffer);
    const glyf = f.tables.get('glyf')!;
    const loca = new DataView(f.tables.get('loca')!.buffer, f.tables.get('loca')!.byteOffset);
    const hmtx = new DataView(f.tables.get('hmtx')!.buffer, f.tables.get('hmtx')!.byteOffset);
    const gv = new DataView(glyf.buffer, glyf.byteOffset);
    const n = f.tables.get('loca')!.length / 2 - 1;
    let checked = 0;
    for (let i = 0; i < n; i++) {
      const start = loca.getUint16(i * 2) * 2;
      const end = loca.getUint16((i + 1) * 2) * 2;
      if (end === start) {
        expect(hmtx.getInt16(i * 4 + 2)).toBe(0);
        continue;
      }
      expect(hmtx.getInt16(i * 4 + 2)).toBe(gv.getInt16(start + 2));
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('keeps outlines close to the OpenType version', async () => {
    const a = parse((await buildFont(glyphs(), base)).buffer);
    const b = parse((await buildFont(glyphs(), { ...base, format: 'ttf' })).buffer);
    for (let i = 2; i < a.numGlyphs; i++) {
      const x = a.glyphs.get(i).getBoundingBox();
      const y = b.glyphs.get(i).getBoundingBox();
      for (const k of ['x1', 'y1', 'x2', 'y2'] as const) expect(Math.abs(x[k] - y[k]), `${i} ${k}`).toBeLessThan(5);
    }
  });

  it('carries kerning and alternates over unchanged', async () => {
    const a = readSfnt((await buildFont(glyphs(), { ...base, kerning: 1 })).buffer);
    const b = readSfnt((await buildFont(glyphs(), { ...base, kerning: 1, format: 'ttf' })).buffer);
    for (const t of ['GSUB', 'GPOS', 'cmap']) expect(Array.from(b.tables.get(t) ?? []), t).toEqual(Array.from(a.tables.get(t) ?? []));
    expect(b.tables.has('GSUB')).toBe(true);
  });

  it('writes OpenType output unless TrueType is asked for', async () => {
    const f = readSfnt((await buildFont(glyphs(), base)).buffer);
    expect(f.version).toBe(0x4f54544f);
    expect(f.tables.has('CFF ')).toBe(true);
    expect(f.tables.has('glyf')).toBe(false);
  });

  it('switches to long offsets when the outlines are large', async () => {
    const otf = (await buildFont(glyphs(), base)).buffer;
    const count = parse(otf).numGlyphs;
    const big: Contour[] = [];
    const ring: Contour = { start: [0, 0], segs: [] };
    for (let i = 1; i <= 20000; i++) ring.segs.push({ t: 'L', p: [i, (i % 2) * 100] });
    big.push(ring);
    const many = Array.from({ length: count }, () => big);
    const f = readSfnt(toTrueType(otf, many));
    const head = new DataView(f.tables.get('head')!.buffer, f.tables.get('head')!.byteOffset);
    expect(head.getInt16(50)).toBe(1);
    expect(f.tables.get('loca')!.length).toBe((count + 1) * 4);
  });
});

describe('left side bearings in OpenType output', () => {
  it('equals the floor of each outline xMin', async () => {
    const { buffer } = await buildFont(glyphs(), base);
    const f = readSfnt(buffer);
    const hmtx = new DataView(f.tables.get('hmtx')!.buffer, f.tables.get('hmtx')!.byteOffset);
    const parsed = parse(buffer);
    for (let i = 2; i < parsed.numGlyphs; i++) {
      expect(Math.abs(hmtx.getInt16(i * 4 + 2) - parsed.glyphs.get(i).getBoundingBox().x1)).toBeLessThanOrEqual(1.5);
    }
  });

  it('exactXMin follows curves and ignores empty outlines', () => {
    expect(exactXMin([])).toBeNull();
    expect(exactXMin([rect(5, 0, 50, 50)])).toBe(5);
    const bulge: Contour = { start: [10, 0], segs: [{ t: 'C', c1: [-100, 30], c2: [-100, 70], p: [10, 100] }] };
    expect(exactXMin([bulge])!).toBeLessThan(10);
    expect(exactXMin([bulge])!).toBeGreaterThan(-100);
  });
});
