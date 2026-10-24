import { describe, expect, it } from 'vitest';
import tokens from '../src/styles/tokens.css?raw';

function block(selector: string): Record<string, string> {
  const start = tokens.indexOf(selector);
  if (start < 0) throw new Error(`missing ${selector}`);
  const open = tokens.indexOf('{', start);
  const close = tokens.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const m of tokens.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function lin(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function full(hex: string): string {
  return hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
}

function lum(hex: string): number {
  const n = parseInt(full(hex).slice(1), 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function ratio(a: string, b: string): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const light = block(':root {');
const dark = block(":root[data-theme='dark']");
const media = block(":root:not([data-theme='light'])");

describe('theme tokens', () => {
  it('defines the same variables in light and dark', () => {
    for (const k of ['--paper', '--ink', '--graphite', '--hairline', '--accent', '--surface', '--surface-ink']) {
      expect(light[k], `light ${k}`).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      expect(dark[k], `dark ${k}`).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    }
  });

  it('keeps the explicit dark theme identical to the system dark theme', () => {
    for (const [k, v] of Object.entries(media)) expect(dark[k], k).toBe(v);
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('meets 4.5:1 for text colours on the page background in %s', (_, t) => {
    expect(ratio(t['--ink'], t['--paper'])).toBeGreaterThanOrEqual(7);
    expect(ratio(t['--graphite'], t['--paper'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['--accent'], t['--paper'])).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('keeps glyph ink and the accent readable on glyph tiles in %s', (_, t) => {
    expect(ratio(t['--surface-ink'], t['--surface'])).toBeGreaterThanOrEqual(7);
    expect(ratio(t['--accent'], t['--surface'])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps hairlines visible but quiet', () => {
    for (const t of [light, dark]) {
      const r = ratio(t['--hairline'], t['--paper']);
      expect(r).toBeGreaterThan(1.1);
      expect(r).toBeLessThan(3);
    }
  });
});
