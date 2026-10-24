import type { BuildGlyph } from '../font/build';
import type { CellResult } from '../vision/cells';
import { captures } from './captures.svelte';
import { settings } from './settings.svelte';

export interface Source {
  id: string;
  name: string;
  page: number;
  cell: CellResult;
}

export function sourcesFor(u: number): Source[] {
  const out: Source[] = [];
  for (const it of [...captures.items].sort((a, b) => a.page - b.page)) {
    const cell = it.cells.find((c) => c.unicode === u && !c.missing);
    if (cell) out.push({ id: it.uid, name: it.name, page: it.page, cell });
  }
  return out;
}

export function chosenFor(u: number): Source | null {
  const list = sourcesFor(u);
  const want = settings.glyphs[u]?.source;
  return list.find((s) => s.id === want) ?? list[0] ?? null;
}

export function altFor(u: number): Source | null {
  const chosen = chosenFor(u);
  return sourcesFor(u).find((s) => s.id !== chosen?.id) ?? null;
}

export function alternateCount(): number {
  const unicodes = new Set<number>();
  for (const it of captures.items) for (const c of it.cells) if (!c.missing) unicodes.add(c.unicode);
  let n = 0;
  for (const u of unicodes) if (!settings.glyphs[u]?.missing && altFor(u)) n++;
  return n;
}

export function collectGlyphs(): BuildGlyph[] {
  const unicodes = new Set<number>();
  for (const it of captures.items) for (const c of it.cells) if (!c.missing) unicodes.add(c.unicode);
  const out: BuildGlyph[] = [];
  for (const u of unicodes) {
    const a = settings.glyphs[u];
    if (a?.missing) continue;
    const s = chosenFor(u);
    if (!s) continue;
    const alt = settings.alternates ? altFor(u) : null;
    out.push({
      unicode: u,
      w: s.cell.w,
      h: s.cell.h,
      baseline: s.cell.guides.baseline,
      bitmap: s.cell.bitmap,
      alt: alt
        ? { w: alt.cell.w, h: alt.cell.h, baseline: alt.cell.guides.baseline, bitmap: alt.cell.bitmap }
        : undefined,
      dy: a?.dy,
      scale: a?.scale,
      lsb: a?.lsb ?? undefined,
      rsb: a?.rsb ?? undefined,
    });
  }
  return out;
}
