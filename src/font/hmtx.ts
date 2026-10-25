import type { Contour } from '../trace/path-parse';
import { readSfnt, writeSfnt } from './sfnt';

export function exactXMin(contours: readonly Contour[]): number | null {
  let min = Infinity;
  for (const c of contours) {
    let [x, y] = c.start;
    min = Math.min(min, x);
    for (const s of c.segs) {
      if (s.t === 'L') {
        min = Math.min(min, s.p[0]);
      } else {
        for (let i = 1; i <= 48; i++) {
          const t = i / 48;
          const u = 1 - t;
          min = Math.min(min, u * u * u * x + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.p[0]);
        }
      }
      [x, y] = s.p;
    }
  }
  return Number.isFinite(min) ? min : null;
}

export function setLeftBearings(buffer: ArrayBuffer, lsbs: readonly number[]): ArrayBuffer {
  const font = readSfnt(buffer);
  return writeSfnt({ ...font, tables: withLsb(font.tables, lsbs) });
}

export function withLsb(tables: Map<string, Uint8Array>, lsbs: readonly number[]): Map<string, Uint8Array> {
  const hmtx = tables.get('hmtx');
  if (!hmtx || hmtx.length < lsbs.length * 4) throw new Error('hmtx does not cover every glyph');
  const next = new Uint8Array(hmtx);
  const v = new DataView(next.buffer);
  lsbs.forEach((l, i) => v.setInt16(i * 4 + 2, Math.max(-32768, Math.min(32767, Math.floor(l)))));
  const out = new Map(tables);
  out.set('hmtx', next);
  return out;
}
