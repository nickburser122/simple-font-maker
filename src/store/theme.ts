export type Theme = 'system' | 'light' | 'dark';
export type Resolved = 'light' | 'dark';

export const THEME_KEY = 'hfm-theme';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export const THEME_COLORS: Record<Resolved, string> = { light: '#f3f0e8', dark: '#121211' };

export function parseTheme(v: unknown): Theme {
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function resolveTheme(t: Theme, systemDark: boolean): Resolved {
  if (t === 'system') return systemDark ? 'dark' : 'light';
  return t;
}
