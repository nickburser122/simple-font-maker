import { describe, expect, it } from 'vitest';
import { buildFont, type BuildGlyph, type BuildSettings } from '../src/font/build';
import { createTraceCache, hashBitmap, type Tracer } from '../src/trace/cache';
import { DEFAULT_TRACE } from '../src/trace/params';
import { sameFont } from './fonts';
import { traceBitmap } from '../src/trace/potrace';
import type { Contour } from '../src/trace/path-parse';

function counting(): { tracer: Tracer; calls: () => number } {
  let n = 0;
  const tracer: Tracer = async () => {
    n++;
    const c: Contour = { start: [0, 0], segs: [{ t: 'L', p: [n, n] }] };
    return [c];
  };
  return { tracer, calls: () => n };
}

function bmp(seed: number, len = 64): Uint8Array {
  const b = new Uint8Array(len);
  b[seed % len] = 1;
  b[(seed * 7 + 3) % len] = 1;
  return b;
}


describe('hashBitmap', () => {
  it('is stable and sensitive to single-pixel changes', () => {
    const a = bmp(7);
    const b = bmp(7);
    expect(hashBitmap(a)).toBe(hashBitmap(b));
    b[10] = b[10] ? 0 : 1;
    expect(hashBitmap(a)).not.toBe(hashBitmap(b));
  });

  it('distinguishes the same bytes in a different order', () => {
    const a = new Uint8Array([1, 0, 0, 1]);
    const b = new Uint8Array([0, 1, 1, 0]);
    expect(hashBitmap(a)).not.toBe(hashBitmap(b));
  });
});

describe('trace cache', () => {
  it('traces once per identical bitmap and parameters', async () => {
    const { tracer, calls } = counting();
    const cache = createTraceCache(tracer);
    const a = await cache(bmp(3), 8, 8, DEFAULT_TRACE);
    const b = await cache(bmp(3), 8, 8, DEFAULT_TRACE);
    expect(calls()).toBe(1);
    expect(b).toBe(a);
  });

  it('retraces when any trace parameter changes', async () => {
    const { tracer, calls } = counting();
    const cache = createTraceCache(tracer);
    await cache(bmp(3), 8, 8, DEFAULT_TRACE);
    await cache(bmp(3), 8, 8, { ...DEFAULT_TRACE, turdsize: 9 });
    await cache(bmp(3), 8, 8, { ...DEFAULT_TRACE, alphamax: 0.5 });
    await cache(bmp(3), 8, 8, { ...DEFAULT_TRACE, opttolerance: 1 });
    expect(calls()).toBe(4);
  });

  it('retraces when the bitmap or its dimensions change', async () => {
    const { tracer, calls } = counting();
    const cache = createTraceCache(tracer);
    await cache(bmp(3), 8, 8, DEFAULT_TRACE);
    await cache(bmp(5), 8, 8, DEFAULT_TRACE);
    await cache(bmp(3), 16, 4, DEFAULT_TRACE);
    expect(calls()).toBe(3);
  });

  it('evicts the least recently used entry past the limit', async () => {
    const { tracer, calls } = counting();
    const cache = createTraceCache(tracer, 2);
    await cache(bmp(1), 8, 8, DEFAULT_TRACE);
    await cache(bmp(2), 8, 8, DEFAULT_TRACE);
    await cache(bmp(1), 8, 8, DEFAULT_TRACE);
    await cache(bmp(4), 8, 8, DEFAULT_TRACE);
    expect(cache.size()).toBe(2);
    expect(calls()).toBe(3);
    await cache(bmp(1), 8, 8, DEFAULT_TRACE);
    expect(calls()).toBe(3);
    await cache(bmp(2), 8, 8, DEFAULT_TRACE);
    expect(calls()).toBe(4);
  });

  it('clears', async () => {
    const { tracer, calls } = counting();
    const cache = createTraceCache(tracer);
    await cache(bmp(3), 8, 8, DEFAULT_TRACE);
    cache.clear();
    await cache(bmp(3), 8, 8, DEFAULT_TRACE);
    expect(calls()).toBe(2);
  });
});

describe('buildFont with a cached tracer', () => {
  const settings: BuildSettings = {
    family: 'Cache Hand',
    designer: '',
    lsb: 40,
    rsb: 40,
    space: 300,
    trace: DEFAULT_TRACE,
  };

  function glyphs(): BuildGlyph[] {
    const w = 40;
    const h = 60;
    return [65, 66, 67].map((u, k) => {
      const bitmap = new Uint8Array(w * h);
      for (let y = 10; y < 50; y++) for (let x = 8 + k * 4; x < 30; x++) bitmap[y * w + x] = 1;
      return { unicode: u, w, h, baseline: 45, bitmap };
    });
  }

  it('produces the same font and skips tracing on the second build', async () => {
    let real = 0;
    const cache = createTraceCache(async (...args) => {
      real++;
      return traceBitmap(...args);
    });
    const first = await buildFont(glyphs(), settings, undefined, undefined, cache);
    const afterFirst = real;
    const second = await buildFont(glyphs(), settings, undefined, undefined, cache);
    expect(afterFirst).toBe(3);
    expect(real).toBe(3);
    expect(sameFont(second.buffer, first.buffer)).toBe(true);
    expect(second.outlines).toEqual(first.outlines);
  });

  it('matches an uncached build exactly', async () => {
    const cache = createTraceCache(traceBitmap);
    const cached = await buildFont(glyphs(), settings, undefined, undefined, cache);
    const plain = await buildFont(glyphs(), settings);
    expect(sameFont(cached.buffer, plain.buffer)).toBe(true);
  });

  it('does not reuse a trace after smoothing settings change', async () => {
    let real = 0;
    const cache = createTraceCache(async (...args) => {
      real++;
      return traceBitmap(...args);
    });
    await buildFont(glyphs(), settings, undefined, undefined, cache);
    await buildFont(glyphs(), { ...settings, trace: { ...DEFAULT_TRACE, turdsize: 20 } }, undefined, undefined, cache);
    expect(real).toBe(6);
  });
});
