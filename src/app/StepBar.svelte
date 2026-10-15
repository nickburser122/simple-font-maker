<script lang="ts">
  import { steps } from './steps';
  import { nav } from '../store/nav.svelte';
</script>

<nav class="stepbar" aria-label="Steps">
  {#each steps as s, i}
    <button
      type="button"
      class="stepbtn"
      aria-current={nav.step === s.n ? 'step' : undefined}
      onclick={() => (nav.step = s.n)}
    >
      <span class="num">{String(s.n).padStart(2, '0')}</span> {s.label}
    </button>
    {#if i < steps.length - 1}<span class="dash" aria-hidden="true">—</span>{/if}
  {/each}
</nav>
