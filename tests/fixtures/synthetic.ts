import { SETS, type SetId } from '../../src/charset/sets';
import {
  CELL,
  MARKER,
  PAPERS,
  cellRect,
  guideYs,
  markerRects,
  placeChars,
  type PaperId,
} from '../../src/template/layout';
import { litRects } from '../../src/template/pagecode';
import { applyH, computeHomography } from '../../src/vision/homography';
import type { Pt, Raster } from '../../src/vision/types';

export type Seg = [number, number, number, number];
export const PEN = 0.9;
const INK = [28, 26, 30];
const GUIDE = [142, 197, 240];
const TABLE = [70, 60, 55];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function strokesFor(u: number): Seg[] {
  const r = rng(u * 2654435761);
  const cap = CELL.h * 0.22 + 1;
  const base = CELL.h * 0.74 - 1;
  const bottom = u % 5 === 0 ? CELL.h * 0.92 - 1 : base;
  const segs: Seg[] = [];
  let x = 4 + r() * 13;
  let y = cap + r() * (base - cap);
  for (let i = 0; i < 2 + (u % 3); i++) {
    let nx = x;
    let ny = y;
    do {
      nx = 4 + r() * 13;
      ny = cap + r() * (bottom - cap);
    } while (Math.hypot(nx - x, ny - y) < 5);
    segs.push([x, y, nx, ny]);
    x = nx;
    y = ny;
  }
  return segs;
}

export function distSeg(px: number, py: number, s: Seg): number {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

export function truthMask(
  u: number,
  cellX: number,
  cellY: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
  ppm: number,
): Uint8Array {
  const segs = strokesFor(u);
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const mx = (ox + i + 0.5) / ppm - cellX;
      const my = (oy + j + 0.5) / ppm - cellY;
      if (segs.some((s) => distSeg(mx, my, s) <= PEN / 2)) out[j * w + i] = 1;
    }
  }
  return out;
}

export function renderPageRaster(
  setId: SetId,
  paper: PaperId,
  page: number,
  ppm: number,
  blank: Set<number>,
): Raster {
  const p = PAPERS[paper];
  const w = Math.round(p.w * ppm);
  const h = Math.round(p.h * ppm);
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const paint = (i: number, j: number, c: number[]) => {
    const o = (j * w + i) * 4;
    data[o] = c[0];
    data[o + 1] = c[1];
    data[o + 2] = c[2];
  };
  const rect = (x: number, y: number, rw: number, rh: number, c: number[]) => {
    for (let j = Math.max(0, Math.floor(y * ppm)); j < Math.min(h, Math.ceil((y + rh) * ppm)); j++)
      for (let i = Math.max(0, Math.floor(x * ppm)); i < Math.min(w, Math.ceil((x + rw) * ppm)); i++)
        paint(i, j, c);
  };
  const seg = (s: Seg, ox: number, oy: number) => {
    const x0 = Math.floor((ox + Math.min(s[0], s[2]) - PEN) * ppm);
    const x1 = Math.ceil((ox + Math.max(s[0], s[2]) + PEN) * ppm);
    const y0 = Math.floor((oy + Math.min(s[1], s[3]) - PEN) * ppm);
    const y1 = Math.ceil((oy + Math.max(s[1], s[3]) + PEN) * ppm);
    for (let j = y0; j < y1; j++)
      for (let i = x0; i < x1; i++)
        if (distSeg((i + 0.5) / ppm - ox, (j + 0.5) / ppm - oy, s) <= PEN / 2) paint(i, j, INK);
  };

  markerRects(paper).forEach((r, i) => {
    rect(r.x, r.y, r.w, r.h, [0, 0, 0]);
    if (i === 0)
      rect(r.x + (r.w - MARKER.hole) / 2, r.y + (r.h - MARKER.hole) / 2, MARKER.hole, MARKER.hole, [255, 255, 255]);
  });

  for (const r of litRects(paper, page)) rect(r.x, r.y, r.w, r.h, [0, 0, 0]);

  for (const s of placeChars(SETS[setId].chars, paper).filter((c) => c.page === page)) {
    const c = cellRect(paper, s.row, s.col);
    const g = guideYs(c);
    rect(c.x, c.y, c.w, 0.25, GUIDE);
    rect(c.x, c.y + c.h - 0.25, c.w, 0.25, GUIDE);
    rect(c.x, c.y, 0.25, c.h, GUIDE);
    rect(c.x + c.w - 0.25, c.y, 0.25, c.h, GUIDE);
    for (const y of [g.cap, g.x, g.baseline, g.descender]) rect(c.x, y - 0.1, c.w, 0.2, GUIDE);
    if (!blank.has(s.unicode)) for (const sg of strokesFor(s.unicode)) seg(sg, c.x, c.y);
  }
  return { w, h, data };
}

export interface PhotoOpts {
  w: number;
  h: number;
  quad: Pt[];
  light: number;
  noise: number;
  seed: number;
}

function pageCornersMm(paper: PaperId): Pt[] {
  const p = PAPERS[paper];
  return [
    [0, 0],
    [p.w, 0],
    [p.w, p.h],
    [0, p.h],
  ];
}

export function photographPage(page: Raster, paper: PaperId, ppm: number, o: PhotoOpts): Raster {
  const H = computeHomography(o.quad, pageCornersMm(paper));
  const r = rng(o.seed);
  const data = new Uint8ClampedArray(o.w * o.h * 4);
  for (let j = 0; j < o.h; j++) {
    for (let i = 0; i < o.w; i++) {
      const [u, v] = applyH(H, i + 0.5, j + 0.5);
      const gx = u * ppm - 0.5;
      const gy = v * ppm - 0.5;
      const shade = 1 - o.light * (i / o.w);
      const noise = (r() - 0.5) * 2 * o.noise;
      const out = (j * o.w + i) * 4;
      data[out + 3] = 255;
      const inside = gx >= 0 && gy >= 0 && gx <= page.w - 1 && gy <= page.h - 1;
      for (let c = 0; c < 3; c++) {
        let val: number = TABLE[c];
        if (inside) {
          const x0 = Math.floor(gx);
          const y0 = Math.floor(gy);
          const x1 = Math.min(x0 + 1, page.w - 1);
          const y1 = Math.min(y0 + 1, page.h - 1);
          const fx = gx - x0;
          const fy = gy - y0;
          val =
            page.data[(y0 * page.w + x0) * 4 + c] * (1 - fx) * (1 - fy) +
            page.data[(y0 * page.w + x1) * 4 + c] * fx * (1 - fy) +
            page.data[(y1 * page.w + x0) * 4 + c] * (1 - fx) * fy +
            page.data[(y1 * page.w + x1) * 4 + c] * fx * fy;
        }
        data[out + c] = val * shade + noise;
      }
    }
  }
  return { w: o.w, h: o.h, data };
}

export function markerPhotoPoints(paper: PaperId, quad: Pt[]): Pt[] {
  const H = computeHomography(pageCornersMm(paper), quad);
  const c = markerRects(paper).map((r) => applyH(H, r.x + r.w / 2, r.y + r.h / 2));
  return [c[0], c[1], c[3], c[2]];
}
