import { SETS, type SetId } from '../charset/sets';
import { cellRect, guideYs, placeChars, type PaperId } from '../template/layout';
import { label } from './components';
import { adaptiveBinarize, binarize, otsu, toGray } from './threshold';
import type { Gray, Mode, Raster } from './types';

export const PPM = 10;
export const CROP_MM = 0.8;
const SPECK_PX = 15;
const MIN_INK_PX = 60;
const ADAPT_RADIUS = 30;
const ADAPT_OFFSET = 20;
const BLOCK = 50;
const PAPER_PERCENTILE = 0.8;
const MIN_PAPER = 60;
const INK_FRACTION = 0.01;
const MIN_CONTRAST = 60;

export interface CellOpts {
  threshold: number | null;
  adaptive: boolean;
  mode: Mode;
}

export interface CellResult {
  char: string;
  unicode: number;
  page: number;
  row: number;
  col: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
  bitmap: Uint8Array;
  ink: number;
  missing: boolean;
  guides: { cap: number; x: number; baseline: number; descender: number };
}

function crop(g: Gray, x: number, y: number, w: number, h: number): Gray {
  const d = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) d.set(g.data.subarray((y + j) * g.w + x, (y + j) * g.w + x + w), j * w);
  return { w, h, data: d };
}

interface Field {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  vals: Float32Array;
}

function paperField(g: Gray, x0: number, y0: number, x1: number, y1: number): Field {
  const bx0 = Math.max(0, Math.floor(x0 / BLOCK) - 1);
  const by0 = Math.max(0, Math.floor(y0 / BLOCK) - 1);
  const nx = Math.max(1, Math.min(Math.ceil(g.w / BLOCK), Math.ceil(x1 / BLOCK) + 1) - bx0);
  const ny = Math.max(1, Math.min(Math.ceil(g.h / BLOCK), Math.ceil(y1 / BLOCK) + 1) - by0);
  const vals = new Float32Array(nx * ny);
  const hist = new Uint32Array(256);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      hist.fill(0);
      const sx = (bx0 + i) * BLOCK;
      const sy = (by0 + j) * BLOCK;
      let n = 0;
      for (let y = sy; y < Math.min(g.h, sy + BLOCK); y++) {
        for (let x = sx; x < Math.min(g.w, sx + BLOCK); x++) {
          hist[g.data[y * g.w + x]]++;
          n++;
        }
      }
      let acc = 0;
      let v = 255;
      const want = n * PAPER_PERCENTILE;
      for (let k = 0; k < 256; k++) {
        acc += hist[k];
        if (acc >= want) {
          v = k;
          break;
        }
      }
      vals[j * nx + i] = Math.max(MIN_PAPER, v);
    }
  }
  return { x0: bx0, y0: by0, nx, ny, vals };
}

function paperAt(f: Field, x: number, y: number): number {
  const fx = Math.min(f.nx - 1, Math.max(0, x / BLOCK - 0.5 - f.x0));
  const fy = Math.min(f.ny - 1, Math.max(0, y / BLOCK - 0.5 - f.y0));
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const i1 = Math.min(f.nx - 1, i0 + 1);
  const j1 = Math.min(f.ny - 1, j0 + 1);
  const tx = fx - i0;
  const ty = fy - j0;
  const a = f.vals[j0 * f.nx + i0] * (1 - tx) + f.vals[j0 * f.nx + i1] * tx;
  const b = f.vals[j1 * f.nx + i0] * (1 - tx) + f.vals[j1 * f.nx + i1] * tx;
  return a * (1 - ty) + b * ty;
}

function flatten(sub: Gray, ox: number, oy: number, f: Field): Gray {
  const out = new Uint8Array(sub.data.length);
  for (let y = 0; y < sub.h; y++) {
    for (let x = 0; x < sub.w; x++) {
      const bg = paperAt(f, ox + x, oy + y);
      out[y * sub.w + x] = Math.min(255, Math.round((sub.data[y * sub.w + x] * 255) / bg));
    }
  }
  return { w: sub.w, h: sub.h, data: out };
}

