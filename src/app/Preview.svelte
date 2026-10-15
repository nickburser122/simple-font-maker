<script lang="ts">
  import { preview } from '../store/preview.svelte';

  let text = $state('The quick brown fox jumps over the lazy dog 0123456789');
  let size = $state(48);
  const sizes = [12, 18, 24, 36, 60, 96];
  const face = $derived(preview.family ? `font-family:'${preview.family}',serif;` : '');
</script>

<div class="prev">
  <textarea bind:value={text} rows="2" aria-label="preview text" style="{face}font-size:{size}px"></textarea>
  <div class="row">
    <label class="slider">
      <span class="meta">size {size}px</span>
      <input type="range" min="12" max="160" bind:value={size} />
    </label>
    <p class="meta">
      {preview.progress ||
        preview.error ||
        (preview.family ? `${preview.count} glyphs in the preview.` : 'no glyphs yet. add a photo in step 02.')}
    </p>
  </div>
  <div class="waterfall">
    {#each sizes as s}
      <div class="wf">
        <span class="meta">{s} px</span>
        <span class="wft" style="{face}font-size:{s}px">{text}</span>
      </div>
    {/each}
  </div>
</div>
