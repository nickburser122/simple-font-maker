import { THEME_COLORS, THEME_KEY, parseTheme, resolveTheme, type Theme } from './theme';

export const theme: { choice: Theme } = $state({ choice: 'system' });

let query: MediaQueryList | null = null;
let started = false;

function read(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

function apply(): void {
  const root = document.documentElement;
  if (theme.choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.choice);
  const resolved = resolveTheme(theme.choice, query?.matches ?? false);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}

function write(t: Theme): void {
  try {
    if (t === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    return;
  }
}

export function setTheme(t: Theme): void {
  theme.choice = t;
  write(t);
  apply();
}

export function initTheme(): void {
  if (started) return;
  started = true;
  query = window.matchMedia('(prefers-color-scheme: dark)');
  theme.choice = read();
  apply();
  query.addEventListener('change', apply);
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== THEME_KEY) return;
    theme.choice = read();
    apply();
  });
}
