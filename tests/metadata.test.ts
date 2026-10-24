import { describe, expect, it } from 'vitest';
import { parse } from 'opentype.js';
import { buildFont, type BuildGlyph, type BuildSettings } from '../src/font/build';
import { readSfnt } from '../src/font/sfnt';
import { tuneVerticalMetrics } from '../src/font/vertical';
import { DEFAULT_META, META_MAX, readMeta } from '../src/store/meta';
import { DEFAULT_TRACE } from '../src/trace/params';

const base: BuildSettings = { family: 'Meta Hand', designer: 'Me', lsb: 40, rsb: 40, space: 300, trace: DEFAULT_TRACE };

function glyphs(top = 10, bottom = 50, baseline = 100): BuildGlyph[] {
  const w = 40;
  const h = 300;
  const bitmap = new Uint8Array(w * h);
  for (let y = top; y < bottom; y++) for (let x = 8; x < 30; x++) bitmap[y * w + x] = 1;
  return [{ unicode: 65, w, h, baseline, bitmap }];
}

describe('readMeta', () => {
  it('uses defaults for missing or wrong-typed values', () => {
    expect(readMeta({})).toEqual(DEFAULT_META);
    expect(readMeta({ copyright: 4, license: null, fontVersion: 2 })).toEqual(DEFAULT_META);
  });

  it('trims and limits text and accepts simple versions only', () => {
    const m = readMeta({ copyright: `  ${'x'.repeat(500)}  `, license: ' OFL ', fontVersion: ' 2.5 ' });
    expect(m.copyright).toHaveLength(META_MAX);
    expect(m.license).toBe('OFL');
    expect(m.fontVersion).toBe('2.5');
    for (const bad of ['v1', '1.', '.5', '1.2.3', '1000.0', '1,5', '']) expect(readMeta({ fontVersion: bad }).fontVersion).toBe('1.000');
  });
});

describe('font naming', () => {
  it('writes version, copyright and license into the name table', async () => {
    const { buffer } = await buildFont(glyphs(), { ...base, version: '2.100', copyright: '(c) 2026 Me', license: 'SIL OFL 1.1' });
    const f = parse(buffer);
    expect(f.names.windows.version.en).toBe('Version 2.100');
    expect(f.names.windows.copyright.en).toBe('(c) 2026 Me');
    expect(f.names.windows.license.en).toBe('SIL OFL 1.1');
    expect(f.names.windows.designer.en).toBe('Me');
  });

  it('keeps the old default version and omits empty fields', async () => {
    const f = parse((await buildFont(glyphs(), base)).buffer);
    expect(f.names.windows.version.en).toBe('Version 1.000');
    expect((f.names.windows.copyright?.en ?? '').trim()).toBe('');
    expect((f.names.windows.license?.en ?? '').trim()).toBe('');
    const blank = parse((await buildFont(glyphs(), { ...base, version: '  ', copyright: ' ', license: '' })).buffer);
    expect(blank.names.windows.version.en).toBe('Version 1.000');
    expect((blank.names.windows.copyright?.en ?? '').trim()).toBe('');
  });
});

function os2(buffer: ArrayBuffer): DataView {
  const t = readSfnt(buffer).tables.get('OS/2')!;
  return new DataView(t.buffer, t.byteOffset, t.byteLength);
}

describe('vertical metrics', () => {
  it('uses the same typographic metrics everywhere and asks Windows to honour them', async () => {
    const { buffer } = await buildFont(glyphs(), base);
    const o = os2(buffer);
    expect(o.getInt16(68)).toBe(800);
    expect(o.getInt16(70)).toBe(-200);
    expect(o.getInt16(72)).toBe(0);
    expect(o.getUint16(62) & 0x80).toBe(0x80);
    const hhea = readSfnt(buffer).tables.get('hhea')!;
    const hv = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength);
    expect(hv.getInt16(4)).toBe(800);
    expect(hv.getInt16(6)).toBe(-200);
  });

  it('never clips: win metrics cover at least the ascender and descender', async () => {
    const o = os2((await buildFont(glyphs(), base)).buffer);
    expect(o.getUint16(74)).toBeGreaterThanOrEqual(800);
    expect(o.getUint16(76)).toBeGreaterThanOrEqual(200);
  });

  it('grows the win metrics for very tall and very deep glyphs', async () => {
    const tall = os2((await buildFont(glyphs(0, 250, 250), base)).buffer);
    expect(tall.getUint16(74)).toBeGreaterThan(800);
    const deep = os2((await buildFont(glyphs(60, 300), base)).buffer);
    expect(deep.getUint16(76)).toBeGreaterThan(200);
  });

  it('leaves a font without OS/2 untouched', () => {
    const empty = new ArrayBuffer(12);
    new DataView(empty).setUint32(0, 0x4f54544f);
    expect(tuneVerticalMetrics(empty, 800, -200)).toBe(empty);
  });

  it('keeps the file checksum valid', async () => {
    const { buffer } = await buildFont(glyphs(), base);
    const u = new Uint8Array(buffer);
    let sum = 0;
    const dv = new DataView(buffer);
    for (let i = 0; i + 4 <= u.length; i += 4) sum = (sum + dv.getUint32(i)) >>> 0;
    expect(sum).toBe(0xb1b0afba);
  });
});
