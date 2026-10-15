import type { CharSpec } from '../charset/sets';

export type PaperId = 'a4' | 'letter';

export interface Paper {
  id: PaperId;
  label: string;
  css: string;
  w: number;
  h: number;
}

export const PAPERS: Record<PaperId, Paper> = {
  a4: { id: 'a4', label: 'A4', css: 'A4', w: 210, h: 297 },
  letter: { id: 'letter', label: 'Letter', css: 'letter', w: 215.9, h: 279.4 },
};

export const MARKER = { size: 12, inset: 8, hole: 4 } as const;
export const CELL = { w: 21, h: 26 } as const;
export const GRID = { top: 24, bottom: 24, side: 10 } as const;
export const GUIDES = { cap: 0.22, x: 0.42, baseline: 0.74, descender: 0.8886 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridLayout {
  cols: number;
  rows: number;
  x0: number;
  y0: number;
  capacity: number;
}

export function gridLayout(paper: PaperId): GridLayout {
  const p = PAPERS[paper];
  const cols = Math.floor((p.w - 2 * GRID.side) / CELL.w);
  const rows = Math.floor((p.h - GRID.top - GRID.bottom) / CELL.h);
  return { cols, rows, x0: (p.w - cols * CELL.w) / 2, y0: GRID.top, capacity: cols * rows };
}

export function placeChars(chars: readonly string[], paper: PaperId): CharSpec[] {
  const { capacity, cols } = gridLayout(paper);
  return chars.map((char, i) => {
    const k = i % capacity;
    return {
      char,
      unicode: char.codePointAt(0)!,
      page: Math.floor(i / capacity) + 1,
      row: Math.floor(k / cols),
      col: k % cols,
    };
  });
}

export function pageCount(glyphs: number, paper: PaperId): number {
  return Math.max(1, Math.ceil(glyphs / gridLayout(paper).capacity));
}

export function cellRect(paper: PaperId, row: number, col: number): Rect {
  const g = gridLayout(paper);
  return { x: g.x0 + col * CELL.w, y: g.y0 + row * CELL.h, w: CELL.w, h: CELL.h };
}

export interface GuideYs {
  cap: number;
  x: number;
  baseline: number;
  descender: number;
}

export function guideYs(cell: Rect): GuideYs {
  return {
    cap: cell.y + cell.h * GUIDES.cap,
    x: cell.y + cell.h * GUIDES.x,
    baseline: cell.y + cell.h * GUIDES.baseline,
    descender: cell.y + cell.h * GUIDES.descender,
  };
}

export function markerRects(paper: PaperId): [Rect, Rect, Rect, Rect] {
  const p = PAPERS[paper];
  const { size: s, inset: i } = MARKER;
  return [
    { x: i, y: i, w: s, h: s },
    { x: p.w - i - s, y: i, w: s, h: s },
    { x: i, y: p.h - i - s, w: s, h: s },
    { x: p.w - i - s, y: p.h - i - s, w: s, h: s },
  ];
}

export function markerCenters(paper: PaperId): [number, number][] {
  return markerRects(paper).map((r) => [r.x + r.w / 2, r.y + r.h / 2] as [number, number]);
}

export function fingerprint(setId: string, paper: PaperId, page: number, pages: number): string {
  const g = gridLayout(paper);
  return `hfm1/${setId}/${paper}/${g.cols}x${g.rows}/${CELL.w}x${CELL.h}/p${page}of${pages}`;
}
