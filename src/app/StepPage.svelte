<script lang="ts">
  import type { StepInfo } from './steps';
  import { steps } from './steps';
  import { nav } from '../store/nav.svelte';
  import TemplateStep from './TemplateStep.svelte';
  import CaptureStep from './CaptureStep.svelte';
  import ExportStep from './ExportStep.svelte';
  import RefineStep from './RefineStep.svelte';

  let { step }: { step: StepInfo } = $props();
</script>

<section class="step" aria-labelledby="h-{step.id}">
  <div class="grid">
    <div class="secnum" aria-hidden="true">{String(step.n).padStart(2, '0')}</div>
    <div class="secbody">
      <h1 id="h-{step.id}">{step.title}</h1>
      <p class="lede">{step.lede}</p>
    </div>
  </div>

  <div class="grid">
    <div class="canvas filled">
      <i class="crop tl"></i><i class="crop tr"></i><i class="crop bl"></i><i class="crop br"></i>
      {#if step.n === 1}
        <TemplateStep />
      {:else if step.n === 2}
        <CaptureStep />
      {:else if step.n === 3}
        <RefineStep />
      {:else if step.n === 4}
        <ExportStep />
      {:else}
        <p class="meta">{step.empty}</p>
      {/if}
    </div>
  </div>

  <div class="grid">
    <div class="actions">
      {#if step.n > 1}
        <button type="button" class="link" onclick={() => (nav.step = step.n - 1)}>back</button>
      {/if}
      {#if step.n < steps.length}
        <button type="button" class="primary" onclick={() => (nav.step = step.n + 1)}>
          next: {steps[step.n].label.toLowerCase()}
        </button>
      {/if}
    </div>
  </div>
</section>
