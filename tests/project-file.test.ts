import { describe, expect, it } from 'vitest';
import { parseProjectFile, type ProjectFile } from '../src/store/project-file';
import { DEFAULT_SETTINGS } from '../src/store/defaults';

const png = 'data:image/png;base64,AAAA';

function sample(): ProjectFile {
  return {
    version: 1,
    app: 'handwriting-font-maker',
    setId: 'basic',
    paper: 'a4',
    family: 'My Hand',
    designer: '',
    copyright: '(c) me',
    license: 'OFL',
    fontVersion: '1.250',
    settings: {
      ...structuredClone(DEFAULT_SETTINGS),
      glyphs: { 97: { dy: 5, scale: 1.1, lsb: null, rsb: 20, missing: false, source: 'abc', alts: null } },
    },
    captures: [
      {
        uid: 'abc',
        name: 'p1.jpg',
        page: 1,
        corners: [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.9, 0.9],
          [0.1, 0.9],
        ],
        detected: true,
        cells: [
          {
            char: 'a',
            unicode: 97,
            page: 1,
            row: 0,
            col: 1,
            w: 194,
            h: 244,
            originX: 10,
            originY: 20,
            ink: 400,
            missing: false,
            guides: { cap: 40, x: 90, baseline: 170, descender: 215 },
            png,
          },
        ],
      },
    ],
  };
}

describe('project file', () => {
  it('round-trips a valid project', () => {
    const f = sample();
    expect(parseProjectFile(JSON.stringify(f))).toEqual(f);
  });

  it('fills missing settings with defaults', () => {
    const f = sample();
    const raw = { ...f, settings: { alphamax: 0.5, glyphs: {} } };
    const out = parseProjectFile(JSON.stringify(raw));
    expect(out.settings.alphamax).toBe(0.5);
    expect(out.settings.space).toBe(DEFAULT_SETTINGS.space);
  });

  it.each([
    ['not json', 'nope'],
    ['oversized cell', JSON.stringify({ ...sample(), captures: [{ ...sample().captures[0], cells: [{ ...sample().captures[0].cells[0], w: 100000 }] }] })],
    ['zero-size cell', JSON.stringify({ ...sample(), captures: [{ ...sample().captures[0], cells: [{ ...sample().captures[0].cells[0], h: 0 }] }] })],
    ['fractional cell size', JSON.stringify({ ...sample(), captures: [{ ...sample().captures[0], cells: [{ ...sample().captures[0].cells[0], w: 10.5 }] }] })],
    ['wrong app', JSON.stringify({ ...sample(), app: 'other' })],
    ['wrong version', JSON.stringify({ ...sample(), version: 2 })],
    ['unknown set', JSON.stringify({ ...sample(), setId: 'huge' })],
    ['bad corners', JSON.stringify({ ...sample(), captures: [{ ...sample().captures[0], corners: [[0, 0]] }] })],
    ['non-png cell', JSON.stringify({ ...sample(), captures: [{ ...sample().captures[0], cells: [{ ...sample().captures[0].cells[0], png: 'http://x/y.png' }] }] })],
  ])('rejects %s', (_, text) => {
    expect(() => parseProjectFile(text)).toThrow('not a project file');
  });

  it('reads kerning, clamps it, and treats older files as unkerned', () => {
    const withK = (k: unknown) => JSON.stringify({ ...sample(), settings: { ...sample().settings, kerning: k } });
    expect(parseProjectFile(withK(35)).settings.kerning).toBe(35);
    expect(parseProjectFile(withK(500)).settings.kerning).toBe(100);
    expect(() => parseProjectFile(withK('x'))).toThrow();
    const old = JSON.parse(JSON.stringify(sample()));
    delete old.settings.kerning;
    expect(parseProjectFile(JSON.stringify(old)).settings.kerning).toBe(0);
  });
});
