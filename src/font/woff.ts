const WOFF_SIGNATURE = 0x774f4646;
const HEADER = 44;
const ENTRY = 20;

interface Table {
  tag: string;
  checksum: number;
  data: Uint8Array;
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readTables(sfnt: ArrayBuffer): { flavor: number; tables: Table[] } {
  const view = new DataView(sfnt);
  const flavor = view.getUint32(0);
  const count = view.getUint16(4);
  const tables: Table[] = [];
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    const offset = view.getUint32(o + 8);
    const length = view.getUint32(o + 12);
    if (offset + length > sfnt.byteLength) throw new Error('truncated font');
    tables.push({
      tag: String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3)),
      checksum: view.getUint32(o + 4),
      data: new Uint8Array(sfnt, offset, length),
    });
  }
  return { flavor, tables: tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0)) };
}

export function woffSupported(): boolean {
  return typeof CompressionStream !== 'undefined';
}

export async function toWoff(sfnt: ArrayBuffer): Promise<ArrayBuffer> {
  const { flavor, tables } = readTables(sfnt);
  const packed: { t: Table; body: Uint8Array }[] = [];
  for (const t of tables) {
    const z = await deflate(t.data);
    packed.push({ t, body: z.length < t.data.length ? z : t.data });
  }
  const dirEnd = HEADER + ENTRY * tables.length;
  let cursor = dirEnd;
  const offsets = packed.map((p) => {
    const at = cursor;
    cursor += pad4(p.body.length);
    return at;
  });
  const total = cursor;
  const sfntSize = 12 + 16 * tables.length + tables.reduce((n, t) => n + pad4(t.data.length), 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, WOFF_SIGNATURE);
  view.setUint32(4, flavor);
  view.setUint32(8, total);
  view.setUint16(12, tables.length);
  view.setUint16(14, 0);
  view.setUint32(16, sfntSize);
  view.setUint16(20, 1);
  view.setUint16(22, 0);
  packed.forEach((p, i) => {
    const o = HEADER + i * ENTRY;
    for (let k = 0; k < 4; k++) view.setUint8(o + k, p.t.tag.charCodeAt(k));
    view.setUint32(o + 4, offsets[i]);
    view.setUint32(o + 8, p.body.length);
    view.setUint32(o + 12, p.t.data.length);
    view.setUint32(o + 16, p.t.checksum);
    out.set(p.body, offsets[i]);
  });
  return out.buffer;
}
