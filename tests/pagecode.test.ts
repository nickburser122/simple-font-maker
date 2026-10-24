import { describe, expect, it } from 'vitest';
import { SETS } from '../src/charset/sets';
import { PAPERS, pageCount, type PaperId } from '../src/template/layout';
import { CODE, MAX_CODE_PAGE, codeBands, codeRects, decodeBits, encodePage, litRects } from '../src/template/pagecode';
import { renderPageSvg } from '../src/template/render-svg';
import { decodePageCode } from '../src/vision/pagecode';
import { extractPage, findCorners, pageRaster } from '../src/vision/pipeline';
import type { Pt } from '../src/vision/types';
import { photographPage, renderPageRaster } from './fixtures/synthetic';

const PAGE_PPM = 6;
const papers: PaperId[] = ['a4', 'letter'];
const tilted: Pt[] = [
  [170, 140],
  [1330, 200],
  [1390, 1860],
  [110, 1790],
];
const upsideDown: Pt[] = [tilted[2], tilted[3], tilted[0], tilted[1]];

describe('page code bits', () => {
  it('round-trips every supported page', () => {
    for (let p = 1; p <= MAX_CODE_PAGE; p++) expect(decodeBits(encodePage(p))).toBe(p);
  });

  it('always has a lit guard module and even parity', () => {
    for (let p = 1; p <= MAX_CODE_PAGE; p++) {
      const bits = encodePage(p);
      expect(bits).toHaveLength(CODE.bits);
      expect(bits[0]).toBe(true);
      expect(bits.filter(Boolean).length % 2).toBe(0);
    }
  });

  it('rejects any single flipped module', () => {
    for (let p = 1; p <= MAX_CODE_PAGE; p++) {
      const bits = encodePage(p);
      for (let i = 0; i < bits.length; i++) {
        const bad = bits.map((b, k) => (k === i ? !b : b));
        expect(decodeBits(bad)).toBeNull();
      }
    }
  });

  it('rejects blank, wrong-length and zero-page patterns', () => {
    expect(decodeBits([false, false, false, false, false, false])).toBeNull();
    expect(decodeBits([true, false, false, false, false, true])).toBeNull();
    expect(decodeBits([true, true])).toBeNull();
  });

  it('refuses to encode pages outside 1 to 15', () => {
    for (const p of [0, -1, 16, 1.5, NaN]) expect(() => encodePage(p)).toThrow(RangeError);
    expect(litRects('a4', 16)).toEqual([]);
  });
});

describe('page code layout', () => {
  it.each(papers)('sits between the header text and the top-right marker on %s', (paper) => {
    const p = PAPERS[paper];
    const rects = codeRects(paper);
    const last = rects[rects.length - 1];
    expect(rects[0].x).toBeGreaterThan(p.w / 2);
    expect(last.x + last.w).toBeLessThan(p.w - 8 - 12);
    expect(rects[0].y).toBeGreaterThanOrEqual(8);
    expect(rects[0].y + rects[0].h).toBeLessThan(24);
    for (let i = 1; i < rects.length; i++) expect(rects[i].x).toBeGreaterThan(rects[i - 1].x + rects[i - 1].w);
    for (const b of codeBands(paper)) {
      expect(b.y).toBeGreaterThan(8);
      expect(b.y + b.h).toBeLessThan(24);
    }
  });

  it.each(papers)('is printed into each page svg on %s', (paper) => {
    const total = pageCount(SETS.latin.chars.length, paper);
    for (let page = 1; page <= total; page++) {
      const svg = renderPageSvg('latin', paper, page);
      const lit = litRects(paper, page);
      for (const r of lit) expect(svg).toContain(`<rect x="${Math.round(r.x * 1000) / 1000}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#000"/>`);
      expect(lit.length).toBe(encodePage(page).filter(Boolean).length);
    }
  });
});

describe('page code detection from photos', () => {
  const cases = [
    { name: 'tilted', quad: tilted, light: 0.2 },
    { name: 'rotated 180 degrees', quad: upsideDown, light: 0.2 },
    { name: 'strong uneven lighting', quad: tilted, light: 0.5 },
  ];

  it.each(cases)('reads pages 1 and 2 of the latin set: $name', ({ quad, light }) => {
    for (const page of [1, 2]) {
      const raster = renderPageRaster('latin', 'a4', page, PAGE_PPM, new Set());
      const photo = photographPage(raster, 'a4', PAGE_PPM, { w: 1500, h: 2000, quad, light, noise: 8, seed: 11 });
      const corners = findCorners(photo);
      expect(corners).not.toBeNull();
      expect(decodePageCode(pageRaster(photo, corners!, 'a4'), 'a4')).toBe(page);
    }
  }, 60000);

  it('reads page 3 on letter paper', () => {
    const raster = renderPageRaster('latin', 'letter', 3, PAGE_PPM, new Set());
    const photo = photographPage(raster, 'letter', PAGE_PPM, { w: 1500, h: 2000, quad: tilted, light: 0.2, noise: 8, seed: 5 });
    const corners = findCorners(photo);
    expect(decodePageCode(pageRaster(photo, corners!, 'letter'), 'letter')).toBe(3);
  }, 60000);

  it('returns null for sheets printed without a code', () => {
    const raster = renderPageRaster('basic', 'a4', 1, PAGE_PPM, new Set());
    const lit = litRects('a4', 1);
    const w = raster.w;
    for (const r of lit) {
      for (let y = Math.floor(r.y * PAGE_PPM); y < Math.ceil((r.y + r.h) * PAGE_PPM); y++)
        for (let x = Math.floor(r.x * PAGE_PPM); x < Math.ceil((r.x + r.w) * PAGE_PPM); x++) {
          const o = (y * w + x) * 4;
          raster.data[o] = raster.data[o + 1] = raster.data[o + 2] = 255;
        }
    }
    const photo = photographPage(raster, 'a4', PAGE_PPM, { w: 1500, h: 2000, quad: tilted, light: 0.2, noise: 8, seed: 3 });
    const corners = findCorners(photo);
    expect(corners).not.toBeNull();
    expect(decodePageCode(pageRaster(photo, corners!, 'a4'), 'a4')).toBeNull();
  }, 60000);

  it('reads page 1 of the basic set', () => {
    const raster = renderPageRaster('basic', 'a4', 1, PAGE_PPM, new Set());
    const photo = photographPage(raster, 'a4', PAGE_PPM, { w: 1500, h: 2000, quad: tilted, light: 0.2, noise: 8, seed: 3 });
    const page = pageRaster(photo, findCorners(photo)!, 'a4');
    expect(decodePageCode(page, 'a4')).toBe(1);
  }, 60000);

  it('extracts the second latin page with every cell present', () => {
    const raster = renderPageRaster('latin', 'a4', 2, PAGE_PPM, new Set());
    const photo = photographPage(raster, 'a4', PAGE_PPM, { w: 1500, h: 2000, quad: tilted, light: 0.2, noise: 8, seed: 7 });
    const cells = extractPage(photo, findCorners(photo)!, 'a4', 'latin', 2, { threshold: null, adaptive: false, mode: 'blue' });
    expect(cells).toHaveLength(SETS.latin.chars.length - 81);
    expect(cells.every((c) => !c.missing)).toBe(true);
    expect(cells.some((c) => c.char === 'é')).toBe(true);
  }, 60000);
});
