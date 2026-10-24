import { SETS } from '../charset/sets';
import { pageCount } from '../template/layout';
import type { CellOpts, CellResult } from '../vision/cells';
import type { Pt } from '../vision/types';
import { extract, load, release } from '../worker/client';
import { idbDelete, idbSet } from './idb';
import { project } from './project.svelte';
import { settings } from './settings.svelte';

export interface Capture {
  id: number;
  uid: string;
  restored: boolean;
  name: string;
  url: string;
  page: number;
  corners: Pt[];
  detected: boolean;
  autoPage: boolean;
  status: 'loading' | 'ready' | 'working' | 'failed';
  cells: CellResult[];
  lowInk: boolean;
  error: string;
}

export const captures: {
  items: Capture[];
} = $state({ items: [] });

const fallback: Pt[] = [
  [0.15, 0.12],
  [0.85, 0.12],
  [0.85, 0.88],
  [0.15, 0.88],
];
const tokens = new Map<number, number>();
let nextId = 1;

function find(id: number): Capture | undefined {
  return captures.items.find((c) => c.id === id);
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'something went wrong';
}

export function cellOpts(): CellOpts {
  return {
    threshold: settings.auto ? null : settings.threshold,
    adaptive: settings.adaptive,
    mode: settings.mode,
  };
}

export async function run(id: number): Promise<void> {
  const it = find(id);
  if (!it || it.restored || it.status === 'loading' || it.status === 'failed') return;
  const token = (tokens.get(id) ?? 0) + 1;
  tokens.set(id, token);
  it.status = 'working';
  try {
    const res = await extract({
      cap: id,
      corners: $state.snapshot(it.corners) as Pt[],
      paper: project.paper,
      setId: project.setId,
      page: it.page,
      opts: cellOpts(),
    });
    const cur = find(id);
    if (cur && tokens.get(id) === token) {
      if (cur.autoPage) {
        cur.autoPage = false;
        const total = pageCount(SETS[project.setId].chars.length, project.paper);
        if (res.pageCode !== null && res.pageCode <= total && res.pageCode !== cur.page) {
          cur.page = res.pageCode;
          void run(id);
          return;
        }
      }
      cur.cells = res.cells;
      cur.lowInk = res.lowInk;
      cur.error = '';
      cur.status = 'ready';
    }
  } catch (e) {
    const cur = find(id);
    if (cur && tokens.get(id) === token) {
      cur.error = message(e);
      cur.status = 'ready';
    }
  }
}

export interface AddInit {
  uid?: string;
  name?: string;
  page?: number;
  corners?: Pt[];
  detected?: boolean;
}

export async function addFile(file: Blob, init: AddInit = {}): Promise<void> {
  const id = nextId++;
  const uid = init.uid ?? crypto.randomUUID();
  const total = pageCount(SETS[project.setId].chars.length, project.paper);
  const used = new Set(captures.items.map((c) => c.page));
  const page =
    init.page ?? Array.from({ length: total }, (_, i) => i + 1).find((n) => !used.has(n)) ?? 1;
  captures.items.push({
    id,
    uid,
    restored: false,
    name: init.name ?? (file instanceof File ? file.name : 'photo'),
    url: URL.createObjectURL(file),
    page,
    corners: (init.corners ?? fallback).map((p) => [...p] as Pt),
    detected: init.detected ?? false,
    autoPage: init.page === undefined,
    status: 'loading',
    cells: [],
    lowInk: false,
    error: '',
  });
  if (!init.uid) idbSet(`photo:${uid}`, file).catch(() => undefined);
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const res = await load(id, bitmap);
    const it = find(id);
    if (!it) return;
    if (res.corners && !init.corners) {
      it.corners = res.corners;
      it.detected = true;
    }
    if (!it.detected) it.autoPage = false;
    it.status = 'ready';
    await run(id);
  } catch (e) {
    const it = find(id);
    if (it) {
      it.status = 'failed';
      it.error = message(e);
    }
  }
}

export function addRestored(init: Required<AddInit> & { cells: CellResult[] }): void {
  captures.items.push({
    id: nextId++,
    uid: init.uid,
    restored: true,
    name: init.name,
    url: '',
    page: init.page,
    corners: init.corners.map((p) => [...p] as Pt),
    detected: init.detected,
    autoPage: false,
    status: 'ready',
    cells: init.cells,
    lowInk: false,
    error: '',
  });
}

export function clearCaptures(deletePhotos = true): void {
  for (const it of captures.items) {
    if (it.url) URL.revokeObjectURL(it.url);
    tokens.delete(it.id);
    if (!it.restored) release(it.id);
    if (deletePhotos) idbDelete(`photo:${it.uid}`).catch(() => undefined);
  }
  captures.items.splice(0);
}

export function setPage(id: number, page: number): void {
  const it = find(id);
  if (!it) return;
  it.page = page;
  it.autoPage = false;
  void run(id);
}

export function cornersMoved(id: number): void {
  const it = find(id);
  if (!it) return;
  it.detected = false;
  it.autoPage = false;
  void run(id);
}

export function removeCapture(id: number): void {
  const i = captures.items.findIndex((c) => c.id === id);
  if (i < 0) return;
  if (captures.items[i].url) URL.revokeObjectURL(captures.items[i].url);
  const [gone] = captures.items.splice(i, 1);
  tokens.delete(id);
  if (!gone.restored) release(id);
  idbDelete(`photo:${gone.uid}`).catch(() => undefined);
}

export function rerunAll(): void {
  for (const it of captures.items) void run(it.id);
}
