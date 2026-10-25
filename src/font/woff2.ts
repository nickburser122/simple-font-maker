import { readSfnt } from './sfnt';

const SIGNATURE = 0x774f4632;
const HEADER = 48;

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc',
  'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

export type Compressor = (bytes: Uint8Array) => Promise<Uint8Array | null>;

export async function brotliCompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  const { compress } = await import('brotli');
  return compress(bytes, { quality: 9, mode: 2, lgwin: 22 });
}

export function base128(n: number): number[] {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new RangeError('value out of range');
  const groups = [n % 128];
  let rest = Math.floor(n / 128);
  while (rest > 0) {
    groups.unshift(rest % 128);
    rest = Math.floor(rest / 128);
  }
  return groups.map((g, i) => (i < groups.length - 1 ? g | 0x80 : g));
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}

export async function toWoff2(sfnt: ArrayBuffer, compress: Compressor = brotliCompress): Promise<ArrayBuffer> {
  const font = readSfnt(sfnt);
  const tags = [...font.tables.keys()].sort();
  const dir: number[] = [];
  const parts: Uint8Array[] = [];
  let sfntSize = 12 + 16 * tags.length;
  for (const tag of tags) {
    const data = font.tables.get(tag)!;
    const index = KNOWN_TAGS.indexOf(tag);
    const nullTransform = tag === 'glyf' || tag === 'loca' ? 3 : 0;
    dir.push((index >= 0 ? index : 63) | (nullTransform << 6));
    if (index < 0) for (let i = 0; i < 4; i++) dir.push(tag.charCodeAt(i));
    dir.push(...base128(data.length));
    parts.push(data);
    sfntSize += pad4(data.length);
  }
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    joined.set(p, at);
    at += p.length;
  }
  const packed = await compress(joined);
  if (!packed) throw new Error('compression failed');
  const total = pad4(HEADER + dir.length + packed.length);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, SIGNATURE);
  v.setUint32(4, font.version);
  v.setUint32(8, total);
  v.setUint16(12, tags.length);
  v.setUint32(16, sfntSize);
  v.setUint32(20, packed.length);
  v.setUint16(24, 1);
  out.set(dir, HEADER);
  out.set(packed, HEADER + dir.length);
  return out.buffer;
}
