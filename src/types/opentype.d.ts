declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export class Path {
    commands: PathCommand[];
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
    close(): void;
  }

  export interface GlyphOptions {
    name: string;
    unicode?: number;
    advanceWidth: number;
    path: Path;
  }

  export class Glyph {
    constructor(options: GlyphOptions);
    name: string;
    unicode?: number;
    advanceWidth: number;
    path: Path;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  }

  export interface FontOptions {
    familyName: string;
    styleName: string;
    unitsPerEm: number;
    ascender: number;
    descender: number;
    designer?: string;
    version?: string;
    glyphs: Glyph[];
  }

  export class Font {
    constructor(options: FontOptions);
    names: Record<string, Record<string, Record<string, string>>>;
    numGlyphs: number;
    glyphs: { get(index: number): Glyph };
    charToGlyph(char: string): Glyph;
    toArrayBuffer(): ArrayBuffer;
  }

  export function parse(buffer: ArrayBuffer): Font;
}