export function autoThreshold(values: Uint8Array): number {
  const counts = new Uint32Array(256);
  for (let i = 0; i < values.length; i++) counts[values[i]]++;
  const want = Math.max(1, Math.floor(values.length * INK_FRACTION));
  let taken = 0;
  let sum = 0;
  for (let v = 0; v < 256 && taken < want; v++) {
    const take = Math.min(counts[v], want - taken);
    sum += take * v;
    taken += take;
  }
  const ink = taken > 0 ? sum / taken : 255;
  return 255 - ink >= MIN_CONTRAST ? Math.round((ink + 255) / 2) : otsu(values);
}

function smooth(g: Gray): Gray {
  const out = new Uint8Array(g.data.length);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      let acc = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= g.h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= g.w) continue;
          acc += g.data[yy * g.w + xx];
          n++;
        }
      }
      out[y * g.w + x] = Math.round(acc / n);
    }
  }
  return { w: g.w, h: g.h, data: out };
}

function clean(bin: Uint8Array, w: number, h: number): number {
  const { blobs, labels } = label(bin, w, h);
  const drop = new Uint8Array(blobs.length + 1);
  let ink = 0;
  for (const b of blobs) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    const edge = b.x0 === 0 || b.y0 === 0 || b.x1 === w - 1 || b.y1 === h - 1;
    const thin = Math.min(bw, bh) <= 12 && Math.max(bw, bh) >= 5 * Math.min(bw, bh);
    if (b.area < SPECK_PX || (edge && thin)) drop[b.id] = 1;
    else ink += b.area;
  }
  for (let i = 0; i < bin.length; i++) if (bin[i] && drop[labels[i]]) bin[i] = 0;
  return ink;
}

export function sliceCells(
  page: Raster,
  setId: SetId,
  paper: PaperId,
  pageNo: number,
  opts: CellOpts,
): CellResult[] {
  const gray = toGray(page, opts.mode);
  const placed = placeChars(SETS[setId].chars, paper).filter((s) => s.page === pageNo);
  const boxes = placed.map((s) => {
    const c = cellRect(paper, s.row, s.col);
    const ox = Math.round((c.x + CROP_MM) * PPM);
    const oy = Math.round((c.y + CROP_MM) * PPM);
    return { s, c, ox, oy, w: Math.round((c.w - 2 * CROP_MM) * PPM), h: Math.round((c.h - 2 * CROP_MM) * PPM) };
  });
  const crops = boxes.map((b) => crop(gray, b.ox, b.oy, b.w, b.h));
  let pooled = crops;
  let thr = opts.threshold ?? 0;
  if (opts.threshold === null && !opts.adaptive && boxes.length > 0) {
    const field = paperField(
      gray,
      Math.min(...boxes.map((b) => b.ox)),
      Math.min(...boxes.map((b) => b.oy)),
      Math.max(...boxes.map((b) => b.ox + b.w)),
      Math.max(...boxes.map((b) => b.oy + b.h)),
    );
    pooled = crops.map((sub, i) => flatten(sub, boxes[i].ox, boxes[i].oy, field));
    const hist = new Uint8Array(pooled.reduce((n, p) => n + p.data.length, 0));
    let at = 0;
    for (const p of pooled) {
      hist.set(p.data, at);
      at += p.data.length;
    }
    thr = autoThreshold(hist);
  }
  return boxes.map((b, i) => {
    const { s, c, ox, oy, w, h } = b;
    const g = guideYs(c);
    const sub = crops[i];
    const bitmap = opts.adaptive ? adaptiveBinarize(smooth(sub), ADAPT_RADIUS, ADAPT_OFFSET) : binarize(pooled[i], thr);
    const ink = clean(bitmap, w, h);
    return {
      char: s.char,
      unicode: s.unicode,
      page: s.page,
      row: s.row,
      col: s.col,
      w,
      h,
      originX: ox,
      originY: oy,
      bitmap,
      ink,
      missing: ink < MIN_INK_PX,
      guides: {
        cap: g.cap * PPM - oy,
        x: g.x * PPM - oy,
        baseline: g.baseline * PPM - oy,
        descender: g.descender * PPM - oy,
      },
    };
  });
}
