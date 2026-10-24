<script lang="ts">
  import { SETS, missingChars } from '../charset/sets';
  import { toWoff, woffSupported } from '../font/woff';
  import { project } from '../store/project.svelte';
  import { fontSettings } from '../store/font.svelte';
  import { buildSettings } from '../store/settings.svelte';
  import { collectGlyphs } from '../store/glyphs';
  import { build } from '../worker/client';
  import { exportProject, importProject, projectFileName } from '../store/persist.svelte';

  const glyphs = $derived(collectGlyphs());
  const total = $derived(SETS[project.setId].chars.length);
  const missing = $derived(missingChars(SETS[project.setId].chars, glyphs.map((g) => g.unicode)));
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

  function fileName(family: string, ext: 'otf' | 'woff'): string {
    const base = family.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-') || 'Handwriting';
    return `${base}-Regular.${ext}`;
  }

  async function download(format: 'otf' | 'woff'): Promise<void> {
    busy = true;
    error = '';
    status = '';
    try {
      const { buffer: buf } = await build(glyphs, buildSettings(), (d, t) => (status = `tracing ${d}/${t}`));
      const name = fileName(fontSettings.family, format);
      const data = format === 'woff' ? await toWoff(buf) : buf;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: format === 'woff' ? 'font/woff' : 'font/otf' }));
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
    <p class="meta count">{glyphs.length} of {total} glyphs ready. missing ones are left out.</p>
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
    {#if canWoff}
      <button type="button" class="link" disabled={busy || glyphs.length === 0} onclick={() => download('woff')}>
        download .woff
      </button>
    {/if}
    <button type="button" class="link" onclick={saveFile}>save project</button>
    <input type="file" accept=".fontproject,application/json" hidden bind:this={input} onchange={openFile} />
    <button type="button" class="link" onclick={() => input?.click()}>open project</button>
    {#if status}<span class="meta">{status}</span>{/if}
    {#if error}<span class="meta danger">{error}</span>{/if}
  </div>
</div>
