import type { Contour } from '../trace/path-parse';

export const Y_MIN = -300;
export const Y_MAX = 1100;
export const BAND = 20;
export const BANDS = Math.ceil((Y_MAX - Y_MIN) / BAND);
export const TOLERANCE = 6;
export const MIN_KERN = 8;
export const MAX_TIGHTEN = 220;
export const MAX_LOOSEN = 70;

export interface Profile {
  advance: number;
  left: Float32Array;
  right: Float32Array;
}

export interface KernGlyph {
  profile: Profile;
}

export interface KernMatrix {
  size: number;
  values: Int16Array;
}

function band(y: number): number {
  return Math.min(BANDS - 1, Math.max(0, Math.floor((y - Y_MIN) / BAND)));
}

function mark(p: Profile, x: number, y: number): void {
  if (y < Y_MIN || y > Y_MAX) return;
  const b = band(y);
  if (x < p.left[b]) p.left[b] = x;
  if (x > p.right[b]) p.right[b] = x;
}

function line(p: Profile, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (BAND / 2)));
  for (let i = 0; i <= n; i++) mark(p, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
}

export function profileOf(contours: readonly Contour[], advance: number): Profile {
  const p: Profile = {
    advance,
    left: new Float32Array(BANDS).fill(Infinity),
    right: new Float32Array(BANDS).fill(-Infinity),
  };
  for (const c of contours) {
    let [x, y] = c.start;
    for (const s of c.segs) {
      if (s.t === 'L') {
        line(p, x, y, s.p[0], s.p[1]);
        [x, y] = s.p;
      } else {
        const steps = 16;
        let px = x;
        let py = y;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const u = 1 - t;
          const nx = u * u * u * x + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.p[0];
          const ny = u * u * u * y + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.p[1];
          line(p, px, py, nx, ny);
          px = nx;
          py = ny;
        }
        [x, y] = s.p;
      }
    }
  }
  return p;
}

export function pairGap(a: Profile, b: Profile): number | null {
  let best = Infinity;
  for (let i = 0; i < BANDS; i++) {
    const r = a.right[i];
    if (r === -Infinity) continue;
    const lo = Math.max(0, i - TOLERANCE);
    const hi = Math.min(BANDS - 1, i + TOLERANCE);
    for (let j = lo; j <= hi; j++) {
      const l = b.left[j];
      if (l === Infinity) continue;
      const g = a.advance + l - r;
      if (g < best) best = g;
    }
  }
  return best === Infinity ? null : best;
}

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeKerning(glyphs: readonly KernGlyph[], strength: number): KernMatrix {
  const n = glyphs.length;
  const values = new Int16Array(n * n);
  if (n < 2 || strength <= 0) return { size: n, values };
  const gaps = new Float64Array(n * n).fill(NaN);
  const finite: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const g = pairGap(glyphs[i].profile, glyphs[j].profile);
      if (g !== null) {
        gaps[i * n + j] = g;
        finite.push(g);
      }
    }
  }
  if (finite.length === 0) return { size: n, values };
  const target = median(finite);
  const k = Math.min(1, strength);
  for (let i = 0; i < n * n; i++) {
    const g = gaps[i];
    if (Number.isNaN(g)) continue;
    const raw = (target - g) * k;
    const v = Math.round(Math.max(-MAX_TIGHTEN, Math.min(MAX_LOOSEN, raw)));
    if (Math.abs(v) >= MIN_KERN) values[i] = v;
  }
  return { size: n, values };
}
