import { describe, expect, it } from 'vitest';
import { SETS } from '../src/charset/sets';
import {
  CELL,
  GUIDES,
  MARKER,
  PAPERS,
  cellRect,
  gridLayout,
  guideYs,
  markerCenters,
  pageCount,
  placeChars,
  type PaperId,
} from '../src/template/layout';
import { esc, renderAllPages } from '../src/template/render-svg';

const papers: PaperId[] = ['a4', 'letter'];

describe('character sets', () => {
  it('basic has 72 glyphs and extended 92', () => {
    expect(SETS.basic.chars).toHaveLength(72);
    expect(SETS.extended.chars).toHaveLength(92);
    expect(new Set(SETS.extended.chars).size).toBe(92);
  });
});

describe('layout', () => {
  it.each(papers)('basic fits one %s page and extended fits two', (paper) => {
    expect(pageCount(SETS.basic.chars.length, paper)).toBe(1);
    expect(pageCount(SETS.extended.chars.length, paper)).toBe(2);
  });

  it.each(papers)('places each glyph in a unique cell on %s', (paper) => {
    const specs = placeChars(SETS.extended.chars, paper);
    const keys = new Set(specs.map((s) => `${s.page}:${s.row}:${s.col}`));
    expect(keys.size).toBe(specs.length);
    const g = gridLayout(paper);
    for (const s of specs) {
      expect(s.col).toBeLessThan(g.cols);
      expect(s.row).toBeLessThan(g.rows);
    }
  });

  it.each(papers)('keeps every cell inside the paper and clear of markers on %s', (paper) => {
    const p = PAPERS[paper];
    const g = gridLayout(paper);
    const first = cellRect(paper, 0, 0);
    const last = cellRect(paper, g.rows - 1, g.cols - 1);
    expect(first.x).toBeGreaterThan(0);
    expect(last.x + last.w).toBeLessThan(p.w);
    expect(first.y).toBeGreaterThanOrEqual(MARKER.inset + MARKER.size);
    expect(last.y + last.h).toBeLessThanOrEqual(p.h - MARKER.inset - MARKER.size);
    expect(first.x + (p.w - (last.x + last.w))).toBeCloseTo(first.x * 2, 6);
  });

  it('orders guidelines from top to bottom inside the cell', () => {
    const c = cellRect('a4', 0, 0);
    const g = guideYs(c);
    expect(c.y).toBeLessThan(g.cap);
    expect(g.cap).toBeLessThan(g.x);
    expect(g.x).toBeLessThan(g.baseline);
    expect(g.baseline).toBeLessThan(g.descender);
    expect(g.descender).toBeLessThan(c.y + c.h);
    expect((g.baseline - c.y) / CELL.h).toBeCloseTo(GUIDES.baseline, 9);
  });

  it('puts marker centres in the page corners', () => {
    const [tl, tr, bl, br] = markerCenters('a4');
    const half = MARKER.inset + MARKER.size / 2;
    expect(tl).toEqual([half, half]);
    expect(tr).toEqual([210 - half, half]);
    expect(bl).toEqual([half, 297 - half]);
    expect(br).toEqual([210 - half, 297 - half]);
  });
});

describe('svg rendering', () => {
  it('escapes xml characters', () => {
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it.each(papers)('renders one well-formed svg per page on %s', (paper) => {
    for (const setId of ['basic', 'extended'] as const) {
      const pages = renderAllPages(setId, paper);
      expect(pages).toHaveLength(pageCount(SETS[setId].chars.length, paper));
      for (const svg of pages) {
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('#8EC5F0');
        expect(svg).not.toMatch(/<!--/);
      }
    }
  });
});
