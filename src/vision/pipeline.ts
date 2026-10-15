import type { SetId } from '../charset/sets';
import { PAPERS, markerCenters, type PaperId } from '../template/layout';
import { PPM, sliceCells, type CellOpts, type CellResult } from './cells';
import { computeHomography } from './homography';
import { detectMarkers } from './markers';
import { toGray } from './threshold';
import type { Pt, Raster } from './types';
import { warpToPage } from './warp';

export function findCorners(photo: Raster): Pt[] | null {
  return detectMarkers(toGray(photo, 'blue'));
}

export function pageRaster(photo: Raster, corners: Pt[], paper: PaperId): Raster {
  const c = markerCenters(paper);
  const target = [c[0], c[1], c[3], c[2]].map(([x, y]) => [x * PPM, y * PPM] as Pt);
  const H = computeHomography(target, corners);
  const p = PAPERS[paper];
  return warpToPage(photo, H, Math.round(p.w * PPM), Math.round(p.h * PPM));
}

export function extractPage(
  photo: Raster,
  corners: Pt[],
  paper: PaperId,
  setId: SetId,
  pageNo: number,
  opts: CellOpts,
): CellResult[] {
  return sliceCells(pageRaster(photo, corners, paper), setId, paper, pageNo, opts);
}
