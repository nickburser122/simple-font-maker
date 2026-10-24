import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: { server: { deps: { inline: ['esm-potrace-wasm', 'opentype.js'] } } },
});
