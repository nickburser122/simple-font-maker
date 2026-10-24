import { SETS, type SetId } from '../charset/sets';
import { PAPERS, type PaperId } from '../template/layout';
import type { CellResult } from '../vision/cells';
import type { Pt } from '../vision/types';
import { DEFAULT_SETTINGS } from './defaults';
import type { GlyphAdjust, Settings } from './settings.svelte';

export interface IdbCapture {
  uid: string;
  name: string;
  page: number;
  corners: Pt[];
  detected: boolean;
  cells?: CellResult[];
}

export interface IdbProject {
  version: 1;
  setId: SetId;
  paper: PaperId;
  family: string;
  designer: string;
  settings: Settings;
  captures: IdbCapture[];
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validCapture(v: unknown): v is IdbCapture {
  if (!isRec(v)) return false;
  if (typeof v.uid !== 'string' || typeof v.name !== 'string') return false;
  if (!Number.isInteger(v.page) || (v.page as number) < 1) return false;
  if (!Array.isArray(v.corners) || v.corners.length !== 4) return false;
  if (!v.corners.every((p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]))) return false;
  return v.cells === undefined || Array.isArray(v.cells);
}

export function sanitizeSettings(v: unknown): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (!isRec(v)) return out;
  for (const k of ['threshold', 'alphamax', 'turdsize', 'opttolerance', 'spacing', 'space'] as const) {
    if (finite(v[k])) out[k] = v[k];
  }
  if (finite(v.kerning)) out.kerning = Math.max(0, Math.min(100, v.kerning));
  for (const k of ['auto', 'adaptive', 'alternates'] as const) {
    if (typeof v[k] === 'boolean') out[k] = v[k];
  }
  if (v.mode === 'blue' || v.mode === 'luma') out.mode = v.mode;
  if (isRec(v.glyphs)) {
    const glyphs: Record<number, GlyphAdjust> = {};
    for (const [k, g] of Object.entries(v.glyphs)) {
      const u = Number(k);
      if (!Number.isInteger(u) || !isRec(g) || !finite(g.dy) || !finite(g.scale)) continue;
      glyphs[u] = {
        dy: g.dy,
        scale: g.scale,
        lsb: finite(g.lsb) ? g.lsb : null,
        rsb: finite(g.rsb) ? g.rsb : null,
        missing: g.missing === true,
        source: typeof g.source === 'string' ? g.source : null,
      };
    }
    out.glyphs = glyphs;
  }
  return out;
}

export function readSession(v: unknown): IdbProject | null {
  if (!isRec(v) || v.version !== 1) return null;
  if (typeof v.setId !== 'string' || !(v.setId in SETS)) return null;
  if (typeof v.paper !== 'string' || !(v.paper in PAPERS)) return null;
  if (!Array.isArray(v.captures) || !v.captures.every(validCapture)) return null;
  return {
    version: 1,
    setId: v.setId as SetId,
    paper: v.paper as PaperId,
    family: typeof v.family === 'string' ? v.family : '',
    designer: typeof v.designer === 'string' ? v.designer : '',
    settings: { ...structuredClone(DEFAULT_SETTINGS), kerning: 0, ...sanitizeSettings(v.settings) },
    captures: v.captures as IdbCapture[],
  };
}
