import { describe, expect, it } from 'vitest';
import { compress, decompress } from 'brotli';
import { buildFont, type BuildGlyph, type BuildSettings } from '../src/font/build';
import { readSfnt, withTables } from '../src/font/sfnt';
import { base128, toWoff2 } from '../src/font/woff2';
import { DEFAULT_TRACE } from '../src/trace/params';

const settings: BuildSettings = { family: 'Woff Two', designer: '', lsb: 40, rsb: 40, space: 300, trace: DEFAULT_TRACE, kerning: 1 };

function glyphs(): BuildGlyph[] {
  const w = 80;
  const h = 100;
  return [65, 66, 233].map((u, k) => {
    const bitmap = new Uint8Array(w * h);
    for (let y = 10; y < 80; y++) for (let x = 8 + k * 3; x < 50; x++) bitmap[y * w + x] = 1;
    return { unicode: u, w, h, baseline: 80, bitmap };
  });
}

const fast = (b: Uint8Array) => compress(b, { quality: 5, mode: 2 });

function readBase128(bytes: Uint8Array, at: number): { value: number; next: number } {
  let value = 0;
  let i = at;
  for (;;) {
    const b = bytes[i++];
    value = value * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) return { value, next: i };
  }
}

interface Entry {
  tag: string;
  flags: number;
  length: number;
}

function readDirectory(out: Uint8Array, count: number): { entries: Entry[]; end: number } {
  const known = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp'];
  let at = 48;
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const flags = out[at++];
    let tag: string;
    if ((flags & 63) === 63) {
      tag = String.fromCharCode(out[at], out[at + 1], out[at + 2], out[at + 3]);
      at += 4;
    } else {
      tag = known[flags & 63];
    }
    const r = readBase128(out, at);
    at = r.next;
    entries.push({ tag, flags, length: r.value });
  }
  return { entries, end: at };
}

describe('base128', () => {
  it('encodes the boundaries', () => {
    expect(base128(0)).toEqual([0]);
    expect(base128(127)).toEqual([127]);
    expect(base128(128)).toEqual([0x81, 0x00]);
    expect(base128(16383)).toEqual([0xff, 0x7f]);
    expect(base128(16384)).toEqual([0x81, 0x80, 0x00]);
    expect(base128(0xffffffff)).toEqual([0x8f, 0xff, 0xff, 0xff, 0x7f]);
  });

  it('round-trips and never starts with a redundant 0x80', () => {
    for (const n of [1, 5, 99, 300, 5000, 70000, 1 << 24, 2 ** 31]) {
      const b = base128(n);
      expect(b[0]).not.toBe(0x80);
      expect(readBase128(Uint8Array.from(b), 0).value).toBe(n);
    }
  });

  it('rejects values it cannot represent', () => {
    for (const n of [-1, 1.5, 2 ** 32, NaN]) expect(() => base128(n)).toThrow(RangeError);
  });
});

describe('toWoff2', () => {
  it('writes a valid header', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    const out = new Uint8Array(await toWoff2(buffer, fast));
    const v = new DataView(out.buffer);
    const src = readSfnt(buffer);
    expect(v.getUint32(0)).toBe(0x774f4632);
    expect(v.getUint32(4)).toBe(0x4f54544f);
    expect(v.getUint32(8)).toBe(out.length);
    expect(out.length % 4).toBe(0);
    expect(v.getUint16(12)).toBe(src.tables.size);
    expect(v.getUint16(14)).toBe(0);
    expect(v.getUint32(16)).toBe(buffer.byteLength);
    for (const o of [28, 32, 36, 40, 44]) expect(v.getUint32(o)).toBe(0);
  });

  it('stores every table exactly in the compressed stream', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    const out = new Uint8Array(await toWoff2(buffer, fast));
    const v = new DataView(out.buffer);
    const { entries, end } = readDirectory(out, v.getUint16(12));
    const packed = out.subarray(end, end + v.getUint32(20));
    const raw = new Uint8Array(decompress(packed));
    const src = readSfnt(buffer);
    expect(entries.map((e) => e.tag)).toEqual([...src.tables.keys()].sort());
    let at = 0;
    for (const e of entries) {
      expect(Array.from(raw.subarray(at, at + e.length)), e.tag).toEqual(Array.from(src.tables.get(e.tag)!));
      at += e.length;
    }
    expect(at).toBe(raw.length);
  });

  it('is smaller than the font it wraps', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    expect((await toWoff2(buffer, fast)).byteLength).toBeLessThan(buffer.byteLength);
  });

  it('marks glyf and loca with the null transform and nothing else', async () => {
    const { buffer } = await buildFont(glyphs(), { ...settings, format: 'ttf' });
    const out = new Uint8Array(await toWoff2(buffer, fast));
    const { entries } = readDirectory(out, new DataView(out.buffer).getUint16(12));
    for (const e of entries) expect(e.flags >> 6, e.tag).toBe(e.tag === 'glyf' || e.tag === 'loca' ? 3 : 0);
    expect(new DataView(out.buffer).getUint32(4)).toBe(0x00010000);
  });

  it('spells out tags that have no short code', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    const withExtra = withTables(buffer, { TEST: new Uint8Array([1, 2, 3, 4, 5]) });
    const out = new Uint8Array(await toWoff2(withExtra, fast));
    const { entries } = readDirectory(out, new DataView(out.buffer).getUint16(12));
    const e = entries.find((x) => x.tag === 'TEST')!;
    expect(e.flags & 63).toBe(63);
    expect(e.length).toBe(5);
  });

  it('fails clearly when compression fails or the font is truncated', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    await expect(toWoff2(buffer, async () => null)).rejects.toThrow('compression failed');
    await expect(toWoff2(buffer.slice(0, 40), fast)).rejects.toThrow();
  });

  it('works with the default compressor', async () => {
    const { buffer } = await buildFont(glyphs(), settings);
    const out = await toWoff2(buffer);
    expect(new DataView(out).getUint32(0)).toBe(0x774f4632);
    expect(out.byteLength).toBeLessThan(buffer.byteLength);
  }, 30000);
});
