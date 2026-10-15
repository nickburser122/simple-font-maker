export interface Raster {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export interface Gray {
  w: number;
  h: number;
  data: Uint8Array;
}

export type Pt = [number, number];
export type Mode = 'blue' | 'luma';
