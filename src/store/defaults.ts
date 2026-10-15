import { SPACE_WIDTH } from '../font/metrics';
import { DEFAULT_TRACE } from '../trace/params';
import type { Settings } from './settings.svelte';

export const DEFAULT_SETTINGS: Settings = {
  auto: true,
  threshold: 128,
  adaptive: false,
  mode: 'blue',
  alphamax: DEFAULT_TRACE.alphamax,
  turdsize: DEFAULT_TRACE.turdsize,
  opttolerance: DEFAULT_TRACE.opttolerance,
  spacing: 0,
  space: SPACE_WIDTH,
  glyphs: {},
};
