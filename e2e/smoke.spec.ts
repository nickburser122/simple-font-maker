import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function filledSheet(ctx: BrowserContext, svg: string, fontSize: number): Promise<Buffer> {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1240, height: 1754 });
  await p.setContent('<body style="margin:0;background:#fff"></body>');
  await p.evaluate(
    ({ svg, fontSize }) => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const root = doc.documentElement;
      for (const g of Array.from(root.querySelectorAll('g[data-u]'))) {
        const rect = g.querySelector('rect')!;
        const baseline = g.querySelectorAll('line')[2].getAttribute('y1')!;
        const t = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String(Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2));
        t.setAttribute('y', baseline);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-size', String(fontSize));
        t.setAttribute('font-family', 'Georgia, serif');
        t.setAttribute('font-style', 'italic');
        t.setAttribute('fill', '#101030');
        t.textContent = String.fromCodePoint(Number(g.getAttribute('data-u')));
        g.appendChild(t);
      }
      root.setAttribute('width', '1240px');
      root.setAttribute('height', '1754px');
      document.body.appendChild(document.importNode(root, true));
    },
    { svg, fontSize },
  );
  const png = await p.screenshot();
  await p.close();
  return png;
}

async function templateSvg(page: Page, index: number): Promise<string> {
  return page.locator('.paper svg').nth(index).evaluate((el) => el.outerHTML);
}

async function upload(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name, mimeType: 'image/png', buffer });
}

async function go(page: Page, step: string): Promise<void> {
  await page.locator('.stepbtn', { hasText: step }).click();
}

async function downloaded(page: Page, label: string): Promise<Buffer> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label, exact: true }).click()]);
  return readFileSync(await dl.path());
}

function tag(buf: Buffer, offset: number): string {
  return buf.subarray(offset, offset + 4).toString('latin1');
}

function tables(otf: Buffer): string[] {
  const n = otf.readUInt16BE(4);
  return Array.from({ length: n }, (_, i) => tag(otf, 12 + i * 16));
}

test.describe('theme', () => {
  test.use({ colorScheme: 'dark' });

  test('follows the system, can be overridden, and persists', async ({ page }) => {
    const paper = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
    const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.goto('/');
    await expect(page.locator('.themes')).toBeVisible();
    expect(await attr()).toBeNull();
    expect(await paper()).toBe('#121211');
    await page.locator('.themes .toggle', { hasText: /^light$/ }).click();
    expect(await attr()).toBe('light');
    expect(await paper()).toBe('#f3f0e8');
    await page.reload();
    expect(await attr()).toBe('light');
    await expect(page.locator('.themes .toggle[aria-pressed=true]')).toHaveText('light');
    await page.locator('.themes .toggle', { hasText: /^system$/ }).click();
    expect(await attr()).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('hfm-theme'))).toBeNull();
    expect(await paper()).toBe('#121211');
  });
});

test('basic sheet to downloadable fonts', async ({ page, context }) => {
  await page.goto('/');
  const sheet = await filledSheet(context, await templateSvg(page, 0), 12);
  await go(page, 'capture');
  await upload(page, 'sheet.png', sheet);
  await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
  await go(page, 'refine');
  await expect(page.locator('.tile')).toHaveCount(72);
  await expect(page.locator('.tile.missing')).toHaveCount(0);
  await go(page, 'export');
  await expect(page.getByText('72 of 72 glyphs ready')).toBeVisible();
  await expect(page.getByText('left out:')).toHaveCount(0);
  const otf = await downloaded(page, 'download .otf');
  expect(tag(otf, 0)).toBe('OTTO');
  expect(tables(otf)).toContain('CFF ');
  expect(tables(otf)).not.toContain('GSUB');
  const woff = await downloaded(page, 'download .woff');
  expect(tag(woff, 0)).toBe('wOFF');
  expect(woff.length).toBeLessThan(otf.length);
  const woff2 = await downloaded(page, 'download .woff2');
  expect(tag(woff2, 0)).toBe('wOF2');
  expect(woff2.length).toBeLessThan(woff.length);
  const ttf = await downloaded(page, 'download .ttf');
  expect(ttf.readUInt32BE(0)).toBe(0x00010000);
  expect(tables(ttf)).toEqual(expect.arrayContaining(['glyf', 'loca', 'GPOS']));
  expect(tables(ttf)).not.toContain('CFF ');
});

