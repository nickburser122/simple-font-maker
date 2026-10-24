import { SETS, type SetId } from '../charset/sets';
import { PAPERS, type PaperId } from '../template/layout';
import type { Pt } from '../vision/types';
import { DEFAULT_SETTINGS } from './defaults';
import type { Settings } from './settings.svelte';

export interface FileCell {
  char: string;
  unicode: number;
  page: number;
  row: number;
  col: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
  ink: number;
  missing: boolean;
  guides: { cap: number; x: number; baseline: number; descender: number };
  png: string;
}

export interface FileCapture {
  uid: string;
  name: string;
  page: number;
  corners: Pt[];
  detected: boolean;
  cells: FileCell[];
}

export interface ProjectFile {
  version: 1;
  app: 'handwriting-font-maker';
  setId: SetId;
  paper: PaperId;
  family: string;
  designer: string;
  settings: Settings;
  captures: FileCapture[];
}

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('not a project file');
  return v as Rec;
}

function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('not a project file');
  return v;
}

const MAX_DIM = 2000;

function dim(v: unknown): number {
  const n = num(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DIM) throw new Error('not a project file');
  return n;
}

function str(v: unknown): string {
  if (typeof v !== 'string') throw new Error('not a project file');
  return v;
}

function arr(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error('not a project file');
  return v;
}

function cell(v: unknown): FileCell {
  const c = rec(v);
  const g = rec(c.guides);
  const png = str(c.png);
  if (!png.startsWith('data:image/png;base64,')) throw new Error('not a project file');
  return {
    char: str(c.char),
    unicode: num(c.unicode),
    page: num(c.page),
    row: num(c.row),
    col: num(c.col),
    w: dim(c.w),
    h: dim(c.h),
    originX: num(c.originX),
    originY: num(c.originY),
    ink: num(c.ink),
    missing: c.missing === true,
    guides: { cap: num(g.cap), x: num(g.x), baseline: num(g.baseline), descender: num(g.descender) },
    png,
  };
}

function capture(v: unknown): FileCapture {
  const c = rec(v);
  const corners = arr(c.corners).map((p) => {
    const q = arr(p);
    return [num(q[0]), num(q[1])] as Pt;
  });
  if (corners.length !== 4) throw new Error('not a project file');
  return {
    uid: str(c.uid),
    name: str(c.name),
    page: num(c.page),
    corners,
    detected: c.detected === true,
    cells: arr(c.cells).map(cell),
  };
}

export function parseProjectFile(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not a project file');
  }
  const f = rec(raw);
  if (f.version !== 1 || f.app !== 'handwriting-font-maker') throw new Error('not a project file');
  const setId = str(f.setId);
  const paper = str(f.paper);
  if (!(setId in SETS) || !(paper in PAPERS)) throw new Error('not a project file');
  const s = rec(f.settings);
  const settings: Settings = { ...DEFAULT_SETTINGS, glyphs: {} };
  for (const k of ['threshold', 'alphamax', 'turdsize', 'opttolerance', 'spacing', 'space'] as const)
    if (k in s) settings[k] = num(s[k]);
  if (typeof s.auto === 'boolean') settings.auto = s.auto;
  if (typeof s.adaptive === 'boolean') settings.adaptive = s.adaptive;
  if (typeof s.alternates === 'boolean') settings.alternates = s.alternates;
  if (s.mode === 'blue' || s.mode === 'luma') settings.mode = s.mode;
  for (const [k, v] of Object.entries(rec(s.glyphs ?? {}))) {
    const g = rec(v);
    settings.glyphs[Number(k)] = {
      dy: num(g.dy),
      scale: num(g.scale),
      lsb: g.lsb === null ? null : num(g.lsb),
      rsb: g.rsb === null ? null : num(g.rsb),
      missing: g.missing === true,
      source: typeof g.source === 'string' ? g.source : null,
    };
  }
  return {
    version: 1,
    app: 'handwriting-font-maker',
    setId: setId as SetId,
    paper: paper as PaperId,
    family: str(f.family),
    designer: str(f.designer),
    settings,
    captures: arr(f.captures).map(capture),
  };
}
