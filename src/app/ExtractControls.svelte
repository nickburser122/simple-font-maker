<script lang="ts">
  import { settings } from '../store/settings.svelte';
</script>

<div class="opts">
  <label class="slider">
    <span class="meta">threshold {settings.auto ? 'auto' : settings.threshold}</span>
    <input type="range" min="30" max="230" bind:value={settings.threshold} disabled={settings.auto || settings.adaptive} />
  </label>
  <button type="button" class="toggle" aria-pressed={settings.auto} onclick={() => (settings.auto = !settings.auto)}>auto</button>
  <button type="button" class="toggle" aria-pressed={settings.adaptive} onclick={() => (settings.adaptive = !settings.adaptive)}>adaptive</button>
  <button
    type="button"
    class="toggle"
    aria-pressed={settings.mode === 'luma'}
    onclick={() => (settings.mode = settings.mode === 'luma' ? 'blue' : 'luma')}>luminance</button
  >
</div>
