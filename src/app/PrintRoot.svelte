<script lang="ts">
  import { project } from '../store/project.svelte';
  import { nav } from '../store/nav.svelte';
  import { PAPERS } from '../template/layout';
  import { renderAllPages } from '../template/render-svg';

  const paper = $derived(PAPERS[project.paper]);
  const pages = $derived(nav.step === 1 ? renderAllPages(project.setId, project.paper) : []);
</script>

<svelte:head>
  {@html `<style>@page{size:${paper.css};margin:0}</style>`}
</svelte:head>

<div class="printroot" aria-hidden="true">
  {#each pages as svg}
    <div class="sheet" style="width:{paper.w}mm;height:{paper.h}mm">{@html svg}</div>
  {/each}
</div>
