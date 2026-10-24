<script lang="ts">
  import StepBar from './StepBar.svelte';
  import StepPage from './StepPage.svelte';
  import Footer from './Footer.svelte';
  import PrintRoot from './PrintRoot.svelte';
  import { steps } from './steps';
  import { nav } from '../store/nav.svelte';
  import { project } from '../store/project.svelte';
  import { rerunAll } from '../store/captures.svelte';
  import { collectGlyphs } from '../store/glyphs';
  import { rebuild } from '../store/preview.svelte';
  import { commitSettings, settings, type Settings } from '../store/settings.svelte';
  import { captures } from '../store/captures.svelte';
  import { currentProject, loadSession, persistState, saveSession } from '../store/persist.svelte';
  import { fontSettings } from '../store/font.svelte';

  const current = $derived(steps[nav.step - 1]);

  $effect(() => {
    void loadSession();
  });

  $effect(() => {
    if (!persistState.ready) return;
    captures.items.length;
    fontSettings.family;
    fontSettings.designer;
    project.setId;
    project.paper;
    const proj = currentProject();
    const t = setTimeout(() => void saveSession(proj), 800);
    return () => clearTimeout(t);
  });

  $effect(() => {
    JSON.stringify([settings.auto, settings.threshold, settings.adaptive, settings.mode, project.setId, project.paper]);
    const t = setTimeout(rerunAll, 120);
    return () => clearTimeout(t);
  });

  $effect(() => {
    collectGlyphs();
    JSON.stringify([
      settings.alphamax,
      settings.turdsize,
      settings.opttolerance,
      settings.spacing,
      settings.space,
      settings.kerning,
      $state.snapshot(settings.glyphs),
    ]);
    const t = setTimeout(rebuild, 120);
    return () => clearTimeout(t);
  });

  $effect(() => {
    const snap = $state.snapshot(settings) as Settings;
    const t = setTimeout(() => commitSettings(snap), 400);
    return () => clearTimeout(t);
  });
</script>

<div class="page">
  <header class="top">
    <span class="wordmark">handwriting font maker</span>
    <StepBar />
  </header>
  <main>
    {#key nav.step}
      <StepPage step={current} />
    {/key}
  </main>
  <Footer />
</div>

<PrintRoot />
