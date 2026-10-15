let counter = 0;
let current: FontFace | null = null;

export async function loadPreview(buffer: ArrayBuffer): Promise<string> {
  const family = `preview-${++counter}`;
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);
  if (current) document.fonts.delete(current);
  current = face;
  return family;
}

export function clearPreview(): void {
  if (current) document.fonts.delete(current);
  current = null;
}
