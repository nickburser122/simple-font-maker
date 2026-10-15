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
  const thr = opts.threshold ?? otsu(gray.data);
  return placeChars(SETS[setId].chars, paper)
    .filter((s) => s.page === pageNo)
    .map((s) => {
      const c = cellRect(paper, s.row, s.col);
      const g = guideYs(c);
      const ox = Math.round((c.x + CROP_MM) * PPM);
      const oy = Math.round((c.y + CROP_MM) * PPM);
      const w = Math.round((c.w - 2 * CROP_MM) * PPM);
      const h = Math.round((c.h - 2 * CROP_MM) * PPM);
      const sub = crop(gray, ox, oy, w, h);
      const bitmap = opts.adaptive ? adaptiveBinarize(sub, ADAPT_RADIUS, ADAPT_OFFSET) : binarize(sub, thr);
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
