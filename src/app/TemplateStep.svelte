<script lang="ts">
  import { SETS, type SetId } from '../charset/sets';
  import { PAPERS, pageCount, type PaperId } from '../template/layout';
  import { renderAllPages } from '../template/render-svg';
  import { project } from '../store/project.svelte';

  const pages = $derived(renderAllPages(project.setId, project.paper));
  const glyphs = $derived(SETS[project.setId].chars.length);
  const total = $derived(pageCount(glyphs, project.paper));

  function download(): void {
    pages.forEach((svg, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        a.download = `template-${project.setId}-${project.paper}-p${i + 1}.svg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, i * 250);
    });
  }
</script>

<div class="tpl">
  <div class="opts">
    <div role="group" aria-labelledby="l-set">
      <span class="meta" id="l-set">character set</span>
      <div class="toggles">
        {#each Object.values(SETS) as s}
          <button
            type="button"
            class="toggle"
            aria-pressed={project.setId === s.id}
            onclick={() => (project.setId = s.id as SetId)}>{s.label.toLowerCase()}</button
          >
        {/each}
      </div>
    </div>
    <div role="group" aria-labelledby="l-paper">
      <span class="meta" id="l-paper">paper</span>
      <div class="toggles">
        {#each Object.values(PAPERS) as p}
          <button
            type="button"
            class="toggle"
            aria-pressed={project.paper === p.id}
            onclick={() => (project.paper = p.id as PaperId)}>{p.label.toLowerCase()}</button
          >
        {/each}
      </div>
    </div>
    <p class="meta count">{glyphs} glyphs · {total} {total === 1 ? 'page' : 'pages'}</p>
  </div>

  <div class="previews">
    {#each pages as svg, i}
      <figure class="thumb">
        <div class="paper">{@html svg}</div>
        <figcaption class="meta">p{i + 1}/{total}</figcaption>
      </figure>
    {/each}
  </div>

  <div class="actions">
    <button type="button" class="primary" onclick={() => window.print()}>print the sheet</button>
    <button type="button" class="link" onclick={download}>download svg</button>
  </div>
</div>
