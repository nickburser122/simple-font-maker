<script lang="ts">
  import type { CellResult } from '../vision/cells';
  import { draw } from './draw';

  let { cells }: { cells: CellResult[] } = $props();

</script>

<div class="cells">
  {#each cells as c (c.unicode)}
    <figure class="cell" class:missing={c.missing}>
      <canvas use:draw={c} aria-label={c.char}></canvas>
      <figcaption>{c.char}</figcaption>
    </figure>
  {/each}
</div>
