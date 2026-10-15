<script lang="ts">
  import { SETS } from '../charset/sets';
  import { pageCount } from '../template/layout';
  import { project } from '../store/project.svelte';
  import {
    addFile,
    captures,
    cornersMoved,
    removeCapture,
    setPage,
  } from '../store/captures.svelte';
  import CornerEditor from './CornerEditor.svelte';
  import CellThumbs from './CellThumbs.svelte';
  import ExtractControls from './ExtractControls.svelte';

  let input: HTMLInputElement | undefined = $state();
  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = $state(null);
  let camError = $state('');

  const total = $derived(pageCount(SETS[project.setId].chars.length, project.paper));

  $effect(() => {
    if (video && stream) video.srcObject = stream;
  });

  $effect(() => () => stopCamera());

  function pick(): void {
    for (const f of Array.from(input?.files ?? [])) void addFile(f);
    if (input) input.value = '';
  }

  async function startCamera(): Promise<void> {
    camError = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      camError = 'camera unavailable.';
    }
  }

  function stopCamera(): void {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function snap(): void {
    if (!video) return;
    const cv = document.createElement('canvas');
    cv.width = video.videoWidth;
    cv.height = video.videoHeight;
    cv.getContext('2d')!.drawImage(video, 0, 0);
    stopCamera();
    cv.toBlob((b) => {
      if (b) void addFile(new File([b], 'camera.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  }
</script>

<div class="cap">
  <div class="actions">
    <input type="file" accept="image/*" multiple hidden bind:this={input} onchange={pick} />
    <button type="button" class="primary" onclick={() => input?.click()}>add photo or scan</button>
    {#if stream}
      <button type="button" class="link" onclick={snap}>capture frame</button>
      <button type="button" class="link" onclick={stopCamera}>cancel camera</button>
    {:else}
      <button type="button" class="link" onclick={startCamera}>use camera</button>
    {/if}
    {#if camError}<span class="meta">{camError}</span>{/if}
  </div>

  {#if stream}
    <video bind:this={video} autoplay playsinline muted class="live"></video>
  {/if}

  <ExtractControls />

  {#each captures.items as it (it.id)}
    {@const found = it.cells.filter((c) => !c.missing).length}
    <article class="item">
      <div class="shot">
        {#if it.url}
        <CornerEditor url={it.url} bind:corners={it.corners} onchange={() => cornersMoved(it.id)} />
        <p class="meta">
          {it.detected ? 'markers detected.' : 'drag the corners onto the four black squares. tl is the one with a white hole.'}
        </p>
        {:else}
          <p class="meta">photo not stored. glyphs restored from the project file.</p>
        {/if}
      </div>
      <div class="info">
        <div class="row">
          <span class="meta">{it.name}</span>
          <button type="button" class="link danger" onclick={() => removeCapture(it.id)}>remove</button>
        </div>
        <div class="toggles">
          {#each Array.from({ length: total }, (_, i) => i + 1) as n}
            <button type="button" class="toggle" aria-pressed={it.page === n} onclick={() => setPage(it.id, n)}>page {n}/{total}</button>
          {/each}
        </div>
        <p class="meta">
          {#if it.status === 'loading'}reading image…
          {:else if it.status === 'failed'}{it.error}
          {:else if it.status === 'working'}extracting {it.cells.length}…
          {:else}{found} of {it.cells.length} glyphs found. missing ones are marked in red.{/if}
        </p>
        {#if it.error && it.status === 'ready'}<p class="meta">{it.error}</p>{/if}
        {#if it.lowInk && it.status === 'ready'}
          <p class="meta">almost no ink found. try luminance mode.</p>
        {/if}
        <CellThumbs cells={it.cells} />
      </div>
    </article>
  {/each}
</div>
