<script lang="ts">
  import { eraseEverything } from '../store/persist.svelte';

  let confirming = $state(false);

  async function erase(): Promise<void> {
    await eraseEverything();
    confirming = false;
  }
</script>

<footer class="foot">
  <p class="meta">
    Runs entirely in this tab. Nothing is uploaded. You can check: open your browser's network panel.
  </p>
  <div class="erase">
    {#if confirming}
      <span class="meta">erase photos, glyphs and settings?</span>
      <button type="button" class="link danger" onclick={erase}>yes, erase</button>
      <button type="button" class="link" onclick={() => (confirming = false)}>cancel</button>
    {:else}
      <button type="button" class="link danger" onclick={() => (confirming = true)}>erase everything</button>
    {/if}
  </div>
</footer>
