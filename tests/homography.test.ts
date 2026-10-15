import { describe, expect, it } from 'vitest';
import { applyH, computeHomography } from '../src/vision/homography';
import type { Pt } from '../src/vision/types';

const square: Pt[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

describe('homography', () => {
  it('recovers the identity', () => {
    const H = computeHomography(square, square);
    for (const [x, y] of [[10, 20], [55, 80], [100, 100]] as Pt[]) {
      const [u, v] = applyH(H, x, y);
      expect(u).toBeCloseTo(x, 8);
      expect(v).toBeCloseTo(y, 8);
    }
  });

  it('maps the four source points exactly onto the targets', () => {
    const dst: Pt[] = [
      [12, 30],
      [480, 10],
      [520, 700],
      [-40, 650],
    ];
    const H = computeHomography(square, dst);
    square.forEach(([x, y], i) => {
      const [u, v] = applyH(H, x, y);
      expect(u).toBeCloseTo(dst[i][0], 6);
      expect(v).toBeCloseTo(dst[i][1], 6);
    });
  });

  it('matches a known scale and translation', () => {
    const dst: Pt[] = square.map(([x, y]) => [2 * x + 5, 3 * y - 7] as Pt);
    const [u, v] = applyH(computeHomography(square, dst), 50, 50);
    expect(u).toBeCloseTo(105, 8);
    expect(v).toBeCloseTo(143, 8);
  });

  it('round-trips through the inverse mapping', () => {
    const dst: Pt[] = [
      [20, 10],
      [300, 40],
      [280, 380],
      [5, 330],
    ];
    const fwd = computeHomography(square, dst);
    const back = computeHomography(dst, square);
    const [u, v] = applyH(fwd, 33, 71);
    const [x, y] = applyH(back, u, v);
    expect(x).toBeCloseTo(33, 6);
    expect(y).toBeCloseTo(71, 6);
  });

  it('rejects collinear points', () => {
    const line: Pt[] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    expect(() => computeHomography(line, square)).toThrow();
  });
});
