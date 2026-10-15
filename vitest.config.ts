import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { server: { deps: { inline: ['esm-potrace-wasm', 'opentype.js'] } } },
});
