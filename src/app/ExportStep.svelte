<script lang="ts">
  import { SETS, missingChars } from '../charset/sets';
  import { toWoff, woffSupported } from '../font/woff';
  import { toWoff2 } from '../font/woff2';
  import { project } from '../store/project.svelte';
  import { fontSettings } from '../store/font.svelte';
  import { buildSettings, settings } from '../store/settings.svelte';
  import { collectGlyphs } from '../store/glyphs';
  import { build } from '../worker/client';
  import { exportProject, importProject, projectFileName } from '../store/persist.svelte';

  const glyphs = $derived(collectGlyphs());
  const total = $derived(SETS[project.setId].chars.length);
  const missing = $derived(missingChars(SETS[project.setId].chars, glyphs.map((g) => g.unicode)));
  const altCount = $derived(glyphs.filter((g) => g.alts).length);
  const SHOWN = 24;
  const canWoff = woffSupported();
  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  let input: HTMLInputElement | undefined = $state();

  function saveFile(): void {
    error = '';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportProject()], { type: 'application/json' }));
    a.download = projectFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function openFile(): Promise<void> {
    const f = input?.files?.[0];
    if (!f) return;
    error = '';
    try {
      await importProject(await f.text());
    } catch (e) {
      error = e instanceof Error ? e.message : 'could not open the project.';
    }
    if (input) input.value = '';
  }

  type Format = 'otf' | 'ttf' | 'woff' | 'woff2';
  const MIME: Record<Format, string> = { otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2' };

  function fileName(family: string, ext: Format): string {
    const base = family.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-') || 'Handwriting';
    return `${base}-Regular.${ext}`;
  }

  async function download(format: Format): Promise<void> {
    busy = true;
    error = '';
    status = '';
    try {
      const request = { ...buildSettings(), format: format === 'ttf' ? ('ttf' as const) : ('otf' as const) };
      const { buffer: buf } = await build(glyphs, request, (d, t) => (status = `tracing ${d}/${t}`));
      const name = fileName(fontSettings.family, format);
      if (format === 'woff' || format === 'woff2') status = 'compressing';
      const data = format === 'woff' ? await toWoff(buf) : format === 'woff2' ? await toWoff2(buf) : buf;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: MIME[format] }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      status = `${name} saved.`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'could not build the font.';
      status = '';
    } finally {
      busy = false;
    }
  }
</script>

<div class="tpl">
  <div class="opts">
    <label class="field">
      <span class="meta">family name</span>
      <input type="text" bind:value={fontSettings.family} maxlength="64" spellcheck="false" />
    </label>
    <label class="field">
      <span class="meta">designer (optional)</span>
      <input type="text" bind:value={fontSettings.designer} maxlength="64" spellcheck="false" />
    </label>
    <label class="field">
      <span class="meta">version</span>
      <input type="text" bind:value={fontSettings.fontVersion} maxlength="8" spellcheck="false" inputmode="decimal" />
    </label>
    <label class="field">
      <span class="meta">copyright (optional)</span>
      <input type="text" bind:value={fontSettings.copyright} maxlength="200" spellcheck="false" />
    </label>
    <label class="field">
      <span class="meta">license (optional)</span>
      <input type="text" bind:value={fontSettings.license} maxlength="200" spellcheck="false" />
    </label>
    <p class="meta count">{glyphs.length} of {total} glyphs ready. missing ones are left out.{settings.alternates && altCount > 0 ? ` ${altCount} have an alternate shape.` : ''}</p>
    {#if missing.length > 0}
      <p class="meta missing" aria-label="glyphs not in the font">
        left out: {missing.slice(0, SHOWN).join(' ')}{missing.length > SHOWN ? ` +${missing.length - SHOWN} more` : ''}
      </p>
    {/if}
  </div>
  <div class="actions">
    <button type="button" class="primary" disabled={busy || glyphs.length === 0} onclick={() => download('otf')}>
      download .otf
    </button>
    <button type="button" class="link" disabled={busy || glyphs.length === 0} onclick={() => download('ttf')}>
      download .ttf
    </button>
    {#if canWoff}
      <button type="button" class="link" disabled={busy || glyphs.length === 0} onclick={() => download('woff')}>
        download .woff
      </button>
    {/if}
    <button type="button" class="link" disabled={busy || glyphs.length === 0} onclick={() => download('woff2')}>
      download .woff2
    </button>
    <button type="button" class="link" onclick={saveFile}>save project</button>
    <input type="file" accept=".fontproject,application/json" hidden bind:this={input} onchange={openFile} />
    <button type="button" class="link" onclick={() => input?.click()}>open project</button>
    {#if status}<span class="meta">{status}</span>{/if}
    {#if error}<span class="meta danger">{error}</span>{/if}
  </div>
</div>
