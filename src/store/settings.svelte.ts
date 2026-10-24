import { History } from '../font/history';
import { SIDE_BEARING } from '../font/metrics';
import type { BuildSettings } from '../font/build';
import type { Mode } from '../vision/types';
import { DEFAULT_SETTINGS } from './defaults';
import { fontSettings } from './font.svelte';

export interface GlyphAdjust {
  dy: number;
  scale: number;
  lsb: number | null;
  rsb: number | null;
  missing: boolean;
  source: string | null;
}

export interface Settings {
  auto: boolean;
  threshold: number;
  adaptive: boolean;
  mode: Mode;
  alphamax: number;
  turdsize: number;
  opttolerance: number;
  spacing: number;
  space: number;
  glyphs: Record<number, GlyphAdjust>;
}

export const DEFAULT_ADJUST: GlyphAdjust = { dy: 0, scale: 1, lsb: null, rsb: null, missing: false, source: null };

export const settings: Settings = $state(structuredClone(DEFAULT_SETTINGS));

const hist = new History<Settings>($state.snapshot(settings) as Settings);
export const historyState = $state({ canUndo: false, canRedo: false });

function sync(): void {
  historyState.canUndo = hist.canUndo;
  historyState.canRedo = hist.canRedo;
}

export function loadSettings(s: Partial<Settings>): void {
  Object.assign(settings, { ...structuredClone(DEFAULT_SETTINGS), ...s, glyphs: structuredClone(s.glyphs ?? {}) });
}

export function resetSettings(): void {
  loadSettings({});
  hist.reset($state.snapshot(settings) as Settings);
  sync();
}

export function commitSettings(snapshot: Settings): void {
  hist.commit(snapshot);
  sync();
}

function flush(): void {
  hist.commit($state.snapshot(settings) as Settings);
}

export function undo(): void {
  flush();
  const s = hist.undo();
  if (s) loadSettings(s);
  sync();
}

export function redo(): void {
  flush();
  const s = hist.redo();
  if (s) loadSettings(s);
  sync();
}

export function patchGlyph(u: number, p: Partial<GlyphAdjust>): void {
  settings.glyphs[u] = { ...DEFAULT_ADJUST, ...settings.glyphs[u], ...p };
}

export function resetGlyph(u: number): void {
  delete settings.glyphs[u];
}

export function buildSettings(): BuildSettings {
  return {
    family: fontSettings.family,
    designer: fontSettings.designer,
    lsb: SIDE_BEARING + settings.spacing,
    rsb: SIDE_BEARING + settings.spacing,
    space: settings.space,
    trace: { turdsize: settings.turdsize, alphamax: settings.alphamax, opttolerance: settings.opttolerance },
  };
}
