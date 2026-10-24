<script lang="ts">
  import { THEMES } from '../store/theme';
  import { setTheme, theme } from '../store/theme.svelte';
</script>

<div class="themes" role="group" aria-label="colour theme">
  <span class="meta">theme</span>
  {#each THEMES as t}
    <button type="button" class="toggle" aria-pressed={theme.choice === t} onclick={() => setTheme(t)}>{t}</button>
  {/each}
</div>
