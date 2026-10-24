<script lang="ts">
  import { SETS } from '../charset/sets';
  import { project } from '../store/project.svelte';
  import { preview } from '../store/preview.svelte';
  import { historyState, redo, settings, undo } from '../store/settings.svelte';
  import { alternateCount, chosenFor, sourcesFor } from '../store/glyphs';
  import ExtractControls from './ExtractControls.svelte';
  import GlyphPanel from './GlyphPanel.svelte';
  import GlyphTile from './GlyphTile.svelte';
  import Preview from './Preview.svelte';
  import Range from './Range.svelte';

  let selected: number | null = $state(null);
  let showSource = $state(false);
  let tiles: HTMLDivElement | undefined = $state();
  let focusIdx = $state(0);

  function tileEls(): HTMLElement[] {
    return Array.from(tiles?.querySelectorAll<HTMLElement>('button.tile') ?? []);
  }

  function move(e: KeyboardEvent): void {
    const els = tileEls();
    const cur = els.indexOf(document.activeElement as HTMLElement);
    if (cur < 0) return;
    let cols = 0;
    for (const el of els) {
      if (el.offsetTop !== els[0].offsetTop) break;
      cols++;
    }
    let next = cur;
    if (e.key === 'ArrowRight') next = cur + 1;
    else if (e.key === 'ArrowLeft') next = cur - 1;
    else if (e.key === 'ArrowDown') next = cur + Math.max(1, cols);
    else if (e.key === 'ArrowUp') next = cur - Math.max(1, cols);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = els.length - 1;
    else if (e.key === 'Escape') {
      selected = null;
      return;
    } else return;
    e.preventDefault();
    next = Math.max(0, Math.min(els.length - 1, next));
    focusIdx = next;
    els[next].focus();
  }

  function focused(): void {
    const i = tileEls().indexOf(document.activeElement as HTMLElement);
    if (i >= 0) focusIdx = i;
  }

  const chars = $derived(SETS[project.setId].chars);
  const alts = $derived(alternateCount());
  const found = $derived(chars.filter((c) => sourcesFor(c.codePointAt(0)!).length > 0 && !settings.glyphs[c.codePointAt(0)!]?.missing).length);

  function onkey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="refine">
  <Preview />

  <div class="globals">
    <ExtractControls />
    <div class="opts">
      <Range label="smoothness" bind:value={settings.alphamax} min={0} max={1.33} step={0.01} />
      <Range label="speck filter" bind:value={settings.turdsize} min={0} max={30} />
      <Range label="letter spacing" bind:value={settings.spacing} min={-40} max={100} />
      <Range label="space width" bind:value={settings.space} min={100} max={600} />
      <Range label="kerning" bind:value={settings.kerning} min={0} max={100} />
    </div>
    <div class="actions">
      <button type="button" class="link" disabled={!historyState.canUndo} onclick={undo}>undo</button>
      <button type="button" class="link" disabled={!historyState.canRedo} onclick={redo}>redo</button>
      <button type="button" class="toggle" aria-pressed={showSource} onclick={() => (showSource = !showSource)}>source bitmaps</button>
      <button
        type="button"
        class="toggle"
        aria-pressed={settings.alternates}
        disabled={alts === 0 && !settings.alternates}
        onclick={() => (settings.alternates = !settings.alternates)}>alternate shapes</button
      >
      <div class="notes">
        <span class="meta">{found} of {chars.length} glyphs found. missing ones are marked in red.</span>
        <span class="meta">
          {#if alts > 0}
            {alts} {alts === 1 ? 'glyph has' : 'glyphs have'} a second sample{settings.alternates ? ', used as an alternate' : ''}.
          {:else}
            photograph a page twice to give letters a second shape.
          {/if}
        </span>
      </div>
    </div>
  </div>

  <div class="gridwrap">
    <div class="tiles" role="toolbar" tabindex="-1" aria-label="glyphs" bind:this={tiles} onkeydown={move} onfocusin={focused}>
      {#each chars as ch, i}
        {@const u = ch.codePointAt(0)!}
        {@const src = chosenFor(u)}
        <GlyphTile
          char={ch}
          unicode={u}
          state={!src ? 'missing' : settings.glyphs[u]?.missing ? 'off' : 'ok'}
          outline={preview.outlines[u]}
          cell={src?.cell ?? null}
          selected={selected === u}
          {showSource}
          tab={i === focusIdx}
          onselect={() => (selected = selected === u ? null : u)}
        />
      {/each}
    </div>
    {#if selected !== null}
      <GlyphPanel unicode={selected} char={String.fromCodePoint(selected)} />
    {/if}
  </div>
</div>
