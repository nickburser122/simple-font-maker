<script lang="ts">
  import type { Pt } from '../vision/types';

  let {
    url,
    corners = $bindable(),
    onchange,
  }: { url: string; corners: Pt[]; onchange: () => void } = $props();

  const names = ['TL', 'TR', 'BR', 'BL'];
  let box: HTMLDivElement | undefined = $state();
  let drag = -1;

  function clamp(v: number): number {
    return Math.min(1, Math.max(0, v));
  }

  function move(e: PointerEvent): void {
    if (drag < 0 || !box) return;
    const r = box.getBoundingClientRect();
    corners[drag] = [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
  }

  function up(): void {
    if (drag < 0) return;
    drag = -1;
    onchange();
  }

  function key(e: KeyboardEvent, i: number): void {
    const step = e.shiftKey ? 0.01 : 0.002;
    const d: Record<string, Pt> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    corners[i] = [clamp(corners[i][0] + v[0]), clamp(corners[i][1] + v[1])];
    onchange();
  }
</script>

<div class="editor" role="group" aria-label="sheet corners" bind:this={box} onpointermove={move} onpointerup={up}>
  <img src={url} alt="the photographed sheet" draggable="false" />
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <polygon points={corners.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} />
  </svg>
  {#each corners as c, i}
    <button
      type="button"
      class="handle"
      style="left:{c[0] * 100}%;top:{c[1] * 100}%"
      aria-label="corner {names[i]}"
      onkeydown={(e) => key(e, i)}
      onpointerdown={(e) => {
        drag = i;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}>{names[i]}</button
    >
  {/each}
</div>
