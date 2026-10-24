<script lang="ts">
  import { unicodeLabel } from '../charset/sets';
  import { MAX_ALTS } from '../font/alternates';
  import { altsFor, chosenFor, sourceLabel, sourcesFor } from '../store/glyphs';
  import { patchGlyph, resetGlyph, settings, DEFAULT_ADJUST } from '../store/settings.svelte';

  let { unicode, char }: { unicode: number; char: string } = $props();

  const a = $derived({ ...DEFAULT_ADJUST, ...settings.glyphs[unicode] });
  const sources = $derived(sourcesFor(unicode));
  const primary = $derived(chosenFor(unicode));
  const others = $derived(sources.filter((s) => s.id !== primary?.id));
  const used = $derived(new Set(altsFor(unicode).map((s) => s.id)));

  function toggleAlt(id: string): void {
    const next = new Set(used);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_ALTS) next.add(id);
    patchGlyph(unicode, { alts: others.filter((s) => next.has(s.id)).map((s) => s.id) });
  }

  function bearing(e: Event, key: 'lsb' | 'rsb'): void {
    const v = (e.currentTarget as HTMLInputElement).value.trim();
    patchGlyph(unicode, { [key]: v === '' ? null : Number(v) });
  }
</script>

<div class="panel">
  <p class="big">{char}</p>
  <p class="meta">{unicodeLabel(unicode)}</p>

  <label class="slider">
    <span class="meta">vertical nudge {a.dy}</span>
    <input type="range" min="-150" max="150" value={a.dy} oninput={(e) => patchGlyph(unicode, { dy: Number(e.currentTarget.value) })} />
  </label>
  <label class="slider">
    <span class="meta">scale {a.scale.toFixed(2)}</span>
    <input type="range" min="0.6" max="1.6" step="0.01" value={a.scale} oninput={(e) => patchGlyph(unicode, { scale: Number(e.currentTarget.value) })} />
  </label>
  <div class="opts">
    <label class="field">
      <span class="meta">lsb</span>
      <input type="number" placeholder="default" value={a.lsb ?? ''} onchange={(e) => bearing(e, 'lsb')} />
    </label>
    <label class="field">
      <span class="meta">rsb</span>
      <input type="number" placeholder="default" value={a.rsb ?? ''} onchange={(e) => bearing(e, 'rsb')} />
    </label>
  </div>

  {#if sources.length > 1}
    <div role="group" aria-label="use this glyph from">
      <span class="meta">use from</span>
      <div class="toggles">
        {#each sources as s}
          <button
            type="button"
            class="toggle"
            aria-pressed={(a.source ?? sources[0].id) === s.id}
            onclick={() => patchGlyph(unicode, { source: s.id })}>{sourceLabel(s, sources)}</button
          >
        {/each}
      </div>
    </div>
  {/if}

  {#if settings.alternates && others.length > 0}
    <div role="group" aria-label="alternate shapes for this glyph">
      <span class="meta">alternates (up to {MAX_ALTS})</span>
      <div class="toggles">
        {#each others as s}
          <button type="button" class="toggle" aria-pressed={used.has(s.id)} onclick={() => toggleAlt(s.id)}>{sourceLabel(s, sources)}</button>
        {/each}
        {#if a.alts !== null}
          <button type="button" class="link" onclick={() => patchGlyph(unicode, { alts: null })}>auto</button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="actions">
    <button type="button" class="toggle" aria-pressed={a.missing} onclick={() => patchGlyph(unicode, { missing: !a.missing })}>mark as missing</button>
    <button type="button" class="link" onclick={() => resetGlyph(unicode)}>reset</button>
  </div>
</div>
