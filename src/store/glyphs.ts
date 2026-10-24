import { MAX_ALTS } from '../font/alternates';
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

export function altsFor(u: number): Source[] {
  const chosen = chosenFor(u);
  const rest = sourcesFor(u).filter((s) => s.id !== chosen?.id);
  const want = settings.glyphs[u]?.alts;
  return (want ? rest.filter((s) => want.includes(s.id)) : rest).slice(0, MAX_ALTS);
}

export function sourceLabel(s: Source, all: readonly Source[]): string {
  const same = all.filter((o) => o.page === s.page).length > 1;
  return same ? `page ${s.page} · ${s.name}` : `page ${s.page}`;
}

export function alternateCount(): number {
  const unicodes = new Set<number>();
  for (const it of captures.items) for (const c of it.cells) if (!c.missing) unicodes.add(c.unicode);
  let n = 0;
  for (const u of unicodes) if (!settings.glyphs[u]?.missing && altsFor(u).length > 0) n++;
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
    const alts = settings.alternates ? altsFor(u) : [];
    out.push({
      unicode: u,
      w: s.cell.w,
      h: s.cell.h,
      baseline: s.cell.guides.baseline,
      bitmap: s.cell.bitmap,
      alts: alts.length > 0 ? alts.map((x) => ({ w: x.cell.w, h: x.cell.h, baseline: x.cell.guides.baseline, bitmap: x.cell.bitmap })) : undefined,
      dy: a?.dy,
      scale: a?.scale,
      lsb: a?.lsb ?? undefined,
      rsb: a?.rsb ?? undefined,
    });
  }
  return out;
}
