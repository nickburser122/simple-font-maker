<script lang="ts">
  import { SETS } from '../charset/sets';
  import { project } from '../store/project.svelte';
  import { fontSettings } from '../store/font.svelte';
  import { buildSettings } from '../store/settings.svelte';
  import { collectGlyphs } from '../store/glyphs';
  import { build } from '../worker/client';
  import { exportProject, importProject, projectFileName } from '../store/persist.svelte';

  const glyphs = $derived(collectGlyphs());
  const total = $derived(SETS[project.setId].chars.length);
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

  function fileName(family: string): string {
    const base = family.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-') || 'Handwriting';
    return `${base}-Regular.otf`;
  }

  async function download(): Promise<void> {
    busy = true;
    error = '';
    status = '';
    try {
      const { buffer: buf } = await build(glyphs, buildSettings(), (d, t) => (status = `tracing ${d}/${t}`));
      const name = fileName(fontSettings.family);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'font/otf' }));
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
  </div>
  <div class="actions">
    <button type="button" class="primary" disabled={busy || glyphs.length === 0} onclick={download}>
      download .otf
    </button>
    <button type="button" class="link" onclick={saveFile}>save project</button>
    <input type="file" accept=".fontproject,application/json" hidden bind:this={input} onchange={openFile} />
    <button type="button" class="link" onclick={() => input?.click()}>open project</button>
    {#if status}<span class="meta">{status}</span>{/if}
    {#if error}<span class="meta danger">{error}</span>{/if}
  </div>
</div>
