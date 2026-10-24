import { MARKER, PAPERS, type PaperId, type Rect } from './layout';

export const CODE = { module: 3.2, gap: 1.4, bits: 6, top: MARKER.inset + 2, margin: 4 } as const;
export const MAX_CODE_PAGE = 15;

export function encodePage(page: number): boolean[] {
  if (!Number.isInteger(page) || page < 1 || page > MAX_CODE_PAGE) throw new RangeError('page out of range');
  const data = [3, 2, 1, 0].map((b) => ((page >> b) & 1) === 1);
  const ones = 1 + data.filter(Boolean).length;
  return [true, ...data, ones % 2 === 1];
}

export function decodeBits(bits: readonly boolean[]): number | null {
  if (bits.length !== CODE.bits || !bits[0]) return null;
  if (bits.filter(Boolean).length % 2 !== 0) return null;
  const page = bits.slice(1, 5).reduce((a, b) => a * 2 + (b ? 1 : 0), 0);
  return page >= 1 ? page : null;
}

export function codeRects(paper: PaperId): Rect[] {
  const p = PAPERS[paper];
  const width = CODE.bits * CODE.module + (CODE.bits - 1) * CODE.gap;
  const x0 = p.w - MARKER.inset - MARKER.size - CODE.margin - width;
  return Array.from({ length: CODE.bits }, (_, i) => ({
    x: x0 + i * (CODE.module + CODE.gap),
    y: CODE.top,
    w: CODE.module,
    h: CODE.module,
  }));
}

export function codeBands(paper: PaperId): [Rect, Rect] {
  const r = codeRects(paper);
  const x = r[0].x;
  const w = r[r.length - 1].x + CODE.module - x;
  return [
    { x, y: CODE.top - 1.8, w, h: 1.2 },
    { x, y: CODE.top + CODE.module + 0.6, w, h: 1.2 },
  ];
}

export function litRects(paper: PaperId, page: number): Rect[] {
  if (page < 1 || page > MAX_CODE_PAGE) return [];
  const bits = encodePage(page);
  return codeRects(paper).filter((_, i) => bits[i]);
}
