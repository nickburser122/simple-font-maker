import { Font, Glyph, Path } from 'opentype.js';
import type { TraceParams } from '../trace/params';
import type { Contour } from '../trace/path-parse';
import { traceBitmap } from '../trace/potrace';
import type { Tracer } from '../trace/cache';
import { MAX_ALTS, buildAlternateGsub, type AlternateSet } from './alternates';
import { makeKernGpos, type KernClass } from './gpos';
import { computeKerning, profileOf, type KernGlyph } from './kerning';
import { withTables } from './sfnt';
import { PPM } from '../vision/cells';
import { ASCENDER, DESCENDER, UPM, mapContours, unitsPerPixel } from './metrics';

export interface BuildSettings {
  family: string;
  designer: string;
  lsb: number;
  rsb: number;
  space: number;
  trace: TraceParams;
  kerning?: number;
}

export interface GlyphImage {
  w: number;
  h: number;
  baseline: number;
  bitmap: Uint8Array;
}

export interface BuildGlyph extends GlyphImage {
  unicode: number;
  alts?: GlyphImage[];
  dy?: number;
  scale?: number;
  lsb?: number;
  rsb?: number;
}

export type Outlines = Record<number, { d: string; advance: number }>;

export function glyphName(u: number): string {
  const hex = u.toString(16).toUpperCase();
  return u <= 0xffff ? `uni${hex.padStart(4, '0')}` : `u${hex}`;
}

export function toSvgPath(contours: Contour[]): string {
  const f = ([x, y]: [number, number]) => `${x} ${-y}`;
  return contours
    .map(
      (c) =>
        `M${f(c.start)}` +
        c.segs.map((s) => (s.t === 'L' ? `L${f(s.p)}` : `C${f(s.c1)} ${f(s.c2)} ${f(s.p)}`)).join('') +
        'Z',
    )
    .join('');
}

export function toPath(contours: Contour[]): Path {
  const p = new Path();
  for (const c of contours) {
    p.moveTo(c.start[0], c.start[1]);
    for (const s of c.segs) {
      if (s.t === 'L') p.lineTo(s.p[0], s.p[1]);
      else p.curveTo(s.c1[0], s.c1[1], s.c2[0], s.c2[1], s.p[0], s.p[1]);
    }
    p.close();
  }
  return p;
}

function notdef(): Glyph {
  const p = new Path();
  p.moveTo(50, 0);
  p.lineTo(450, 0);
  p.lineTo(450, 700);
  p.lineTo(50, 700);
  p.close();
  p.moveTo(100, 50);
  p.lineTo(100, 650);
  p.lineTo(400, 650);
  p.lineTo(400, 50);
  p.close();
  return new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: p });
}

export async function buildFont(
  glyphs: BuildGlyph[],
  s: BuildSettings,
  ppm: number = PPM,
  onProgress?: (done: number, total: number) => void,
  trace: Tracer = traceBitmap,
): Promise<{ buffer: ArrayBuffer; outlines: Outlines }> {
  const sorted = glyphs.filter((g) => g.unicode !== 32).sort((a, b) => a.unicode - b.unicode);
  const upp = unitsPerPixel(ppm);
  const outlines: Outlines = {};
  const out: Glyph[] = [
    notdef(),
    new Glyph({ name: 'space', unicode: 32, advanceWidth: Math.round(s.space), path: new Path() }),
  ];
  const sets: AlternateSet[] = [];
  const kernGlyphs: KernGlyph[] = [];
  const kernClasses: { glyphs: number[] }[] = [];
  const place = async (g: BuildGlyph, img: GlyphImage) => {
    const contours = await trace(img.bitmap, img.w, img.h, s.trace);
    if (contours.length === 0) return null;
    return mapContours(contours, {
      baseline: img.baseline,
      unitsPerPx: upp,
      lsb: g.lsb ?? s.lsb,
      rsb: g.rsb ?? s.rsb,
      dy: g.dy,
      scale: g.scale,
    });
  };
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const m = await place(g, g);
    if (m) {
      outlines[g.unicode] = { d: toSvgPath(m.contours), advance: Math.round(m.advance) };
      out.push(
        new Glyph({
          name: glyphName(g.unicode),
          unicode: g.unicode,
          advanceWidth: Math.round(m.advance),
          path: toPath(m.contours),
        }),
      );
      const base = out.length - 1;
      kernGlyphs.push({ profile: profileOf(m.contours, Math.round(m.advance)) });
      kernClasses.push({ glyphs: [base] });
      const made: number[] = [];
      for (const [k, img] of (g.alts ?? []).slice(0, MAX_ALTS).entries()) {
        const a = await place(g, img);
        if (!a) continue;
        out.push(
          new Glyph({
            name: `${glyphName(g.unicode)}.alt${k === 0 ? '' : k + 1}`,
            advanceWidth: Math.round(a.advance),
            path: toPath(a.contours),
          }),
        );
        made.push(out.length - 1);
        kernClasses[kernClasses.length - 1].glyphs.push(out.length - 1);
      }
      if (made.length > 0) sets.push({ base, alts: made });
    }
    onProgress?.(i + 1, sorted.length);
  }
  const font = new Font({
    familyName: s.family.trim() || 'Handwriting',
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: ASCENDER,
    descender: DESCENDER,
    designer: s.designer.trim(),
    version: 'Version 1.000',
    glyphs: out,
  });
  const gsub = buildAlternateGsub(sets);
  if (gsub) font.tables.gsub = gsub;
  let buffer = font.toArrayBuffer();
  const strength = s.kerning ?? 0;
  if (strength > 0 && kernGlyphs.length > 1) {
    const gpos = makeKernGpos(computeKerning(kernGlyphs, strength), kernClasses as KernClass[]);
    if (gpos) buffer = withTables(buffer, { GPOS: gpos });
  }
  return { buffer, outlines };
}
