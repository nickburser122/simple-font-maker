import { describe, expect, it } from 'vitest';
import { cellRect } from '../src/template/layout';
import { PPM, autoThreshold } from '../src/vision/cells';
import { extractPage, findCorners } from '../src/vision/pipeline';
import type { Pt } from '../src/vision/types';
import { photographPage, renderPageRaster, truthMask, type PhotoOpts } from './fixtures/synthetic';

const BLANK = new Set([0x71, 0x37, 0x26]);
const PAGE_PPM = 6;
const quad: Pt[] = [
  [170, 140],
  [1330, 200],
  [1390, 1860],
  [110, 1790],
];
const small: Pt[] = [
  [90, 75],
  [710, 105],
  [745, 990],
  [60, 955],
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

interface Scenario {
  name: string;
  ink?: number[];
  size?: { w: number; h: number; quad: Pt[] };
  photo?: Partial<PhotoOpts>;
  auto: number;
  adaptive: number;
}

const scenarios: Scenario[] = [
  { name: 'clean', auto: 0.9, adaptive: 0.83 },
  { name: 'phone blur (2px)', photo: { blur: 2 }, auto: 0.87, adaptive: 0.7 },
  { name: 'strong blur (3px)', photo: { blur: 3 }, auto: 0.78, adaptive: 0.64 },
  { name: 'dark pencil', ink: [110, 110, 118], auto: 0.9, adaptive: 0.86 },
  { name: 'light pencil', ink: [150, 150, 158], auto: 0.9, adaptive: 0.88 },
  { name: 'light pencil and blur', ink: [150, 150, 158], photo: { blur: 2 }, auto: 0.86, adaptive: 0.83 },
  { name: 'hard cast shadow', photo: { shadow: { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8, strength: 0.6 } }, auto: 0.9, adaptive: 0.88 },
  { name: 'heavy noise', photo: { noise: 25 }, auto: 0.9, adaptive: 0.83 },
  { name: 'low resolution', size: { w: 800, h: 1100, quad: small }, auto: 0.86, adaptive: 0.8 },
  {
    name: 'shadow, pencil and blur',
    ink: [130, 130, 138],
    photo: { blur: 2, shadow: { x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.4, strength: 0.5 } },
    auto: 0.86,
    adaptive: 0.75,
  },
];

function evaluate(sc: Scenario, adaptive: boolean) {
  const q = sc.size?.quad ?? quad;
  const page = renderPageRaster('basic', 'a4', 1, PAGE_PPM, BLANK, sc.ink ?? [16, 16, 48]);
  const photo = photographPage(page, 'a4', PAGE_PPM, {
    w: sc.size?.w ?? 1500,
    h: sc.size?.h ?? 2000,
    quad: q,
    light: 0.2,
    noise: 8,
    seed: 7,
    ...sc.photo,
  });
  const corners = findCorners(photo);
  expect(corners).not.toBeNull();
  const cells = extractPage(photo, corners!, 'a4', 'basic', 1, { threshold: null, adaptive, mode: 'blue' });
  let missing = 0;
  let falseInk = 0;
  let sum = 0;
  let n = 0;
  let worst = 1;
  for (const c of cells) {
    if (BLANK.has(c.unicode)) {
      if (!c.missing) falseInk++;
      continue;
    }
    if (c.missing) {
      missing++;
      continue;
    }
    const r = cellRect('a4', c.row, c.col);
    const score = iou(c.bitmap, truthMask(c.unicode, r.x, r.y, c.originX, c.originY, c.w, c.h, PPM));
    sum += score;
    worst = Math.min(worst, score);
    n++;
  }
  return { cells: cells.length, missing, falseInk, mean: n ? sum / n : 0, worst };
}

describe('degraded photos in automatic mode', () => {
  it.each(scenarios)('$name', (sc) => {
    const r = evaluate(sc, false);
    expect(r.cells).toBe(72);
    expect(r.falseInk).toBe(0);
    expect(r.missing).toBe(0);
    expect(r.mean).toBeGreaterThan(sc.auto);
    expect(r.worst).toBeGreaterThan(sc.auto - 0.12);
  }, 60000);
});

describe('degraded photos with adaptive thresholding', () => {
  it.each(scenarios)('$name', (sc) => {
    const r = evaluate(sc, true);
    expect(r.falseInk).toBe(0);
    expect(r.missing).toBe(0);
    expect(r.mean).toBeGreaterThan(sc.adaptive);
  }, 60000);
});

describe('glare that washes out the paper', () => {
  const sc: Scenario = { name: 'glare', photo: { glare: { x: 0.5, y: 0.45, r: 0.12, gain: 0.9 } }, auto: 0, adaptive: 0 };

  it('flags the destroyed cells as missing instead of producing garbage', () => {
    for (const adaptive of [false, true]) {
      const r = evaluate(sc, adaptive);
      expect(r.falseInk).toBe(0);
      expect(r.missing).toBeLessThanOrEqual(12);
      expect(r.mean).toBeGreaterThan(0.8);
    }
  }, 60000);
});

describe('autoThreshold', () => {
  function sample(paper: number, ink: number, inkShare: number, n = 10000): Uint8Array {
    const a = new Uint8Array(n).fill(paper);
    a.fill(ink, 0, Math.round(n * inkShare));
    return a;
  }

  it('sits halfway between paper and ink', () => {
    expect(autoThreshold(sample(255, 20, 0.03))).toBe(138);
    expect(autoThreshold(sample(255, 120, 0.03))).toBe(188);
  });

  it('copes with very little ink', () => {
    expect(autoThreshold(sample(255, 40, 0.012))).toBe(148);
  });

  it('falls back to Otsu when there is almost no contrast', () => {
    const flat = sample(255, 235, 0.3);
    const t = autoThreshold(flat);
    expect(t).toBeGreaterThanOrEqual(235);
    expect(t).toBeLessThan(255);
  });

  it('returns a usable value for an empty or uniform sheet', () => {
    expect(Number.isFinite(autoThreshold(new Uint8Array(0)))).toBe(true);
    expect(Number.isFinite(autoThreshold(new Uint8Array(500).fill(250)))).toBe(true);
  });
});

describe('manual threshold', () => {
  it('is applied to the raw photo exactly as given', () => {
    const page = renderPageRaster('basic', 'a4', 1, PAGE_PPM, BLANK);
    const photo = photographPage(page, 'a4', PAGE_PPM, { w: 1500, h: 2000, quad, light: 0.2, noise: 8, seed: 7 });
    const corners = findCorners(photo)!;
    const ink = (t: number) =>
      extractPage(photo, corners, 'a4', 'basic', 1, { threshold: t, adaptive: false, mode: 'blue' }).reduce((n, c) => n + c.ink, 0);
    expect(ink(40)).toBeLessThan(ink(120));
    expect(ink(120)).toBeLessThan(ink(220));
  }, 60000);
});
