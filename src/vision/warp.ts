import type { Mat3 } from './homography';
import type { Raster } from './types';

export function warpToPage(src: Raster, H: Mat3, outW: number, outH: number): Raster {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { w, h, data } = src;
  for (let j = 0; j < outH; j++) {
    for (let i = 0; i < outW; i++) {
      const px = i + 0.5;
      const py = j + 0.5;
      const d = H[6] * px + H[7] * py + H[8];
      const gx = (H[0] * px + H[1] * py + H[2]) / d - 0.5;
      const gy = (H[3] * px + H[4] * py + H[5]) / d - 0.5;
      const o = (j * outW + i) * 4;
      out[o + 3] = 255;
      if (!(gx >= 0 && gy >= 0 && gx <= w - 1 && gy <= h - 1)) {
        out[o] = out[o + 1] = out[o + 2] = 255;
        continue;
      }
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const fx = gx - x0;
      const fy = gy - y0;
      for (let c = 0; c < 3; c++) {
        out[o + c] =
          data[(y0 * w + x0) * 4 + c] * (1 - fx) * (1 - fy) +
          data[(y0 * w + x1) * 4 + c] * fx * (1 - fy) +
          data[(y1 * w + x0) * 4 + c] * (1 - fx) * fy +
          data[(y1 * w + x1) * 4 + c] * fx * fy;
      }
    }
  }
  return { w: outW, h: outH, data: out };
}
