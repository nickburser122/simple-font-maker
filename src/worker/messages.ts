import type { BuildGlyph, BuildSettings, Outlines } from '../font/build';
import type { SetId } from '../charset/sets';
import type { PaperId } from '../template/layout';
import type { CellOpts, CellResult } from '../vision/cells';
import type { Pt } from '../vision/types';

export type Req =
  | { type: 'load'; rid: number; cap: number; bitmap: ImageBitmap }
  | {
      type: 'extract';
      rid: number;
      cap: number;
      corners: Pt[];
      paper: PaperId;
      setId: SetId;
      page: number;
      opts: CellOpts;
    }
  | { type: 'release'; rid: number; cap: number }
  | { type: 'build'; rid: number; glyphs: BuildGlyph[]; settings: BuildSettings };

export type Res =
  | { type: 'loaded'; rid: number; corners: Pt[] | null }
  | { type: 'cells'; rid: number; cells: CellResult[]; lowInk: boolean; pageCode: number | null }
  | { type: 'released'; rid: number }
  | { type: 'progress'; rid: number; done: number; total: number }
  | { type: 'font'; rid: number; buffer: ArrayBuffer; outlines: Outlines }
  | { type: 'error'; rid: number; message: string };
