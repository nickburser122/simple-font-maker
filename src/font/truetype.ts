import type { Contour } from '../trace/path-parse';
import type { Pt } from '../vision/types';
import { withLsb } from './hmtx';
import { TRUETYPE_VERSION, readSfnt, writeSfnt } from './sfnt';

export interface TtPoint {
  x: number;
  y: number;
  on: boolean;
}

export const QUAD_TOLERANCE = 0.8;
const MAX_SPLIT = 10;

function bez(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function dBez(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * (p1 - p0) + 2 * u * t * (p2 - p1) + t * t * (p3 - p2);
}

export function cubicToQuads(p0: Pt, c1: Pt, c2: Pt, p3: Pt, tol = QUAD_TOLERANCE): { ctrl: Pt; end: Pt }[] {
  let result: { ctrl: Pt; end: Pt }[] = [];
  for (let n = 1; n <= MAX_SPLIT; n++) {
    result = [];
    let ok = true;
    for (let k = 0; k < n && ok; k++) {
      const a = k / n;
      const b = (k + 1) / n;
      const q: Pt[] = [];
      const piece: number[][] = [[], []];
      for (let d = 0; d < 2; d++) {
        const P = [p0[d], c1[d], c2[d], p3[d]];
        const s = bez(P[0], P[1], P[2], P[3], a);
        const e = bez(P[0], P[1], P[2], P[3], b);
        const s1 = s + (b - a) * dBez(P[0], P[1], P[2], P[3], a);
        const e1 = e - (b - a) * dBez(P[0], P[1], P[2], P[3], b);
        piece[d] = [s, s1, e1, e];
      }
      const ctrl: Pt = [0, 0];
      for (let d = 0; d < 2; d++) ctrl[d] = (3 * (piece[d][1] + piece[d][2]) - piece[d][0] - piece[d][3]) / 4;
      q.push(ctrl);
      for (const t of [0.2, 0.4, 0.5, 0.6, 0.8]) {
        const tt = a + (b - a) * t;
        const u = 1 - t;
        const dx = bez(p0[0], c1[0], c2[0], p3[0], tt) - (u * u * piece[0][0] + 2 * u * t * ctrl[0] + t * t * piece[0][3]);
        const dy = bez(p0[1], c1[1], c2[1], p3[1], tt) - (u * u * piece[1][0] + 2 * u * t * ctrl[1] + t * t * piece[1][3]);
        if (Math.hypot(dx, dy) > tol) ok = false;
      }
      result.push({ ctrl, end: [piece[0][3], piece[1][3]] });
    }
    if (ok) return result;
  }
  return result;
}

export function contourToPoints(c: Contour, tol = QUAD_TOLERANCE): TtPoint[] {
  const pts: TtPoint[] = [{ x: c.start[0], y: c.start[1], on: true }];
  let cur: Pt = c.start;
  for (const s of c.segs) {
    if (s.t === 'L') {
      pts.push({ x: s.p[0], y: s.p[1], on: true });
    } else {
      for (const q of cubicToQuads(cur, s.c1, s.c2, s.p, tol)) {
        pts.push({ x: q.ctrl[0], y: q.ctrl[1], on: false });
        pts.push({ x: q.end[0], y: q.end[1], on: true });
      }
    }
    cur = s.p;
  }
  const rounded = pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), on: p.on }));
  const out: TtPoint[] = [];
  for (const p of rounded) {
    const prev = out[out.length - 1];
    if (prev && prev.x === p.x && prev.y === p.y && prev.on === p.on) continue;
    out.push(p);
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (last.on && first.x === last.x && first.y === last.y) out.pop();
    else break;
  }
  return out;
}

