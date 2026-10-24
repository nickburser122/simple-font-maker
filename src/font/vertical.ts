import { readSfnt, writeSfnt } from './sfnt';

const OS2_FS_SELECTION = 62;
const OS2_TYPO_ASC = 68;
const OS2_TYPO_DESC = 70;
const OS2_WIN_ASC = 74;
const OS2_WIN_DESC = 76;
const HEAD_Y_MIN = 38;
const HEAD_Y_MAX = 42;
const USE_TYPO_METRICS = 0x80;

export function tuneVerticalMetrics(buffer: ArrayBuffer, ascender: number, descender: number): ArrayBuffer {
  const font = readSfnt(buffer);
  const os2 = font.tables.get('OS/2');
  const head = font.tables.get('head');
  if (!os2 || !head || os2.length < OS2_WIN_DESC + 2 || head.length < HEAD_Y_MAX + 2) return buffer;
  const h = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const o = new DataView(os2.buffer, os2.byteOffset, os2.byteLength);
  const yMin = h.getInt16(HEAD_Y_MIN);
  const yMax = h.getInt16(HEAD_Y_MAX);
  o.setInt16(OS2_TYPO_ASC, ascender);
  o.setInt16(OS2_TYPO_DESC, descender);
  o.setUint16(OS2_WIN_ASC, Math.max(ascender, yMax, 0));
  o.setUint16(OS2_WIN_DESC, Math.max(-descender, -yMin, 0));
  o.setUint16(OS2_FS_SELECTION, o.getUint16(OS2_FS_SELECTION) | USE_TYPO_METRICS);
  return writeSfnt(font);
}
