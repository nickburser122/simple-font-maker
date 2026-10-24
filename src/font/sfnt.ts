export interface Sfnt {
  version: number;
  tables: Map<string, Uint8Array>;
}

export const CFF_VERSION = 0x4f54544f;
export const TRUETYPE_VERSION = 0x00010000;

function pad4(n: number): number {
  return (n + 3) & ~3;
}

export function checksum(bytes: Uint8Array): number {
  let sum = 0;
  const n = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, n);
  const whole = n - (n % 4);
  for (let i = 0; i < whole; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  if (whole < n) {
    let tail = 0;
    for (let i = 0; i < 4; i++) tail = (tail << 8) | (whole + i < n ? bytes[whole + i] : 0);
    sum = (sum + (tail >>> 0)) >>> 0;
  }
  return sum;
}

export function readSfnt(buffer: ArrayBuffer): Sfnt {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) throw new Error('truncated font');
  const version = view.getUint32(0);
  const count = view.getUint16(4);
  if (buffer.byteLength < 12 + count * 16) throw new Error('truncated font');
  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    const offset = view.getUint32(o + 8);
    const length = view.getUint32(o + 12);
    if (offset + length > buffer.byteLength) throw new Error('truncated font');
    tables.set(tag, new Uint8Array(buffer.slice(offset, offset + length)));
  }
  return { version, tables };
}

export function writeSfnt(font: Sfnt): ArrayBuffer {
  const tags = [...font.tables.keys()].sort();
  const n = tags.length;
  const dirEnd = 12 + 16 * n;
  let cursor = dirEnd;
  const placed = tags.map((tag) => {
    const data = font.tables.get(tag)!;
    const at = cursor;
    cursor += pad4(data.length);
    return { tag, data, at };
  });
  const out = new Uint8Array(cursor);
  const view = new DataView(out.buffer);
  const entrySelector = Math.floor(Math.log2(Math.max(1, n)));
  const searchRange = 16 * 2 ** entrySelector;
  view.setUint32(0, font.version);
  view.setUint16(4, n);
  view.setUint16(6, searchRange);
  view.setUint16(8, entrySelector);
  view.setUint16(10, n * 16 - searchRange);
  let headAt = -1;
  placed.forEach((p, i) => {
    const o = 12 + i * 16;
    for (let k = 0; k < 4; k++) view.setUint8(o + k, p.tag.charCodeAt(k));
    out.set(p.data, p.at);
    if (p.tag === 'head') {
      headAt = p.at;
      if (p.data.length >= 12) view.setUint32(p.at + 8, 0);
    }
    view.setUint32(o + 4, checksum(out.subarray(p.at, p.at + p.data.length)));
    view.setUint32(o + 8, p.at);
    view.setUint32(o + 12, p.data.length);
  });
  if (headAt >= 0) view.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out.buffer;
}

export function withTables(buffer: ArrayBuffer, add: Record<string, Uint8Array | null>, version?: number): ArrayBuffer {
  const font = readSfnt(buffer);
  for (const [tag, data] of Object.entries(add)) {
    if (data) font.tables.set(tag, data);
    else font.tables.delete(tag);
  }
  if (version !== undefined) font.version = version;
  return writeSfnt(font);
}
