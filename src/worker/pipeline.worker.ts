import { buildFont } from '../font/build';
import { createTraceCache } from '../trace/cache';
import { traceBitmap } from '../trace/potrace';
import { sliceCells } from '../vision/cells';
import { decodePageCode } from '../vision/pagecode';
import { findCorners, pageRaster } from '../vision/pipeline';
import type { Pt, Raster } from '../vision/types';
import type { Req, Res } from './messages';

const ctx = self as unknown as {
  postMessage(m: Res, t?: Transferable[]): void;
  onmessage: ((e: MessageEvent<Req>) => void) | null;
};

const MAX_SIDE = 3000;
const rasters = new Map<number, Raster>();
const pages = new Map<number, { key: string; raster: Raster }>();
const tracer = createTraceCache(traceBitmap);

async function handle(m: Req): Promise<void> {
  if (m.type === 'load') {
    const s = Math.min(1, MAX_SIDE / Math.max(m.bitmap.width, m.bitmap.height));
    const w = Math.round(m.bitmap.width * s);
    const h = Math.round(m.bitmap.height * s);
    const cv = new OffscreenCanvas(w, h);
    const g = cv.getContext('2d')!;
    g.drawImage(m.bitmap, 0, 0, w, h);
    m.bitmap.close();
    const raster: Raster = { w, h, data: g.getImageData(0, 0, w, h).data };
    rasters.set(m.cap, raster);
    const found = findCorners(raster);
    ctx.postMessage({
      type: 'loaded',
      rid: m.rid,
      corners: found ? found.map(([x, y]) => [x / w, y / h] as Pt) : null,
    });
  } else if (m.type === 'extract') {
    const r = rasters.get(m.cap);
    if (!r) throw new Error('image not loaded');
    const corners = m.corners.map(([x, y]) => [x * r.w, y * r.h] as Pt);
    const key = JSON.stringify([corners, m.paper]);
    let cached = pages.get(m.cap);
    if (!cached || cached.key !== key) {
      cached = { key, raster: pageRaster(r, corners, m.paper) };
      pages.set(m.cap, cached);
    }
    const cells = sliceCells(cached.raster, m.setId, m.paper, m.page, m.opts);
    ctx.postMessage(
      {
        type: 'cells',
        rid: m.rid,
        cells,
        lowInk: cells.every((c) => c.missing),
        pageCode: decodePageCode(cached.raster, m.paper),
      },
      cells.map((c) => c.bitmap.buffer as ArrayBuffer),
    );
  } else if (m.type === 'build') {
    const { buffer, outlines } = await buildFont(
      m.glyphs,
      m.settings,
      undefined,
      (done, total) => ctx.postMessage({ type: 'progress', rid: m.rid, done, total }),
      tracer,
    );
    ctx.postMessage({ type: 'font', rid: m.rid, buffer, outlines }, [buffer]);
  } else {
    rasters.delete(m.cap);
    pages.delete(m.cap);
    ctx.postMessage({ type: 'released', rid: m.rid });
  }
}

ctx.onmessage = (e) => {
  handle(e.data).catch((err: unknown) => {
    ctx.postMessage({
      type: 'error',
      rid: e.data.rid,
      message: err instanceof Error ? err.message : 'worker error',
    });
  });
};
