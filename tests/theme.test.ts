import { afterEach, describe, expect, it, vi } from 'vitest';
import initCode from '../public/theme-init.js?raw';
import { THEME_COLORS, THEME_KEY, THEMES, parseTheme, resolveTheme } from '../src/store/theme';

interface Env {
  stored: Record<string, string>;
  attrs: Record<string, string>;
  metaContent: { value: string };
  systemDark: { value: boolean };
  listeners: { change: (() => void)[]; storage: ((e: { key: string | null }) => void)[] };
  throwStorage: { value: boolean };
}

function env(init: Partial<{ stored: string; systemDark: boolean; throwStorage: boolean; noMeta: boolean }> = {}) {
  const e: Env = {
    stored: init.stored ? { [THEME_KEY]: init.stored } : {},
    attrs: {},
    metaContent: { value: THEME_COLORS.light },
    systemDark: { value: init.systemDark ?? false },
    listeners: { change: [], storage: [] },
    throwStorage: { value: init.throwStorage ?? false },
  };
  const storage = {
    getItem: (k: string) => {
      if (e.throwStorage.value) throw new Error('denied');
      return k in e.stored ? e.stored[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (e.throwStorage.value) throw new Error('denied');
      e.stored[k] = v;
    },
    removeItem: (k: string) => {
      if (e.throwStorage.value) throw new Error('denied');
      delete e.stored[k];
    },
  };
  const meta = init.noMeta
    ? null
    : { setAttribute: (_: string, v: string) => (e.metaContent.value = v) };
  const doc = {
    documentElement: {
      setAttribute: (k: string, v: string) => (e.attrs[k] = v),
      removeAttribute: (k: string) => delete e.attrs[k],
    },
    querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? meta : null),
  };
  const win = {
    matchMedia: () => ({
      get matches() {
        return e.systemDark.value;
      },
      addEventListener: (_: string, f: () => void) => e.listeners.change.push(f),
    }),
    addEventListener: (t: string, f: (ev: { key: string | null }) => void) => {
      if (t === 'storage') e.listeners.storage.push(f);
    },
  };
  return { e, storage, doc, win };
}

describe('theme helpers', () => {
  it('parses unknown values as system', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('purple')).toBe('system');
    expect(parseTheme(3)).toBe('system');
  });

  it('resolves system from the OS preference and keeps explicit choices', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('offers system, light and dark in that order', () => {
    expect([...THEMES]).toEqual(['system', 'light', 'dark']);
  });
});

describe('theme-init.js', () => {
  const code = initCode;

  function run(init: Parameters<typeof env>[0]) {
    const { e, storage, doc, win } = env(init);
    new Function('localStorage', 'document', 'window', code)(storage, doc, win);
    return e;
  }

  it('leaves the attribute off for system and follows the OS', () => {
    const light = run({ systemDark: false });
    expect(light.attrs['data-theme']).toBeUndefined();
    expect(light.metaContent.value).toBe(THEME_COLORS.light);
    const dark = run({ systemDark: true });
    expect(dark.attrs['data-theme']).toBeUndefined();
    expect(dark.metaContent.value).toBe(THEME_COLORS.dark);
  });

  it('applies a stored explicit theme regardless of the OS', () => {
    const d = run({ stored: 'dark', systemDark: false });
    expect(d.attrs['data-theme']).toBe('dark');
    expect(d.metaContent.value).toBe(THEME_COLORS.dark);
    const l = run({ stored: 'light', systemDark: true });
    expect(l.attrs['data-theme']).toBe('light');
    expect(l.metaContent.value).toBe(THEME_COLORS.light);
  });

  it('ignores garbage in storage', () => {
    const e = run({ stored: 'neon', systemDark: true });
    expect(e.attrs['data-theme']).toBeUndefined();
    expect(e.metaContent.value).toBe(THEME_COLORS.dark);
  });

  it('survives blocked storage and a missing meta tag', () => {
    const e = run({ throwStorage: true, systemDark: true, noMeta: true });
    expect(e.attrs['data-theme']).toBeUndefined();
  });

  it('uses the same key and colours as the app', () => {
    expect(code).toContain(`'${THEME_KEY}'`);
    expect(code).toContain(`'${THEME_COLORS.light}'`);
    expect(code).toContain(`'${THEME_COLORS.dark}'`);
  });
});

describe('theme store', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function boot(init: Parameters<typeof env>[0] = {}) {
    const { e, storage, doc, win } = env(init);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', win);
    const mod = await import('../src/store/theme.svelte');
    mod.initTheme();
    return { e, mod };
  }

  it('starts on system when nothing is stored', async () => {
    const { e, mod } = await boot({ systemDark: true });
    expect(mod.theme.choice).toBe('system');
    expect(e.attrs['data-theme']).toBeUndefined();
    expect(e.metaContent.value).toBe(THEME_COLORS.dark);
  });

  it('restores a stored choice', async () => {
    const { e, mod } = await boot({ stored: 'light', systemDark: true });
    expect(mod.theme.choice).toBe('light');
    expect(e.attrs['data-theme']).toBe('light');
    expect(e.metaContent.value).toBe(THEME_COLORS.light);
  });

  it('persists explicit choices and clears the key for system', async () => {
    const { e, mod } = await boot();
    mod.setTheme('dark');
    expect(e.attrs['data-theme']).toBe('dark');
    expect(e.stored[THEME_KEY]).toBe('dark');
    expect(e.metaContent.value).toBe(THEME_COLORS.dark);
    mod.setTheme('system');
    expect(e.attrs['data-theme']).toBeUndefined();
    expect(THEME_KEY in e.stored).toBe(false);
    expect(e.metaContent.value).toBe(THEME_COLORS.light);
  });

  it('follows OS changes only while on system', async () => {
    const { e, mod } = await boot({ systemDark: false });
    e.systemDark.value = true;
    e.listeners.change.forEach((f) => f());
    expect(e.metaContent.value).toBe(THEME_COLORS.dark);
    mod.setTheme('light');
    e.systemDark.value = false;
    e.systemDark.value = true;
    e.listeners.change.forEach((f) => f());
    expect(e.attrs['data-theme']).toBe('light');
    expect(e.metaContent.value).toBe(THEME_COLORS.light);
  });

  it('syncs from another tab', async () => {
    const { e, mod } = await boot();
    e.stored[THEME_KEY] = 'dark';
    e.listeners.storage.forEach((f) => f({ key: THEME_KEY }));
    expect(mod.theme.choice).toBe('dark');
    expect(e.attrs['data-theme']).toBe('dark');
    e.stored[THEME_KEY] = 'light';
    e.listeners.storage.forEach((f) => f({ key: 'something-else' }));
    expect(mod.theme.choice).toBe('dark');
  });

  it('still switches when storage is blocked', async () => {
    const { e, mod } = await boot({ throwStorage: true });
    mod.setTheme('dark');
    expect(mod.theme.choice).toBe('dark');
    expect(e.attrs['data-theme']).toBe('dark');
  });

  it('registers its listeners once', async () => {
    const { e, mod } = await boot();
    mod.initTheme();
    expect(e.listeners.change.length).toBe(1);
    expect(e.listeners.storage.length).toBe(1);
  });
});
