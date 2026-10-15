export interface Blob {
  id: number;
  area: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sx: number;
  sy: number;
}

export function label(bin: Uint8Array, w: number, h: number): { labels: Int32Array; blobs: Blob[] } {
  const labels = new Int32Array(w * h);
  const blobs: Blob[] = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < bin.length; s++) {
    if (!bin[s] || labels[s]) continue;
    const id = blobs.length + 1;
    const b: Blob = { id, area: 0, x0: w, y0: h, x1: 0, y1: 0, sx: 0, sy: 0 };
    let sp = 0;
    stack[sp++] = s;
    labels[s] = id;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      b.area++;
      b.sx += x;
      b.sy += y;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (bin[q] && !labels[q]) {
            labels[q] = id;
            stack[sp++] = q;
          }
        }
      }
    }
    blobs.push(b);
  }
  return { labels, blobs };
}
