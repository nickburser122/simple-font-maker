import { label, type Blob } from './components';
import { adaptiveBinarize, binarize, otsu } from './threshold';
import type { Gray, Pt } from './types';

function holeFraction(labels: Int32Array, w: number, b: Blob): number {
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const seen = new Uint8Array(bw * bh);
  const stack: number[] = [];
  const solid = (x: number, y: number) => labels[(b.y0 + y) * w + b.x0 + x] === b.id;
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= bw || y >= bh) return;
    const k = y * bw + x;
    if (seen[k] || solid(x, y)) return;
    seen[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < bw; x++) {
    push(x, 0);
    push(x, bh - 1);
  }
  for (let y = 0; y < bh; y++) {
    push(0, y);
    push(bw - 1, y);
  }
  while (stack.length > 0) {
    const k = stack.pop()!;
    const x = k % bw;
    const y = (k - x) / bw;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  let hole = 0;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (!seen[y * bw + x] && !solid(x, y)) hole++;
  return hole / b.area;
}

function fromBinary(bin: Uint8Array, w: number, h: number): Pt[] | null {
  const { labels, blobs } = label(bin, w, h);
  const m = Math.max(w, h);
  const quad: (Blob | null)[] = [null, null, null, null];
  for (const b of blobs) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    const r = bw / bh;
    if (r < 0.6 || r > 1.67 || b.area / (bw * bh) < 0.45 || bw < m * 0.015 || bw > m * 0.2) continue;
    const q = (b.sy / b.area < h / 2 ? 0 : 2) + (b.sx / b.area < w / 2 ? 0 : 1);
    const cur = quad[q];
    if (!cur || b.area > cur.area) quad[q] = b;
  }
  if (quad.some((q) => q === null)) return null;
  const four = quad as Blob[];
  const areas = four.map((b) => b.area);
  if (Math.max(...areas) / Math.min(...areas) > 2.5) return null;
  const holes = four.map((b) => holeFraction(labels, w, b));
  const order = [0, 1, 2, 3].sort((a, b) => holes[b] - holes[a]);
  if (holes[order[0]] < 0.04 || holes[order[1]] > holes[order[0]] / 2) return null;
  const pts = four.map((b) => [b.sx / b.area + 0.5, b.sy / b.area + 0.5] as Pt);
  const mx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const my = pts.reduce((s, p) => s + p[1], 0) / 4;
  const idx = [0, 1, 2, 3].sort(
    (a, b) => Math.atan2(pts[a][1] - my, pts[a][0] - mx) - Math.atan2(pts[b][1] - my, pts[b][0] - mx),
  );
  const start = idx.indexOf(order[0]);
  return [0, 1, 2, 3].map((i) => pts[idx[(start + i) % 4]]);
}

export function detectMarkers(g: Gray): Pt[] | null {
  return (
    fromBinary(binarize(g, otsu(g.data)), g.w, g.h) ??
    fromBinary(adaptiveBinarize(g, Math.round(Math.max(g.w, g.h) / 40), 25), g.w, g.h)
  );
}
