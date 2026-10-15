import { describe, expect, it } from 'vitest';
import { label } from '../src/vision/components';
import { extractPage, findCorners } from '../src/vision/pipeline';
import { otsu } from '../src/vision/threshold';
import type { Pt } from '../src/vision/types';
import { PPM } from '../src/vision/cells';
import { cellRect } from '../src/template/layout';
import {
  markerPhotoPoints,
  photographPage,
  renderPageRaster,
  truthMask,
} from './fixtures/synthetic';

const PAGE_PPM = 6;
const BLANK = new Set([0x71, 0x37, 0x26]);

const tilted: Pt[] = [
  [170, 140],
  [1330, 200],
  [1390, 1860],
  [110, 1790],
];
const upsideDown: Pt[] = [tilted[2], tilted[3], tilted[0], tilted[1]];

const cases = [
  { name: 'tilted with perspective, noise and shading', quad: tilted, light: 0.2, adaptive: false, manual: false },
  { name: 'rotated 180 degrees', quad: upsideDown, light: 0.2, adaptive: false, manual: false },
  { name: 'strong uneven lighting with adaptive threshold', quad: tilted, light: 0.45, adaptive: true, manual: false },
  { name: 'manually supplied corners', quad: tilted, light: 0.2, adaptive: false, manual: true },
];

function iou(a: Uint8Array, b: Uint8Array): number {
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k] && b[k]) i++;
    if (a[k] || b[k]) u++;
  }
  return u === 0 ? 1 : i / u;
}

describe('primitives', () => {
  it('finds the valley between two intensity clusters', () => {
    const d = new Uint8Array(1000);
    d.fill(230);
    d.fill(30, 0, 200);
    const t = otsu(d);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(230);
  });

  it('labels eight-connected blobs with bounds and area', () => {
    const w = 6;
    const bin = new Uint8Array(w * 4);
    [0, 1, 7, 8, 21].forEach((i) => (bin[i] = 1));
    const { blobs } = label(bin, w, 4);
    expect(blobs.map((b) => b.area).sort()).toEqual([1, 4]);
  });
});

describe('synthetic fixture', () => {
  const page = renderPageRaster('basic', 'a4', 1, PAGE_PPM, BLANK);

  it.each(cases)('extracts every cell: $name', ({ quad, light, adaptive, manual }) => {
    const photo = photographPage(page, 'a4', PAGE_PPM, { w: 1500, h: 2000, quad, light, noise: 8, seed: 7 });
    const truth = markerPhotoPoints('a4', quad);
    const found = manual ? truth : findCorners(photo);
    expect(found).not.toBeNull();
    found!.forEach((p, i) => {
      expect(Math.abs(p[0] - truth[i][0])).toBeLessThan(3);
      expect(Math.abs(p[1] - truth[i][1])).toBeLessThan(3);
    });

    const cells = extractPage(photo, found!, 'a4', 'basic', 1, { threshold: null, adaptive, mode: 'blue' });
    expect(cells).toHaveLength(72);
    let worst = 1;
    for (const c of cells) {
      if (BLANK.has(c.unicode)) {
        expect(c.missing).toBe(true);
        continue;
      }
      expect(c.missing).toBe(false);
      const r = cellRect('a4', c.row, c.col);
      const score = iou(c.bitmap, truthMask(c.unicode, r.x, r.y, c.originX, c.originY, c.w, c.h, PPM));
      worst = Math.min(worst, score);
      expect(score).toBeGreaterThan(0.75);
    }
    expect(worst).toBeGreaterThan(0.75);
  }, 60000);
});
