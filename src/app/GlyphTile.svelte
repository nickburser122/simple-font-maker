<script lang="ts">
  import { X_HEIGHT, CAP_HEIGHT } from '../font/metrics';
  import { unicodeLabel } from '../charset/sets';
  import type { CellResult } from '../vision/cells';
  import { draw } from './draw';

  let {
    char,
    unicode,
    state,
    outline,
    cell,
    selected,
    showSource,
    tab,
    onselect,
  }: {
    char: string;
    unicode: number;
    state: 'ok' | 'missing' | 'off';
    outline: { d: string; advance: number } | undefined;
    cell: CellResult | null;
    selected: boolean;
    showSource: boolean;
    tab: boolean;
    onselect: () => void;
  } = $props();
</script>

<button
  type="button"
  class="tile"
  class:missing={state !== 'ok'}
  class:source={showSource}
  tabindex={tab ? 0 : -1}
  aria-pressed={selected}
  aria-label="{char} {unicodeLabel(unicode)}{state === 'ok' ? '' : ', missing'}"
  onclick={onselect}
>
  <span class="uni">{unicodeLabel(unicode)}</span>
  <svg viewBox="0 -960 1100 1260" aria-hidden="true">
    <line x1="0" x2="1100" y1="0" y2="0" class="g base" />
    <line x1="0" x2="1100" y1={-X_HEIGHT} y2={-X_HEIGHT} class="g" />
    <line x1="0" x2="1100" y1={-CAP_HEIGHT} y2={-CAP_HEIGHT} class="g" />
    {#if outline && state === 'ok'}
      <path d={outline.d} transform="translate({(1100 - outline.advance) / 2},0)" />
    {/if}
  </svg>
  {#if cell}<canvas use:draw={cell} class="src"></canvas>{/if}
</button>
