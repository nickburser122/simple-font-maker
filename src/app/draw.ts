import type { CellResult } from '../vision/cells';

export function draw(node: HTMLCanvasElement, cell: CellResult) {
  const paint = (c: CellResult) => {
    node.width = c.w;
    node.height = c.h;
    const ctx = node.getContext('2d')!;
    const img = ctx.createImageData(c.w, c.h);
    for (let i = 0; i < c.bitmap.length; i++) {
      const v = c.bitmap[i] ? 22 : 255;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  paint(cell);
  return { update: paint };
}
