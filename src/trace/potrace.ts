import { init, potrace } from 'esm-potrace-wasm';
import type { TraceParams } from './params';
import { mapContour, parsePath, type Contour } from './path-parse';

const POTRACE_SCALE = 10;
let ready: Promise<void> | null = null;

export async function traceBitmap(
  bitmap: Uint8Array,
  w: number,
  h: number,
  params: TraceParams,
): Promise<Contour[]> {
  ready ??= init();
  await ready;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < bitmap.length; i++) {
    const v = bitmap[i] ? 0 : 255;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const paths = await potrace({ data, width: w, height: h } as unknown as ImageData, {
    pathonly: true,
    extractcolors: false,
    turdsize: params.turdsize,
    alphamax: params.alphamax,
    opticurve: 1,
    opttolerance: params.opttolerance,
  });
  return paths
    .flatMap((d) => parsePath(d))
    .map((c) => mapContour(c, ([x, y]) => [x / POTRACE_SCALE, h - y / POTRACE_SCALE]));
}
