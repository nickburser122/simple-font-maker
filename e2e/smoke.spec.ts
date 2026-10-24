import { readFileSync } from 'node:fs';
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
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
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
