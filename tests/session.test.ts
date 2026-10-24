import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/store/defaults';
import { readSession, sanitizeSettings } from '../src/store/session';

function session(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    setId: 'basic',
    paper: 'a4',
    family: 'Hand',
    designer: 'me',
    settings: structuredClone(DEFAULT_SETTINGS),
    captures: [
      {
        uid: 'a',
        name: 'p1.jpg',
        page: 1,
        corners: [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.9, 0.9],
          [0.1, 0.9],
        ],
        detected: true,
      },
    ],
    ...over,
  };
}

describe('readSession', () => {
  it('accepts a well-formed session', () => {
    const s = readSession(session());
    expect(s?.setId).toBe('basic');
    expect(s?.captures).toHaveLength(1);
    expect(s?.settings).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['an array', []],
    ['wrong version', session({ version: 2 })],
    ['unknown set', session({ setId: 'klingon' })],
    ['unknown paper', session({ paper: 'a0' })],
    ['paper not a string', session({ paper: 4 })],
    ['captures not an array', session({ captures: {} })],
    ['capture without uid', session({ captures: [{ name: 'x', page: 1, corners: [[0, 0], [1, 0], [1, 1], [0, 1]] }] })],
    ['capture page zero', session({ captures: [{ uid: 'a', name: 'x', page: 0, corners: [[0, 0], [1, 0], [1, 1], [0, 1]] }] })],
    ['capture with three corners', session({ captures: [{ uid: 'a', name: 'x', page: 1, corners: [[0, 0], [1, 0], [1, 1]] }] })],
    ['capture with NaN corner', session({ captures: [{ uid: 'a', name: 'x', page: 1, corners: [[NaN, 0], [1, 0], [1, 1], [0, 1]] }] })],
    ['capture cells not an array', session({ captures: [{ uid: 'a', name: 'x', page: 1, corners: [[0, 0], [1, 0], [1, 1], [0, 1]], cells: 5 }] })],
  ])('ignores a session with %s', (_, v) => {
    expect(readSession(v)).toBeNull();
  });

  it('falls back to defaults for bad settings instead of dropping the session', () => {
    const s = readSession(session({ settings: { alphamax: 'big', spacing: 12, mode: 'rainbow', glyphs: 4 } }));
    expect(s?.settings.alphamax).toBe(DEFAULT_SETTINGS.alphamax);
    expect(s?.settings.spacing).toBe(12);
    expect(s?.settings.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(s?.settings.glyphs).toEqual({});
  });

  it('keeps empty names when family or designer are missing', () => {
    const s = readSession(session({ family: undefined, designer: 3 }));
    expect(s?.family).toBe('');
    expect(s?.designer).toBe('');
  });
});

describe('sanitizeSettings', () => {
  it('returns nothing for non-objects', () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings(3)).toEqual({});
    expect(sanitizeSettings([])).toEqual({});
  });

  it('keeps valid values and drops invalid ones', () => {
    const out = sanitizeSettings({
      threshold: 90,
      alphamax: Infinity,
      turdsize: '3',
      auto: false,
      adaptive: 'yes',
      alternates: true,
      mode: 'luma',
    });
    expect(out).toEqual({ threshold: 90, auto: false, alternates: true, mode: 'luma' });
  });

  it('sanitises per-glyph adjustments', () => {
    const out = sanitizeSettings({
      glyphs: {
        97: { dy: 5, scale: 1.2, lsb: 3, rsb: null, missing: true, source: 'abc' },
        98: { dy: 'x', scale: 1 },
        '99.5': { dy: 0, scale: 1 },
        100: 'nope',
        101: { dy: 1, scale: 2, lsb: 'bad', rsb: NaN, source: 4 },
      },
    });
    expect(Object.keys(out.glyphs!).map(Number)).toEqual([97, 101]);
    expect(out.glyphs![97]).toEqual({ dy: 5, scale: 1.2, lsb: 3, rsb: null, missing: true, source: 'abc' });
    expect(out.glyphs![101]).toEqual({ dy: 1, scale: 2, lsb: null, rsb: null, missing: false, source: null });
  });
});
