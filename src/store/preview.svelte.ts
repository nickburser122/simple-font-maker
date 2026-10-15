import type { Outlines } from '../font/build';
import { clearPreview, loadPreview } from '../font/preview';
import { build } from '../worker/client';
import { collectGlyphs } from './glyphs';
import { buildSettings } from './settings.svelte';

export const preview: { family: string; progress: string; error: string; count: number; outlines: Outlines } =
  $state({ family: '', progress: '', error: '', count: 0, outlines: {} });

let running = false;
let dirty = false;

export async function rebuild(): Promise<void> {
  if (running) {
    dirty = true;
    return;
  }
  running = true;
  do {
    dirty = false;
    try {
      const glyphs = collectGlyphs();
      if (glyphs.length === 0) {
        clearPreview();
        preview.family = '';
        preview.count = 0;
        preview.outlines = {};
      } else {
        const res = await build(glyphs, buildSettings(), (d, t) => (preview.progress = `tracing ${d}/${t}`));
        preview.family = await loadPreview(res.buffer);
        preview.outlines = res.outlines;
        preview.count = glyphs.length;
      }
      preview.error = '';
    } catch (e) {
      preview.error = e instanceof Error ? e.message : 'preview failed.';
    }
  } while (dirty);
  preview.progress = '';
  running = false;
}
