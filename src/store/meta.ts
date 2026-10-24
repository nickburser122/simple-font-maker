export interface FontMeta {
  copyright: string;
  license: string;
  fontVersion: string;
}

export const DEFAULT_META: FontMeta = { copyright: '', license: '', fontVersion: '1.000' };

export const VERSION_PATTERN = /^\d{1,3}\.\d{1,3}$/;
export const META_MAX = 200;

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, META_MAX) : '';
}

export function readMeta(v: Record<string, unknown>): FontMeta {
  const version = typeof v.fontVersion === 'string' ? v.fontVersion.trim() : '';
  return {
    copyright: text(v.copyright),
    license: text(v.license),
    fontVersion: VERSION_PATTERN.test(version) ? version : DEFAULT_META.fontVersion,
  };
}
