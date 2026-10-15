import type { Pt } from '../vision/types';

export type Seg = { t: 'L'; p: Pt } | { t: 'C'; c1: Pt; c2: Pt; p: Pt };

export interface Contour {
  start: Pt;
  segs: Seg[];
}

export function mapContour(c: Contour, f: (p: Pt) => Pt): Contour {
  return {
    start: f(c.start),
    segs: c.segs.map((s) =>
      s.t === 'L' ? { t: 'L', p: f(s.p) } : { t: 'C', c1: f(s.c1), c2: f(s.c2), p: f(s.p) },
    ),
  };
}

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

export function parsePath(d: string): Contour[] {
  const out: Contour[] = [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let c: Contour | null = null;

  const close = () => {
    if (!c) return;
    if (cur[0] !== start[0] || cur[1] !== start[1]) c.segs.push({ t: 'L', p: [start[0], start[1]] });
    if (c.segs.length > 0) out.push(c);
    cur = [start[0], start[1]];
    c = null;
  };

  for (const m of d.matchAll(/([MmLlCcZz])([^MmLlCcZz]*)/g)) {
    const cmd = m[1];
    const rel = cmd === cmd.toLowerCase();
    const n = (m[2].match(NUM) ?? []).map(Number);
    const base = (): Pt => (rel ? cur : [0, 0]);

    if (cmd === 'Z' || cmd === 'z') {
      close();
    } else if (cmd === 'M' || cmd === 'm') {
      close();
      for (let i = 0; i + 1 < n.length; i += 2) {
        const b = base();
        const p: Pt = [b[0] + n[i], b[1] + n[i + 1]];
        if (i === 0) {
          start = p;
          c = { start: p, segs: [] };
        } else c?.segs.push({ t: 'L', p });
        cur = p;
      }
    } else if (cmd === 'L' || cmd === 'l') {
      for (let i = 0; i + 1 < n.length; i += 2) {
        const b = base();
        const p: Pt = [b[0] + n[i], b[1] + n[i + 1]];
        c?.segs.push({ t: 'L', p });
        cur = p;
      }
    } else {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const b = base();
        const c1: Pt = [b[0] + n[i], b[1] + n[i + 1]];
        const c2: Pt = [b[0] + n[i + 2], b[1] + n[i + 3]];
        const p: Pt = [b[0] + n[i + 4], b[1] + n[i + 5]];
        c?.segs.push({ t: 'C', c1, c2, p });
        cur = p;
      }
    }
  }
  close();
  return out;
}
