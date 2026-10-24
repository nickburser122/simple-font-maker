import { describe, expect, it } from 'vitest';
import { buildFont, type BuildGlyph } from '../src/font/build';
import { checksum, readSfnt, withTables, writeSfnt } from '../src/font/sfnt';
import { DEFAULT_TRACE } from '../src/trace/params';

async function sample(): Promise<ArrayBuffer> {
  const w = 40;
  const h = 60;
  const gl: BuildGlyph[] = [65, 66].map((u, k) => {
    const bitmap = new Uint8Array(w * h);
    for (let y = 10; y < 50; y++) for (let x = 8 + k * 3; x < 30; x++) bitmap[y * w + x] = 1;
    return { unicode: u, w, h, baseline: 45, bitmap };
  });
  return (await buildFont(gl, { family: 'Sfnt', designer: '', lsb: 40, rsb: 40, space: 300, trace: DEFAULT_TRACE })).buffer;
}

function wholeFileSum(buf: ArrayBuffer): number {
  return checksum(new Uint8Array(buf));
}

describe('checksum', () => {
  it('sums big-endian words and pads the tail with zeros', () => {
    expect(checksum(new Uint8Array([0, 0, 0, 1]))).toBe(1);
    expect(checksum(new Uint8Array([0, 0, 0, 1, 0, 0, 0, 2]))).toBe(3);
    expect(checksum(new Uint8Array([1]))).toBe(0x01000000);
    expect(checksum(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 2]))).toBe(1);
  });
});

describe('sfnt round trip', () => {
  it('keeps every table byte-identical', async () => {
    const original = await sample();
    const a = readSfnt(original);
    const b = readSfnt(writeSfnt(a));
    expect([...b.tables.keys()].sort()).toEqual([...a.tables.keys()].sort());
    for (const [tag, data] of a.tables) {
      if (tag === 'head') continue;
      expect(Array.from(b.tables.get(tag)!), tag).toEqual(Array.from(data));
    }
    expect(b.version).toBe(a.version);
  });

  it('produces a file whose checksum adjustment makes the total sum 0xB1B0AFBA', async () => {
    const out = writeSfnt(readSfnt(await sample()));
    expect(wholeFileSum(out)).toBe(0xb1b0afba);
  });

  it('keeps 4-byte alignment and sorted tags', async () => {
    const out = writeSfnt(readSfnt(await sample()));
    const v = new DataView(out);
    const n = v.getUint16(4);
    let prev = '';
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
      expect(tag > prev).toBe(true);
      prev = tag;
      expect(v.getUint32(o + 8) % 4).toBe(0);
    }
    expect(out.byteLength % 4).toBe(0);
  });

  it('adds, replaces and removes tables', async () => {
    const original = await sample();
    const added = withTables(original, { TEST: new Uint8Array([1, 2, 3]) });
    expect(readSfnt(added).tables.get('TEST')).toEqual(new Uint8Array([1, 2, 3]));
    expect(wholeFileSum(added)).toBe(0xb1b0afba);
    const removed = withTables(added, { TEST: null });
    expect(readSfnt(removed).tables.has('TEST')).toBe(false);
  });

  it('rejects truncated input', async () => {
    const original = await sample();
    expect(() => readSfnt(original.slice(0, 8))).toThrow();
    expect(() => readSfnt(original.slice(0, 100))).toThrow();
  });
});
