import type { TraceParams } from './params';
import type { Contour } from './path-parse';

export type Tracer = (bitmap: Uint8Array, w: number, h: number, params: TraceParams) => Promise<Contour[]>;

export function hashBitmap(bitmap: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < bitmap.length; i++) {
    const v = bitmap[i] + 1;
    a = Math.imul(a ^ v, 0x01000193);
    b = Math.imul(b + v + i, 0x85ebca6b) ^ (b >>> 13);
  }
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`;
}

export function createTraceCache(trace: Tracer, limit = 512): Tracer & { size: () => number; clear: () => void } {
  const store = new Map<string, Contour[]>();
  const cached: Tracer = async (bitmap, w, h, params) => {
    const key = `${w}x${h}:${params.turdsize}:${params.alphamax}:${params.opttolerance}:${hashBitmap(bitmap)}`;
    const hit = store.get(key);
    if (hit) {
      store.delete(key);
      store.set(key, hit);
      return hit;
    }
    const result = await trace(bitmap, w, h, params);
    store.set(key, result);
    if (store.size > limit) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    return result;
  };
  return Object.assign(cached, { size: () => store.size, clear: () => store.clear() });
}