test('a missing sheet lists what will be left out', async ({ page, context }) => {
  await page.goto('/');
  const sheet = await filledSheet(context, await templateSvg(page, 0), 12);
  await go(page, 'capture');
  await upload(page, 'sheet.png', sheet);
  await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
  await go(page, 'print');
  await page.locator('.toggle', { hasText: /^extended$/ }).click();
  await go(page, 'export');
  await expect(page.getByText(/left out: /)).toBeVisible();
});

test('detects which page of the latin set a photo shows', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('.toggle', { hasText: /^latin$/ }).click();
  await expect(page.locator('.paper svg')).toHaveCount(2);
  const second = await filledSheet(context, await templateSvg(page, 1), 11);
  await go(page, 'capture');
  await upload(page, 'second.png', second);
  await expect(page.getByText('78 of 78 glyphs found')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'page 2/2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'page 1/2' })).toHaveAttribute('aria-pressed', 'false');
});

test('a second photo of a page becomes an alternate shape', async ({ page, context }) => {
  await page.goto('/');
  const svg = await templateSvg(page, 0);
  await go(page, 'capture');
  await upload(page, 'first.png', await filledSheet(context, svg, 12));
  await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
  await go(page, 'refine');
  const toggle = page.getByRole('button', { name: 'alternate shapes' });
  await expect(toggle).toBeDisabled();
  await go(page, 'capture');
  await upload(page, 'second.png', await filledSheet(context, svg, 10));
  await expect(page.locator('.item')).toHaveCount(2);
  await expect(page.getByText('72 of 72 glyphs found')).toHaveCount(2, { timeout: 60_000 });
  await go(page, 'refine');
  await expect(toggle).toBeEnabled();
  await expect(page.getByText('72 glyphs have a second sample')).toBeVisible();
  await go(page, 'export');
  const plain = await downloaded(page, 'download .otf');
  expect(tables(plain)).not.toContain('GSUB');
  await go(page, 'refine');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await go(page, 'export');
  await expect(page.getByText('72 have an alternate shape')).toBeVisible();
  const withAlt = await downloaded(page, 'download .otf');
  expect(tables(withAlt)).toContain('GSUB');
  expect(withAlt.includes(Buffer.from('calt'))).toBe(true);
  expect(withAlt.length).toBeGreaterThan(plain.length);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function overflow(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }

  test('no step scrolls sideways', async ({ page, context }) => {
    await page.goto('/');
    const sheet = await filledSheet(context, await templateSvg(page, 0), 12);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await go(page, 'capture');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await upload(page, 'sheet.png', sheet);
    await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await go(page, 'refine');
    await expect(page.locator('.tile')).toHaveCount(72);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await go(page, 'export');
    await expect(page.getByRole('button', { name: 'download .woff2', exact: true })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('small controls get a finger-sized hit area without changing the layout', async ({ page }) => {
    await page.goto('/');
    await go(page, 'capture');
    const measure = (name: string) =>
      page.getByRole('button', { name, exact: true }).evaluate((el) => {
        const a = getComputedStyle(el, '::after');
        return { w: parseFloat(a.width), h: parseFloat(a.height), box: el.getBoundingClientRect().height };
      });
    for (const name of ['adaptive', 'auto', 'luminance']) {
      const m = await measure(name);
      expect(m.h, name).toBeGreaterThanOrEqual(44);
      expect(m.w, name).toBeGreaterThanOrEqual(44);
      expect(m.box, name).toBeLessThan(32);
    }
    const slider = page.locator('input[type=range]').first();
    expect(await slider.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(24);
  });

  test('a corner handle can be dragged by touch without scrolling the page', async ({ page, context }) => {
    await page.goto('/');
    const sheet = await filledSheet(context, await templateSvg(page, 0), 12);
    await go(page, 'capture');
    await upload(page, 'sheet.png', sheet);
    await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
    const handle = page.getByRole('button', { name: 'corner TL' });
    expect(await handle.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
    expect(await handle.evaluate((el) => parseFloat(getComputedStyle(el, '::after').height))).toBeGreaterThanOrEqual(44);
    await handle.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const b = (await handle.boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 5, y: cy + i * 9 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await handle.boundingBox())!.y).toBeGreaterThan(b.y + 30);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });
});

async function violations(page: Page, name: string): Promise<string[]> {
  await page.waitForTimeout(400);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.map((v) => `${name}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`accessibility: no WCAG 2.2 AA violations on any step in ${scheme} mode`, async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const svg = await templateSvg(page, 0);
    const found: string[] = [];
    found.push(...(await violations(page, 'print')));
    await go(page, 'capture');
    found.push(...(await violations(page, 'capture')));
    await upload(page, 'sheet.png', await filledSheet(context, svg, 12));
    await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
    found.push(...(await violations(page, 'capture with photo')));
    await go(page, 'refine');
    await expect(page.locator('.tile')).toHaveCount(72);
    found.push(...(await violations(page, 'refine')));
    await page.locator('button.tile').first().click();
    found.push(...(await violations(page, 'refine with glyph panel')));
    await go(page, 'export');
    found.push(...(await violations(page, 'export')));
    expect(found).toEqual([]);
  });
}

test.describe('keyboard', () => {
  async function stops(page: Page, limit: number): Promise<{ name: string; visible: boolean }[]> {
    const out: { name: string; visible: boolean }[] = [];
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        const hex = (c: string) => '#' + (c.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
        const underline = hex(cs.borderBottomColor) === accent.toLowerCase();
        return { name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30), visible: outline || underline };
      });
      if (!info) break;
      out.push(info);
    }
    return out;
  }

  test('every stop on the first and last steps shows a focus indicator and nothing traps focus', async ({ page, context }) => {
    await page.goto('/');
    const svg = await templateSvg(page, 0);
    const first = await stops(page, 60);
    expect(first.length).toBeGreaterThan(8);
    expect(first.length).toBeLessThan(60);
    expect(first.filter((s) => !s.visible).map((s) => s.name)).toEqual([]);
    await go(page, 'capture');
    await upload(page, 'sheet.png', await filledSheet(context, svg, 12));
    await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
    await go(page, 'export');
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    const last = await stops(page, 80);
    expect(last.length).toBeGreaterThan(8);
    expect(last.filter((s) => !s.visible).map((s) => s.name)).toEqual([]);
  });

  test('corner handles move with the arrow keys and re-extract', async ({ page, context }) => {
    await page.goto('/');
    const sheet = await filledSheet(context, await templateSvg(page, 0), 12);
    await go(page, 'capture');
    await upload(page, 'sheet.png', sheet);
    await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
    const handle = page.getByRole('button', { name: 'corner BR' });
    const pos = () => handle.evaluate((el) => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top) }));
    const before = await pos();
    await handle.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
    const after = await pos();
    expect(before.x - after.x).toBeCloseTo(4, 1);
    expect(after.y).toBeCloseTo(before.y, 3);
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
    expect((await pos()).y - before.y).toBeCloseTo(1, 1);
    await expect(page.getByText(/of 72 glyphs found/)).toBeVisible({ timeout: 30_000 });
  });

  test('undo and redo work from the keyboard on the refine step', async ({ page, context }) => {
    await page.goto('/');
    const sheet = await filledSheet(context, await templateSvg(page, 0), 12);
    await go(page, 'capture');
    await upload(page, 'sheet.png', sheet);
    await expect(page.getByText('72 of 72 glyphs found')).toBeVisible({ timeout: 60_000 });
    await go(page, 'refine');
    await expect(page.locator('.tile')).toHaveCount(72);
    const spacing = page.locator('label.slider', { hasText: 'letter spacing' }).locator('input');
    await expect(spacing).toHaveValue('0');
    await spacing.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect(spacing).not.toHaveValue('0');
    await page.waitForTimeout(700);
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('Control+z');
    await expect(spacing).toHaveValue('0');
    await page.keyboard.press('Control+Shift+z');
    await expect(spacing).not.toHaveValue('0');
  });
});
