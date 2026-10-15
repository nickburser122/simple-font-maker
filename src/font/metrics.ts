import { CELL, GUIDES } from '../template/layout';
import { mapContour, type Contour, type Seg } from '../trace/path-parse';
import type { Pt } from '../vision/types';

export const UPM = 1000;
export const ASCENDER = 800;
export const DESCENDER = -200;
export const CAP_HEIGHT = 700;
export const X_HEIGHT = Math.round((CAP_HEIGHT * (GUIDES.baseline - GUIDES.x)) / (GUIDES.baseline - GUIDES.cap));
export const SPACE_WIDTH = 300;
export const SIDE_BEARING = 40;

export function unitsPerPixel(ppm: number): number {
  return CAP_HEIGHT / ((GUIDES.baseline - GUIDES.cap) * CELL.h * ppm);
}

function cubic(a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
}

export function flatten(c: Contour, steps = 12): Pt[] {
  const pts: Pt[] = [c.start];
  let cur = c.start;
  for (const s of c.segs) {
    if (s.t === 'L') pts.push(s.p);
    else for (let i = 1; i <= steps; i++) pts.push(cubic(cur, s.c1, s.c2, s.p, i / steps));
    cur = s.p;
  }
  return pts;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function bounds(cs: Contour[]): Bounds {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const c of cs)
    for (const [x, y] of flatten(c)) {
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
  return b;
}

export function signedArea(c: Contour): number {
  const pts = flatten(c);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function reverseContour(c: Contour): Contour {
  const pts = [c.start, ...c.segs.map((s) => s.p)];
  const segs: Seg[] = [];
  for (let i = c.segs.length - 1; i >= 0; i--) {
    const s = c.segs[i];
    segs.push(s.t === 'L' ? { t: 'L', p: pts[i] } : { t: 'C', c1: s.c2, c2: s.c1, p: pts[i] });
  }
  return { start: pts[pts.length - 1], segs };
}

export function normalizeWinding(cs: Contour[]): Contour[] {
  if (cs.length === 0) return cs;
  let big = cs[0];
  let area = Math.abs(signedArea(big));
  for (const c of cs) {
    const a = Math.abs(signedArea(c));
    if (a > area) {
      big = c;
      area = a;
    }
  }
  return signedArea(big) < 0 ? cs.map(reverseContour) : cs;
}

export interface MapOpts {
  baseline: number;
  unitsPerPx: number;
  lsb: number;
  rsb: number;
  dy?: number;
  scale?: number;
}

export interface Mapped {
  contours: Contour[];
  advance: number;
  bounds: Bounds;
}

export function mapContours(cs: Contour[], o: MapOpts): Mapped {
  const s = o.unitsPerPx * (o.scale ?? 1);
  const dy = o.dy ?? 0;
  const flipped = cs.map((c) => mapContour(c, ([x, y]) => [x * s, (o.baseline - y) * s + dy]));
  const dx = o.lsb - bounds(flipped).x0;
  const contours = normalizeWinding(
    flipped.map((c) => mapContour(c, ([x, y]) => [Math.round(x + dx), Math.round(y)])),
  );
  const b = bounds(contours);
  return { contours, advance: b.x1 + o.rsb, bounds: b };
}
