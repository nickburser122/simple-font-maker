import type { KernMatrix } from './kerning';

export interface KernClass {
  glyphs: readonly number[];
}

class Bytes {
  private data: number[] = [];

  u16(v: number): this {
    this.data.push((v >> 8) & 255, v & 255);
    return this;
  }

  i16(v: number): this {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }

  u32(v: number): this {
    return this.u16(Math.floor(v / 0x10000) & 0xffff).u16(v & 0xffff);
  }

  tag(s: string): this {
    for (let i = 0; i < 4; i++) this.data.push(s.charCodeAt(i));
    return this;
  }

  bytes(b: ArrayLike<number>): this {
    for (let i = 0; i < b.length; i++) this.data.push(b[i]);
    return this;
  }

  get length(): number {
    return this.data.length;
  }

  done(): Uint8Array {
    return Uint8Array.from(this.data);
  }
}

function coverage(glyphs: readonly number[]): Uint8Array {
  const sorted = [...new Set(glyphs)].sort((a, b) => a - b);
  const w = new Bytes().u16(1).u16(sorted.length);
  for (const g of sorted) w.u16(g);
  return w.done();
}

function classDef(map: Map<number, number>): Uint8Array {
  const ids = [...map.keys()].sort((a, b) => a - b);
  if (ids.length === 0) return new Bytes().u16(1).u16(0).u16(0).done();
  const start = ids[0];
  const count = ids[ids.length - 1] - start + 1;
  const w = new Bytes().u16(1).u16(start).u16(count);
  for (let i = 0; i < count; i++) w.u16(map.get(start + i) ?? 0);
  return w.done();
}

export function makeKernGpos(matrix: KernMatrix, classes: readonly KernClass[]): Uint8Array | null {
  const n = matrix.size;
  if (classes.length !== n) throw new Error('class count must match matrix size');
  const rows: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < n; i++) {
    if (classes[i].glyphs.length === 0) continue;
    for (let j = 0; j < n; j++) {
      if (matrix.values[i * n + j] !== 0 && classes[j].glyphs.length > 0) {
        if (!rows.includes(i)) rows.push(i);
        if (!cols.includes(j)) cols.push(j);
      }
    }
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a - b);
  cols.sort((a, b) => a - b);
  const first = new Map<number, number>();
  rows.forEach((r, k) => classes[r].glyphs.forEach((g) => first.set(g, k + 1)));
  const second = new Map<number, number>();
  cols.forEach((c, k) => classes[c].glyphs.forEach((g) => second.set(g, k + 1)));
  const c1 = rows.length + 1;
  const c2 = cols.length + 1;

  const cov = coverage([...first.keys()]);
  const cd1 = classDef(first);
  const cd2 = classDef(second);
  const records = new Bytes();
  for (let a = 0; a < c1; a++) {
    for (let b = 0; b < c2; b++) {
      records.i16(a === 0 || b === 0 ? 0 : matrix.values[rows[a - 1] * n + cols[b - 1]]);
    }
  }
  const headerSize = 16;
  const covAt = headerSize + records.length;
  const cd1At = covAt + cov.length;
  const cd2At = cd1At + cd1.length;
  const sub = new Bytes()
    .u16(2)
    .u16(covAt)
    .u16(0x0004)
    .u16(0)
    .u16(cd1At)
    .u16(cd2At)
    .u16(c1)
    .u16(c2)
    .bytes(records.done())
    .bytes(cov)
    .bytes(cd1)
    .bytes(cd2)
    .done();

  const langSys = new Bytes().u16(0).u16(0xffff).u16(1).u16(0).done();
  const script = new Bytes().u16(4).u16(0).bytes(langSys).done();
  const scriptList = new Bytes().u16(1).tag('DFLT').u16(8).bytes(script).done();
  const feature = new Bytes().u16(0).u16(1).u16(0).done();
  const featureList = new Bytes().u16(1).tag('kern').u16(8).bytes(feature).done();
  const lookup = new Bytes().u16(2).u16(0).u16(1).u16(8).bytes(sub).done();
  const lookupList = new Bytes().u16(1).u16(4).bytes(lookup).done();

  const scriptAt = 10;
  const featureAt = scriptAt + scriptList.length;
  const lookupAt = featureAt + featureList.length;
  return new Bytes()
    .u32(0x00010000)
    .u16(scriptAt)
    .u16(featureAt)
    .u16(lookupAt)
    .bytes(scriptList)
    .bytes(featureList)
    .bytes(lookupList)
    .done();
}
