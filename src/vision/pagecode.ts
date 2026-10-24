import { CODE, codeBands, codeRects, decodeBits } from '../template/pagecode';
import type { PaperId, Rect } from '../template/layout';
import { PPM } from './cells';
import type { Raster } from './types';

function mean(page: Raster, r: Rect, shrink: number): number {
  const x0 = Math.max(0, Math.round((r.x + shrink) * PPM));
  const x1 = Math.min(page.w, Math.round((r.x + r.w - shrink) * PPM));
  const y0 = Math.max(0, Math.round((r.y + shrink) * PPM));
  const y1 = Math.min(page.h, Math.round((r.y + r.h - shrink) * PPM));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * page.w + x) * 4;
      sum += (page.data[o] + page.data[o + 1] + page.data[o + 2]) / 3;
      n++;
    }
  }
  return n === 0 ? 255 : sum / n;
}

export function decodePageCode(page: Raster, paper: PaperId): number | null {
  const shrink = CODE.module * 0.2;
  const levels = codeRects(paper).map((r) => mean(page, r, shrink));
  const [above, below] = codeBands(paper);
  const sheet = (mean(page, above, 0) + mean(page, below, 0)) / 2;
  const guard = levels[0];
  if (!(guard < sheet * 0.6)) return null;
  const cut = (guard + sheet) / 2;
  return decodeBits(levels.map((v) => v < cut));
}
