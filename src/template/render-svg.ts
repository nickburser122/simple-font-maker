import { SETS, type SetId } from '../charset/sets';
import {
  CELL,
  MARKER,
  PAPERS,
  cellRect,
  fingerprint,
  guideYs,
  markerRects,
  pageCount,
  placeChars,
  type PaperId,
} from './layout';
import { litRects } from './pagecode';

export const DROPOUT = '#8EC5F0';
const MONO = "ui-monospace, Menlo, Consolas, 'Courier New', monospace";

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function n(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

function markerSvg(index: number, paper: PaperId): string {
  const r = markerRects(paper)[index];
  if (index !== 0) return `<rect x="${n(r.x)}" y="${n(r.y)}" width="${r.w}" height="${r.h}" fill="#000"/>`;
  const hx = r.x + (r.w - MARKER.hole) / 2;
  const hy = r.y + (r.h - MARKER.hole) / 2;
  return (
    `<path fill="#000" fill-rule="evenodd" d="M${n(r.x)} ${n(r.y)}h${r.w}v${r.h}h-${r.w}Z` +
    `M${n(hx)} ${n(hy)}h${MARKER.hole}v${MARKER.hole}h-${MARKER.hole}Z"/>`
  );
}

export function renderPageSvg(setId: SetId, paper: PaperId, page: number): string {
  const p = PAPERS[paper];
  const specs = placeChars(SETS[setId].chars, paper);
  const pages = pageCount(specs.length, paper);
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}mm" height="${p.h}mm" viewBox="0 0 ${p.w} ${p.h}" font-family="${MONO}">`,
    `<rect width="${p.w}" height="${p.h}" fill="#fff"/>`,
  );

  for (let i = 0; i < 4; i++) out.push(markerSvg(i, paper));
  for (const r of litRects(paper, page)) {
    out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${r.w}" height="${r.h}" fill="#000"/>`);
  }

  const tx = MARKER.inset + MARKER.size + 3;
  out.push(
    `<text x="${tx}" y="${MARKER.inset + 4}" font-size="3.4" fill="#000">p${page}/${pages}</text>`,
    `<text x="${tx}" y="${MARKER.inset + 8.2}" font-size="2.2" fill="#000">${esc(fingerprint(setId, paper, page, pages))}</text>`,
    `<text x="${p.w / 2}" y="${p.h - MARKER.inset - 4}" font-size="3" text-anchor="middle" fill="#000">Use a dark pen. Stay inside the box. Print at any size, no scaling needed.</text>`,
  );

  for (const s of specs.filter((c) => c.page === page)) {
    const c = cellRect(paper, s.row, s.col);
    const g = guideYs(c);
    const line = (y: number, dash: string, w: number) =>
      `<line x1="${n(c.x)}" y1="${n(y)}" x2="${n(c.x + c.w)}" y2="${n(y)}" stroke="${DROPOUT}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    out.push(
      `<g data-u="${s.unicode}">`,
      `<rect x="${n(c.x)}" y="${n(c.y)}" width="${CELL.w}" height="${CELL.h}" fill="none" stroke="${DROPOUT}" stroke-width="0.3"/>`,
      line(g.cap, '0.8 0.8', 0.15),
      line(g.x, '0.8 0.8', 0.15),
      line(g.baseline, '', 0.3),
      line(g.descender, '0.8 0.8', 0.15),
      `<text x="${n(c.x + 1.2)}" y="${n(c.y + 3.6)}" font-size="3.2" fill="${DROPOUT}">${esc(s.char)}</text>`,
      `</g>`,
    );
  }

  out.push('</svg>');
  return out.join('');
}

export function renderAllPages(setId: SetId, paper: PaperId): string[] {
  const total = pageCount(SETS[setId].chars.length, paper);
  return Array.from({ length: total }, (_, i) => renderPageSvg(setId, paper, i + 1));
}
