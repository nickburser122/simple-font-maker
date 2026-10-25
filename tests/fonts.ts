import { readSfnt } from '../src/font/sfnt';

export function sameFont(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const x = readSfnt(a);
  const y = readSfnt(b);
  if (x.version !== y.version || x.tables.size !== y.tables.size) return false;
  for (const [tag, data] of x.tables) {
    if (tag === 'head') continue;
    const other = y.tables.get(tag);
    if (!other || other.length !== data.length || !data.every((v, i) => v === other[i])) return false;
  }
  return true;
}
