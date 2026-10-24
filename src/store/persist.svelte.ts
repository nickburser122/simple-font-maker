import type { CellResult } from '../vision/cells';
import type { Pt } from '../vision/types';
import { addFile, addRestored, captures, clearCaptures } from './captures.svelte';
import { fontSettings } from './font.svelte';
import { idbDelete, idbErase, idbGet, idbSet } from './idb';
import { nav } from './nav.svelte';
import { decodeBitmap, encodeBitmap } from './png';
import { parseProjectFile, type ProjectFile } from './project-file';
import { readSession, type IdbProject } from './session';
import { project } from './project.svelte';
import { loadSettings, resetSettings, settings, type Settings } from './settings.svelte';

const KEY = 'project';

export const persistState = $state({ ready: false });

export function currentProject(): IdbProject | null {
  if (captures.items.length === 0) return null;
  return {
    version: 1,
    setId: project.setId,
    paper: project.paper,
    family: fontSettings.family,
    designer: fontSettings.designer,
    settings: $state.snapshot(settings) as Settings,
    captures: captures.items
      .filter((c) => c.status !== 'failed')
      .map((c) => ({
        uid: c.uid,
        name: c.name,
        page: c.page,
        corners: $state.snapshot(c.corners) as Pt[],
        detected: c.detected,
        cells: c.restored ? ($state.snapshot(c.cells) as CellResult[]) : undefined,
      })),
  };
}

export async function saveSession(p: IdbProject | null): Promise<void> {
  try {
    if (p) await idbSet(KEY, p);
    else await idbDelete(KEY);
  } catch {
    return;
  }
}

export async function loadSession(): Promise<void> {
  try {
    const p = readSession(await idbGet<unknown>(KEY));
    if (p) {
      project.setId = p.setId;
      project.paper = p.paper;
      fontSettings.family = p.family;
      fontSettings.designer = p.designer;
      loadSettings(p.settings);
      for (const c of p.captures) {
        if (c.cells) addRestored({ ...c, cells: c.cells });
        else {
          const blob = await idbGet<Blob>(`photo:${c.uid}`);
          if (blob) await addFile(blob, c);
        }
      }
    }
  } catch {
    clearCaptures(false);
  } finally {
    persistState.ready = true;
  }
}

export function projectFileName(): string {
  const base = fontSettings.family.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-') || 'Handwriting';
  return `${base}.fontproject`;
}

export function exportProject(): string {
  const file: ProjectFile = {
    version: 1,
    app: 'handwriting-font-maker',
    setId: project.setId,
    paper: project.paper,
    family: fontSettings.family,
    designer: fontSettings.designer,
    settings: $state.snapshot(settings) as Settings,
    captures: captures.items
      .filter((c) => c.status !== 'failed')
      .map((c) => ({
        uid: c.uid,
        name: c.name,
        page: c.page,
        corners: $state.snapshot(c.corners) as Pt[],
        detected: c.detected,
        cells: c.cells.map((cell) => ({
          char: cell.char,
          unicode: cell.unicode,
          page: cell.page,
          row: cell.row,
          col: cell.col,
          w: cell.w,
          h: cell.h,
          originX: cell.originX,
          originY: cell.originY,
          ink: cell.ink,
          missing: cell.missing,
          guides: { ...cell.guides },
          png: encodeBitmap(cell.bitmap, cell.w, cell.h),
        })),
      })),
  };
  return JSON.stringify(file);
}

export async function importProject(text: string): Promise<void> {
  const f = parseProjectFile(text);
  const decoded = await Promise.all(
    f.captures.map(async (c) => ({
      ...c,
      cells: await Promise.all(
        c.cells.map(async ({ png, ...rest }): Promise<CellResult> => ({
          ...rest,
          ink: rest.ink,
          bitmap: await decodeBitmap(png, rest.w, rest.h),
        })),
      ),
    })),
  );
  clearCaptures();
  project.setId = f.setId;
  project.paper = f.paper;
  fontSettings.family = f.family;
  fontSettings.designer = f.designer;
  loadSettings(f.settings);
  for (const c of decoded) addRestored(c);
  nav.step = 3;
}

export async function eraseEverything(): Promise<void> {
  persistState.ready = false;
  try {
    await idbErase();
  } catch {
    persistState.ready = true;
  }
  clearCaptures(false);
  project.setId = 'basic';
  project.paper = 'a4';
  fontSettings.family = 'My Handwriting';
  fontSettings.designer = '';
  resetSettings();
  nav.step = 1;
  persistState.ready = true;
}