function area(pts: readonly TtPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function inside(poly: readonly TtPoint[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export function orientContours(contours: TtPoint[][]): TtPoint[][] {
  return contours.map((pts, i) => {
    const probe = pts.find((p) => p.on) ?? pts[0];
    let depth = 0;
    contours.forEach((other, j) => {
      if (j !== i && other.length >= 3 && inside(other, probe.x + 0.01, probe.y + 0.01)) depth++;
    });
    const clockwise = area(pts) < 0;
    const wantClockwise = depth % 2 === 0;
    return clockwise === wantClockwise ? pts : [...pts].reverse();
  });
}

export interface EncodedGlyph {
  data: Uint8Array;
  points: number;
  contours: number;
  bounds: [number, number, number, number] | null;
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}

export function encodeGlyph(contours: readonly Contour[]): EncodedGlyph {
  const shaped = orientContours(contours.map((c) => contourToPoints(c)).filter((p) => p.length >= 3));
  if (shaped.length === 0) return { data: new Uint8Array(0), points: 0, contours: 0, bounds: null };
  const all = shaped.flat();
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const bounds: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const size = pad4(10 + shaped.length * 2 + 2 + all.length * 5);
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  v.setInt16(0, shaped.length);
  bounds.forEach((b, i) => v.setInt16(2 + i * 2, b));
  let o = 10;
  let end = -1;
  for (const c of shaped) {
    end += c.length;
    v.setUint16(o, end);
    o += 2;
  }
  v.setUint16(o, 0);
  o += 2;
  for (const p of all) out[o++] = p.on ? 1 : 0;
  let px = 0;
  for (const p of all) {
    v.setInt16(o, p.x - px);
    px = p.x;
    o += 2;
  }
  let py = 0;
  for (const p of all) {
    v.setInt16(o, p.y - py);
    py = p.y;
    o += 2;
  }
  return { data: out.subarray(0, pad4(o)), points: all.length, contours: shaped.length, bounds };
}

function maxp(numGlyphs: number, maxPoints: number, maxContours: number): Uint8Array {
  const out = new Uint8Array(32);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, numGlyphs);
  v.setUint16(6, maxPoints);
  v.setUint16(8, maxContours);
  v.setUint16(14, 1);
  return out;
}

function gasp(): Uint8Array {
  const out = new Uint8Array(8);
  const v = new DataView(out.buffer);
  v.setUint16(0, 1);
  v.setUint16(2, 1);
  v.setUint16(4, 0xffff);
  v.setUint16(6, 0x000f);
  return out;
}

export function toTrueType(otf: ArrayBuffer, glyphs: readonly (readonly Contour[])[]): ArrayBuffer {
  const font = readSfnt(otf);
  const head = font.tables.get('head');
  if (!head || head.length < 54) throw new Error('font has no head table');
  const encoded = glyphs.map((g) => encodeGlyph(g));
  const total = encoded.reduce((n, g) => n + g.data.length, 0);
  const long = total > 0x1fffe;
  const glyf = new Uint8Array(total);
  const loca = new Uint8Array((encoded.length + 1) * (long ? 4 : 2));
  const lv = new DataView(loca.buffer);
  let at = 0;
  encoded.forEach((g, i) => {
    if (long) lv.setUint32(i * 4, at);
    else lv.setUint16(i * 2, at / 2);
    glyf.set(g.data, at);
    at += g.data.length;
  });
  if (long) lv.setUint32(encoded.length * 4, at);
  else lv.setUint16(encoded.length * 2, at / 2);

  const h = new Uint8Array(head);
  const hv = new DataView(h.buffer);
  hv.setInt16(50, long ? 1 : 0);
  const boxes = encoded.map((g) => g.bounds).filter((b): b is [number, number, number, number] => b !== null);
  if (boxes.length > 0) {
    hv.setInt16(36, Math.min(...boxes.map((b) => b[0])));
    hv.setInt16(38, Math.min(...boxes.map((b) => b[1])));
    hv.setInt16(40, Math.max(...boxes.map((b) => b[2])));
    hv.setInt16(42, Math.max(...boxes.map((b) => b[3])));
  }

  font.tables.delete('CFF ');
  font.tables.set('glyf', glyf);
  font.tables.set('loca', loca);
  font.tables.set('head', h);
  font.tables.set('maxp', maxp(encoded.length, Math.max(0, ...encoded.map((g) => g.points)), Math.max(0, ...encoded.map((g) => g.contours))));
  font.tables.set('gasp', gasp());
  font.version = TRUETYPE_VERSION;
  font.tables = withLsb(font.tables, encoded.map((g) => (g.bounds ? g.bounds[0] : 0)));
  return writeSfnt(font);
}
