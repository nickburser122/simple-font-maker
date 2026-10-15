import type { Gray, Mode, Raster } from './types';

export function toGray(r: Raster, mode: Mode): Gray {
  const out = new Uint8Array(r.w * r.h);
  const d = r.data;
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = mode === 'blue' ? d[j + 2] : (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  }
  return { w: r.w, h: r.h, data: out };
}

export function otsu(data: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = data.length - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) {
      best = v;
      thr = t;
    }
  }
  return thr;
}

export function binarize(g: Gray, t: number): Uint8Array {
  const out = new Uint8Array(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i] <= t ? 1 : 0;
  return out;
}

export function adaptiveBinarize(g: Gray, radius: number, offset: number): Uint8Array {
  const { w, h, data } = g;
  const W = w + 1;
  const ii = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const sum = ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = data[y * w + x] < mean - offset ? 1 : 0;
    }
  }
  return out;
}
