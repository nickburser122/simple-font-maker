import { describe, expect, it } from 'vitest';
import { parse } from 'opentype.js';
import { buildFont, type BuildGlyph, type BuildSettings } from '../src/font/build';
import { toWoff, woffSupported } from '../src/font/woff';
import { SETS, missingChars } from '../src/charset/sets';
import { DEFAULT_TRACE } from '../src/trace/params';

const settings: BuildSettings = { family: 'Woff Hand', designer: '', lsb: 40, rsb: 40, space: 300, trace: DEFAULT_TRACE };

function glyphs(): BuildGlyph[] {
  const w = 40;
  const h = 60;
  return [65, 66, 233].map((u, k) => {
    const bitmap = new Uint8Array(w * h);
    for (let y = 10; y < 50; y++) for (let x = 8 + k * 3; x < 30; x++) bitmap[y * w + x] = 1;
    return { unicode: u, w, h, baseline: 45, bitmap };
  });
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

describe('woff', () => {
  it('is supported in the test runtime', () => {
    expect(woffSupported()).toBe(true);
  });

  it('writes a valid WOFF 1.0 container that round-trips every table', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    const woff = await toWoff(buffer);
    const v = new DataView(woff);
    expect(v.getUint32(0)).toBe(0x774f4646);
    expect(v.getUint32(4)).toBe(new DataView(buffer).getUint32(0));
    expect(v.getUint32(8)).toBe(woff.byteLength);
    expect(v.getUint32(16)).toBe(buffer.byteLength);
    expect(v.getUint16(14)).toBe(0);
    const n = v.getUint16(12);
    expect(n).toBe(new DataView(buffer).getUint16(4));
    const src = new DataView(buffer);
    const original = new Map<string, Uint8Array>();
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(src.getUint8(o), src.getUint8(o + 1), src.getUint8(o + 2), src.getUint8(o + 3));
      original.set(tag, new Uint8Array(buffer, src.getUint32(o + 8), src.getUint32(o + 12)));
    }
    let prev = '';
    for (let i = 0; i < n; i++) {
      const o = 44 + i * 20;
      const tag = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
      expect(tag > prev).toBe(true);
      prev = tag;
      const offset = v.getUint32(o + 4);
      const comp = v.getUint32(o + 8);
      const orig = v.getUint32(o + 12);
      expect(offset % 4).toBe(0);
      expect(comp).toBeLessThanOrEqual(orig);
      const body = new Uint8Array(woff, offset, comp);
      const raw = comp < orig ? await inflate(body) : body;
      expect(raw.length).toBe(orig);
      expect(Array.from(raw)).toEqual(Array.from(original.get(tag)!));
    }
  });

  it('compresses the font', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    const woff = await toWoff(buffer);
    expect(woff.byteLength).toBeLessThan(buffer.byteLength);
  });

  it('parses back into the same glyph set', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    const a = parse(buffer);
    const b = parse(await toWoff(buffer));
    expect(b.numGlyphs).toBe(a.numGlyphs);
    for (const ch of 'ABé') expect(b.charToGlyph(ch).advanceWidth).toBe(a.charToGlyph(ch).advanceWidth);
  });

  it('rejects a truncated font', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    await expect(toWoff(buffer.slice(0, 60))).rejects.toThrow();
  });
});

describe('missingChars', () => {
  it('lists set characters without a glyph, in set order', () => {
    const have = [...SETS.basic.chars].filter((c) => !'aZ9'.includes(c)).map((c) => c.codePointAt(0)!);
    expect(missingChars(SETS.basic.chars, have)).toEqual(['Z', 'a', '9']);
  });

  it('is empty when everything is present and full when nothing is', () => {
    expect(missingChars(SETS.basic.chars, SETS.basic.chars.map((c) => c.codePointAt(0)!))).toEqual([]);
    expect(missingChars(SETS.basic.chars, [])).toEqual([...SETS.basic.chars]);
  });
});
